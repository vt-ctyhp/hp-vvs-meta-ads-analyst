import type { User } from "@supabase/supabase-js";

import {
  isUserRole,
  permissionsForRoles,
  type AppPermission,
  type UserRole,
} from "./access-control.ts";
import { createAdsAnalystClient, usesLimitedAdsAnalystDbAccess } from "./ads-analyst-db.ts";
import { ConfigurationError, isTruthyEnv } from "./env.ts";
import { getActiveMetaInboxEnvironment } from "./meta-inbox-environment.ts";
import { createServerAuthClient, createServiceClient } from "./supabase.ts";

export type AccessProfile = {
  authenticated: boolean;
  authUserId: string | null;
  appUserId: string | null;
  email: string | null;
  fullName: string | null;
  initials: string | null;
  active: boolean;
  roles: UserRole[];
  permissions: AppPermission[];
  missingAppProfile: boolean;
  teamLead: boolean;
  teamIds: string[];
  teamUserIds: string[];
};

export const AUTH_ACCESS_COOKIE = "hp_vvs_app_access";
export const LOCAL_TEST_ACCESS_TOKEN_PREFIX = "local-test:";

const LOCAL_TEST_DEFAULT_EMAIL = "local-admin@hp-vvs.test";
const LOCAL_TEST_DEFAULT_PASSWORD = "local-test-password";

export class AuthorizationError extends Error {
  status: number;

  constructor(message: string, status = 403) {
    super(message);
    this.name = "AuthorizationError";
    this.status = status;
  }
}

type IdentityProfileRow = {
  app_user_id: string;
  auth_user_id: string;
  email: string;
  full_name: string;
  initials: string | null;
  active: boolean;
  roles: unknown;
};

type AppUserRow = {
  id: string;
  auth_user_id: string;
  email: string;
  full_name: string;
  initials: string | null;
  active: boolean;
};

type UserRoleRow = {
  role: UserRole;
};

export async function getAccessProfileFromRequest(request: Request): Promise<AccessProfile> {
  const token = bearerToken(request) || authCookieToken(request);
  if (!token) return anonymousProfile();
  return getAccessProfileForToken(token);
}

export async function requirePermissionFromRequest(
  request: Request,
  permission: AppPermission,
): Promise<AccessProfile> {
  const profile = await getAccessProfileFromRequest(request);

  if (!profile.authenticated) {
    throw new AuthorizationError("Sign in is required.", 401);
  }

  if (!profile.active || profile.missingAppProfile) {
    throw new AuthorizationError("Your account does not have access to this app.", 403);
  }

  if (!profile.permissions.includes(permission)) {
    throw new AuthorizationError("You do not have permission to perform this action.", 403);
  }

  return profile;
}

export async function getAccessProfileForToken(accessToken: string): Promise<AccessProfile> {
  const localProfile = getLocalTestAccessProfileForToken(accessToken);
  if (localProfile) return localProfile;

  try {
    const authClient = createServerAuthClient();
    const { data, error } = await authClient.auth.getUser(accessToken);

    if (error || !data.user) return anonymousProfile();

    return getAccessProfileForAuthUser(data.user);
  } catch (error) {
    if (isLocalTestAuthEnabled() && error instanceof ConfigurationError) {
      return anonymousProfile();
    }

    throw error;
  }
}

export function isLocalTestAuthEnabled() {
  return process.env.NODE_ENV !== "production" && isTruthyEnv("LOCAL_TEST_AUTH_ENABLED");
}

export function getLocalTestAuthCredentials() {
  return {
    email: process.env.LOCAL_TEST_AUTH_EMAIL?.trim() || LOCAL_TEST_DEFAULT_EMAIL,
    password: process.env.LOCAL_TEST_AUTH_PASSWORD?.trim() || LOCAL_TEST_DEFAULT_PASSWORD,
  };
}

export function getLocalTestAccessToken() {
  const { email } = getLocalTestAuthCredentials();
  return `${LOCAL_TEST_ACCESS_TOKEN_PREFIX}${email}`;
}

export function validateLocalTestCredentials(email: string, password: string) {
  if (!isLocalTestAuthEnabled()) return false;

  const credentials = getLocalTestAuthCredentials();
  return (
    email.trim().toLowerCase() === credentials.email.toLowerCase() &&
    password === credentials.password
  );
}

export function getLocalTestAccessProfileForToken(accessToken: string): AccessProfile | null {
  if (!isLocalTestAuthEnabled()) return null;
  if (accessToken !== getLocalTestAccessToken()) return null;

  const { email } = getLocalTestAuthCredentials();
  const roles: UserRole[] = ["admin"];

  return {
    authenticated: true,
    authUserId: "local-test-auth-user",
    appUserId: "local-test-app-user",
    email,
    fullName: "Local Test Admin",
    initials: "LT",
    active: true,
    roles,
    permissions: permissionsForRoles(roles),
    missingAppProfile: false,
    teamLead: false,
    teamIds: [],
    teamUserIds: [],
  };
}

async function getAccessProfileForAuthUser(user: User): Promise<AccessProfile> {
  if (!usesLimitedAdsAnalystDbAccess()) {
    return getLegacyAccessProfileForAuthUser(user);
  }

  const supabase = createAdsAnalystClient("web") as unknown as {
    schema: (schema: "analytics") => {
      from: (table: "ads_analyst_identity_profiles_v1") => {
        select: (columns: string) => {
          eq: (column: string, value: string) => {
            maybeSingle: () => Promise<{ data: IdentityProfileRow | null; error: Error | null }>;
          };
        };
      };
    };
  };
  const { data: appUser, error: userError } = await supabase
    .schema("analytics")
    .from("ads_analyst_identity_profiles_v1")
    .select("app_user_id,auth_user_id,email,full_name,initials,active,roles")
    .eq("auth_user_id", user.id)
    .maybeSingle();

  if (userError) throw userError;

  const metadataRoles = rolesFromMetadata(user.app_metadata?.roles);
  const profile = appUser as IdentityProfileRow | null;
  if (!profile || !profile.active) {
    const roles = metadataRoles;
    return {
      authenticated: true,
      authUserId: user.id,
      appUserId: null,
      email: user.email || null,
      fullName: stringFromMetadata(user.user_metadata?.full_name) || user.email || null,
      initials: null,
      active: Boolean(profile?.active),
      roles,
      permissions: permissionsForRoles(roles),
      missingAppProfile: !profile,
      teamLead: false,
      teamIds: [],
      teamUserIds: [],
    };
  }

  const roles = uniqueRoles([
    ...metadataRoles,
    ...rolesFromView(profile.roles),
  ]);

  const membership = await loadTeamMembership(
    supabase as unknown as SupabaseTeamClient,
    profile.app_user_id,
  );

  return {
    authenticated: true,
    authUserId: user.id,
    appUserId: profile.app_user_id,
    email: profile.email,
    fullName: profile.full_name,
    initials: profile.initials,
    active: profile.active,
    roles,
    permissions: permissionsForRoles(roles),
    missingAppProfile: false,
    ...membership,
  };
}

async function getLegacyAccessProfileForAuthUser(user: User): Promise<AccessProfile> {
  const supabase = createServiceClient();
  const { data: appUser, error: userError } = await supabase
    .from("users")
    .select("id,auth_user_id,email,full_name,initials,active")
    .eq("auth_user_id", user.id)
    .maybeSingle();

  if (userError) throw userError;

  const metadataRoles = rolesFromMetadata(user.app_metadata?.roles);
  const profile = appUser as AppUserRow | null;
  if (!profile || !profile.active) {
    const roles = metadataRoles;
    return {
      authenticated: true,
      authUserId: user.id,
      appUserId: null,
      email: user.email || null,
      fullName: stringFromMetadata(user.user_metadata?.full_name) || user.email || null,
      initials: null,
      active: Boolean(profile?.active),
      roles,
      permissions: permissionsForRoles(roles),
      missingAppProfile: !profile,
      teamLead: false,
      teamIds: [],
      teamUserIds: [],
    };
  }

  const { data: roleRows, error: roleError } = await supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", profile.id);

  if (roleError) throw roleError;

  const roles = uniqueRoles([
    ...metadataRoles,
    ...((roleRows || []) as UserRoleRow[]).map((row) => row.role),
  ]);

  const legacyMembership = await loadTeamMembership(
    supabase as unknown as SupabaseTeamClient,
    profile.id,
  );

  return {
    authenticated: true,
    authUserId: user.id,
    appUserId: profile.id,
    email: profile.email,
    fullName: profile.full_name,
    initials: profile.initials,
    active: profile.active,
    roles,
    permissions: permissionsForRoles(roles),
    missingAppProfile: false,
    ...legacyMembership,
  };
}

function bearerToken(request: Request) {
  const header = request.headers.get("authorization");
  if (!header?.startsWith("Bearer ")) return null;
  const token = header.slice("Bearer ".length).trim();
  return token || null;
}

function authCookieToken(request: Request) {
  return cookieValue(request.headers.get("cookie"), AUTH_ACCESS_COOKIE);
}

function cookieValue(header: string | null, name: string) {
  if (!header) return null;

  for (const part of header.split(";")) {
    const [rawKey, ...rawValue] = part.trim().split("=");
    if (rawKey !== name) continue;

    const value = rawValue.join("=").trim();
    if (!value) return null;

    try {
      return decodeURIComponent(value);
    } catch {
      return value;
    }
  }

  return null;
}

function anonymousProfile(): AccessProfile {
  return {
    authenticated: false,
    authUserId: null,
    appUserId: null,
    email: null,
    fullName: null,
    initials: null,
    active: false,
    roles: [],
    permissions: [],
    missingAppProfile: false,
    teamLead: false,
    teamIds: [],
    teamUserIds: [],
  };
}

// ---------------------------------------------------------------------------
// Team membership derivation — pure helper, exported for unit testing
// ---------------------------------------------------------------------------

export type TeamMemberRow = { team_id: string; app_user_id: string; role: string };

export function deriveTeamMembership(
  rows: TeamMemberRow[],
  appUserId: string | null,
): { teamLead: boolean; teamIds: string[]; teamUserIds: string[] } {
  if (!appUserId) return { teamLead: false, teamIds: [], teamUserIds: [] };

  // Teams where the current user is a lead
  const ledTeamIds = new Set<string>();
  // All teams the current user belongs to (any role)
  const memberTeamIds = new Set<string>();

  for (const row of rows) {
    if (row.app_user_id === appUserId) {
      memberTeamIds.add(row.team_id);
      if (row.role === "lead") ledTeamIds.add(row.team_id);
    }
  }

  const teamLead = ledTeamIds.size > 0;
  const teamIds = Array.from(memberTeamIds);

  // teamUserIds: app_user_ids of members in the teams where ME is lead, excluding ME
  const teamUserIds: string[] = [];
  if (teamLead) {
    const seen = new Set<string>();
    for (const row of rows) {
      if (ledTeamIds.has(row.team_id) && row.app_user_id !== appUserId) {
        if (!seen.has(row.app_user_id)) {
          seen.add(row.app_user_id);
          teamUserIds.push(row.app_user_id);
        }
      }
    }
  }

  return { teamLead, teamIds, teamUserIds };
}

// ---------------------------------------------------------------------------
// DB helper — loads team membership for a real app user
// ---------------------------------------------------------------------------

type SupabaseTeamClient = {
  from: (table: string) => {
    select: (columns: string) => {
      eq: (column: string, value: string) => Promise<{ data: unknown[] | null; error: unknown }>;
    };
  };
};

async function loadTeamMembership(
  supabase: SupabaseTeamClient,
  appUserId: string | null,
): Promise<{ teamLead: boolean; teamIds: string[]; teamUserIds: string[] }> {
  if (!appUserId) return { teamLead: false, teamIds: [], teamUserIds: [] };
  try {
    const { data } = await supabase
      .from("meta_inbox_team_members")
      .select("team_id,app_user_id,role")
      .eq("environment", getActiveMetaInboxEnvironment());
    return deriveTeamMembership((data || []) as TeamMemberRow[], appUserId);
  } catch {
    // Never hard-fail auth due to a metrics table read error
    return { teamLead: false, teamIds: [], teamUserIds: [] };
  }
}

function rolesFromMetadata(value: unknown): UserRole[] {
  if (!Array.isArray(value)) return [];
  return uniqueRoles(value.filter(isKnownRole));
}

function rolesFromView(value: unknown): UserRole[] {
  if (!Array.isArray(value)) return [];
  return uniqueRoles(value.filter(isKnownRole));
}

function uniqueRoles(roles: UserRole[]) {
  return Array.from(new Set(roles));
}

function isKnownRole(value: unknown): value is UserRole {
  return isUserRole(value);
}

function stringFromMetadata(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}
