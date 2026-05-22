import { revalidateTag } from "next/cache";

import { CREATIVE_ANALYSIS_CACHE_TAG } from "@/lib/creative-analysis";
import { jsonError, isAuthorizedCronRequest } from "@/lib/http";
import { revalidateAndWarmMetaInsightAggregateCache } from "@/lib/meta-insight-cache-warmup";
import { syncMetaAds } from "@/lib/meta";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function GET(request: Request) {
  if (!isAuthorizedCronRequest(request)) {
    return Response.json({ error: "Unauthorized cron request" }, { status: 401 });
  }

  try {
    const result = await syncMetaAds("cron");
    await revalidateAndWarmMetaInsightAggregateCache();
    revalidateTag(CREATIVE_ANALYSIS_CACHE_TAG, { expire: 0 });
    return Response.json(result);
  } catch (error) {
    return jsonError(error);
  }
}
