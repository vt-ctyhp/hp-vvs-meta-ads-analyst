import { revalidateTag } from "next/cache";

import { isAuthorizedCronRequest, jsonError } from "@/lib/http";
import { META_INSIGHT_AGGREGATES_CACHE_TAG } from "@/lib/meta-insight-aggregates";
import { runMetaAdsBackfillBatch } from "@/lib/meta-backfill";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function POST(request: Request) {
  if (!isAuthorizedCronRequest(request)) {
    return Response.json({ error: "Unauthorized backfill request" }, { status: 401 });
  }

  try {
    const body = (await request.json().catch(() => ({}))) as { limit?: number };
    const result = await runMetaAdsBackfillBatch({ limit: body.limit });
    revalidateTag(META_INSIGHT_AGGREGATES_CACHE_TAG, { expire: 0 });
    return Response.json(result);
  } catch (error) {
    return jsonError(error);
  }
}
