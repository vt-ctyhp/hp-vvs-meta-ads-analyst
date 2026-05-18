import type { User } from "@supabase/supabase-js";

import {
  permissionsForRoles,
  type AppPermission,
  type UserRole,
} from "./access-control";
import { createServerAuthClient, createServiceClient } from "./supabase";

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
};

export const AUTH_ACCESS_COOKIE = "hp_vvs_app_access";

export class AuthorizationError extends Error {
  status: number;

  constructor(message: string, status = 403) {
    super(message);
    this.name = "AuthorizationError";
    this.status = status;
  }
}

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
  const authClient = createServerAuthClient();
  const { data, error } = await authClient.auth.getUser(accessToken);

  if (error || !data.user) return anonymousProfile();

  return getAccessProfileForAuthUser(data.user);
}

async function getAccessProfileForAuthUser(user: User): Promise<AccessProfile> {
  const supabase = createServiceClient();
  const { data: appUser, error: userError } = await supabase
    .from("users")
    .select("id,auth_user_id,email,full_name,initials,active")
    .eq("auth_user_id", user.id)
    .maybeSingle();

  if (userError) throw userError;

  const metadataRoles = rolesFromMetadata(user.app_metadata?.roles);
  if (!appUser || !appUser.active) {
    const roles = metadataRoles;
    return {
      authenticated: true,
      authUserId: user.id,
      appUserId: null,
      email: user.email || null,
      fullName: stringFromMetadata(user.user_metadata?.full_name) || user.email || null,
      initials: null,
      active: Boolean(appUser?.active),
      roles,
      permissions: permissionsForRoles(roles),
      missingAppProfile: !appUser,
    };
  }

  const { data: roleRows, error: roleError } = await supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", appUser.id);

  if (roleError) throw roleError;

  const roles = uniqueRoles([
    ...metadataRoles,
    ...((roleRows || []) as UserRoleRow[]).map((row) => row.role),
  ]);

  return {
    authenticated: true,
    authUserId: user.id,
    appUserId: appUser.id,
    email: appUser.email,
    fullName: appUser.full_name,
    initials: appUser.initials,
    active: appUser.active,
    roles,
    permissions: permissionsForRoles(roles),
    missingAppProfile: false,
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
  };
}

function rolesFromMetadata(value: unknown): UserRole[] {
  if (!Array.isArray(value)) return [];
  return uniqueRoles(value.filter(isKnownRole));
}

function uniqueRoles(roles: UserRole[]) {
  return Array.from(new Set(roles));
}

function isKnownRole(value: unknown): value is UserRole {
  return (
    value === "admin" ||
    value === "marketing" ||
    value === "sales" ||
    value === "client_advisor" ||
    value === "joc" ||
    value === "diamond_order_admin" ||
    value === "diamond_order_assistant" ||
    value === "wax_request_admin" ||
    value === "read_only"
  );
}

function stringFromMetadata(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}
