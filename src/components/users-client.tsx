"use client";

import {
  AlertTriangle,
  Check,
  Shield,
  Users,
} from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";

import type {
  APP_PERMISSIONS,
  PERMISSION_GROUPS,
  ROLE_LABELS,
  UserRole,
} from "@/lib/access-control";
import { AUTH, translateError } from "@/lib/glossary";
import { createBrowserClient } from "@/lib/supabase";

type PermissionLabelMap = typeof APP_PERMISSIONS;
type PermissionGroup = (typeof PERMISSION_GROUPS)[number];

type UsersPayload = {
  canManageUsers: boolean;
  users: TeamUser[];
  roleOptions: Array<{ role: UserRole; label: string }>;
  permissionGroups: PermissionGroup[];
  permissionLabels: PermissionLabelMap;
};

type TeamUser = {
  id: string;
  authUserId: string;
  email: string;
  fullName: string;
  initials: string | null;
  active: boolean;
  notes: string | null;
  roles: UserRole[];
  createdAt: string;
  updatedAt: string;
};

type EditableUser = TeamUser & {
  draftFullName: string;
  draftActive: boolean;
  draftNotes: string;
  draftRoles: UserRole[];
};

type AccessProfile = {
  authenticated: boolean;
  email: string | null;
  fullName: string | null;
  roles: UserRole[];
  permissions: string[];
  missingAppProfile: boolean;
};

const ROLE_ORDER: UserRole[] = [
  "admin",
  "marketing",
  "sales",
  "client_advisor",
  "joc",
  "diamond_order_admin",
  "diamond_order_assistant",
  "wax_request_admin",
  "read_only",
];

const CAN_EDIT_USERS = false;

export function UsersClient({ loginNextPath = "/operate/users" }: { loginNextPath?: string } = {}) {
  const [profile, setProfile] = useState<AccessProfile | null>(null);
  const [payload, setPayload] = useState<UsersPayload | null>(null);
  const [users, setUsers] = useState<EditableUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState("");

  const roleLabels = useMemo(
    () =>
      Object.fromEntries(
        (payload?.roleOptions || []).map((option) => [option.role, option.label]),
      ) as Partial<typeof ROLE_LABELS>,
    [payload?.roleOptions],
  );
  const loadUsers = useCallback(async function loadUsers() {
    await Promise.resolve();
    setLoading(true);
    setStatus("");

    try {
      const token = await currentAccessToken();
      if (!token) {
        setProfile({ authenticated: false, email: null, fullName: null, roles: [], permissions: [], missingAppProfile: false });
        setPayload(null);
        setUsers([]);
        return;
      }

      const [profileResponse, usersResponse] = await Promise.all([
        fetch("/api/auth/me", { headers: { authorization: `Bearer ${token}` } }),
        fetch("/api/users", { headers: { authorization: `Bearer ${token}` } }),
      ]);
      const nextProfile = (await profileResponse.json()) as AccessProfile;
      setProfile(nextProfile);

      const nextPayload = await usersResponse.json();
      if (!usersResponse.ok) {
        throw new Error(nextPayload.error || "Could not load users.");
      }

      setPayload(nextPayload);
      setUsers(nextPayload.users.map(toEditableUser));
    } catch (error) {
      setStatus(translateError(error));
      setPayload(null);
      setUsers([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      void loadUsers();
    }, 0);
    return () => window.clearTimeout(timeout);
  }, [loadUsers]);

  function patchUser(userId: string, patch: Partial<EditableUser>) {
    setUsers((current) =>
      current.map((user) => (user.id === userId ? { ...user, ...patch } : user)),
    );
  }

  if (loading) {
    return (
      <main className="min-h-screen bg-hp-foundation px-4 py-8 text-hp-body md:px-8">
        <section className="mx-auto max-w-5xl border border-hp-rule bg-hp-card p-6">
          <p className="bg-hp-inset px-3 py-2 text-[11px] uppercase tracking-[0.14em] text-hp-muted">
            Loading users
          </p>
        </section>
      </main>
    );
  }

  if (profile && !profile.authenticated) {
    return (
      <AccessMessage
        title={`${AUTH.signIn} required`}
        body="The users page requires an approved internal account."
        actionHref={`/login?next=${encodeURIComponent(loginNextPath)}`}
        actionLabel={AUTH.signIn}
      />
    );
  }

  if (!payload) {
    return (
      <AccessMessage
        title="Access unavailable"
        body={status || "You do not have permission to view user management."}
        actionHref="/"
        actionLabel="Return to dashboard"
      />
    );
  }

  return (
    <main className="min-h-screen bg-hp-foundation px-4 py-6 text-hp-body md:px-8">
      <header className="mx-auto flex max-w-7xl flex-col gap-5 border-b border-hp-rule pb-6 md:flex-row md:items-end md:justify-between">
        <div>
          <span className="text-[11px] uppercase tracking-[0.14em] text-hp-muted">
            Internal Access
          </span>
          <h1 className="mt-2 font-title text-4xl leading-tight text-hp-ink md:text-5xl">
            Users & Permissions
          </h1>
          <p className="mt-3 max-w-3xl text-sm leading-6 text-hp-body">
            Review Supabase-backed app users and the roles that control internal dashboard
            access. User and role changes are managed outside this app.
          </p>
        </div>
        <div className="border border-hp-rule bg-hp-card p-4 text-sm leading-6">
          Signed in as <span className="text-hp-ink">{profile?.email}</span>
        </div>
      </header>

      <section className="mx-auto mt-6 grid max-w-7xl gap-4 lg:grid-cols-3">
        {payload.permissionGroups.map((group) => (
          <div key={group.key} className="border border-hp-rule bg-hp-card p-4">
            <div className="flex items-center gap-2 text-hp-ink">
              <Shield size={18} />
              <span className="text-[11px] uppercase tracking-[0.14em]">{group.label}</span>
            </div>
            <p className="mt-3 text-sm leading-6 text-hp-body">{group.description}</p>
            <div className="mt-4 flex flex-wrap gap-2">
              {group.permissions.map((permission) => (
                <span
                  key={permission}
                  className="border border-hp-rule bg-hp-inset px-2 py-1 text-[11px] text-hp-body"
                  title={payload.permissionLabels[permission].description}
                >
                  {payload.permissionLabels[permission].label}
                </span>
              ))}
            </div>
          </div>
        ))}
      </section>

      <section className="mx-auto mt-6 max-w-7xl border border-hp-rule bg-hp-card">
        <div className="flex items-center gap-2 border-b border-hp-rule p-4 text-hp-ink">
          <Users size={18} />
          <span className="text-[11px] uppercase tracking-[0.14em]">Team users</span>
        </div>
        <div className="divide-y divide-hp-rule">
          {users.map((user) => (
            <article key={user.id} className="grid gap-4 p-4 xl:grid-cols-[1.2fr_1.4fr_1fr_auto]">
              <div>
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center border border-hp-rule bg-hp-inset text-sm text-hp-ink">
                    {user.initials || user.draftFullName.slice(0, 2).toUpperCase()}
                  </div>
                  <div>
                    <p className="text-hp-ink">{user.fullName}</p>
                    <p className="text-sm text-hp-muted">{user.email}</p>
                  </div>
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  {user.roles.map((role) => (
                    <span key={role} className="border border-hp-rule px-2 py-1 text-[11px] text-hp-body">
                      {roleLabels[role] || role}
                    </span>
                  ))}
                </div>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <TextInput
                  label="Full name"
                  value={user.draftFullName}
                  onChange={(value) => patchUser(user.id, { draftFullName: value })}
                  disabled={!CAN_EDIT_USERS}
                />
                <label className="block">
                  <span className="mb-2 block text-[10px] uppercase tracking-[0.14em] text-hp-muted">
                    Status
                  </span>
                  <select
                    value={user.draftActive ? "active" : "inactive"}
                    onChange={(event) =>
                      patchUser(user.id, { draftActive: event.target.value === "active" })
                    }
                    disabled={!CAN_EDIT_USERS}
                    className="h-10 w-full border border-hp-rule bg-hp-inset px-3 text-sm outline-none focus:border-hp-pink disabled:opacity-60"
                  >
                    <option value="active">Active</option>
                    <option value="inactive">Inactive</option>
                  </select>
                </label>
                <label className="block sm:col-span-2">
                  <span className="mb-2 block text-[10px] uppercase tracking-[0.14em] text-hp-muted">
                    Notes
                  </span>
                  <textarea
                    value={user.draftNotes}
                    onChange={(event) => patchUser(user.id, { draftNotes: event.target.value })}
                    rows={2}
                    disabled={!CAN_EDIT_USERS}
                    className="w-full resize-none border border-hp-rule bg-hp-inset p-3 text-sm outline-none focus:border-hp-pink disabled:opacity-60"
                  />
                </label>
              </div>

              <RoleCheckboxes
                label="Assigned roles"
                roles={user.draftRoles}
                roleOptions={payload.roleOptions}
                roleLabels={roleLabels}
                onChange={(roles) => patchUser(user.id, { draftRoles: roles })}
                disabled={!CAN_EDIT_USERS}
              />
            </article>
          ))}
        </div>
      </section>

      {status ? <p className="mx-auto mt-4 max-w-7xl text-sm text-hp-body">{status}</p> : null}
    </main>
  );
}

function AccessMessage({
  title,
  body,
  actionHref,
  actionLabel,
}: {
  title: string;
  body: string;
  actionHref: string;
  actionLabel: string;
}) {
  return (
    <main className="min-h-screen bg-hp-foundation px-4 py-8 text-hp-body md:px-8">
      <section className="mx-auto max-w-3xl border border-hp-rule bg-hp-card p-6">
        <div className="flex items-start gap-3">
          <AlertTriangle size={20} className="mt-1 text-signal-warning" />
          <div>
            <p className="text-[11px] uppercase tracking-[0.14em] text-hp-muted">
              Users & Permissions
            </p>
            <h1 className="mt-2 font-title text-3xl text-hp-ink">{title}</h1>
            <p className="mt-3 text-sm leading-6 text-hp-body">{body}</p>
            <Link
              href={actionHref}
              className="mt-5 inline-flex bg-hp-ink px-5 py-3 text-[11px] uppercase tracking-[0.14em] text-hp-foundation transition-colors hover:bg-hp-pink"
            >
              {actionLabel}
            </Link>
          </div>
        </div>
      </section>
    </main>
  );
}

function TextInput({
  label,
  value,
  onChange,
  type = "text",
  required = false,
  disabled = false,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: string;
  required?: boolean;
  disabled?: boolean;
}) {
  return (
    <label className="block">
      <span className="mb-2 block text-[10px] uppercase tracking-[0.14em] text-hp-muted">
        {label}
      </span>
      <input
        type={type}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        required={required}
        disabled={disabled}
        className="h-10 w-full border border-hp-rule bg-hp-inset px-3 text-sm outline-none focus:border-hp-pink disabled:opacity-60"
      />
    </label>
  );
}

function RoleCheckboxes({
  label,
  roles,
  roleOptions,
  roleLabels,
  onChange,
  disabled = false,
}: {
  label: string;
  roles: UserRole[];
  roleOptions: Array<{ role: UserRole; label: string }>;
  roleLabels: Partial<typeof ROLE_LABELS>;
  onChange: (roles: UserRole[]) => void;
  disabled?: boolean;
}) {
  const sortedOptions = [...roleOptions].sort(
    (a, b) => ROLE_ORDER.indexOf(a.role) - ROLE_ORDER.indexOf(b.role),
  );

  function toggle(role: UserRole) {
    if (roles.includes(role)) {
      onChange(roles.filter((current) => current !== role));
    } else {
      onChange([...roles, role]);
    }
  }

  return (
    <div>
      <span className="mb-2 block text-[10px] uppercase tracking-[0.14em] text-hp-muted">
        {label}
      </span>
      <div className="flex flex-wrap gap-2">
        {sortedOptions.map((option) => {
          const checked = roles.includes(option.role);
          return (
            <button
              key={option.role}
              type="button"
              onClick={() => toggle(option.role)}
              disabled={disabled}
              className={`inline-flex items-center gap-1 border px-2 py-1 text-[11px] transition-colors ${
                checked
                  ? "border-hp-ink bg-hp-ink text-hp-foundation"
                  : "border-hp-rule bg-hp-inset text-hp-body hover:border-hp-ink"
              } disabled:opacity-60`}
            >
              {checked ? <Check size={12} /> : null}
              {roleLabels[option.role] || option.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

async function currentAccessToken() {
  const supabase = createBrowserClient();
  const { data } = await supabase.auth.getSession();
  return data.session?.access_token || null;
}

function toEditableUser(user: TeamUser): EditableUser {
  return {
    ...user,
    draftFullName: user.fullName,
    draftActive: user.active,
    draftNotes: user.notes || "",
    draftRoles: user.roles,
  };
}
