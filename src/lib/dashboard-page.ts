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
import {
  normalizeAnalystPeriodCount,
  type AnalystPeriodCount,
} from "./analyst-periods";
import { requirePagePermission } from "./server-route-auth";
import { isWowMode, resolveWowWindow, type WowMode } from "./wow-window";

export type DashboardPageSearchParams = Record<string, string | string[] | undefined>;

export type DashboardPageResult = {
  dashboard: DashboardPayload;
  permissions: AppPermission[];
  analystPeriodCount: AnalystPeriodCount;
  /**
   * The active week-over-week mode if one was applied (via `?wow=cal|rolling`
   * or via `defaultWow`). Null when the legacy days/start/end input was used.
   * Rendered surfaces inspect this to know which toggle state to highlight.
   */
  wow: WowMode | null;
};

export type LoadDashboardOptions = {
  /**
   * If `?wow=` is missing from the URL, fall back to this mode. Defaults to
   * `null` (preserve legacy days/start/end behavior). The executive snapshot
   * will pass `"cal"` here to default to the current calendar week.
   */
  defaultWow?: WowMode | null;
};

export async function loadDashboardPagePayload(
  params: DashboardPageSearchParams,
  requestedPath: string,
  options: LoadDashboardOptions = {},
): Promise<DashboardPageResult> {
  const profile = await requirePagePermission(
    "view_dashboard",
    pathWithQuery(requestedPath, params),
  );

  const wowParam = firstParam(params.wow);
  const wow = isWowMode(wowParam) ? wowParam : options.defaultWow ?? null;
  const analystPeriodCount = normalizeAnalystPeriodCount(firstParam(params.periods));

  if (wow) {
    const window = resolveWowWindow(wow);
    const dashboard = await fetchDashboardData({
      startDate: window.start,
      endDate: window.end,
      periodCount: analystPeriodCount,
      includeLowerLevels: false,
    });
    return { dashboard, permissions: profile.permissions, analystPeriodCount, wow };
  }

  const dashboard = await fetchDashboardData({
    startDate: firstParam(params.start),
    endDate: firstParam(params.end),
    days: numberParam(params.days) || 30,
    periodCount: analystPeriodCount,
    includeLowerLevels: false,
  });
  return { dashboard, permissions: profile.permissions, analystPeriodCount, wow: null };
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
