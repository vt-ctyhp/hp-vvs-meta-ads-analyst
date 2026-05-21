import { ExecutiveSnapshot } from "@/components/executive-snapshot";
import {
  loadDashboardPagePayload,
  type DashboardPageSearchParams,
} from "@/lib/dashboard-page";

export const dynamic = "force-dynamic";

type SearchParams = Promise<DashboardPageSearchParams>;

// / is the Executive Snapshot as of v1 Days 4-5. The analyst dashboard lives
// at /analyst (unchanged) for power users.
//
// Default WoW window is the current calendar week (Mon → today, capped at
// Sunday) when the user hasn't explicitly chosen via the WeekWindowToggle.
export default async function Home({
  searchParams,
}: {
  searchParams?: SearchParams;
}) {
  const params = searchParams ? await searchParams : {};
  const { dashboard, wow } = await loadDashboardPagePayload(params, "/", {
    defaultWow: "cal",
  });
  return <ExecutiveSnapshot data={dashboard} wow={wow} />;
}
