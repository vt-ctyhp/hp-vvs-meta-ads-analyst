import { DashboardClient } from "@/components/dashboard-client";
import { fetchDashboardData } from "@/lib/analytics";

export const dynamic = "force-dynamic";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export default async function Home({ searchParams }: { searchParams?: SearchParams }) {
  const params = searchParams ? await searchParams : {};
  const dashboard = await fetchDashboardData({
    startDate: firstParam(params.start),
    endDate: firstParam(params.end),
    days: numberParam(params.days) || 30,
  });

  return <DashboardClient initialData={dashboard} />;
}

function firstParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function numberParam(value: string | string[] | undefined) {
  const parsed = Number(firstParam(value));
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}
