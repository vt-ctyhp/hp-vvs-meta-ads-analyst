import {
  APP_PERMISSIONS,
  ASSIGNABLE_USER_ROLES,
  PERMISSION_GROUPS,
  ROLE_LABELS,
  isUserRole,
  type UserRole,
} from "@/lib/access-control";
import { AuthorizationError, requirePermissionFromRequest } from "@/lib/app-auth";
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

export async function GET(request: Request) {
  try {
    const profile = await requirePermissionFromRequest(request, "view_users");
    const payload = await loadUsersPayload(profile.permissions.includes("manage_users"));
    return Response.json(payload);
  } catch (error) {
    return jsonError(error);
  }
}

export async function POST(request: Request) {
  try {
    const profile = await requirePermissionFromRequest(request, "manage_users");
    const body = (await request.json().catch(() => ({}))) as {
      email?: string;
      fullName?: string;
      roles?: unknown;
      notes?: string | null;
    };
    const email = normalizeEmail(body.email);
    const fullName = normalizeRequiredText(body.fullName, "Full name");
    const roles = normalizeRoles(body.roles);

    if (!roles.length) {
      throw new AuthorizationError("At least one role is required.", 400);
    }

    const supabase = createServiceClient();
    const invite = await supabase.auth.admin.inviteUserByEmail(email, {
      data: { full_name: fullName },
    });

    if (invite.error) throw invite.error;
    if (!invite.data.user) {
      throw new AuthorizationError("Supabase did not return an invited user.", 500);
    }

    const { data: inserted, error: insertError } = await supabase
      .from("users")
      .upsert(
        {
          auth_user_id: invite.data.user.id,
          email,
          full_name: fullName,
          active: true,
          notes: body.notes?.trim() || null,
        },
        { onConflict: "auth_user_id" },
      )
      .select("id")
      .single();

    if (insertError) throw insertError;
    await replaceUserRoles(inserted.id, roles, profile.appUserId);

    return Response.json(await loadUsersPayload(true));
  } catch (error) {
    return jsonError(error);
  }
}

export async function PATCH(request: Request) {
  try {
    const profile = await requirePermissionFromRequest(request, "manage_users");
    const body = (await request.json().catch(() => ({}))) as {
      userId?: string;
      fullName?: string;
      active?: boolean;
      notes?: string | null;
      roles?: unknown;
    };
    const userId = normalizeRequiredText(body.userId, "User ID");
    const fullName = normalizeRequiredText(body.fullName, "Full name");
    const roles = normalizeRoles(body.roles);
    const active = body.active !== false;

    if (!roles.length) {
      throw new AuthorizationError("At least one role is required.", 400);
    }

    await assertAdminWillRemain(userId, roles, active);

    const supabase = createServiceClient();
    const { error: updateError } = await supabase
      .from("users")
      .update({
        full_name: fullName,
        active,
        notes: body.notes?.trim() || null,
      })
      .eq("id", userId);

    if (updateError) throw updateError;
    await replaceUserRoles(userId, roles, profile.appUserId);

    return Response.json(await loadUsersPayload(true));
  } catch (error) {
    return jsonError(error);
  }
}

async function loadUsersPayload(canManageUsers: boolean) {
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

async function replaceUserRoles(
  userId: string,
  roles: UserRole[],
  grantedBy: string | null,
) {
  const supabase = createServiceClient();
  const { error: deleteError } = await supabase.from("user_roles").delete().eq("user_id", userId);
  if (deleteError) throw deleteError;

  const { error: insertError } = await supabase.from("user_roles").insert(
    roles.map((role) => ({
      user_id: userId,
      role,
      granted_by: grantedBy,
    })),
  );

  if (insertError) throw insertError;
}

async function assertAdminWillRemain(userId: string, nextRoles: UserRole[], nextActive: boolean) {
  if (nextActive && nextRoles.includes("admin")) return;

  const supabase = createServiceClient();
  const { data: adminRoles, error: rolesError } = await supabase
    .from("user_roles")
    .select("user_id")
    .eq("role", "admin");

  if (rolesError) throw rolesError;

  const remainingAdminIds = (adminRoles || [])
    .map((row) => row.user_id)
    .filter((id) => id !== userId);

  if (!remainingAdminIds.length) {
    throw new AuthorizationError("At least one active admin must remain.", 400);
  }

  const { data: activeAdmins, error: usersError } = await supabase
    .from("users")
    .select("id")
    .in("id", remainingAdminIds)
    .eq("active", true);

  if (usersError) throw usersError;

  if (!activeAdmins?.length) {
    throw new AuthorizationError("At least one active admin must remain.", 400);
  }
}

function normalizeRoles(value: unknown): UserRole[] {
  if (!Array.isArray(value)) return [];
  return Array.from(new Set(value.filter(isUserRole)));
}

function normalizeEmail(value: unknown) {
  const email = typeof value === "string" ? value.trim().toLowerCase() : "";
  if (!email || !email.includes("@")) {
    throw new AuthorizationError("A valid email is required.", 400);
  }
  return email;
}

function normalizeRequiredText(value: unknown, label: string) {
  const text = typeof value === "string" ? value.trim() : "";
  if (!text) throw new AuthorizationError(`${label} is required.`, 400);
  return text;
}
