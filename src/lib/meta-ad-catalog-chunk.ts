// Pure engine for the chunked, self-healing ad-catalog refresh.
//
// The single 132-page `act_X/ads` walk used to abort the whole refresh on the
// first Meta throttle or the 300s Vercel cap, writing zero rows. Instead, each
// cron run processes a budgeted slice of the stalest ad sets, fetching each ad
// set's ads independently and stamping its freshness. This module holds only the
// loop logic behind injected deps so it is fully unit-testable; the Supabase and
// Meta Graph wiring lives in meta.ts (syncAdCatalogChunk).

export type AdSetChunkDeps = {
  // Ad-set ids already ordered stalest-first (NULL / oldest ads_refreshed_at first).
  listAdSets: () => Promise<string[]>;
  fetchAds: (adSetId: string) => Promise<Record<string, unknown>[]>;
  persist: (
    adSetId: string,
    ads: Record<string, unknown>[],
  ) => Promise<{ ads: number; creatives: number }>;
  stampRefreshed: (adSetId: string) => Promise<void>;
  now: () => number;
  budgetMs: number;
};

export type AdCatalogChunkResult = {
  status: "ok" | "budget_exhausted";
  adSetsProcessed: number;
  ads: number;
  creatives: number;
  errors: string[];
};

export async function runAdCatalogChunk(
  deps: AdSetChunkDeps,
): Promise<AdCatalogChunkResult> {
  const start = deps.now();
  const adSetIds = await deps.listAdSets();
  const result: AdCatalogChunkResult = {
    status: "ok",
    adSetsProcessed: 0,
    ads: 0,
    creatives: 0,
    errors: [],
  };

  for (const adSetId of adSetIds) {
    if (deps.now() - start > deps.budgetMs) {
      result.status = "budget_exhausted";
      break;
    }
    try {
      const ads = await deps.fetchAds(adSetId);
      const counts = await deps.persist(adSetId, ads);
      // Stamp only after a successful fetch+persist. A failure leaves
      // ads_refreshed_at unchanged so this ad set is retried next run.
      await deps.stampRefreshed(adSetId);
      result.adSetsProcessed += 1;
      result.ads += counts.ads;
      result.creatives += counts.creatives;
    } catch (error) {
      result.errors.push(error instanceof Error ? error.message : String(error));
    }
  }

  return result;
}
