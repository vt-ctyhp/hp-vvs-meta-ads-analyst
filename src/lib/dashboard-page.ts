/**
 * Shared loader for the analyst dashboard payload + permission gate.
 *
 * Today both `/` and `/analyst` render the same data while the executive
 * snapshot is being built. Centralizing the auth + fetch here keeps the two
 * routes in lockstep and avoids drift while we transition.
 *
 * When the executive snapshot lands in v1 Days 4–5, `src/app/page.tsx` stops
 * importing this helper; `src/app/analyst/page.tsx` continues using it.
 */

import { fetchDashboardData, type DashboardPayload } from "./analytics";
import type { AppPermission } from "./access-control";
import { requirePagePermission } from "./server-route-auth";

export type DashboardPageSearchParams = Record<string, string | string[] | undefined>;

export type DashboardPageResult = {
  dashboard: DashboardPayload;
  permissions: AppPermission[];
};

export async function loadDashboardPagePayload(
  params: DashboardPageSearchParams,
  requestedPath: string,
): Promise<DashboardPageResult> {
  const profile = await requirePagePermission(
    "view_dashboard",
    pathWithQuery(requestedPath, params),
  );
  const dashboard = await fetchDashboardData({
    startDate: firstParam(params.start),
    endDate: firstParam(params.end),
    days: numberParam(params.days) || 30,
  });
  return { dashboard, permissions: profile.permissions };
}

export function firstParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

export function numberParam(value: string | string[] | undefined) {
  const parsed = Number(firstParam(value));
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

export function pathWithQuery(
  pathname: string,
  params: DashboardPageSearchParams,
) {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (Array.isArray(value)) {
      for (const item of value) query.append(key, item);
    } else if (value !== undefined) {
      query.set(key, value);
    }
  }
  const search = query.toString();
  return search ? `${pathname}?${search}` : pathname;
}
