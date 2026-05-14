import { DashboardClient } from "@/components/dashboard-client";
import { fetchDashboardData } from "@/lib/analytics";

export const dynamic = "force-dynamic";

export default async function Home() {
  const dashboard = await fetchDashboardData(30);
  return <DashboardClient initialData={dashboard} />;
}
