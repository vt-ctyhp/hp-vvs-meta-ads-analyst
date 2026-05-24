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

export const OPTIMIZE_DEFAULT_DAYS = 7;
export const OPTIMIZE_DEFAULT_PERIODS = 1;
export const ANALYST_LANDING_PATH = "/analyst";
export const MOBILE_INBOX_LANDING_PATH = "/m/inbox";
export const OPTIMIZE_LANDING_PATH = ANALYST_LANDING_PATH;

/**
 * Nav order matters. Within each group, items are listed in the order they're
 * most likely to be used. Across groups, the order goes:
 *   performance (daily decision-making)
 *   channels    (daily customer touchpoints)
 *   tools       (occasional ad-hoc + workflow surfaces)
 *   admin       (admin / data ops)
 *
 * Labels are deliberately short and unambiguous. Final visible IA has three
 * primary rooms: Analyst, Convert, and Operate.
 */
export const APP_NAV_ROUTES = [
  { href: "/analyst", label: "Analyst", permission: "view_dashboard", group: "performance" },
  { href: "/analyst/creative-analysis", label: "Creative Analysis", permission: "view_creative_analysis", group: "performance" },
  { href: "/analysis", label: "AI Analysis", permission: "view_ai_analysis", group: "performance" },

  // Channels: where customers come in.
  { href: "/convert", label: "Convert", permission: "view_dashboard", group: "channels" },
  { href: "/convert/inbox", label: "Inbox", permission: "view_inbox", group: "channels" },

  // Admin: data ops + access.
  { href: "/operate/pipelines", label: "Pipelines", permission: "view_backfill", group: "admin" },
  { href: "/operate/coverage", label: "Coverage", permission: "view_backfill", group: "admin" },
  { href: "/operate/health", label: "Health", permission: "view_backfill", group: "admin" },
  { href: "/operate/users", label: "Users", permission: "view_users", group: "admin" },
] satisfies AppRoute[];

export const APP_ROUTE_GROUP_ORDER: AppRouteGroup[] = [
  "performance",
  "channels",
  "tools",
  "admin",
];

type AppAccessRoute = Pick<AppRoute, "href" | "permission">;

const APP_ACCESS_ROUTES = [
  { href: "/admin/backfill", permission: "view_backfill" },
  { href: "/website-funnel", permission: "view_dashboard" },
  { href: "/attribution-ledger", permission: "view_dashboard" },
  { href: "/operate", permission: "view_backfill" },
  { href: "/m/inbox", permission: "view_inbox" },
  ...APP_NAV_ROUTES,
] satisfies AppAccessRoute[];

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
  if (permissions.includes("view_dashboard")) return ANALYST_LANDING_PATH;
  if (permissions.includes("view_inbox")) return MOBILE_INBOX_LANDING_PATH;

  return APP_NAV_ROUTES.find((route) => permissions.includes(route.permission))?.href || null;
}

export function getAppRouteForPath(pathname: string) {
  return (
    APP_ACCESS_ROUTES
      .filter((route) => routeMatches(route.href, pathname))
      .sort((a, b) => b.href.length - a.href.length)[0] || null
  );
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
  if (next && pathnameFromAppPath(next) !== "/" && canAccessAppPath(profile.permissions, next)) {
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
