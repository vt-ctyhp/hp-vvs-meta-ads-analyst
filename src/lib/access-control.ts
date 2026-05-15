import type { Database } from "./database.types";

export type UserRole = Database["public"]["Enums"]["user_role"];

export type AppPermission =
  | "view_dashboard"
  | "view_creative_analysis"
  | "view_ai_analysis"
  | "view_inbox"
  | "view_backfill"
  | "run_meta_sync"
  | "manage_backfill"
  | "view_users"
  | "manage_users";

export type PermissionGroup = {
  key: "admin" | "marketing" | "sales";
  label: string;
  description: string;
  roles: UserRole[];
  permissions: AppPermission[];
};

export const APP_PERMISSIONS: Record<AppPermission, { label: string; description: string }> = {
  view_dashboard: {
    label: "Dashboard",
    description: "View account performance, reports, and high-level Meta Ads summaries.",
  },
  view_creative_analysis: {
    label: "Creative Analysis",
    description: "Review creative scorecards, diagnostics, and recommendations.",
  },
  view_ai_analysis: {
    label: "AI Analysis",
    description: "Use saved and ad-hoc analysis dashboards.",
  },
  view_inbox: {
    label: "Inbox",
    description: "View social inbox readiness and customer conversation surfaces.",
  },
  view_backfill: {
    label: "Backfill Read-Only",
    description: "View historical Meta Ads backfill coverage, jobs, and data health.",
  },
  run_meta_sync: {
    label: "Manual Sync",
    description: "Trigger read-only Meta data refresh actions where exposed.",
  },
  manage_backfill: {
    label: "Backfill Admin",
    description: "Create, pause, resume, and inspect historical Meta Ads backfill jobs.",
  },
  view_users: {
    label: "Users",
    description: "View team members, roles, and permission assignments.",
  },
  manage_users: {
    label: "Manage Users",
    description: "Invite users, change roles, and activate or deactivate access.",
  },
};

export const PERMISSION_GROUPS: PermissionGroup[] = [
  {
    key: "admin",
    label: "Admin",
    description: "Full internal access, including backfill operations and user management.",
    roles: ["admin"],
    permissions: [
      "view_dashboard",
      "view_creative_analysis",
      "view_ai_analysis",
      "view_inbox",
      "view_backfill",
      "run_meta_sync",
      "manage_backfill",
      "view_users",
      "manage_users",
    ],
  },
  {
    key: "marketing",
    label: "Marketing",
    description: "Dashboard, creative, AI, inbox visibility, and read-only backfill access.",
    roles: ["marketing"],
    permissions: [
      "view_dashboard",
      "view_creative_analysis",
      "view_ai_analysis",
      "view_inbox",
      "view_backfill",
    ],
  },
  {
    key: "sales",
    label: "Sales",
    description: "Inbox-only access for appointment and customer follow-up.",
    roles: ["sales", "client_advisor", "joc"],
    permissions: ["view_inbox"],
  },
];

export const ASSIGNABLE_USER_ROLES: UserRole[] = [
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

export const ROLE_LABELS: Record<UserRole, string> = {
  admin: "Admin",
  marketing: "Marketing",
  sales: "Sales",
  client_advisor: "Client Advisor",
  joc: "JOC",
  diamond_order_admin: "Diamond Order Admin",
  diamond_order_assistant: "Diamond Order Assistant",
  wax_request_admin: "Wax Request Admin",
  read_only: "Read Only",
};

export function permissionsForRoles(roles: UserRole[]): AppPermission[] {
  const permissions = new Set<AppPermission>();

  for (const role of roles) {
    if (role === "admin") {
      PERMISSION_GROUPS.find((group) => group.key === "admin")?.permissions.forEach((permission) =>
        permissions.add(permission),
      );
      continue;
    }

    if (role === "marketing") {
      PERMISSION_GROUPS.find((group) => group.key === "marketing")?.permissions.forEach((permission) =>
        permissions.add(permission),
      );
      continue;
    }

    if (role === "sales" || role === "client_advisor" || role === "joc") {
      PERMISSION_GROUPS.find((group) => group.key === "sales")?.permissions.forEach((permission) =>
        permissions.add(permission),
      );
      continue;
    }

    if (role === "diamond_order_admin" || role === "diamond_order_assistant") {
      ["view_dashboard", "view_ai_analysis", "view_inbox"].forEach((permission) =>
        permissions.add(permission as AppPermission),
      );
      continue;
    }

    if (role === "wax_request_admin") {
      ["view_dashboard", "view_ai_analysis"].forEach((permission) =>
        permissions.add(permission as AppPermission),
      );
      continue;
    }

    if (role === "read_only") {
      [
        "view_dashboard",
        "view_creative_analysis",
        "view_ai_analysis",
        "view_inbox",
        "view_backfill",
        "view_users",
      ].forEach((permission) => permissions.add(permission as AppPermission));
    }
  }

  return Array.from(permissions);
}

export function hasPermission(roles: UserRole[], permission: AppPermission) {
  return permissionsForRoles(roles).includes(permission);
}

export function isUserRole(value: unknown): value is UserRole {
  return typeof value === "string" && ASSIGNABLE_USER_ROLES.includes(value as UserRole);
}
