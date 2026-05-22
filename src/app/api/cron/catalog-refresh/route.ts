import { revalidateTag } from "next/cache";

import { CREATIVE_ANALYSIS_CACHE_TAG } from "@/lib/creative-analysis";
import { jsonError, isAuthorizedCronRequest } from "@/lib/http";
import { META_INSIGHT_AGGREGATES_CACHE_TAG } from "@/lib/meta-insight-aggregates";
import { syncMetaAds } from "@/lib/meta";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// Catalog refresh hits /campaigns + /adsets + /ads + /adcreatives + per-ad
// preview fetches and the ranking-diagnostics insights pass. Even with
// the active-only /ads filter, the full sweep typically takes 1-3 min on
// HP's account. 300s is the Vercel function ceiling we already use for
// the lightweight /api/cron/sync route.
export const maxDuration = 300;

/**
 * Daily automated catalog refresh.
 *
 * Schedule: `0 11 * * *` UTC = 3 AM PST / 4 AM PDT (see vercel.json).
 * The 1 AM-5 AM California window is the cheapest time to spend the
 * Meta Ads-Management hourly call budget — no operators are clicking
 * sync or running ad-hoc reports.
 *
 * Why a separate route from `/api/cron/sync`:
 *   - /api/cron/sync runs with `syncMetaAds("cron")` which goes through
 *     `syncOptionsForTrigger("cron")` = lightweight insights only. We
 *     don't want to overload it with a catalog flag because the daily
 *     1 PM UTC tick is when operators want fresh metrics, not a 3-minute
 *     entity sweep that could rate-limit them.
 *   - Distinguishing `cron_catalog` from `manual_catalog` in the
 *     sync_runs ledger makes it obvious whether a refresh was scheduled
 *     vs. operator-clicked.
 *
 * Authorized via the same CRON_SECRET as the other cron routes.
 */
export async function GET(request: Request) {
  if (!isAuthorizedCronRequest(request)) {
    return Response.json({ error: "Unauthorized cron request" }, { status: 401 });
  }

  try {
    const result = await syncMetaAds("cron_catalog");
    revalidateTag(META_INSIGHT_AGGREGATES_CACHE_TAG, { expire: 0 });
    revalidateTag(CREATIVE_ANALYSIS_CACHE_TAG, { expire: 0 });
    return Response.json(result);
  } catch (error) {
    return jsonError(error);
  }
}
