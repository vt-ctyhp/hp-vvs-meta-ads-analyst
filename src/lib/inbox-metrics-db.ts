// --- server fetcher (no unit test; DB-backed) ---
//
// Kept in this file so that the pure-compute module (inbox-metrics.ts) can be
// imported in unit tests without dragging in Supabase client or social-inbox.ts.

import { createAdsAnalystClient } from "./ads-analyst-db.ts";
import { getSocialInboxData } from "./social-inbox.ts";
import type { MetaInboxAccessProfile } from "./meta-inbox-access.ts";

import {
  DEFAULT_BUSINESS_WINDOW,
  resolveUserWindow,
  buildQueueWindowMap,
  computePipelineMetrics,
  computeUnassignedMetrics,
  computeRepliesSentToday,
  computeTodayResponseMetrics,
  pickYesterdayAvg,
  computeClaimsToday,
  computeTeammatesOverSla,
  assemblePersonalHeaderMetrics,
  todaysWindow,
  type PersonalHeaderMetrics,
  type ConversationLike,
  type SendAttemptLike,
  type CommentActionLike,
  type QueueCategoryWindowRow,
  type MetricsDailyRow,
  type AssignmentEventLike,
  type RepliedConversation,
} from "./inbox-metrics.ts";

// Minimal dynamic client type — mirrors the private DynamicSupabaseClient in
// social-inbox.ts. Bypasses the typed schema for tables not yet codegen-registered.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type DynamicClient = { from: (table: string) => any };

// Web-scoped Supabase client for read-only metric queries. Mirrors the
// private dynamicSupabase("web") in social-inbox.ts.
export function dynamicSupabaseWeb(): DynamicClient {
  return createAdsAnalystClient("web") as unknown as DynamicClient;
}

export type HeaderProfile = MetaInboxAccessProfile & {
  teamLead?: boolean;
  teamIds?: readonly string[];
  teamUserIds?: readonly string[]; // app_user_ids of teammates (resolved in auth, Task 23)
};

export async function getPersonalHeaderMetrics(
  profile: HeaderProfile,
  now: Date,
): Promise<PersonalHeaderMetrics> {
  const userId = profile.appUserId;
  if (!userId) {
    // Anonymous / missing app user → empty, before/open neutral.
    const userWindow = DEFAULT_BUSINESS_WINDOW;
    return assemblePersonalHeaderMetrics({
      userId: "",
      timezone: userWindow.tz,
      userWindow,
      now,
      pipeline: { assigned: 0, needsReply: 0, atRisk: 0 },
      today: { avgResponseSec: null, onTimeRate: null, repliesSent: 0 },
      yesterdayAvgSec: null,
      unassigned: 0,
      oldestUnassignedSec: null,
      claims: { claimedByMe: 0, todayUnassignedDenominator: 0 },
      teammatesOverSla: undefined,
    });
  }

  const supabase = dynamicSupabaseWeb();
  const inbox = await getSocialInboxData(profile);

  // Queue windows.
  const { data: queueRows } = await supabase
    .from("meta_inbox_queue_categories")
    .select("key,timezone,business_hours_start,business_hours_end");
  const queueWindows = buildQueueWindowMap((queueRows || []) as QueueCategoryWindowRow[]);

  // User timezone preference (default PT).
  const { data: prefRow } = await supabase
    .from("meta_inbox_user_preferences")
    .select("timezone")
    .eq("user_id", userId)
    .maybeSingle();
  const timezone = (prefRow?.timezone as string | undefined) || DEFAULT_BUSINESS_WINDOW.tz;
  const userWindow = resolveUserWindow(timezone);

  const conversations = inbox.inboxConversations as unknown as ConversationLike[];

  // Pipeline (A1-A3) + unassigned (C1/C3).
  const pipeline = computePipelineMetrics(conversations, userId, now, queueWindows);
  const unassignedMetrics = computeUnassignedMetrics(conversations, now, queueWindows);

  // B3 replies sent today.
  const repliesSent = computeRepliesSentToday(
    inbox.sendAttempts as unknown as SendAttemptLike[],
    inbox.commentActions as unknown as CommentActionLike[],
    userId,
    userWindow,
    now,
  );

  // B1/B2 — build first-reply-by-conversation among my sent attempts.
  const replied = buildRepliedConversations(inbox, userId);
  const todayResponse = computeTodayResponseMetrics(replied, userWindow, queueWindows, now);

  // Yesterday avg from rollup.
  const { data: dailyRows } = await supabase
    .from("meta_inbox_metrics_daily")
    .select("user_id,date,avg_response_seconds")
    .eq("user_id", userId)
    .order("date", { ascending: false })
    .limit(7);
  const yesterdayAvgSec = pickYesterdayAvg(
    (dailyRows || []) as MetricsDailyRow[],
    userId,
    now,
    userWindow,
  );

  // C2 claims today.
  // Filters: event_type = 'assignment_changed', event_at >= today.start,
  // previous_value->>'assignedUserId' IS NULL, new_value->>'assignedUserId' = userId.
  // JSONB extraction mapped to camelCase fields expected by computeClaimsToday.
  const today = todaysWindow(now, userWindow);
  const { data: eventRows } = await supabase
    .from("meta_inbox_conversation_events")
    .select("event_at,previous_value,new_value")
    .eq("event_type", "assignment_changed")
    .gte("event_at", today.start.toISOString());
  const events: AssignmentEventLike[] = (eventRows || []).map((e: Record<string, unknown>) => ({
    event_at: String(e.event_at),
    previousAssignedUserId:
      (e.previous_value as Record<string, unknown> | null)?.assignedUserId as string | null ?? null,
    newAssignedUserId:
      (e.new_value as Record<string, unknown> | null)?.assignedUserId as string | null ?? null,
  }));
  const claims = computeClaimsToday(events, conversations, userId, userWindow, now);

  // teammatesOverSla — leads only.
  let teammatesOverSla: number | undefined;
  if (profile.teamLead && profile.teamUserIds && profile.teamUserIds.length) {
    teammatesOverSla = computeTeammatesOverSla(
      conversations,
      new Set(profile.teamUserIds),
      now,
      queueWindows,
    );
  }

  return assemblePersonalHeaderMetrics({
    userId,
    timezone,
    userWindow,
    now,
    pipeline,
    today: {
      avgResponseSec: todayResponse.avgResponseSec,
      onTimeRate: todayResponse.onTimeRate,
      repliesSent,
    },
    yesterdayAvgSec,
    unassigned: unassignedMetrics.unassigned,
    oldestUnassignedSec: unassignedMetrics.oldestUnassignedSec,
    claims,
    teammatesOverSla,
  });
}

// Builds first-outbound-by-conversation among the user's sent send-attempts,
// joined to each conversation's first_inbound_at + queue key.
function buildRepliedConversations(
  inbox: Awaited<ReturnType<typeof getSocialInboxData>>,
  userId: string,
): RepliedConversation[] {
  const convById = new Map(inbox.inboxConversations.map((c) => [c.id, c]));
  const firstOutbound = new Map<string, string>();
  for (const s of inbox.sendAttempts) {
    if (s.approved_by !== userId || s.status !== "sent" || !s.sent_at) continue;
    const existing = firstOutbound.get(s.conversation_id);
    if (!existing || Date.parse(s.sent_at) < Date.parse(existing)) {
      firstOutbound.set(s.conversation_id, s.sent_at);
    }
  }
  const out: RepliedConversation[] = [];
  for (const [conversationId, outboundAt] of firstOutbound) {
    const conv = convById.get(conversationId);
    if (!conv) continue;
    out.push({
      firstInboundAt: conv.first_inbound_at,
      firstOutboundAt: outboundAt,
      queueKey: conv.queue_category_key,
    });
  }
  return out;
}
