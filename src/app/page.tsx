import { DashboardClient } from "@/components/dashboard-client";
import { fetchDashboardData } from "@/lib/analytics";
import { requirePagePermission } from "@/lib/server-route-auth";

export const dynamic = "force-dynamic";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export default async function Home({ searchParams }: { searchParams?: SearchParams }) {
  const params = searchParams ? await searchParams : {};
  const profile = await requirePagePermission("view_dashboard", pathWithQuery("/", params));
  const dashboard = await fetchDashboardData({
    startDate: firstParam(params.start),
    endDate: firstParam(params.end),
    days: numberParam(params.days) || 30,
  });

  return <DashboardClient initialData={dashboard} permissions={profile.permissions} />;
}

function firstParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function numberParam(value: string | string[] | undefined) {
  const parsed = Number(firstParam(value));
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function pathWithQuery(pathname: string, params: Record<string, string | string[] | undefined>) {
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
