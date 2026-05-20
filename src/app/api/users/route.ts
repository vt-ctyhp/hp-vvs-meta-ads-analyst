import {
  APP_PERMISSIONS,
  ASSIGNABLE_USER_ROLES,
  PERMISSION_GROUPS,
  ROLE_LABELS,
  type UserRole,
} from "@/lib/access-control";
import { AuthorizationError, requirePermissionFromRequest } from "@/lib/app-auth";
import { createAdsAnalystClient, usesLimitedAdsAnalystDbAccess } from "@/lib/ads-analyst-db";
import { jsonError } from "@/lib/http";
import { createServiceClient } from "@/lib/supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type UserRow = {
  id: string;
  auth_user_id: string;
  email: string;
  full_name: string;
  initials: string | null;
  active: boolean;
  notes: string | null;
  created_at: string;
  updated_at: string;
};

type RoleRow = {
  user_id: string;
  role: UserRole;
};

type IdentityProfileRow = {
  app_user_id: string;
  auth_user_id: string;
  email: string;
  full_name: string;
  initials: string | null;
  active: boolean;
  roles: unknown;
};

export async function GET(request: Request) {
  try {
    await requirePermissionFromRequest(request, "view_users");
    const payload = await loadUsersPayload(false);
    return Response.json(payload);
  } catch (error) {
    return jsonError(error);
  }
}

export async function POST(request: Request) {
  try {
    await requirePermissionFromRequest(request, "manage_users");
    throw new AuthorizationError(
      "Ads Analyst user-management writes are disabled by the ERP data boundary.",
      403,
    );
  } catch (error) {
    return jsonError(error);
  }
}

export async function PATCH(request: Request) {
  try {
    await requirePermissionFromRequest(request, "manage_users");
    throw new AuthorizationError(
      "Ads Analyst user-management writes are disabled by the ERP data boundary.",
      403,
    );
  } catch (error) {
    return jsonError(error);
  }
}

async function loadUsersPayload(canManageUsers: boolean) {
  if (usesLimitedAdsAnalystDbAccess()) {
    return loadUsersPayloadFromBoundaryView(canManageUsers);
  }

  const supabase = createServiceClient();
  const [usersRes, rolesRes] = await Promise.all([
    supabase
      .from("users")
      .select("id,auth_user_id,email,full_name,initials,active,notes,created_at,updated_at")
      .order("full_name", { ascending: true }),
    supabase.from("user_roles").select("user_id,role"),
  ]);

  if (usersRes.error) throw usersRes.error;
  if (rolesRes.error) throw rolesRes.error;

  const rolesByUser = new Map<string, UserRole[]>();
  for (const row of (rolesRes.data || []) as RoleRow[]) {
    rolesByUser.set(row.user_id, [...(rolesByUser.get(row.user_id) || []), row.role]);
  }

  return {
    canManageUsers,
    users: ((usersRes.data || []) as UserRow[]).map((user) => ({
      id: user.id,
      authUserId: user.auth_user_id,
      email: user.email,
      fullName: user.full_name,
      initials: user.initials,
      active: user.active,
      notes: user.notes,
      roles: rolesByUser.get(user.id) || [],
      createdAt: user.created_at,
      updatedAt: user.updated_at,
    })),
    roleOptions: ASSIGNABLE_USER_ROLES.map((role) => ({
      role,
      label: ROLE_LABELS[role],
    })),
    permissionGroups: PERMISSION_GROUPS,
    permissionLabels: APP_PERMISSIONS,
  };
}

async function loadUsersPayloadFromBoundaryView(canManageUsers: boolean) {
  const supabase = createAdsAnalystClient("web") as unknown as {
    schema: (schema: "analytics") => {
      from: (table: "ads_analyst_identity_profiles_v1") => {
        select: (columns: string) => {
          order: (
            column: string,
            options: { ascending: boolean },
          ) => Promise<{ data: IdentityProfileRow[] | null; error: Error | null }>;
        };
      };
    };
  };
  const { data, error } = await supabase
    .schema("analytics")
    .from("ads_analyst_identity_profiles_v1")
    .select("app_user_id,auth_user_id,email,full_name,initials,active,roles")
    .order("full_name", { ascending: true });

  if (error) throw error;

  return {
    canManageUsers,
    users: ((data || []) as IdentityProfileRow[]).map((user) => ({
      id: user.app_user_id,
      authUserId: user.auth_user_id,
      email: user.email,
      fullName: user.full_name,
      initials: user.initials,
      active: user.active,
      notes: null,
      roles: rolesFromView(user.roles),
      createdAt: "",
      updatedAt: "",
    })),
    roleOptions: ASSIGNABLE_USER_ROLES.map((role) => ({
      role,
      label: ROLE_LABELS[role],
    })),
    permissionGroups: PERMISSION_GROUPS,
    permissionLabels: APP_PERMISSIONS,
  };
}

function rolesFromView(value: unknown): UserRole[] {
  if (!Array.isArray(value)) return [];
  return value.filter((role): role is UserRole =>
    ASSIGNABLE_USER_ROLES.includes(role as UserRole),
  );
}
