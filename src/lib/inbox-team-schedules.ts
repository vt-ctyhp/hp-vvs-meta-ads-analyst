// ---------------------------------------------------------------------------
// inbox-team-schedules.ts
//
// Pure helper + async data-module functions for the team eligibility/schedule
// settings surface (Task 15). No writes to public.users or assigned_user_id.
// ---------------------------------------------------------------------------

import { createAdsAnalystClient } from "./ads-analyst-db.ts";
import { AuthorizationError } from "./app-auth.ts";
import { getActiveMetaInboxEnvironment } from "./meta-inbox-environment.ts";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type SchedulePatchEntry = {
  weekday: number;
  startTime: string | null;
  endTime: string | null;
};

export type ScheduleWritePlan = {
  upserts: { weekday: number; startTime: string; endTime: string }[];
  deleteWeekdays: number[];
};

export type TeamMemberScheduleRow = {
  appUserId: string;
  fullName: string;
  autoAssignEligible: boolean;
  timezone: string | null;
  schedules: { weekday: number; startTime: string; endTime: string }[];
};

export type SchedulePatch = {
  appUserId: string;
  autoAssignEligible?: boolean;
  schedules?: SchedulePatchEntry[];
};

// Profile shape accepted by the data functions — subset of AccessProfile.
export type ScheduleSettingsProfile = {
  appUserId: string | null;
  teamLead: boolean;
  teamUserIds: readonly string[];
};

// ---------------------------------------------------------------------------
// Part A — pure helper
// ---------------------------------------------------------------------------

// Decide which weekday rows to upsert vs delete from an incoming weekly patch.
// An entry with a non-empty startTime AND endTime is an upsert; an entry with
// either blank (null/"") means that weekday is a day off -> delete.
// Weekdays must be 0-6; throws on out-of-range. Later entries for the same
// weekday win.
export function resolveScheduleWrites(
  entries: readonly SchedulePatchEntry[],
): ScheduleWritePlan {
  const byWeekday = new Map<number, SchedulePatchEntry>();
  for (const e of entries) {
    if (e.weekday < 0 || e.weekday > 6 || !Number.isInteger(e.weekday)) {
      throw new Error(`Invalid weekday: ${e.weekday}`);
    }
    byWeekday.set(e.weekday, e);
  }
  const upserts: ScheduleWritePlan["upserts"] = [];
  const deleteWeekdays: number[] = [];
  for (const [weekday, e] of byWeekday) {
    if (e.startTime && e.endTime) {
      upserts.push({ weekday, startTime: e.startTime, endTime: e.endTime });
    } else {
      deleteWeekdays.push(weekday);
    }
  }
  return { upserts, deleteWeekdays };
}

// ---------------------------------------------------------------------------
// Internal DB client — mirrors dynamicSupabaseWeb() in inbox-metrics-db.ts
// ---------------------------------------------------------------------------

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type DynamicClient = { from: (table: string) => any };

function dynamicSupabaseWeb(): DynamicClient {
  return createAdsAnalystClient("web") as unknown as DynamicClient;
}

// ---------------------------------------------------------------------------
// Part B — data module functions
// ---------------------------------------------------------------------------

/**
 * Load schedule settings for all teammates managed by the given profile.
 * Only callable for team leads (profile.teamLead === true).
 * Returns one entry per team member the lead manages.
 */
export async function loadInboxTeamScheduleSettings(
  profile: ScheduleSettingsProfile,
): Promise<TeamMemberScheduleRow[]> {
  if (!profile.teamLead || profile.teamUserIds.length === 0) {
    return [];
  }

  const env = getActiveMetaInboxEnvironment();
  const supabase = dynamicSupabaseWeb();
  const ids = Array.from(profile.teamUserIds);

  // 1. team_members rows (auto_assign_eligible)
  const { data: memberRows } = await supabase
    .from("meta_inbox_team_members")
    .select("app_user_id,auto_assign_eligible")
    .eq("environment", env)
    .in("app_user_id", ids);

  const eligibleById = new Map<string, boolean>(
    ((memberRows || []) as { app_user_id: string; auto_assign_eligible: boolean | null }[]).map(
      (r) => [r.app_user_id, r.auto_assign_eligible ?? true],
    ),
  );

  // 2. member_schedules rows
  const { data: scheduleRows } = await supabase
    .from("meta_inbox_member_schedules")
    .select("app_user_id,weekday,start_time,end_time")
    .eq("environment", env)
    .in("app_user_id", ids);

  const schedulesByUser = new Map<
    string,
    { weekday: number; startTime: string; endTime: string }[]
  >();
  for (const r of (scheduleRows || []) as {
    app_user_id: string;
    weekday: number;
    start_time: string;
    end_time: string;
  }[]) {
    const existing = schedulesByUser.get(r.app_user_id) ?? [];
    existing.push({ weekday: r.weekday, startTime: r.start_time, endTime: r.end_time });
    schedulesByUser.set(r.app_user_id, existing);
  }

  // 3. user_preferences (timezone)
  const { data: prefRows } = await supabase
    .from("meta_inbox_user_preferences")
    .select("user_id,timezone")
    .eq("environment", env)
    .in("user_id", ids);

  const timezoneById = new Map<string, string>(
    ((prefRows || []) as { user_id: string; timezone: string | null }[])
      .filter((r) => r.timezone)
      .map((r) => [r.user_id, r.timezone as string]),
  );

  // 4. Names via analytics identity view (mirrors inbox-metrics-db.ts pattern exactly)
  const { data: userRows } = await (supabase as unknown as {
    schema: (schema: "analytics") => {
      from: (table: "ads_analyst_identity_profiles_v1") => {
        select: (columns: string) => {
          in: (
            column: string,
            values: string[],
          ) => Promise<{
            data: { app_user_id: string; full_name: string | null }[] | null;
          }>;
        };
      };
    };
  })
    .schema("analytics")
    .from("ads_analyst_identity_profiles_v1")
    .select("app_user_id,full_name")
    .in("app_user_id", ids);

  const nameById = new Map<string, string | null>(
    ((userRows || []) as { app_user_id: string; full_name: string | null }[]).map((u) => [
      u.app_user_id,
      u.full_name,
    ]),
  );

  // 5. Assemble result in team-member order
  return ids.map((uid) => ({
    appUserId: uid,
    fullName: nameById.get(uid) || "Unknown",
    autoAssignEligible: eligibleById.get(uid) ?? true,
    timezone: timezoneById.get(uid) ?? null,
    schedules: (schedulesByUser.get(uid) ?? []).sort((a, b) => a.weekday - b.weekday),
  }));
}

/**
 * Apply a patch to one team member's eligibility and/or schedule.
 * Authorizes that appUserId is a member the profile may manage.
 * Throws AuthorizationError (403) if not authorized.
 */
export async function saveInboxTeamScheduleSettings(
  profile: ScheduleSettingsProfile,
  patch: SchedulePatch,
): Promise<void> {
  // Authorization: caller must be a lead AND the target must be in their team
  if (
    !profile.teamLead ||
    !profile.teamUserIds.includes(patch.appUserId)
  ) {
    throw new AuthorizationError(
      "Not authorized to manage this team member's schedule settings.",
      403,
    );
  }

  const env = getActiveMetaInboxEnvironment();
  const supabase = dynamicSupabaseWeb();

  // 1. Update auto_assign_eligible if provided
  if (typeof patch.autoAssignEligible === "boolean") {
    await supabase
      .from("meta_inbox_team_members")
      .update({ auto_assign_eligible: patch.autoAssignEligible })
      .eq("environment", env)
      .eq("app_user_id", patch.appUserId);
  }

  // 2. Apply schedule patch if provided
  if (patch.schedules !== undefined) {
    const plan = resolveScheduleWrites(patch.schedules);

    // Delete day-off weekdays
    if (plan.deleteWeekdays.length > 0) {
      await supabase
        .from("meta_inbox_member_schedules")
        .delete()
        .eq("environment", env)
        .eq("app_user_id", patch.appUserId)
        .in("weekday", plan.deleteWeekdays);
    }

    // Upsert working weekdays
    if (plan.upserts.length > 0) {
      const rows = plan.upserts.map((u) => ({
        environment: env,
        app_user_id: patch.appUserId,
        weekday: u.weekday,
        start_time: u.startTime,
        end_time: u.endTime,
      }));
      await supabase
        .from("meta_inbox_member_schedules")
        .upsert(rows, { onConflict: "environment,app_user_id,weekday" });
    }
  }
}
