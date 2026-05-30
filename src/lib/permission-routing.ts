/**
 * Role → landing-route resolver for the 3-room IA.
 *
 * The PRD specifies that authenticated users land on the destination most
 * relevant to their job:
 *
 *   - Admin / Marketing / Read-only / Executive → /analyst (then /convert,
 *     /operate as needed).
 *   - Sales → /convert/inbox by default (desktop inbox in the Convert room).
 *     The Convert dashboard stays gated behind view_dashboard; the phone-first
 *     /m/inbox shell remains available.
 *   - Sales leadership variants (sales_lead, sales_appointment_reviewer,
 *     sales_creative_reviewer) → /analyst so they can see context.
 *   - Diamond / wax / 3D / manufacturing roles without any of the above keep
 *     today's behavior: send them to /analyst when they have view_dashboard,
 *     otherwise /no-access.
 *
 * The function returns the path without origin; callers prepend the host as
 * needed. It never returns null — a user with zero permissions still gets a
 * stable next destination (`/no-access`).
 */

import type { AppPermission, UserRole } from "./access-control.ts";
import { hasPermission } from "./access-control.ts";

export type Room = "analyst" | "convert" | "operate";

export const ROOM_PATHS: Record<Room, string> = {
  analyst: "/analyst",
  convert: "/convert",
  operate: "/operate/pipelines",
};

export const ROOM_PERMISSIONS: Record<Room, AppPermission> = {
  analyst: "view_dashboard",
  convert: "view_dashboard",
  operate: "view_backfill",
};

export function resolveLandingPath(roles: UserRole[]): string {
  if (roles.length === 0) return "/no-access";

  // Dashboard users land in Analyst, which is the canonical marketing home.
  if (hasPermission(roles, "view_dashboard")) {
    return ROOM_PATHS.analyst;
  }

  // Inbox-permitted roles without dashboard (frontline sales, etc.) default to
  // the desktop inbox in the Convert room.
  if (hasPermission(roles, "view_inbox")) {
    return "/convert/inbox";
  }

  return "/no-access";
}

export function roomsForRoles(roles: UserRole[]): Room[] {
  const rooms: Room[] = [];
  if (
    hasPermission(roles, "view_dashboard") ||
    hasPermission(roles, "view_creative_analysis") ||
    hasPermission(roles, "view_ai_analysis")
  ) {
    rooms.push("analyst");
  }
  // Convert holds the desktop inbox; inbox-permitted roles (e.g. frontline
  // sales) get the room so they can reach /convert/inbox. Per-page gates still
  // keep the Convert dashboard (view_dashboard) and Review (view_review) out.
  if (hasPermission(roles, "view_dashboard") || hasPermission(roles, "view_inbox")) {
    rooms.push("convert");
  }
  if (
    hasPermission(roles, "view_backfill") ||
    hasPermission(roles, "manage_backfill") ||
    hasPermission(roles, "view_users")
  ) {
    rooms.push("operate");
  }
  return rooms;
}

export function firstWorkspaceHref(
  rooms: readonly Room[],
  permissions: readonly AppPermission[],
) {
  if (rooms.includes("analyst")) {
    if (permissions.includes("view_dashboard")) return "/analyst";
    if (permissions.includes("view_creative_analysis")) return "/analyst/creative-analysis";
    if (permissions.includes("view_ai_analysis")) return "/analysis";
  }

  if (rooms.includes("convert")) {
    if (permissions.includes("view_dashboard")) return "/convert";
    if (permissions.includes("view_inbox")) return "/convert/inbox";
  }

  if (rooms.includes("operate")) {
    if (permissions.includes("view_backfill") || permissions.includes("manage_backfill")) {
      return "/operate/pipelines";
    }
    if (permissions.includes("view_users")) return "/operate/users";
  }

  const firstRoom = rooms[0];
  return firstRoom ? ROOM_PATHS[firstRoom] : "/no-access";
}

export function isRoom(value: string): value is Room {
  return value === "analyst" || value === "convert" || value === "operate";
}
