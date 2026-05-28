// --- server fetcher (no unit test; DB-backed) ---
//
// Kept in this file so that the pure-compute module (inbox-metrics.ts) can be
// imported in unit tests without dragging in Supabase client or social-inbox.ts.

import { createAdsAnalystClient } from "./ads-analyst-db.ts";
import { getSocialInboxData } from "./social-inbox.ts";
import type { MetaInboxAccessProfile } from "./meta-inbox-access.ts";
import { getActiveMetaInboxEnvironment } from "./meta-inbox-environment.ts";
import { buildMetaInboxManagerDashboard } from "./meta-inbox-manager-dashboard.ts";

import {
  DEFAULT_BUSINESS_WINDOW,
  resolveUserWindow,
  buildQueueWindowMap,
  getQueueWindow,
  isOpenConversation,
  businessSecondsBetween,
  computePipelineMetrics,
  computeUnassignedMetrics,
  computeRepliesSentToday,
  computeTodayResponseMetrics,
  pickYesterdayAvg,
  computeClaimsToday,
  computeTeammatesOverSla,
  assemblePersonalHeaderMetrics,
  mapAssigneeRowToTeamRow,
  periodToDays,
  userDateString,
  todaysWindow,
  type PersonalHeaderMetrics,
  type ConversationLike,
  type SendAttemptLike,
  type CommentActionLike,
  type QueueCategoryWindowRow,
  type QueueWindowMap,
  type MetricsDailyRow,
  type AssignmentEventLike,
  type RepliedConversation,
  type Period,
  type TeamRollup,
  type TeamRow,
  type DailyHistoryRow,
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
    .select("key,timezone,business_hours_start,business_hours_end")
    .eq("environment", getActiveMetaInboxEnvironment());
  const queueWindows = buildQueueWindowMap((queueRows || []) as QueueCategoryWindowRow[]);

  // User timezone preference (default PT).
  const { data: prefRow } = await supabase
    .from("meta_inbox_user_preferences")
    .select("timezone")
    .eq("environment", getActiveMetaInboxEnvironment())
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
    .eq("environment", getActiveMetaInboxEnvironment())
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
    .eq("environment", getActiveMetaInboxEnvironment())
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

// --- Task 33: team rollup (server fetcher; integration-verified, not unit-tested) ---
//
// Maps the manager dashboard's byAssignee rows into business-hours-aware
// TeamRows for the lead's teammates (plus self). Pipeline/at-risk/oldest are
// always current-state. avg/on-time/replies/claims are period-aware:
//   - period "today": computed live from the in-memory inbox (tested helpers).
//   - historical periods: summed from meta_inbox_metrics_daily completed-day
//     rows in the window. NOTE: the rollup covers completed days only (today is
//     not yet rolled up), so for multi-day periods this is a completed-days
//     approximation that may trail the dashboard's live avg by the current day.
//     Confirm exact boundary semantics during integration QA.
export async function getTeamRollup(
  profile: HeaderProfile,
  period: Period,
  now: Date,
): Promise<TeamRollup> {
  const teamUserIds = new Set<string>([
    ...(profile.teamUserIds || []),
    ...(profile.appUserId ? [profile.appUserId] : []),
  ]);
  if (teamUserIds.size === 0) return { period, teamName: "Team", rows: [] };

  const env = getActiveMetaInboxEnvironment();
  const supabase = dynamicSupabaseWeb();
  const inbox = await getSocialInboxData(profile);
  const dashboard = buildMetaInboxManagerDashboard(inbox, { days: periodToDays(period), now });

  const { data: queueRows } = await supabase
    .from("meta_inbox_queue_categories")
    .select("key,timezone,business_hours_start,business_hours_end")
    .eq("environment", env);
  const queueWindows = buildQueueWindowMap((queueRows || []) as QueueCategoryWindowRow[]);

  const conversations = inbox.inboxConversations as unknown as ConversationLike[];
  const userWindow = resolveUserWindow(DEFAULT_BUSINESS_WINDOW.tz);
  const ids = Array.from(teamUserIds);

  // Names via the data-boundary identity view (web role has SELECT here; it has
  // no grant on public.users under limited-access mode). app_user_id == user id.
  const { data: userRows } = await (supabase as unknown as {
    schema: (schema: "analytics") => {
      from: (table: "ads_analyst_identity_profiles_v1") => {
        select: (columns: string) => {
          in: (column: string, values: string[]) => Promise<{ data: { app_user_id: string; full_name: string | null }[] | null }>;
        };
      };
    };
  })
    .schema("analytics")
    .from("ads_analyst_identity_profiles_v1")
    .select("app_user_id,full_name")
    .in("app_user_id", ids);
  const nameById = new Map<string, string | null>(
    ((userRows || []) as { app_user_id: string; full_name: string | null }[]).map(
      (u) => [u.app_user_id, u.full_name],
    ),
  );

  // Historical aggregates from the rollup (non-today periods).
  const dailyByUser = new Map<string, { onTime: number; total: number; claims: number }>();
  if (period !== "today") {
    const startDate = dateStringNDaysAgo(now, periodToDays(period) - 1);
    const { data: dailyRows } = await supabase
      .from("meta_inbox_metrics_daily")
      .select("user_id,date,on_time_replies,total_replies,team_claims")
      .eq("environment", env)
      .in("user_id", ids)
      .gte("date", startDate);
    for (const r of (dailyRows || []) as MetricsDailyRow[]) {
      const acc = dailyByUser.get(r.user_id) || { onTime: 0, total: 0, claims: 0 };
      acc.onTime += r.on_time_replies ?? 0;
      acc.total += r.total_replies ?? 0;
      acc.claims += r.team_claims ?? 0;
      dailyByUser.set(r.user_id, acc);
    }
  }

  // Today's claims, computed live from assignment events since today's open.
  const claimsTodayByUser = new Map<string, number>();
  if (period === "today") {
    const today = todaysWindow(now, userWindow);
    const { data: eventRows } = await supabase
      .from("meta_inbox_conversation_events")
      .select("event_at,previous_value,new_value")
      .eq("environment", env)
      .eq("event_type", "assignment_changed")
      .gte("event_at", today.start.toISOString());
    for (const e of (eventRows || []) as Record<string, unknown>[]) {
      const prev = (e.previous_value as Record<string, unknown> | null)?.assignedUserId ?? null;
      const next =
        ((e.new_value as Record<string, unknown> | null)?.assignedUserId as string | null) ?? null;
      if (prev === null && next && teamUserIds.has(next)) {
        claimsTodayByUser.set(next, (claimsTodayByUser.get(next) || 0) + 1);
      }
    }
  }

  const rows: TeamRow[] = [];
  for (const assignee of dashboard.byAssignee) {
    const uid = assignee.assigneeUserId;
    if (!uid || !teamUserIds.has(uid)) continue;

    const pipeline = computePipelineMetrics(conversations, uid, now, queueWindows);
    const oldestUnansweredSec = computeOldestUnansweredForAssignee(
      conversations,
      uid,
      now,
      queueWindows,
    );

    let avgResponseSec: number | null;
    let onTimeRate: number | null;
    let repliesSent: number;
    let teamClaims: number;

    if (period === "today") {
      const replied = buildRepliedConversations(inbox, uid);
      const todayResp = computeTodayResponseMetrics(replied, userWindow, queueWindows, now);
      avgResponseSec = todayResp.avgResponseSec;
      onTimeRate = todayResp.onTimeRate;
      repliesSent = computeRepliesSentToday(
        inbox.sendAttempts as unknown as SendAttemptLike[],
        inbox.commentActions as unknown as CommentActionLike[],
        uid,
        userWindow,
        now,
      );
      teamClaims = claimsTodayByUser.get(uid) || 0;
    } else {
      const agg = dailyByUser.get(uid);
      avgResponseSec =
        assignee.averageFirstResponseMinutes === null
          ? null
          : Math.round(assignee.averageFirstResponseMinutes * 60);
      onTimeRate = agg && agg.total > 0 ? agg.onTime / agg.total : null;
      repliesSent = agg ? agg.total : 0;
      teamClaims = agg ? agg.claims : 0;
    }

    const teamRow = mapAssigneeRowToTeamRow(assignee, {
      name: nameById.get(uid) || "Unknown",
      role: "member",
      atRisk: pipeline.atRisk,
      avgResponseSec,
      onTimeRate,
      teamClaims,
      oldestUnansweredSec,
      lastActiveAt: lastActiveForAssignee(inbox, uid),
      repliesSent,
    });
    if (teamRow) rows.push(teamRow);
  }

  rows.sort((a, b) => b.atRisk - a.atRisk || b.needsReply - a.needsReply);
  return { period, teamName: "Team", rows };
}

// Oldest still-unanswered conversation (business seconds) assigned to userId.
function computeOldestUnansweredForAssignee(
  conversations: ConversationLike[],
  userId: string,
  now: Date,
  queueWindows: QueueWindowMap,
): number | null {
  let oldest: number | null = null;
  for (const c of conversations) {
    if (c.assigned_user_id !== userId || !c.needs_reply || !isOpenConversation(c)) continue;
    const arrived = c.latest_inbound_at ? new Date(c.latest_inbound_at) : null;
    if (!arrived || Number.isNaN(arrived.getTime())) continue;
    const w = getQueueWindow(queueWindows, c.queue_category_key);
    const age = businessSecondsBetween(arrived, now, w);
    if (oldest === null || age > oldest) oldest = age;
  }
  return oldest;
}

// Most recent sent send-attempt time for an assignee, or null.
function lastActiveForAssignee(
  inbox: Awaited<ReturnType<typeof getSocialInboxData>>,
  userId: string,
): Date | null {
  let latest: number | null = null;
  for (const s of inbox.sendAttempts) {
    if (s.approved_by !== userId || s.status !== "sent" || !s.sent_at) continue;
    const t = Date.parse(s.sent_at);
    if (Number.isFinite(t) && (latest === null || t > latest)) latest = t;
  }
  return latest === null ? null : new Date(latest);
}

// Daily avg-response history for one user over the period window, from the
// rollup. Integration-verified (DB-backed). Environment is pinned via the
// scoped client + the explicit filter, matching getPersonalHeaderMetrics.
export async function getUserDailyHistory(
  userId: string,
  period: Period,
): Promise<DailyHistoryRow[]> {
  const supabase = dynamicSupabaseWeb();
  const since = new Date(Date.now() - periodToDays(period) * 86_400_000)
    .toISOString()
    .slice(0, 10);
  const { data } = await supabase
    .from("meta_inbox_metrics_daily")
    .select("date,avg_response_seconds")
    .eq("environment", getActiveMetaInboxEnvironment())
    .eq("user_id", userId)
    .gte("date", since)
    .order("date", { ascending: true });
  return ((data || []) as { date: string; avg_response_seconds: number | null }[]).map((r) => ({
    date: r.date,
    avgResponseSec: r.avg_response_seconds,
  }));
}

// User-local date string N days before now (YYYY-MM-DD), for rollup range starts.
function dateStringNDaysAgo(now: Date, n: number): string {
  const today = userDateString(now, DEFAULT_BUSINESS_WINDOW);
  const [y, m, d] = today.split("-").map(Number);
  const past = new Date(Date.UTC(y, m - 1, d) - n * 86_400_000);
  return `${past.getUTCFullYear()}-${String(past.getUTCMonth() + 1).padStart(2, "0")}-${String(past.getUTCDate()).padStart(2, "0")}`;
}
