// src/lib/inbox-auto-assign-worker.ts
import { createAdsAnalystClient } from "./ads-analyst-db.ts";
import { updateAssignment } from "./inbox-assignment.ts";
import { pickAssignee, type Candidate, type ScheduleRow } from "./inbox-auto-assign.ts";
import { getActiveMetaInboxEnvironment } from "./meta-inbox-environment.ts";
import { SYSTEM_INBOX_PROFILE } from "./meta-inbox-access.ts";

// Minimal dynamic client type — mirrors the pattern in inbox-metrics-db.ts.
// Bypasses the typed schema for tables not yet codegen-registered.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type DynamicClient = { from: (table: string) => any };

type ConfidentConversation = {
  id: string;
  queue_category_key: string;
  assigned_team_id: string | null;
};

export type AutoAssignSweepResult = {
  scanned: number;
  assigned: number;
  skippedNoCoverer: number;
  errors: number;
};

const CONFIDENCE_FLOOR = 0.85;

export async function runInboxAutoAssignSweep(): Promise<AutoAssignSweepResult> {
  const env = getActiveMetaInboxEnvironment();
  const supabase = createAdsAnalystClient("worker") as unknown as DynamicClient;
  const result: AutoAssignSweepResult = { scanned: 0, assigned: 0, skippedNoCoverer: 0, errors: 0 };

  const { data: convRows } = await supabase
    .from("meta_inbox_conversations")
    .select("id,queue_category_key,assigned_team_id,routing_confidence,assigned_user_id")
    .eq("environment", env)
    .is("assigned_user_id", null)
    .not("queue_category_key", "is", null)
    .neq("queue_category_key", "uncategorized_needs_review")
    .gte("routing_confidence", CONFIDENCE_FLOOR);
  const conversations = (convRows || []) as (ConfidentConversation & { routing_confidence: number })[];
  result.scanned = conversations.length;
  if (conversations.length === 0) return result;

  const byCategory = new Map<string, ConfidentConversation[]>();
  for (const c of conversations) {
    byCategory.set(c.queue_category_key, [...(byCategory.get(c.queue_category_key) || []), c]);
  }

  for (const [categoryKey, convs] of byCategory) {
    let candidates: Candidate[];
    let pointer: string | null;
    try {
      candidates = await loadCandidates(supabase, env, categoryKey);
      pointer = await loadRotationPointer(supabase, env, categoryKey);
    } catch {
      result.errors += convs.length;
      continue;
    }

    for (const conv of convs) {
      try {
        const pick = pickAssignee({ candidates, now: new Date(), lastAssignedUserId: pointer });
        if (!pick) {
          result.skippedNoCoverer += 1;
          continue;
        }
        await updateAssignment(
          conv.id,
          { user_id: pick.assignedUserId, team_id: conv.assigned_team_id, actor_id: "system" },
          SYSTEM_INBOX_PROFILE,
        );
        await saveRotationPointer(supabase, env, categoryKey, pick.nextPointer);
        pointer = pick.nextPointer;
        result.assigned += 1;
      } catch {
        result.errors += 1;
      }
    }
  }

  return result;
}

async function loadCandidates(
  supabase: DynamicClient,
  env: string,
  categoryKey: string,
): Promise<Candidate[]> {
  const { data: accessRows } = await supabase
    .from("meta_inbox_team_queue_access")
    .select("team_id")
    .eq("environment", env)
    .eq("queue_category_key", categoryKey);
  const teamIds = Array.from(new Set(((accessRows || []) as { team_id: string }[]).map((r) => r.team_id)));
  if (teamIds.length === 0) return [];

  const { data: memberRows } = await supabase
    .from("meta_inbox_team_members")
    .select("app_user_id,auto_assign_eligible,team_id")
    .eq("environment", env)
    .in("team_id", teamIds)
    .eq("auto_assign_eligible", true);
  const memberIds = Array.from(
    new Set(((memberRows || []) as { app_user_id: string }[]).map((r) => r.app_user_id)),
  );
  if (memberIds.length === 0) return [];

  const { data: scheduleRows } = await supabase
    .from("meta_inbox_member_schedules")
    .select("app_user_id,weekday,start_time,end_time")
    .eq("environment", env)
    .in("app_user_id", memberIds);
  const schedulesByUser = new Map<string, ScheduleRow[]>();
  for (const r of (scheduleRows || []) as {
    app_user_id: string; weekday: number; start_time: string; end_time: string;
  }[]) {
    schedulesByUser.set(r.app_user_id, [
      ...(schedulesByUser.get(r.app_user_id) || []),
      { weekday: r.weekday, startTime: r.start_time, endTime: r.end_time },
    ]);
  }

  const { data: prefRows } = await supabase
    .from("meta_inbox_user_preferences")
    .select("user_id,timezone")
    .eq("environment", env)
    .in("user_id", memberIds);
  const tzByUser = new Map<string, string>();
  for (const r of (prefRows || []) as { user_id: string; timezone: string }[]) {
    tzByUser.set(r.user_id, r.timezone);
  }

  return memberIds.map((appUserId) => ({
    appUserId,
    coversCategory: true,
    eligible: true,
    scheduleRows: schedulesByUser.get(appUserId) || [],
    tz: tzByUser.get(appUserId) || "America/Los_Angeles",
  }));
}

async function loadRotationPointer(
  supabase: DynamicClient,
  env: string,
  categoryKey: string,
): Promise<string | null> {
  const { data } = await supabase
    .from("meta_inbox_assign_rotation")
    .select("last_assigned_user_id")
    .eq("environment", env)
    .eq("queue_category_key", categoryKey)
    .maybeSingle();
  return (data as { last_assigned_user_id: string | null } | null)?.last_assigned_user_id ?? null;
}

async function saveRotationPointer(
  supabase: DynamicClient,
  env: string,
  categoryKey: string,
  nextPointer: string,
): Promise<void> {
  await supabase
    .from("meta_inbox_assign_rotation")
    .upsert(
      { environment: env, queue_category_key: categoryKey, last_assigned_user_id: nextPointer },
      { onConflict: "environment,queue_category_key" },
    );
}
