import { WebsiteFunnelClient } from "@/components/website-funnel-client";
import { requirePagePermission } from "@/lib/server-route-auth";
import { fetchWebsiteFunnelData } from "@/lib/website-analytics";

export const dynamic = "force-dynamic";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export default async function WebsiteFunnelPage({
  searchParams,
}: {
  searchParams?: SearchParams;
}) {
  const params = searchParams ? await searchParams : {};
  await requirePagePermission("view_dashboard", "/website-funnel");
  const data = await fetchWebsiteFunnelData({
    startDate: firstParam(params.start),
    endDate: firstParam(params.end),
    days: numberParam(params.days) || 30,
  });

  return <WebsiteFunnelClient initialData={data} />;
}

function firstParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function numberParam(value: string | string[] | undefined) {
  const parsed = Number(firstParam(value));
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}
