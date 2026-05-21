import { ExecutiveSnapshot } from "@/components/executive-snapshot";
import {
  loadDashboardPagePayload,
  type DashboardPageSearchParams,
} from "@/lib/dashboard-page";

export const dynamic = "force-dynamic";

type SearchParams = Promise<DashboardPageSearchParams>;

/**
 * Legacy Executive Snapshot — the "Performance Broadsheet" that used to live
 * at `/`. Phase 12 cutover moved the root landing to per-role v2 rooms
 * (resolveLandingPath in `src/lib/permission-routing.ts`), so `/` now
 * redirects. The broadsheet itself is still useful as a recap surface and
 * as a fallback during the early cutover monitoring window, so we preserve
 * it at /broadsheet instead of deleting it.
 *
 * The analyst dashboard at /analyst (power users, detailed grid) is
 * unchanged.
 *
 * Default WoW window is the current calendar week (Mon → today, capped at
 * Sunday) when the user hasn't explicitly chosen via the WeekWindowToggle.
 */
export default async function BroadsheetPage({
  searchParams,
}: {
  searchParams?: SearchParams;
}) {
  const params = searchParams ? await searchParams : {};
  const { dashboard, wow } = await loadDashboardPagePayload(params, "/broadsheet", {
    defaultWow: "cal",
  });
  return <ExecutiveSnapshot data={dashboard} wow={wow} />;
}
