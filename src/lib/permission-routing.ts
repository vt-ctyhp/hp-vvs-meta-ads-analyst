/**
 * Role → landing-route resolver for the 3-room IA.
 *
 * The PRD specifies that authenticated users land on the destination most
 * relevant to their job:
 *
 *   - Admin / Marketing / Read-only / Executive → /optimize (then /convert,
 *     /operate as needed).
 *   - Sales / Client Advisor / JOC → /m/inbox (mobile-equal inbox shell, no
 *     room navigation).
 *   - Sales leadership variants (sales_lead, sales_appointment_reviewer,
 *     sales_creative_reviewer) → /optimize so they can see context.
 *   - Diamond / wax / 3D / manufacturing roles without any of the above keep
 *     today's behavior: send them to /optimize when they have view_dashboard,
 *     otherwise /no-access.
 *
 * The function returns the path without origin; callers prepend the host as
 * needed. It never returns null — a user with zero permissions still gets a
 * stable next destination (`/no-access`).
 */

import type { AppPermission, UserRole } from "./access-control.ts";
import { hasPermission } from "./access-control.ts";

export type Room = "optimize" | "convert" | "operate";

export const ROOM_PATHS: Record<Room, string> = {
  optimize: "/optimize",
  convert: "/convert",
  operate: "/operate",
};

export const ROOM_PERMISSIONS: Record<Room, AppPermission> = {
  optimize: "view_dashboard",
  convert: "view_dashboard",
  operate: "manage_backfill",
};

const SALES_LIKE_ROLES: ReadonlySet<UserRole> = new Set<UserRole>([
  "sales",
  "client_advisor",
  "joc",
]);

export function resolveLandingPath(roles: UserRole[]): string {
  if (roles.length === 0) return "/no-access";

  // Sales-frontline lands on the mobile-equal inbox shell with no room nav.
  if (roles.some((role) => SALES_LIKE_ROLES.has(role))) {
    return "/m/inbox";
  }

  // Anyone else with dashboard access lands on Optimize.
  if (hasPermission(roles, "view_dashboard")) {
    return ROOM_PATHS.optimize;
  }

  // Inbox-permitted roles without dashboard fall through to the mobile inbox.
  if (hasPermission(roles, "view_inbox")) {
    return "/m/inbox";
  }

  return "/no-access";
}

export function roomsForRoles(roles: UserRole[]): Room[] {
  const rooms: Room[] = [];
  if (hasPermission(roles, ROOM_PERMISSIONS.optimize)) rooms.push("optimize");
  if (hasPermission(roles, ROOM_PERMISSIONS.convert)) rooms.push("convert");
  if (hasPermission(roles, ROOM_PERMISSIONS.operate)) rooms.push("operate");
  return rooms;
}

export function isRoom(value: string): value is Room {
  return value === "optimize" || value === "convert" || value === "operate";
}
