// ---------------------------------------------------------------------------
// inbox-team-admin.ts
//
// Admin-only team management for the inbox: create/delete teams, add/remove
// members, set member vs. lead, and set per-team queue-category coverage.
// All writes target Meta-Ads-owned, env-scoped tables; never public.users.
// Names + the sales-user candidate list come from the data-boundary identity
// view (fetched all + mapped — an .in() filter on that view returns empty at
// runtime, so we mirror the proven /api/users read).
// ---------------------------------------------------------------------------

import { createAdsAnalystClient } from "./ads-analyst-db.ts";
import { AuthorizationError } from "./app-auth.ts";
import { getActiveMetaInboxEnvironment } from "./meta-inbox-environment.ts";
import { META_INBOX_QUEUE_CATEGORIES } from "./meta-inbox-vocabulary.ts";
import { loadInboxUserDirectory } from "./inbox-user-directory.ts";

export type TeamAdminProfile = {
  appUserId: string | null;
  roles: readonly string[];
};

export type TeamMemberRole = "member" | "lead";

export type TeamAdminMember = {
  appUserId: string;
  fullName: string;
  role: TeamMemberRole;
};

export type TeamAdminTeam = {
  id: string;
  name: string;
  members: TeamAdminMember[];
  coverage: string[]; // queue_category_key[]
};

export type TeamAdminData = {
  teams: TeamAdminTeam[];
  salesUsers: { appUserId: string; fullName: string }[];
  categories: { key: string; label: string }[];
};

const REAL_CATEGORIES = META_INBOX_QUEUE_CATEGORIES.filter(
  (c) => c.key !== "uncategorized_needs_review",
).map((c) => ({ key: c.key as string, label: c.label as string }));
const VALID_CATEGORY_KEYS = new Set(REAL_CATEGORIES.map((c) => c.key));

function assertAdmin(profile: TeamAdminProfile): void {
  if (!profile.roles.includes("admin")) {
    throw new AuthorizationError("Admin access required to manage teams.", 403);
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type DynamicClient = { from: (table: string) => any };
function webClient(): DynamicClient {
  return createAdsAnalystClient("web") as unknown as DynamicClient;
}

function normalizeRole(value: unknown): TeamMemberRole {
  return value === "lead" ? "lead" : "member";
}

async function loadProfiles(): Promise<{
  nameById: Map<string, string | null>;
  salesUsers: { appUserId: string; fullName: string }[];
}> {
  const directory = await loadInboxUserDirectory();
  const nameById = new Map<string, string | null>(
    directory.map((u) => [u.appUserId, u.fullName]),
  );
  const salesUsers = directory
    .filter((u) => u.active && u.roles.some((role) => role === "sales" || role === "sales_lead"))
    .map((u) => ({ appUserId: u.appUserId, fullName: u.fullName || "Unknown" }));
  return { nameById, salesUsers };
}

export async function loadTeamAdminData(profile: TeamAdminProfile): Promise<TeamAdminData> {
  assertAdmin(profile);
  const env = getActiveMetaInboxEnvironment();
  const supabase = webClient();

  const { data: teamRows } = await supabase
    .from("meta_inbox_teams")
    .select("id,name")
    .eq("environment", env)
    .eq("active", true)
    .order("name", { ascending: true });
  const teams = (teamRows || []) as { id: string; name: string }[];

  const { data: memberRows } = await supabase
    .from("meta_inbox_team_members")
    .select("team_id,app_user_id,role")
    .eq("environment", env);
  const members = (memberRows || []) as {
    team_id: string;
    app_user_id: string;
    role: TeamMemberRole;
  }[];

  const { data: coverageRows } = await supabase
    .from("meta_inbox_team_queue_access")
    .select("team_id,queue_category_key")
    .eq("environment", env);
  const coverage = (coverageRows || []) as { team_id: string; queue_category_key: string }[];

  const { nameById, salesUsers } = await loadProfiles();

  return {
    teams: teams.map((t) => ({
      id: t.id,
      name: t.name,
      members: members
        .filter((m) => m.team_id === t.id)
        .map((m) => ({
          appUserId: m.app_user_id,
          fullName: nameById.get(m.app_user_id) || "Unknown",
          role: normalizeRole(m.role),
        }))
        .sort((a, b) => a.fullName.localeCompare(b.fullName)),
      coverage: coverage.filter((c) => c.team_id === t.id).map((c) => c.queue_category_key),
    })),
    salesUsers,
    categories: REAL_CATEGORIES,
  };
}

export async function createTeam(profile: TeamAdminProfile, name: string): Promise<void> {
  assertAdmin(profile);
  const trimmed = name.trim();
  if (!trimmed) throw Object.assign(new Error("Team name is required."), { status: 400 });
  const env = getActiveMetaInboxEnvironment();
  await webClient().from("meta_inbox_teams").insert({ environment: env, name: trimmed });
}

export async function deleteTeam(profile: TeamAdminProfile, teamId: string): Promise<void> {
  assertAdmin(profile);
  if (!teamId) throw Object.assign(new Error("teamId is required."), { status: 400 });
  const env = getActiveMetaInboxEnvironment();
  const supabase = webClient();
  // Remove dependents first (FKs may or may not cascade for the scoped role).
  await supabase.from("meta_inbox_team_queue_access").delete().eq("environment", env).eq("team_id", teamId);
  await supabase.from("meta_inbox_team_members").delete().eq("environment", env).eq("team_id", teamId);
  await supabase.from("meta_inbox_teams").delete().eq("environment", env).eq("id", teamId);
}

export async function addTeamMember(
  profile: TeamAdminProfile,
  args: { teamId: string; appUserId: string; role: TeamMemberRole },
): Promise<void> {
  assertAdmin(profile);
  if (!args.teamId || !args.appUserId) {
    throw Object.assign(new Error("teamId and appUserId are required."), { status: 400 });
  }
  const env = getActiveMetaInboxEnvironment();
  await webClient()
    .from("meta_inbox_team_members")
    .upsert(
      {
        environment: env,
        team_id: args.teamId,
        app_user_id: args.appUserId,
        role: normalizeRole(args.role),
      },
      { onConflict: "team_id,app_user_id" },
    );
}

export async function removeTeamMember(
  profile: TeamAdminProfile,
  args: { teamId: string; appUserId: string },
): Promise<void> {
  assertAdmin(profile);
  const env = getActiveMetaInboxEnvironment();
  await webClient()
    .from("meta_inbox_team_members")
    .delete()
    .eq("environment", env)
    .eq("team_id", args.teamId)
    .eq("app_user_id", args.appUserId);
}

export async function setMemberRole(
  profile: TeamAdminProfile,
  args: { teamId: string; appUserId: string; role: TeamMemberRole },
): Promise<void> {
  assertAdmin(profile);
  const env = getActiveMetaInboxEnvironment();
  await webClient()
    .from("meta_inbox_team_members")
    .update({ role: normalizeRole(args.role) })
    .eq("environment", env)
    .eq("team_id", args.teamId)
    .eq("app_user_id", args.appUserId);
}

export async function setTeamCoverage(
  profile: TeamAdminProfile,
  args: { teamId: string; categoryKeys: string[] },
): Promise<void> {
  assertAdmin(profile);
  if (!args.teamId) throw Object.assign(new Error("teamId is required."), { status: 400 });
  const valid = Array.from(new Set(args.categoryKeys.filter((k) => VALID_CATEGORY_KEYS.has(k))));
  const env = getActiveMetaInboxEnvironment();
  const supabase = webClient();
  await supabase
    .from("meta_inbox_team_queue_access")
    .delete()
    .eq("environment", env)
    .eq("team_id", args.teamId);
  if (valid.length) {
    await supabase.from("meta_inbox_team_queue_access").insert(
      valid.map((k) => ({ environment: env, team_id: args.teamId, queue_category_key: k })),
    );
  }
}
