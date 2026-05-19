import { AnalystV2Client } from "@/components/analyst-v2";
import {
  loadDashboardPagePayload,
  type DashboardPageSearchParams,
} from "@/lib/dashboard-page";

export const dynamic = "force-dynamic";

type SearchParams = Promise<DashboardPageSearchParams>;

// /analyst-v2 is a from-scratch redesign of the deep-dive analyst surface.
// Coexists with /analyst (the old DashboardClient) until product approval to
// cut over. Built around a progressive drill-down: Campaigns → Ad Sets →
// Creatives → Drawer, with one focal point at a time and URL state for the
// active path.
//
// Permission gate: same as /analyst — view_dashboard.
export default async function AnalystV2Page({
  searchParams,
}: {
  searchParams?: SearchParams;
}) {
  const params = searchParams ? await searchParams : {};
  const { dashboard } = await loadDashboardPagePayload(params, "/analyst-v2", {
    defaultWow: "cal",
  });
  return <AnalystV2Client data={dashboard} />;
}
