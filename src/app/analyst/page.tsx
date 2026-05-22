import { DashboardClient } from "@/components/dashboard-client";
import {
  loadDashboardPagePayload,
  type DashboardPageSearchParams,
} from "@/lib/dashboard-page";

export const dynamic = "force-dynamic";

type SearchParams = Promise<DashboardPageSearchParams>;

export default async function AnalystDashboardPage({
  searchParams,
}: {
  searchParams?: SearchParams;
}) {
  const params = searchParams ? await searchParams : {};
  const { dashboard, permissions, analystPeriodCount } = await loadDashboardPagePayload(
    params,
    "/analyst",
  );
  return (
    <DashboardClient
      initialData={dashboard}
      permissions={permissions}
      initialPeriodCount={analystPeriodCount}
    />
  );
}
