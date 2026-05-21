export type MetaAdsSyncTrigger = "cron" | "manual" | "manual_catalog" | "preview";

export type MetaAdsSyncOptions = {
  refreshPreviews: boolean;
  refreshAdCatalog: boolean;
  refreshRankingDiagnostics: boolean;
  includeCreativeDiagnostics: boolean;
};

export function syncOptionsForTrigger(
  trigger: MetaAdsSyncTrigger,
): Partial<MetaAdsSyncOptions> {
  if (trigger === "preview") return {};

  if (trigger === "manual_catalog") {
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
