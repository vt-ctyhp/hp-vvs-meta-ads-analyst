import { isAuthorizedCronRequest, jsonError } from "@/lib/http";
import { revalidateAndWarmMetaInsightAggregateCache } from "@/lib/meta-insight-cache-warmup";
import { runMetaAdsBackfillBatch } from "@/lib/meta-backfill";
import { runMetaInsightBreakdownBackfillBatch } from "@/lib/meta-breakdown-backfill";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function GET(request: Request) {
  if (!isAuthorizedCronRequest(request)) {
    return Response.json({ error: "Unauthorized cron request" }, { status: 401 });
  }

  try {
    const result = await runMetaAdsBackfillBatch();
    const breakdownBackfill = await runMetaInsightBreakdownBackfillBatch();
    await revalidateAndWarmMetaInsightAggregateCache();
    return Response.json({ ...result, breakdownBackfill });
  } catch (error) {
    return jsonError(error);
  }
}
