export type MetaAdsSyncTrigger =
  | "cron"
  | "cron_catalog"
  | "manual"
  | "manual_catalog"
  | "preview";

export type MetaAdsSyncOptions = {
  refreshPreviews: boolean;
  refreshAdCatalog: boolean;
  refreshRankingDiagnostics: boolean;
  includeCreativeDiagnostics: boolean;
};

/**
 * Map a trigger to the set of sync options it should run with.
 *
 * Three flavors of sync, distinguished in the sync_runs ledger:
 *   - `cron` / `manual`           → lightweight insights-only path.
 *     Catalog is NOT touched. Cheap; safe to run anytime.
 *   - `cron_catalog`              → automated nightly catalog refresh
 *     scheduled at 3 AM California time. Mirrors `manual_catalog` but
 *     records itself with a distinct trigger so we can audit human-
 *     clicked vs scheduled refreshes.
 *   - `manual_catalog`            → operator-clicked catalog refresh.
 *     Same heavy options as `cron_catalog`.
 *   - `preview`                   → no defaults; caller supplies options.
 */
export function syncOptionsForTrigger(
  trigger: MetaAdsSyncTrigger,
): Partial<MetaAdsSyncOptions> {
  if (trigger === "preview") return {};

  if (trigger === "manual_catalog" || trigger === "cron_catalog") {
    return {
      refreshPreviews: true,
      refreshAdCatalog: true,
      refreshRankingDiagnostics: true,
      includeCreativeDiagnostics: true,
    };
  }

  return {
    refreshPreviews: false,
    refreshAdCatalog: false,
    refreshRankingDiagnostics: false,
    includeCreativeDiagnostics: false,
  };
}

export function shouldCacheCreativeThumbnailsAfterSync(
  trigger: MetaAdsSyncTrigger,
) {
  return trigger === "manual_catalog" || trigger === "cron_catalog";
}
