import type { AppPermission } from "./access-control";

export type AppRoute = {
  href: string;
  label: string;
  permission: AppPermission;
};

export type PermissionProfile = {
  authenticated: boolean;
  active: boolean;
  missingAppProfile: boolean;
  permissions: AppPermission[];
};

export const APP_NAV_ROUTES = [
  { href: "/", label: "Dashboard", permission: "view_dashboard" },
  { href: "/analyst", label: "Analyst View", permission: "view_dashboard" },
  { href: "/review", label: "Review", permission: "view_review" },
  { href: "/outcomes", label: "Outcomes", permission: "view_outcomes" },
  { href: "/creative-analysis", label: "Creative Analysis", permission: "view_creative_analysis" },
  { href: "/analysis", label: "AI Analysis", permission: "view_ai_analysis" },
  { href: "/website-funnel", label: "Website Funnel", permission: "view_dashboard" },
  { href: "/inbox", label: "Inbox", permission: "view_inbox" },
  { href: "/admin/backfill", label: "Backfill", permission: "view_backfill" },
  { href: "/users", label: "Users", permission: "view_users" },
] satisfies AppRoute[];

const INTERNAL_ORIGIN = "https://internal.hp-vvs.local";

export function hasInternalAppAccess(profile: PermissionProfile) {
  return (
    profile.authenticated &&
    profile.active &&
    !profile.missingAppProfile &&
    profile.permissions.length > 0
  );
}

export function firstPermittedAppPath(permissions: AppPermission[]) {
  return APP_NAV_ROUTES.find((route) => permissions.includes(route.permission))?.href || null;
}

export function getAppRouteForPath(pathname: string) {
  return APP_NAV_ROUTES.find((route) => routeMatches(route.href, pathname)) || null;
}

export function canAccessAppPath(permissions: AppPermission[], path: string) {
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
