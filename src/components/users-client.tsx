"use client";

import {
  AlertTriangle,
  Check,
  Shield,
  UserPlus,
  Users,
} from "lucide-react";
import Link from "next/link";
import { type FormEvent, useCallback, useEffect, useMemo, useState } from "react";

import type {
  APP_PERMISSIONS,
  PERMISSION_GROUPS,
  ROLE_LABELS,
  UserRole,
} from "@/lib/access-control";
import { AUTH } from "@/lib/glossary";
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

export function UsersClient() {
  const [profile, setProfile] = useState<AccessProfile | null>(null);
  const [payload, setPayload] = useState<UsersPayload | null>(null);
  const [users, setUsers] = useState<EditableUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingUserId, setSavingUserId] = useState<string | null>(null);
  const [status, setStatus] = useState("");
  const [inviteStatus, setInviteStatus] = useState("");
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteName, setInviteName] = useState("");
  const [inviteNotes, setInviteNotes] = useState("");
  const [inviteRoles, setInviteRoles] = useState<UserRole[]>(["marketing"]);

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
      setStatus(error instanceof Error ? error.message : String(error));
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

  async function saveUser(user: EditableUser) {
    setSavingUserId(user.id);
    setStatus("");

    try {
      const token = await currentAccessToken();
      if (!token) throw new Error("Sign in is required.");

      const response = await fetch("/api/users", {
        method: "PATCH",
        headers: {
          authorization: `Bearer ${token}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          userId: user.id,
          fullName: user.draftFullName,
          active: user.draftActive,
          notes: user.draftNotes,
          roles: user.draftRoles,
        }),
      });
      const nextPayload = await response.json();
      if (!response.ok) throw new Error(nextPayload.error || "Could not save user.");
      setPayload(nextPayload);
      setUsers(nextPayload.users.map(toEditableUser));
      setStatus(`${user.draftFullName} updated.`);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : String(error));
    } finally {
      setSavingUserId(null);
    }
  }

  async function inviteUser(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setInviteStatus("");
    setStatus("");

    try {
      const token = await currentAccessToken();
      if (!token) throw new Error("Sign in is required.");

      const response = await fetch("/api/users", {
        method: "POST",
        headers: {
          authorization: `Bearer ${token}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          email: inviteEmail,
          fullName: inviteName,
          notes: inviteNotes,
          roles: inviteRoles,
        }),
      });
      const nextPayload = await response.json();
      if (!response.ok) throw new Error(nextPayload.error || "Could not invite user.");
      setPayload(nextPayload);
      setUsers(nextPayload.users.map(toEditableUser));
      setInviteEmail("");
      setInviteName("");
      setInviteNotes("");
      setInviteRoles(["marketing"]);
      setInviteStatus(`Invitation prepared for ${inviteEmail}.`);
    } catch (error) {
      setInviteStatus(error instanceof Error ? error.message : String(error));
    }
  }

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
        actionHref="/login?next=/users"
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
            Manage Supabase-backed app users and assign the roles that control internal dashboard
            access.
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

      {payload.canManageUsers ? (
        <section className="mx-auto mt-6 max-w-7xl border border-hp-rule bg-hp-card p-4">
          <div className="mb-4 flex items-center gap-2 text-hp-ink">
            <UserPlus size={18} />
            <span className="text-[11px] uppercase tracking-[0.14em]">Invite user</span>
          </div>
          <form onSubmit={inviteUser} className="grid gap-4 lg:grid-cols-[1fr_1fr_1.2fr_auto]">
            <TextInput label="Full name" value={inviteName} onChange={setInviteName} required />
            <TextInput label="Email" value={inviteEmail} onChange={setInviteEmail} type="email" required />
            <RoleCheckboxes
              label="Roles"
              roles={inviteRoles}
              roleOptions={payload.roleOptions}
              roleLabels={roleLabels}
              onChange={setInviteRoles}
            />
            <button
              type="submit"
              className="self-end bg-hp-ink px-5 py-3 text-[11px] uppercase tracking-[0.14em] text-hp-foundation transition-colors hover:bg-hp-pink"
            >
              Invite
            </button>
          </form>
          <label className="mt-4 block">
            <span className="mb-2 block text-[10px] uppercase tracking-[0.14em] text-hp-muted">
              Notes
            </span>
            <textarea
              value={inviteNotes}
              onChange={(event) => setInviteNotes(event.target.value)}
              rows={2}
              className="w-full resize-none border border-hp-rule bg-hp-inset p-3 text-sm outline-none focus:border-hp-pink"
            />
          </label>
          {inviteStatus ? <p className="mt-3 text-sm text-hp-body">{inviteStatus}</p> : null}
        </section>
      ) : null}

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
                  disabled={!payload.canManageUsers}
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
                    disabled={!payload.canManageUsers}
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
                    disabled={!payload.canManageUsers}
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
                disabled={!payload.canManageUsers}
              />

              <button
                onClick={() => saveUser(user)}
                disabled={!payload.canManageUsers || savingUserId === user.id}
                className="self-start border border-hp-ink px-4 py-3 text-[11px] uppercase tracking-[0.14em] text-hp-ink transition-colors hover:bg-hp-ink hover:text-hp-foundation disabled:opacity-60"
              >
                {savingUserId === user.id ? "Saving" : "Save"}
              </button>
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
