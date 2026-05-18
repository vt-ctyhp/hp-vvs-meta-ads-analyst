import { CreativeAnalysisClient } from "@/components/creative-analysis-client";
import { fetchCreativeAnalysisData } from "@/lib/creative-analysis";
import { requirePagePermission } from "@/lib/server-route-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export default async function CreativeAnalysisPage({
  searchParams,
}: {
  searchParams?: SearchParams;
}) {
  const params = searchParams ? await searchParams : {};
  await requirePagePermission("view_creative_analysis", "/creative-analysis");
  const dashboard = await fetchCreativeAnalysisData({
    startDate: firstParam(params.start),
    endDate: firstParam(params.end),
    days: numberParam(params.days) || 30,
    includeLive: booleanParam(params.live),
  });

  return <CreativeAnalysisClient initialData={dashboard} />;
}

function firstParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function numberParam(value: string | string[] | undefined) {
  const parsed = Number(firstParam(value));
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function booleanParam(value: string | string[] | undefined) {
  const param = firstParam(value);
  return param === "1" || param === "true";
}
