import { revalidateTag } from "next/cache";

import { jsonError, isAuthorizedCronRequest } from "@/lib/http";
import { META_INSIGHT_AGGREGATES_CACHE_TAG } from "@/lib/meta-insight-aggregates";
import { repairNextMetaInsightRollupChunk } from "@/lib/meta-insight-rollups";
import { createMetaRollupsCronHandler } from "@/lib/meta-rollup-cron";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

export const GET = createMetaRollupsCronHandler({
  isAuthorizedRequest: isAuthorizedCronRequest,
  repairNextChunk: repairNextMetaInsightRollupChunk,
  revalidateAggregates: () => revalidateTag(META_INSIGHT_AGGREGATES_CACHE_TAG, { expire: 0 }),
  jsonError,
});
