import type { AppPermission } from "./access-control";

/**
 * Nav group. Used by the shell to render visual separators between clusters,
 * not for permission gating.
 */
export type AppRouteGroup = "performance" | "channels" | "tools" | "admin";

export type AppRoute = {
  href: string;
  label: string;
  permission: AppPermission;
  group: AppRouteGroup;
  /**
   * When true, the route renders as a placeholder page (no real content yet).
   * The shell adds a subtle "Soon" badge so users can tell at a glance
   * without having to click in.
   */
  placeholder?: boolean;
};

export type PermissionProfile = {
  authenticated: boolean;
  active: boolean;
  missingAppProfile: boolean;
  permissions: readonly AppPermission[];
};

/**
 * Nav order matters. Within each group, items are listed in the order they're
 * most likely to be used. Across groups, the order goes:
 *   performance (daily decision-making)
 *   channels    (daily customer touchpoints)
 *   tools       (occasional ad-hoc + workflow surfaces)
 *   admin       (admin / data ops)
 *
 * Labels are deliberately short and unambiguous. We had three "analysis"
 * surfaces (Analyst View / Creative Analysis / AI Analysis) which made it
 * impossible to tell which to click; they're now Analyst / Creatives /
 * Queries.
 */
export const APP_NAV_ROUTES = [
  // Performance: how the account is doing.
  { href: "/", label: "Overview", permission: "view_dashboard", group: "performance" },
  { href: "/analyst", label: "Analyst", permission: "view_dashboard", group: "performance" },
  { href: "/creative-analysis", label: "Creatives", permission: "view_creative_analysis", group: "performance" },
  // Attribution Ledger: first-party booking attribution per appointment
  // (added on main while the rebuild branch was in flight). Lives under
  // Performance because it's another lens on the same booking funnel.
  { href: "/attribution-ledger", label: "Attribution", permission: "view_dashboard", group: "performance" },

  // Channels: where customers come in.
  { href: "/inbox", label: "Inbox", permission: "view_inbox", group: "channels" },
  { href: "/website-funnel", label: "Website", permission: "view_dashboard", group: "channels" },

  // Tools: workflow + ad-hoc surfaces.
  { href: "/analysis", label: "Queries", permission: "view_ai_analysis", group: "tools" },
  { href: "/review", label: "Review", permission: "view_review", group: "tools", placeholder: true },
  { href: "/outcomes", label: "Outcomes", permission: "view_outcomes", group: "tools", placeholder: true },

  // Admin: data ops + access.
  { href: "/admin/backfill", label: "Backfill", permission: "view_backfill", group: "admin" },
  { href: "/users", label: "Users", permission: "view_users", group: "admin" },
] satisfies AppRoute[];

export const APP_ROUTE_GROUP_ORDER: AppRouteGroup[] = [
  "performance",
  "channels",
  "tools",
  "admin",
];

const INTERNAL_ORIGIN = "https://internal.hp-vvs.local";

export function hasInternalAppAccess(profile: PermissionProfile) {
  return (
    profile.authenticated &&
    profile.active &&
    !profile.missingAppProfile &&
    profile.permissions.length > 0
  );
}

export function firstPermittedAppPath(permissions: readonly AppPermission[]) {
  return APP_NAV_ROUTES.find((route) => permissions.includes(route.permission))?.href || null;
}

export function getAppRouteForPath(pathname: string) {
  return APP_NAV_ROUTES.find((route) => routeMatches(route.href, pathname)) || null;
}

export function canAccessAppPath(permissions: readonly AppPermission[], path: string) {
  const pathname = pathnameFromAppPath(path);
  const route = getAppRouteForPath(pathname);
  return Boolean(route && permissions.includes(route.permission));
}

export function getPostLoginDestination(
  profile: PermissionProfile,
  requestedNext?: string | null,
) {
  if (!hasInternalAppAccess(profile)) return null;

  const next = normalizeAppNextPath(requestedNext);
  if (next && canAccessAppPath(profile.permissions, next)) {
    return next;
  }

  return firstPermittedAppPath(profile.permissions);
}

export function normalizeAppNextPath(value?: string | null) {
  if (!value) return null;

  try {
    const url = new URL(value, INTERNAL_ORIGIN);
    if (url.origin !== INTERNAL_ORIGIN) return null;
    if (url.pathname === "/login" || url.pathname === "/no-access") return null;
    if (!getAppRouteForPath(url.pathname)) return null;

    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return null;
  }
}

function pathnameFromAppPath(path: string) {
  try {
    return new URL(path, INTERNAL_ORIGIN).pathname;
  } catch {
    return path;
  }
}

function routeMatches(routeHref: string, pathname: string) {
  if (routeHref === "/") return pathname === "/";
  return pathname === routeHref || pathname.startsWith(`${routeHref}/`);
}
