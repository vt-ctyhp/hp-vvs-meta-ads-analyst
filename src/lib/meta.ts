import { ConfigurationError, getMetaApiVersion } from "./env.ts";
import { AsyncLocalStorage } from "node:async_hooks";
import {
  cacheThumbnailBatch,
  type ThumbnailBatchResult,
} from "./creative-thumbnail-batch.ts";
import {
  classifyCampaignUmbrella,
  isCampaignUmbrella,
  type CampaignUmbrellaClassification,
  type CampaignUmbrellaOverride,
} from "./campaign-umbrellas.ts";
import {
  buildInsightDateParams,
  finalizedInsightCutoffDate,
  incrementalDatePreset,
  incrementalSyncDays,
  todayString,
  type InsightDateRange,
} from "./meta-backfill-utils.ts";
import { resolveMetaKpi } from "./meta-kpi.ts";
import {
  shouldCacheCreativeThumbnailsAfterSync,
  syncOptionsForTrigger,
  type MetaAdsSyncTrigger,
} from "./meta-sync-options.ts";
import {
  adsAnalystOnConflict,
  createAdsAnalystClient,
  getAdsAnalystEnvironment,
  usesEnvironmentScopedAdsAnalystUpserts,
  usesLimitedAdsAnalystDbAccess,
  withAdsAnalystEnvironment,
  withAdsAnalystEnvironmentRows,
} from "./ads-analyst-db.ts";
import {
  runAdCatalogChunk,
  type AdSetChunkDeps,
} from "./meta-ad-catalog-chunk.ts";
import type { Json } from "./database.types.ts";

type JsonRecord = Record<string, unknown>;

type MetaPaging<T> = {
  data?: T[];
  paging?: {
    next?: string;
  };
  error?: {
    message?: string;
    type?: string;
    code?: number;
    error_subcode?: number;
  };
};

type PageOptions = {
  maxPages?: number;
  signal?: AbortSignal;
};

export type MetaUsageSample = {
  path: string;
  maxPercent: number;
  observedAt: string;
  app?: JsonRecord;
  adAccount?: JsonRecord;
  businessUseCase?: JsonRecord;
};

export type MetaUsageSummary = {
  maxPercent: number;
  thresholdPercent: number;
  overThreshold: boolean;
  byPath: Record<string, { maxPercent: number; samples: number }>;
  samples: MetaUsageSample[];
};

export type MetaUsageCollector = {
  record: (sample: MetaUsageSample) => void;
  summary: () => MetaUsageSummary;
};

type MetaPermission = {
  permission: string;
  status: string;
};

type PermissionStatus = {
  ok: boolean;
  required: string[];
  missing: string[];
  optionalMissing?: string[];
  warnings?: string[];
};

export type SyncAccountConfig = {
  brandCode: "HP" | "VVS";
  brandName: string;
  accountId: string;
};

type SyncMetrics = {
  accounts: number;
  campaigns: number;
  adSets: number;
  ads: number;
  creatives: number;
  insightRows: number;
  previewRefreshes: number;
  adSetsProcessed?: number;
  enrichment?: SyncEnrichmentMetrics;
  metaUsage?: MetaUsageSummary;
  audit?: SyncAuditSummary;
  thumbnailCache?: ThumbnailBatchResult;
};

type SyncEnrichmentMetrics = {
  insightSidecarRows: number;
  adLabels: number;
  adPixels: number;
  customConversions: number;
  skipped: Array<{ account: string; group: string; reason: string }>;
};

type InsightAggregateSnapshot = {
  rows: number;
  spend: number;
  impressions: number;
  clicks: number;
  leads: number;
  bookings: number;
  conversions: number;
};

type InsightBucketSnapshot = InsightAggregateSnapshot & {
  month: string;
  campaignUmbrella: string;
};

type AccountSyncAudit = {
  brandCode: string;
  metaAccountId: string;
  requestedRange: string;
  fetchedRows: number;
  validRows: number;
  storedRows: number;
  skippedFinalizedRows: number;
  skippedInvalidRows: number;
  duplicateFetchedRows: number;
  allowFinalizedUpdates: boolean;
  finalizedCutoffDate: string | null;
  affectedRange: { start: string | null; end: string | null };
  before: InsightAggregateSnapshot;
  after: InsightAggregateSnapshot;
  delta: InsightAggregateSnapshot;
  changedBuckets: InsightBucketSnapshot[];
  warnings: string[];
};

type InsightRankingDiagnostics = {
  objective: string | null;
  optimizationGoal: string | null;
  qualityRanking: string | null;
  engagementRateRanking: string | null;
  conversionRateRanking: string | null;
};

type SyncAuditSummary = {
  incrementalRefreshDays: number;
  finalizedCutoffDate: string;
  accounts: AccountSyncAudit[];
  warnings: string[];
};

export const META_CAMPAIGN_CATALOG_FIELDS = [
  "id",
  "name",
  "objective",
  "status",
  "effective_status",
  "buying_type",
  "daily_budget",
  "lifetime_budget",
  "budget_remaining",
  "bid_strategy",
  "pacing_type",
  "budget_rebalance_flag",
  "start_time",
  "stop_time",
  "created_time",
  "updated_time",
] as const;

export const META_AD_SET_CATALOG_FIELDS = [
  "id",
  "name",
  "campaign_id",
  "status",
  "effective_status",
  "optimization_goal",
  "billing_event",
  "bid_strategy",
  "daily_budget",
  "lifetime_budget",
  "budget_remaining",
  "learning_stage_info",
  "attribution_spec",
  "promoted_object",
  "destination_type",
  "targeting_optimization_types",
  "is_dynamic_creative",
  "is_budget_schedule_enabled",
  "start_time",
  "end_time",
  "created_time",
  "updated_time",
  "targeting",
] as const;

const META_AD_CREATIVE_CORE_CATALOG_FIELDS = [
  "id",
  "name",
  "title",
  "body",
  "thumbnail_url",
  "image_url",
  "image_hash",
  "object_type",
  "object_story_id",
  "effective_object_story_id",
  "object_story_spec",
  "asset_feed_spec",
  "call_to_action_type",
  "video_id",
] as const;

export const META_AD_CREATIVE_CATALOG_FIELDS = [
  ...META_AD_CREATIVE_CORE_CATALOG_FIELDS,
  "call_to_action",
  "url_tags",
  "instagram_permalink_url",
  "effective_instagram_media_id",
  "degrees_of_freedom_spec",
] as const;

const META_AD_CORE_CATALOG_FIELDS = [
  "id",
  "name",
  "campaign_id",
  "adset_id",
  "status",
  "configured_status",
  "effective_status",
  "created_time",
  "updated_time",
  `creative{${META_AD_CREATIVE_CORE_CATALOG_FIELDS.join(",")}}`,
] as const;

export const META_AD_CATALOG_FIELDS = [
  "id",
  "name",
  "campaign_id",
  "adset_id",
  "status",
  "configured_status",
  "effective_status",
  "tracking_specs",
  "tracking_and_conversion_with_defaults",
  "preview_shareable_link",
  "ad_active_time",
  "created_time",
  "updated_time",
  `creative{${META_AD_CREATIVE_CATALOG_FIELDS.join(",")}}`,
] as const;

// Catalog refresh paginates an account's whole active+paused ad inventory (and
// derives meta_creatives from the same payload). The binding limit is the PAGE
// COUNT, not the page size: graphPages throws as soon as a `next` cursor
// survives maxPages, which aborts the entire catalog refresh before a single
// ad/creative row is written (last good write 2026-05-16, so every ad newer
// than that — and its thumbnail — went missing from the ledger). The HP account
// crossed the old 50/page x 100-page = 5,000-ad ceiling, so a 250-page ceiling
// (12,500 ads at the proven 50/page) clears it.
//
// Do NOT raise the per-page size: META_AD_CATALOG_FIELDS is heavy (nested
// creative + raw specs) and Meta rejects larger pages outright with "please
// reduce the amount of data you're asking for" (verified: a 100/page run failed
// before writing any ad). Both values stay env-overridable.
export const META_AD_CATALOG_PAGE_LIMIT = 50;
export const DEFAULT_META_SYNC_MAX_AD_PAGES = 250;

const META_AD_STATUS_FIELDS = [
  "id",
  "name",
  "campaign_id",
  "adset_id",
  "status",
  "configured_status",
  "effective_status",
  "created_time",
  "updated_time",
  "creative{id}",
] as const;

const META_CAMPAIGN_STATUS_FIELDS = [
  "id",
  "name",
  "status",
  "effective_status",
  "created_time",
  "updated_time",
] as const;

const META_AD_SET_STATUS_FIELDS = [
  "id",
  "name",
  "campaign_id",
  "status",
  "effective_status",
  "created_time",
  "updated_time",
] as const;

export const META_INSIGHT_CORE_FIELDS = [
  "campaign_id",
  "campaign_name",
  "objective",
  "adset_id",
  "adset_name",
  "optimization_goal",
  "ad_id",
  "ad_name",
  "date_start",
  "date_stop",
  "spend",
  "impressions",
  "reach",
  "frequency",
  "cpm",
  "cpc",
  "ctr",
  "clicks",
  "inline_link_clicks",
  "inline_link_click_ctr",
  "unique_clicks",
  "actions",
  "action_values",
  "cost_per_action_type",
] as const;

export const META_INSIGHT_ENRICHMENT_FIELDS = [
  "account_currency",
  "attribution_setting",
  "cost_per_result",
  "result_rate",
  "outbound_clicks",
  "unique_outbound_clicks",
  "cost_per_outbound_click",
  "website_ctr",
  "landing_page_view_per_link_click",
  "landing_page_view_actions_per_link_click",
  "inline_post_engagement",
  "instagram_profile_visits",
  "social_spend",
  "cost_per_inline_link_click",
  "cost_per_inline_post_engagement",
  "conversions",
] as const;

export const META_INSIGHT_BREAKDOWN_SETS = [
  "demographic",
  "geo",
  "placement",
  "device",
  "hourly_advertiser",
  "hourly_audience",
] as const;

export type MetaInsightBreakdownSet = (typeof META_INSIGHT_BREAKDOWN_SETS)[number];

export const META_INSIGHT_BREAKDOWN_FIELDS_BY_SET: Record<MetaInsightBreakdownSet, string[]> = {
  demographic: ["age", "gender"],
  geo: ["country", "region", "dma"],
  placement: ["publisher_platform", "platform_position"],
  device: ["impression_device"],
  hourly_advertiser: ["hourly_stats_aggregated_by_advertiser_time_zone"],
  hourly_audience: ["hourly_stats_aggregated_by_audience_time_zone"],
};

const META_INSIGHT_BREAKDOWN_CORE_FIELDS = [
  "campaign_id",
  "adset_id",
  "ad_id",
  "date_start",
  "date_stop",
  "spend",
  "impressions",
  "reach",
  "clicks",
  "inline_link_clicks",
  "actions",
] as const;

export type MetaAccountInsightTotals = {
  brandCode: SyncAccountConfig["brandCode"];
  metaAccountId: string;
  rows: number;
  spend: number;
  impressions: number;
  clicks: number;
  leads: number;
  bookings: number;
  conversions: number;
};

export type MetaCreativeAnalysisInsight = JsonRecord & {
  brand_code: SyncAccountConfig["brandCode"];
  meta_account_id: string;
};

export type MetaCreativeAnalysisInsightsResult = {
  rows: MetaCreativeAnalysisInsight[];
  warnings: string[];
  unavailableFields: string[];
  adAccounts: Array<{
    brandCode: SyncAccountConfig["brandCode"];
    metaAccountId: string;
  }>;
};

type MetaActionMetricRows = Array<Record<string, unknown>>;

export type MetaAdVideoMetrics = {
  adId: string;
  adName: string | null;
  actions: MetaActionMetricRows;
  videoPlayActions: MetaActionMetricRows;
  videoP25WatchedActions: MetaActionMetricRows;
  videoP50WatchedActions: MetaActionMetricRows;
  videoP75WatchedActions: MetaActionMetricRows;
  videoP95WatchedActions: MetaActionMetricRows;
  videoP100WatchedActions: MetaActionMetricRows;
  videoThruplayWatchedActions: MetaActionMetricRows;
};

export type DynamicSupabaseClient = {
  from: (table: string) => {
    upsert: (
      rows: JsonRecord[],
      options: { onConflict: string; defaultToNull?: boolean },
    ) => {
      select: (columns: string) => Promise<{ data: JsonRecord[] | null; error: Error | null }>;
    };
  };
};
type SupabaseSelectChain = PromiseLike<{ data: unknown; error: Error | null }> & {
  eq: (column: string, value: unknown) => SupabaseSelectChain;
  gte: (column: string, value: unknown) => SupabaseSelectChain;
  in: (column: string, values: unknown[]) => SupabaseSelectChain;
  lte: (column: string, value: unknown) => SupabaseSelectChain;
  range: (from: number, to: number) => SupabaseSelectChain;
};
type SupabaseSelectClient = {
  from: (table: string) => {
    select: (columns: string) => SupabaseSelectChain;
  };
};

export type SyncResult = {
  status: "success" | "partial" | "failed";
  metrics: SyncMetrics;
  errors: string[];
  syncRunId?: string;
};

const FORBIDDEN_META_PERMISSIONS = ["ads_management"];
const ADS_SYNC_REQUIRED_PERMISSIONS = ["ads_read"];
const ADS_SYNC_OPTIONAL_PERMISSIONS = ["read_insights"];
const SOCIAL_INBOX_REQUIRED_PERMISSIONS = [
  "pages_show_list",
  "pages_manage_metadata",
  "pages_read_engagement",
  "pages_messaging",
  "instagram_basic",
  "instagram_manage_messages",
  "instagram_manage_comments",
];
const SOCIAL_REPLY_REQUIRED_PERMISSIONS = ["pages_manage_engagement"];

class MetaGraphError extends Error {
  details?: unknown;

  constructor(message: string, details?: unknown) {
    super(message);
    this.name = "MetaGraphError";
    this.details = details;
  }
}

export async function syncMetaAds(trigger: MetaAdsSyncTrigger = "manual") {
  const supabase = createAdsAnalystClient("worker");
  const accounts = getConfiguredAccounts();
  const runInsert = await supabase
    .from("sync_runs")
    .insert(withAdsAnalystEnvironment({
      trigger,
      status: "running",
      ad_account_ids: accounts.map((account) => account.accountId),
    }))
    .select("id")
    .single();

  if (runInsert.error) {
    throw runInsert.error;
  }

  const syncRunId = String(runInsert.data.id);
  const metrics: SyncMetrics = {
    accounts: 0,
    campaigns: 0,
    adSets: 0,
    ads: 0,
    creatives: 0,
    insightRows: 0,
    previewRefreshes: 0,
    enrichment: emptyEnrichmentMetrics(),
  };
  const metaUsageCollector = createMetaUsageCollector();
  const auditSummary: SyncAuditSummary = {
    incrementalRefreshDays: incrementalSyncDays(),
    finalizedCutoffDate: finalizedInsightCutoffDate(),
    accounts: [],
    warnings: [],
  };
  const errors: string[] = [];

  try {
    return await withMetaUsageCollector(metaUsageCollector, async () => {
      await validateMetaAdsSyncPermissions();
      const brandRows = await ensureBrands(accounts);
      const brandByCode = new Map(brandRows.map((brand) => [String(brand.code), String(brand.id)]));

      const chunkedCatalog = trigger === "cron_catalog" || trigger === "manual_catalog";

      for (const account of accounts) {
        try {
          if (chunkedCatalog) {
            // Catalog refresh runs as a budgeted, resumable per-ad-set chunk so
            // it fits Vercel's 300s cap and Meta's ad-account rate budget. It
            // refreshes ads + creatives only; insights/diagnostics have their
            // own triggers.
            const result = await syncAdCatalogChunk(
              account,
              brandByCode.get(account.brandCode) || null,
            );
            metrics.accounts += 1;
            metrics.ads += result.ads;
            metrics.creatives += result.creatives;
            metrics.adSetsProcessed = (metrics.adSetsProcessed ?? 0) + result.adSetsProcessed;
            mergeEnrichmentMetrics(metrics.enrichment!, result.enrichment);
            if (result.errors.length) {
              errors.push(
                `${account.brandCode}: ${result.errors.length} ad set(s) failed this chunk (e.g. ${result.errors[0]})`,
              );
            }
            continue;
          }

          const result = await syncAccount(
            account,
            brandByCode.get(account.brandCode) || null,
            syncOptionsForTrigger(trigger),
          );
          metrics.accounts += 1;
          metrics.campaigns += result.campaigns;
          metrics.adSets += result.adSets;
          metrics.ads += result.ads;
          metrics.creatives += result.creatives;
          metrics.insightRows += result.insightRows;
          metrics.previewRefreshes += result.previewRefreshes;
          mergeEnrichmentMetrics(metrics.enrichment!, result.enrichment);
          auditSummary.accounts.push(result.audit);
          auditSummary.warnings.push(...result.audit.warnings);
        } catch (error) {
          errors.push(`${account.brandCode}: ${errorToMessage(error)}`);
        }
      }

      if (shouldCacheCreativeThumbnailsAfterSync(trigger) && metrics.creatives > 0) {
        try {
          metrics.thumbnailCache = await cacheThumbnailBatch({
            limit: catalogThumbnailCacheLimit(),
          });
        } catch (error) {
          errors.push(`creative_thumbnail_cache: ${errorToMessage(error)}`);
        }
      }

      metrics.audit = auditSummary;
      metrics.metaUsage = metaUsageCollector.summary();
      const status = errors.length ? (metrics.accounts > 0 ? "partial" : "failed") : "success";
      await supabase
        .from("sync_runs")
        .update(withAdsAnalystEnvironment({
          status,
          completed_at: new Date().toISOString(),
          metrics: metrics as unknown as Json,
          errors,
        }))
        .eq("id", syncRunId);

      return { status, metrics, errors, syncRunId } satisfies SyncResult;
    });
  } catch (error) {
    errors.push(errorToMessage(error));
    metrics.audit = auditSummary;
    metrics.metaUsage = metaUsageCollector.summary();
    await supabase
      .from("sync_runs")
      .update(withAdsAnalystEnvironment({
        status: "failed",
        completed_at: new Date().toISOString(),
        metrics: metrics as unknown as Json,
        errors,
      }))
      .eq("id", syncRunId);

    return { status: "failed", metrics, errors, syncRunId } satisfies SyncResult;
  }
}

export async function validateMetaAdsSyncPermissions() {
  const permissionHealth = await getMetaPermissionHealth();

  if (permissionHealth.forbiddenGranted.length) {
    throw new ConfigurationError(
      `Meta token has forbidden permission(s): ${permissionHealth.forbiddenGranted.join(", ")}. Re-issue a token without campaign/ad mutation permissions.`,
    );
  }

  if (permissionHealth.adsSync.missing.length) {
    throw new ConfigurationError(
      `Meta token is missing required ads sync permission(s): ${permissionHealth.adsSync.missing.join(", ")}. Grant ads_read, then retry sync.`,
      permissionHealth.adsSync.missing,
    );
  }

  return {
    granted: permissionHealth.granted,
    optionalMissing: permissionHealth.adsSync.optionalMissing || [],
  };
}

export const validateReadOnlyMetaToken = validateMetaAdsSyncPermissions;

export async function getMetaPermissionHealth() {
  const granted = await fetchGrantedMetaPermissions();
  const forbiddenGranted = FORBIDDEN_META_PERMISSIONS.filter((permission) =>
    granted.has(permission),
  );
  const adsSync = buildPermissionStatus(granted, ADS_SYNC_REQUIRED_PERMISSIONS, {
    optional: ADS_SYNC_OPTIONAL_PERMISSIONS,
  });
  const socialInbox = buildPermissionStatus(granted, SOCIAL_INBOX_REQUIRED_PERMISSIONS);
  const socialReply = buildPermissionStatus(granted, SOCIAL_REPLY_REQUIRED_PERMISSIONS, {
    warnings: [
      "Facebook Page comment replies may be blocked until pages_manage_engagement is granted.",
      "The app must still require a human click before any reply is sent.",
    ],
  });

  return {
    granted: Array.from(granted).sort(),
    forbiddenGranted,
    adsSync,
    socialInbox,
    socialReply,
  };
}

export async function validateConfiguredMetaAccounts() {
  const accounts = getConfiguredAccounts();

  return Promise.all(
    accounts.map(async (account) => {
      const accountId = `act_${normalizeAccountId(account.accountId)}`;

      try {
        const profile = await graphFetch<JsonRecord>(accountId, {
          fields: "id,name,account_status,currency,timezone_name",
        });

        return {
          brandCode: account.brandCode,
          accountId,
          ok: true,
          name: stringField(profile.name),
          accountStatus: numberField(profile.account_status),
        };
      } catch (error) {
        return {
          brandCode: account.brandCode,
          accountId,
          ok: false,
          error: errorToMessage(error),
        };
      }
    }),
  );
}

export async function syncMetaAdsAccountRange(input: {
  account: SyncAccountConfig;
  since: string;
  until: string;
}) {
  const metaUsageCollector = createMetaUsageCollector();
  const brandRows = await ensureBrands([input.account]);
  const brandId = String(
    brandRows.find((brand) => String(brand.code) === input.account.brandCode)?.id || "",
  ) || null;

  return withMetaUsageCollector(metaUsageCollector, async () => {
    const result = await syncAccount(input.account, brandId, {
      insights: { kind: "range", since: input.since, until: input.until },
      refreshPreviews: false,
      refreshAdCatalog: false,
      refreshAdStatusesOnly: false,
      refreshRankingDiagnostics: false,
      includeCreativeDiagnostics: false,
      allowFinalizedInsightUpdates: true,
    });

    return {
      ...result,
      metaUsage: metaUsageCollector.summary(),
    };
  });
}

export async function fetchMetaAccountInsightTotalsForRange(input: {
  since: string;
  until: string;
}): Promise<MetaAccountInsightTotals[]> {
  const accounts = getConfiguredAccounts();

  return Promise.all(
    accounts.map(async (account) => {
      const metaAccountId = `act_${normalizeAccountId(account.accountId)}`;
      const insights = await fetchAccountInsightsTotal(metaAccountId, input);

      return insights.reduce<MetaAccountInsightTotals>(
        (total, insight) => ({
          ...total,
          rows: total.rows + 1,
          spend: roundCurrency(total.spend + (numberField(insight.spend) || 0)),
          impressions: total.impressions + Math.round(numberField(insight.impressions) || 0),
          clicks: total.clicks + Math.round(numberField(insight.clicks) || 0),
          leads:
            total.leads +
            extractExactActionCount(insight.actions, [
              "lead",
              "onsite_conversion.lead",
              "onsite_conversion.lead_grouped",
              "onsite_web_lead",
              "offsite_conversion.fb_pixel_lead",
            ]),
          bookings:
            total.bookings +
            extractExactActionCount(insight.actions, [
              "offsite_conversion.fb_pixel_custom",
              "schedule",
              "submit_application",
              "booking",
              "appointment",
            ]),
          conversions:
            total.conversions +
            extractActionCount(insight.actions, ["offsite_conversion", "purchase", "complete_registration"]),
        }),
        {
          brandCode: account.brandCode,
          metaAccountId,
          rows: 0,
          spend: 0,
          impressions: 0,
          clicks: 0,
          leads: 0,
          bookings: 0,
          conversions: 0,
        },
      );
    }),
  );
}

export async function fetchMetaCreativeAnalysisInsightsForRange(input: {
  since: string;
  until: string;
  signal?: AbortSignal;
}): Promise<MetaCreativeAnalysisInsightsResult> {
  const accounts = getConfiguredAccounts();
  const accountResults = await Promise.all(
    accounts.map(async (account) => {
      const metaAccountId = `act_${normalizeAccountId(account.accountId)}`;

      try {
        const result = await fetchCreativeAnalysisInsights(metaAccountId, input);
        const rows = result.rows.map((row) => ({
          ...row,
          brand_code: account.brandCode,
          meta_account_id: metaAccountId,
        }));
        const warnings = result.unavailableFields.length
          ? [
              `${account.brandCode}: Meta did not return ${result.unavailableFields.join(", ")} for this Insights request.`,
            ]
          : [];

        return {
          rows,
          warnings,
          unavailableFields: result.unavailableFields,
        };
      } catch (error) {
        const message = isAbortError(error)
          ? "Live Meta Insights timed out; using stored Supabase history."
          : errorToMessage(error);
        return {
          rows: [],
          warnings: [`${account.brandCode}: ${message}`],
          unavailableFields: [],
        };
      }
    }),
  );

  const unavailableFields = new Set<string>();
  accountResults.forEach((result) =>
    result.unavailableFields.forEach((field) => unavailableFields.add(field)),
  );

  return {
    rows: accountResults.flatMap((result) => result.rows),
    warnings: accountResults.flatMap((result) => result.warnings),
    unavailableFields: Array.from(unavailableFields).sort(),
    adAccounts: accounts.map((account) => ({
      brandCode: account.brandCode,
      metaAccountId: `act_${normalizeAccountId(account.accountId)}`,
    })),
  };
}

export async function fetchMetaAdVideoMetricsForRange(input: {
  metaAccountId: string;
  adId: string;
  since: string;
  until: string;
  signal?: AbortSignal;
}): Promise<MetaAdVideoMetrics> {
  const metaAccountId = `act_${normalizeAccountId(input.metaAccountId)}`;
  const configuredAccountIds = new Set(
    getConfiguredAccounts().map((account) => `act_${normalizeAccountId(account.accountId)}`),
  );

  if (!configuredAccountIds.has(metaAccountId)) {
    throw new Error("Meta account is not configured for this app.");
  }

  const rows = await graphPages<JsonRecord>(`${metaAccountId}/insights`, {
    level: "ad",
    time_increment: "all_days",
    ...buildInsightDateParams({ kind: "range", since: input.since, until: input.until }),
    fields: [
      "ad_id",
      "ad_name",
      "actions",
      "video_play_actions",
      "video_p25_watched_actions",
      "video_p50_watched_actions",
      "video_p75_watched_actions",
      "video_p95_watched_actions",
      "video_p100_watched_actions",
      "video_thruplay_watched_actions",
    ].join(","),
    filtering: JSON.stringify([
      {
        field: "ad.id",
        operator: "IN",
        value: [input.adId],
      },
    ]),
    limit: "10",
  }, {
    maxPages: 1,
    signal: input.signal,
  });

  const row = rows[0] || {};

  return {
    adId: stringField(row.ad_id) || input.adId,
    adName: stringField(row.ad_name),
    actions: actionMetricRows(row.actions),
    videoPlayActions: actionMetricRows(row.video_play_actions),
    videoP25WatchedActions: actionMetricRows(row.video_p25_watched_actions),
    videoP50WatchedActions: actionMetricRows(row.video_p50_watched_actions),
    videoP75WatchedActions: actionMetricRows(row.video_p75_watched_actions),
    videoP95WatchedActions: actionMetricRows(row.video_p95_watched_actions),
    videoP100WatchedActions: actionMetricRows(row.video_p100_watched_actions),
    videoThruplayWatchedActions: actionMetricRows(row.video_thruplay_watched_actions),
  };
}

function activeInventoryFilter() {
  return JSON.stringify([
    {
      field: "effective_status",
      operator: "IN",
      value: [
        "ACTIVE",
        "PAUSED",
        "PENDING_REVIEW",
        "WITH_ISSUES",
        "CAMPAIGN_PAUSED",
        "ADSET_PAUSED",
      ],
    },
  ]);
}

async function fetchMetaAdsForCatalogRefresh(
  metaAccountId: string,
  fallback?: { enrichment: SyncEnrichmentMetrics; account: string },
) {
  try {
    return await graphPages<JsonRecord>(`${metaAccountId}/ads`, {
      fields: META_AD_CATALOG_FIELDS.join(","),
      limit: String(META_AD_CATALOG_PAGE_LIMIT),
      filtering: activeInventoryFilter(),
    }, { maxPages: getSyncMaxPages("META_SYNC_MAX_AD_PAGES", DEFAULT_META_SYNC_MAX_AD_PAGES) });
  } catch (error) {
    if (!(error instanceof MetaGraphError)) throw error;
    if (fallback) {
      recordSkippedEnrichment(fallback.enrichment, fallback.account, "ad_catalog_fields", errorToMessage(error));
    }
    return graphPages<JsonRecord>(`${metaAccountId}/ads`, {
      fields: META_AD_CORE_CATALOG_FIELDS.join(","),
      limit: String(META_AD_CATALOG_PAGE_LIMIT),
      filtering: activeInventoryFilter(),
    }, { maxPages: getSyncMaxPages("META_SYNC_MAX_AD_PAGES", DEFAULT_META_SYNC_MAX_AD_PAGES) });
  }
}

export type LiveAdSetState = {
  id: string;
  name: string | null;
  status: string | null;
  dailyBudget: string | null; // Meta returns minor units as a string
};

/**
 * Read-only live read of an ad set's current status and daily budget.
 * Returns null if Meta is unreachable or the token is missing - callers must
 * degrade gracefully (verify_value = 'na'); this never throws to the caller.
 */
export async function fetchLiveAdSetState(adSetId: string): Promise<LiveAdSetState | null> {
  try {
    const data = await graphFetch<{ id: string; name?: string; status?: string; daily_budget?: string }>(
      adSetId,
      { fields: "id,name,status,daily_budget" },
    );
    const node = data as { id: string; name?: string; status?: string; daily_budget?: string };
    return {
      id: node.id,
      name: node.name ?? null,
      status: node.status ?? null,
      dailyBudget: node.daily_budget ?? null,
    };
  } catch {
    return null;
  }
}

// Shared request shape for the per-ad-set catalog fetch. Exported so tests can
// assert the edge/fields/page-size without hitting Meta.
export function adSetAdsRequest(adSetId: string) {
  return {
    path: `${adSetId}/ads`,
    params: {
      fields: META_AD_CATALOG_FIELDS.join(","),
      limit: String(META_AD_CATALOG_PAGE_LIMIT),
      filtering: activeInventoryFilter(),
    },
  };
}

// Per-ad-set ads fetch for the chunked catalog refresh. Mirrors
// fetchMetaAdsForCatalogRefresh (heavy fields with a core-field fallback on
// MetaGraphError) but scoped to one ad set, so each call is small and the
// graphPages backoff can absorb transient throttles.
async function fetchMetaAdsForAdSet(
  adSetId: string,
  fallback?: { enrichment: SyncEnrichmentMetrics; account: string },
) {
  const maxPages = getSyncMaxPages("META_SYNC_MAX_AD_PAGES", DEFAULT_META_SYNC_MAX_AD_PAGES);
  const req = adSetAdsRequest(adSetId);
  try {
    return await graphPages<JsonRecord>(req.path, req.params, { maxPages });
  } catch (error) {
    if (!(error instanceof MetaGraphError)) throw error;
    if (fallback) {
      recordSkippedEnrichment(fallback.enrichment, fallback.account, "ad_catalog_fields", errorToMessage(error));
    }
    return graphPages<JsonRecord>(
      req.path,
      { ...req.params, fields: META_AD_CORE_CATALOG_FIELDS.join(",") },
      { maxPages },
    );
  }
}

async function fetchMetaAdsForStatusRefresh(metaAccountId: string) {
  return graphPages<JsonRecord>(`${metaAccountId}/ads`, {
    fields: META_AD_STATUS_FIELDS.join(","),
    limit: "100",
    filtering: activeInventoryFilter(),
  }, { maxPages: getSyncMaxPages("META_SYNC_MAX_AD_STATUS_PAGES", 100) });
}

async function fetchMetaCampaignsForCatalogRefresh(
  metaAccountId: string,
  fallback?: { enrichment: SyncEnrichmentMetrics; account: string },
) {
  try {
    return await graphPages<JsonRecord>(`${metaAccountId}/campaigns`, {
      fields: META_CAMPAIGN_CATALOG_FIELDS.join(","),
      limit: "100",
    }, { maxPages: getSyncMaxPages("META_SYNC_MAX_CAMPAIGN_PAGES", 12) });
  } catch (error) {
    if (!(error instanceof MetaGraphError)) throw error;
    if (fallback) {
      recordSkippedEnrichment(fallback.enrichment, fallback.account, "campaign_catalog_fields", errorToMessage(error));
    }
    return fetchMetaCampaignsForStatusRefresh(metaAccountId);
  }
}

async function fetchMetaCampaignsForStatusRefresh(metaAccountId: string) {
  return graphPages<JsonRecord>(`${metaAccountId}/campaigns`, {
    fields: META_CAMPAIGN_STATUS_FIELDS.join(","),
    limit: "100",
  }, { maxPages: getSyncMaxPages("META_SYNC_MAX_CAMPAIGN_STATUS_PAGES", 12) });
}

async function fetchMetaAdSetsForCatalogRefresh(
  metaAccountId: string,
  fallback?: { enrichment: SyncEnrichmentMetrics; account: string },
) {
  try {
    return await graphPages<JsonRecord>(`${metaAccountId}/adsets`, {
      fields: META_AD_SET_CATALOG_FIELDS.join(","),
      limit: "100",
    }, { maxPages: getSyncMaxPages("META_SYNC_MAX_AD_SET_PAGES", 12) });
  } catch (error) {
    if (!(error instanceof MetaGraphError)) throw error;
    if (fallback) {
      recordSkippedEnrichment(fallback.enrichment, fallback.account, "ad_set_catalog_fields", errorToMessage(error));
    }
    return fetchMetaAdSetsForStatusRefresh(metaAccountId);
  }
}

async function fetchMetaAdSetsForStatusRefresh(metaAccountId: string) {
  return graphPages<JsonRecord>(`${metaAccountId}/adsets`, {
    fields: META_AD_SET_STATUS_FIELDS.join(","),
    limit: "100",
  }, { maxPages: getSyncMaxPages("META_SYNC_MAX_AD_SET_STATUS_PAGES", 12) });
}

async function fetchMetaAdLabels(metaAccountId: string) {
  return graphPages<JsonRecord>(`${metaAccountId}/adlabels`, {
    fields: "id,name",
    limit: "100",
  }, { maxPages: getSyncMaxPages("META_SYNC_MAX_AD_LABEL_PAGES", 25) });
}

async function fetchMetaAdPixels(metaAccountId: string) {
  return graphPages<JsonRecord>(`${metaAccountId}/adspixels`, {
    fields: "id,name,last_fired_time,is_unavailable",
    limit: "100",
  }, { maxPages: getSyncMaxPages("META_SYNC_MAX_AD_PIXEL_PAGES", 10) });
}

async function fetchMetaCustomConversions(metaAccountId: string) {
  return graphPages<JsonRecord>(`${metaAccountId}/customconversions`, {
    fields: "id,name,custom_event_type,event_source_type,creation_time,last_fired_time,is_archived,is_unavailable",
    limit: "100",
  }, { maxPages: getSyncMaxPages("META_SYNC_MAX_CUSTOM_CONVERSION_PAGES", 10) });
}

// Shared row shaping for the full ad-catalog upserts. Extracted from syncAccount
// so the chunked per-ad-set path (syncAdCatalogChunk) builds identical rows.
type CreativeCatalogRowContext = {
  brandId: string | null;
  accountRowId: unknown;
  metaAccountId: string;
  now: string;
  refreshPreviews: boolean;
  previewByAdId: Map<string, { previewHtml: string | null; previewUrl: string | null }>;
};

type AdCatalogRowContext = CreativeCatalogRowContext & {
  classifications: Map<string, CampaignUmbrellaClassification>;
  campaignByMetaId: Map<string, JsonRecord>;
  adSetByMetaId: Map<string, JsonRecord>;
  creativeByMetaId: Map<string, JsonRecord>;
};

export function buildCreativeCatalogRow(
  ad: JsonRecord,
  ctx: CreativeCatalogRowContext,
): JsonRecord | null {
  const creative = recordField(ad.creative);
  const creativeId = stringField(creative.id);
  if (!creativeId) return null;
  const adPreview = ctx.previewByAdId.get(String(ad.id)) || null;
  const preview = ctx.refreshPreviews ? chooseStoredPreview(creative, adPreview) : null;
  return {
    brand_id: ctx.brandId,
    account_id: ctx.accountRowId,
    meta_account_id: ctx.metaAccountId,
    creative_id: creativeId,
    name: stringField(creative.name),
    title: stringField(creative.title),
    body: stringField(creative.body),
    call_to_action_type: stringField(creative.call_to_action_type),
    ...(hasMetaField(creative, "call_to_action") ? { call_to_action: recordField(creative.call_to_action) } : {}),
    ...(hasMetaField(creative, "url_tags") ? { url_tags: stringField(creative.url_tags) } : {}),
    ...(hasMetaField(creative, "instagram_permalink_url")
      ? { instagram_permalink_url: stringField(creative.instagram_permalink_url) }
      : {}),
    ...(hasMetaField(creative, "effective_instagram_media_id")
      ? { effective_instagram_media_id: stringField(creative.effective_instagram_media_id) }
      : {}),
    ...(hasMetaField(creative, "degrees_of_freedom_spec")
      ? { degrees_of_freedom_spec: recordField(creative.degrees_of_freedom_spec) }
      : {}),
    object_type: stringField(creative.object_type),
    object_story_id: stringField(creative.object_story_id),
    effective_object_story_id: stringField(creative.effective_object_story_id),
    ...(ctx.refreshPreviews
      ? {
          thumbnail_url: stringField(creative.thumbnail_url),
          image_url: stringField(creative.image_url),
          video_thumbnail_url: stringField(creative.video_thumbnail_url),
          preview_url: preview?.previewUrl || null,
          preview_html: preview?.previewHtml || null,
          preview_source: preview?.previewSource || "fallback",
          creative_cache_attempted_at: null,
          creative_cache_error: null,
          last_preview_refresh_at: ctx.now,
        }
      : {}),
    asset_metadata: {
      image_hash: creative.image_hash || null,
      video_id: creative.video_id || null,
    },
    object_story_spec: recordField(creative.object_story_spec),
    asset_feed_spec: recordField(creative.asset_feed_spec),
    raw_json: creative,
    last_synced_at: ctx.now,
  };
}

export function buildAdCatalogRow(ad: JsonRecord, ctx: AdCatalogRowContext): JsonRecord {
  const creative = recordField(ad.creative);
  const adPreview = ctx.previewByAdId.get(String(ad.id)) || null;
  const preview = ctx.refreshPreviews ? chooseStoredPreview(creative, adPreview) : null;
  const creativeId = stringField(creative.id);
  const adId = stringField(ad.id);
  const classification = ctx.classifications.get(adId || "") ||
    classifyCampaignUmbrella({ campaignName: stringField(ad.name) });
  return {
    brand_id: ctx.brandId,
    account_id: ctx.accountRowId,
    campaign_ref_id: ctx.campaignByMetaId.get(String(ad.campaign_id))?.id || null,
    ad_set_ref_id: ctx.adSetByMetaId.get(String(ad.adset_id))?.id || null,
    creative_ref_id: ctx.creativeByMetaId.get(creativeId || "")?.id || null,
    meta_account_id: ctx.metaAccountId,
    campaign_id: stringField(ad.campaign_id),
    ad_set_id: stringField(ad.adset_id),
    ad_id: adId,
    creative_id: creativeId,
    name: stringField(ad.name),
    status: stringField(ad.status),
    configured_status: stringField(ad.configured_status),
    effective_status: stringField(ad.effective_status),
    ...(hasMetaField(ad, "tracking_specs") ? { tracking_specs: arrayField(ad.tracking_specs) } : {}),
    ...(hasMetaField(ad, "tracking_and_conversion_with_defaults")
      ? { tracking_and_conversion_with_defaults: recordField(ad.tracking_and_conversion_with_defaults) }
      : {}),
    ...(hasMetaField(ad, "preview_shareable_link")
      ? { preview_shareable_link: stringField(ad.preview_shareable_link) }
      : {}),
    ...(hasMetaField(ad, "ad_active_time") ? { ad_active_time: stringField(ad.ad_active_time) } : {}),
    ...(ctx.refreshPreviews
      ? {
          preview_source: preview?.previewSource || "fallback",
          preview_url: preview?.previewUrl || null,
          preview_html: preview?.previewHtml || null,
        }
      : {}),
    created_time: stringField(ad.created_time),
    updated_time: stringField(ad.updated_time),
    ...umbrellaColumns(classification),
    raw_json: ad,
    last_synced_at: ctx.now,
  };
}

type DimensionCatalogRowContext = {
  brandId: string | null;
  accountRowId: unknown;
  metaAccountId: string;
  now: string;
  statusOnly: boolean;
};

export function buildCampaignCatalogRow(
  campaign: JsonRecord,
  classification: CampaignUmbrellaClassification,
  ctx: DimensionCatalogRowContext,
): JsonRecord {
  const baseRow = {
    brand_id: ctx.brandId,
    account_id: ctx.accountRowId,
    meta_account_id: ctx.metaAccountId,
    campaign_id: stringField(campaign.id),
    name: stringField(campaign.name),
    status: stringField(campaign.status),
    effective_status: stringField(campaign.effective_status),
    created_time: stringField(campaign.created_time),
    updated_time: stringField(campaign.updated_time),
    ...umbrellaColumns(classification),
    raw_json: campaign,
    last_synced_at: ctx.now,
  };
  if (ctx.statusOnly) return baseRow;
  return {
    ...baseRow,
    ...(hasMetaField(campaign, "objective") ? { objective: stringField(campaign.objective) } : {}),
    ...(hasMetaField(campaign, "buying_type") ? { buying_type: stringField(campaign.buying_type) } : {}),
    ...(hasMetaField(campaign, "daily_budget") ? { daily_budget: moneyCents(campaign.daily_budget) } : {}),
    ...(hasMetaField(campaign, "lifetime_budget") ? { lifetime_budget: moneyCents(campaign.lifetime_budget) } : {}),
    ...(hasMetaField(campaign, "budget_remaining") ? { budget_remaining: moneyCents(campaign.budget_remaining) } : {}),
    ...(hasMetaField(campaign, "bid_strategy") ? { bid_strategy: stringField(campaign.bid_strategy) } : {}),
    ...(hasMetaField(campaign, "pacing_type") ? { pacing_type: arrayField(campaign.pacing_type) } : {}),
    ...(hasMetaField(campaign, "budget_rebalance_flag")
      ? { budget_rebalance_flag: booleanField(campaign.budget_rebalance_flag) }
      : {}),
    ...(hasMetaField(campaign, "start_time") ? { start_time: stringField(campaign.start_time) } : {}),
    ...(hasMetaField(campaign, "stop_time") ? { stop_time: stringField(campaign.stop_time) } : {}),
  };
}

export function buildAdSetCatalogRow(
  adSet: JsonRecord,
  classification: CampaignUmbrellaClassification,
  ctx: DimensionCatalogRowContext & { campaignByMetaId: Map<string, JsonRecord> },
): JsonRecord {
  const baseRow = {
    brand_id: ctx.brandId,
    account_id: ctx.accountRowId,
    campaign_ref_id: ctx.campaignByMetaId.get(String(adSet.campaign_id))?.id || null,
    meta_account_id: ctx.metaAccountId,
    campaign_id: stringField(adSet.campaign_id),
    ad_set_id: stringField(adSet.id),
    name: stringField(adSet.name),
    status: stringField(adSet.status),
    effective_status: stringField(adSet.effective_status),
    created_time: stringField(adSet.created_time),
    updated_time: stringField(adSet.updated_time),
    ...umbrellaColumns(classification),
    raw_json: adSet,
    last_synced_at: ctx.now,
  };
  if (ctx.statusOnly) return baseRow;
  return {
    ...baseRow,
    ...(hasMetaField(adSet, "optimization_goal") ? { optimization_goal: stringField(adSet.optimization_goal) } : {}),
    ...(hasMetaField(adSet, "billing_event") ? { billing_event: stringField(adSet.billing_event) } : {}),
    ...(hasMetaField(adSet, "bid_strategy") ? { bid_strategy: stringField(adSet.bid_strategy) } : {}),
    ...(hasMetaField(adSet, "daily_budget") ? { daily_budget: moneyCents(adSet.daily_budget) } : {}),
    ...(hasMetaField(adSet, "lifetime_budget") ? { lifetime_budget: moneyCents(adSet.lifetime_budget) } : {}),
    ...(hasMetaField(adSet, "budget_remaining") ? { budget_remaining: moneyCents(adSet.budget_remaining) } : {}),
    ...(hasMetaField(adSet, "learning_stage_info") ? { learning_stage_info: recordField(adSet.learning_stage_info) } : {}),
    ...(hasMetaField(adSet, "attribution_spec") ? { attribution_spec: arrayField(adSet.attribution_spec) } : {}),
    ...(hasMetaField(adSet, "promoted_object") ? { promoted_object: recordField(adSet.promoted_object) } : {}),
    ...(hasMetaField(adSet, "destination_type") ? { destination_type: stringField(adSet.destination_type) } : {}),
    ...(hasMetaField(adSet, "targeting_optimization_types")
      ? { targeting_optimization_types: arrayField(adSet.targeting_optimization_types) }
      : {}),
    ...(hasMetaField(adSet, "is_dynamic_creative")
      ? { is_dynamic_creative: booleanField(adSet.is_dynamic_creative) }
      : {}),
    ...(hasMetaField(adSet, "is_budget_schedule_enabled")
      ? { is_budget_schedule_enabled: booleanField(adSet.is_budget_schedule_enabled) }
      : {}),
    ...(hasMetaField(adSet, "start_time") ? { start_time: stringField(adSet.start_time) } : {}),
    ...(hasMetaField(adSet, "end_time") ? { end_time: stringField(adSet.end_time) } : {}),
    ...(hasMetaField(adSet, "targeting") ? { targeting: recordField(adSet.targeting) } : {}),
  };
}

function adCatalogChunkBudgetMs() {
  const v = Number(process.env.META_CATALOG_CHUNK_BUDGET_MS);
  return Number.isFinite(v) && v > 0 ? Math.floor(v) : 210_000;
}

function adCatalogChunkMaxAdSets() {
  const v = Number(process.env.META_CATALOG_CHUNK_MAX_ADSETS);
  return Number.isFinite(v) && v > 0 ? Math.floor(v) : 200;
}

function adCatalogEnvironmentScoped() {
  return usesEnvironmentScopedAdsAnalystUpserts() || usesLimitedAdsAnalystDbAccess();
}

// Loose view of the Supabase query builder — meta.ts otherwise upserts through
// upsertMany, so the read/update chain isn't covered by an existing type.
type AdSetStateClient = {
  from: (table: string) => {
    // deno-lint-ignore no-explicit-any
    select: (columns: string) => any;
    // deno-lint-ignore no-explicit-any
    update: (values: Record<string, unknown>) => any;
  };
};

async function selectStalestAdSetIds(metaAccountId: string, limit: number): Promise<string[]> {
  const supabase = createAdsAnalystClient("worker") as unknown as AdSetStateClient;
  let query = supabase
    .from("meta_ad_sets")
    .select("ad_set_id,ads_refreshed_at")
    .eq("meta_account_id", metaAccountId);
  if (adCatalogEnvironmentScoped()) {
    query = query.eq("environment", getAdsAnalystEnvironment());
  }
  const { data, error } = await query
    .order("ads_refreshed_at", { ascending: true, nullsFirst: true })
    .limit(limit);
  if (error) throw error;
  const rows: JsonRecord[] = Array.isArray(data) ? data : [];
  return rows
    .map((row) => stringField(row.ad_set_id))
    .filter((value): value is string => Boolean(value));
}

async function stampAdSetRefreshed(metaAccountId: string, adSetId: string, now: string) {
  const supabase = createAdsAnalystClient("worker") as unknown as AdSetStateClient;
  let query = supabase
    .from("meta_ad_sets")
    .update({ ads_refreshed_at: now })
    .eq("meta_account_id", metaAccountId)
    .eq("ad_set_id", adSetId);
  if (adCatalogEnvironmentScoped()) {
    query = query.eq("environment", getAdsAnalystEnvironment());
  }
  const { error } = await query;
  if (error) throw error;
}

// Per-ad-set preview map: only ads whose stored preview is a fallback need a
// fresh /preview fetch. Mirrors the loop syncAccount runs over the whole account.
async function buildCatalogPreviewMap(ads: JsonRecord[]) {
  const previewByAdId = new Map<string, { previewHtml: string | null; previewUrl: string | null }>();
  for (const ad of ads) {
    const adId = stringField(ad.id);
    if (!adId) continue;
    const creative = recordField(ad.creative);
    const preview = chooseStoredPreview(creative, null);
    if (preview.previewSource === "fallback") {
      previewByAdId.set(adId, await fetchAdPreview(adId));
    }
  }
  return previewByAdId;
}

// One chunked catalog pass for an account: refresh the campaign/ad-set
// dimensions, then process the stalest ad sets (within a wall-clock budget),
// upserting their ads + creatives and stamping ads_refreshed_at.
async function syncAdCatalogChunk(account: SyncAccountConfig, brandId: string | null) {
  const accountId = normalizeAccountId(account.accountId);
  const metaAccountId = `act_${accountId}`;
  const now = new Date().toISOString();
  const enrichment = emptyEnrichmentMetrics();

  const accountProfile = await graphFetch<JsonRecord>(metaAccountId, {
    fields: "id,name,currency,timezone_name,account_status,business_name",
  });
  const accountRow = await upsertSingle(
    "meta_ad_accounts",
    {
      brand_id: brandId,
      meta_account_id: metaAccountId,
      name: stringField(accountProfile.name) || account.brandName,
      currency: stringField(accountProfile.currency),
      timezone_name: stringField(accountProfile.timezone_name),
      account_status: numberField(accountProfile.account_status),
      raw_json: accountProfile,
      last_synced_at: now,
    },
    "meta_account_id",
  );

  const campaigns = await fetchMetaCampaignsForCatalogRefresh(metaAccountId, {
    enrichment,
    account: account.brandCode,
  });
  const adSets = await fetchMetaAdSetsForCatalogRefresh(metaAccountId, {
    enrichment,
    account: account.brandCode,
  });
  const overrides = await fetchCampaignUmbrellaOverrides(metaAccountId);
  const campaignRawByMetaId = new Map(campaigns.map((c) => [String(c.id), c]));
  const adSetRawByMetaId = new Map(adSets.map((a) => [String(a.id), a]));
  const adSetNamesByCampaignId = groupAdSetNamesByCampaignId(adSets);

  const campaignClassifications = new Map<string, CampaignUmbrellaClassification>();
  for (const campaign of campaigns) {
    const campaignId = stringField(campaign.id);
    if (!campaignId) continue;
    campaignClassifications.set(
      campaignId,
      classifyCampaignUmbrella({
        campaignName: stringField(campaign.name),
        adSetNames: adSetNamesByCampaignId.get(campaignId) || [],
        override: getUmbrellaOverride(overrides, "campaign", campaignId),
      }),
    );
  }
  const dimCtx: DimensionCatalogRowContext = {
    brandId,
    accountRowId: accountRow.id,
    metaAccountId,
    now,
    statusOnly: false,
  };
  const campaignRows = await upsertMany(
    "meta_campaigns",
    campaigns.map((campaign) =>
      buildCampaignCatalogRow(
        campaign,
        campaignClassifications.get(stringField(campaign.id) || "") ||
          classifyCampaignUmbrella({ campaignName: stringField(campaign.name) }),
        dimCtx,
      ),
    ),
    "meta_account_id,campaign_id",
  );
  const campaignByMetaId = new Map(campaignRows.map((row) => [String(row.campaign_id), row]));

  const adSetClassifications = new Map<string, CampaignUmbrellaClassification>();
  for (const adSet of adSets) {
    const adSetId = stringField(adSet.id);
    if (!adSetId) continue;
    const campaignId = stringField(adSet.campaign_id);
    const campaign = campaignId ? campaignRawByMetaId.get(campaignId) : undefined;
    adSetClassifications.set(
      adSetId,
      classifyCampaignUmbrella({
        campaignName: stringField(campaign?.name),
        adSetName: stringField(adSet.name),
        inherited: campaignId ? campaignClassifications.get(campaignId) : null,
        override: getUmbrellaOverride(overrides, "ad_set", adSetId),
      }),
    );
  }
  const adSetRows = await upsertMany(
    "meta_ad_sets",
    adSets.map((adSet) =>
      buildAdSetCatalogRow(
        adSet,
        adSetClassifications.get(stringField(adSet.id) || "") ||
          classifyCampaignUmbrella({ adSetName: stringField(adSet.name) }),
        { ...dimCtx, campaignByMetaId },
      ),
    ),
    "meta_account_id,ad_set_id",
  );
  const adSetByMetaId = new Map(adSetRows.map((row) => [String(row.ad_set_id), row]));

  const deps: AdSetChunkDeps = {
    listAdSets: () => selectStalestAdSetIds(metaAccountId, adCatalogChunkMaxAdSets()),
    fetchAds: (adSetId) =>
      fetchMetaAdsForAdSet(adSetId, { enrichment, account: account.brandCode }),
    persist: async (_adSetId, ads) => {
      const previewByAdId = await buildCatalogPreviewMap(ads);
      const creativeCtx: CreativeCatalogRowContext = {
        brandId,
        accountRowId: accountRow.id,
        metaAccountId,
        now,
        refreshPreviews: true,
        previewByAdId,
      };
      const creativeRows = uniqueBy(
        ads.map((ad) => buildCreativeCatalogRow(ad, creativeCtx)).filter(Boolean) as JsonRecord[],
        (row) => String(row.creative_id),
      );
      const upsertedCreatives = await upsertMany(
        "meta_creatives",
        creativeRows,
        "meta_account_id,creative_id",
      );
      const creativeByMetaId = new Map(
        upsertedCreatives.map((row) => [String(row.creative_id), row]),
      );

      const adClassifications = new Map<string, CampaignUmbrellaClassification>();
      for (const ad of ads) {
        const adId = stringField(ad.id);
        if (!adId) continue;
        const campaignId = stringField(ad.campaign_id);
        const aSetId = stringField(ad.adset_id);
        const campaign = campaignId ? campaignRawByMetaId.get(campaignId) : undefined;
        const aSet = aSetId ? adSetRawByMetaId.get(aSetId) : undefined;
        adClassifications.set(
          adId,
          classifyCampaignUmbrella({
            campaignName: stringField(campaign?.name),
            adSetName: stringField(aSet?.name),
            inherited:
              (aSetId && adSetClassifications.get(aSetId)) ||
              (campaignId && campaignClassifications.get(campaignId)) ||
              null,
            override: getUmbrellaOverride(overrides, "ad", adId),
          }),
        );
      }

      const adRows = ads.map((ad) =>
        buildAdCatalogRow(ad, {
          ...creativeCtx,
          classifications: adClassifications,
          campaignByMetaId,
          adSetByMetaId,
          creativeByMetaId,
        }),
      );
      await upsertMany("meta_ads", adRows, "meta_account_id,ad_id");
      return { ads: adRows.length, creatives: creativeRows.length };
    },
    stampRefreshed: (adSetId) => stampAdSetRefreshed(metaAccountId, adSetId, now),
    now: () => Date.now(),
    budgetMs: adCatalogChunkBudgetMs(),
  };

  const result = await runAdCatalogChunk(deps);
  return { ...result, enrichment };
}

async function syncAccount(
  account: SyncAccountConfig,
  brandId: string | null,
  options: {
    insights?: InsightDateRange;
    refreshPreviews?: boolean;
    refreshAdCatalog?: boolean;
    refreshAdStatusesOnly?: boolean;
    refreshRankingDiagnostics?: boolean;
    includeCreativeDiagnostics?: boolean;
    allowFinalizedInsightUpdates?: boolean;
  } = {},
) {
  const accountId = normalizeAccountId(account.accountId);
  const metaAccountId = `act_${accountId}`;
  const now = new Date().toISOString();
  const refreshPreviews = options.refreshPreviews ?? true;
  const refreshAdCatalog = options.refreshAdCatalog ?? true;
  const refreshAdStatusesOnly = options.refreshAdStatusesOnly ?? false;
  const refreshRankingDiagnostics = options.refreshRankingDiagnostics ?? true;
  const includeCreativeDiagnostics = options.includeCreativeDiagnostics ?? true;
  const enrichment = emptyEnrichmentMetrics();

  const accountProfile = await graphFetch<JsonRecord>(metaAccountId, {
    fields: "id,name,currency,timezone_name,account_status,business_name",
  });

  const accountRow = await upsertSingle("meta_ad_accounts", {
    brand_id: brandId,
    meta_account_id: metaAccountId,
    name: stringField(accountProfile.name) || account.brandName,
    currency: stringField(accountProfile.currency),
    timezone_name: stringField(accountProfile.timezone_name),
    account_status: numberField(accountProfile.account_status),
    raw_json: accountProfile,
    last_synced_at: now,
  }, "meta_account_id");

  const campaigns = refreshAdStatusesOnly
    ? await fetchMetaCampaignsForStatusRefresh(metaAccountId)
    : await fetchMetaCampaignsForCatalogRefresh(metaAccountId, {
        enrichment,
        account: account.brandCode,
      });

  const adSets = refreshAdStatusesOnly
    ? await fetchMetaAdSetsForStatusRefresh(metaAccountId)
    : await fetchMetaAdSetsForCatalogRefresh(metaAccountId, {
        enrichment,
        account: account.brandCode,
      });

  const overrides = await fetchCampaignUmbrellaOverrides(metaAccountId);
  const campaignRawByMetaId = new Map(campaigns.map((campaign) => [String(campaign.id), campaign]));
  const adSetRawByMetaId = new Map(adSets.map((adSet) => [String(adSet.id), adSet]));
  const adSetNamesByCampaignId = groupAdSetNamesByCampaignId(adSets);
  const campaignClassifications = new Map<string, CampaignUmbrellaClassification>();

  for (const campaign of campaigns) {
    const campaignId = stringField(campaign.id);
    if (!campaignId) continue;
    campaignClassifications.set(
      campaignId,
      classifyCampaignUmbrella({
        campaignName: stringField(campaign.name),
        adSetNames: adSetNamesByCampaignId.get(campaignId) || [],
        override: getUmbrellaOverride(overrides, "campaign", campaignId),
      }),
    );
  }

  const campaignRows = await upsertMany(
    "meta_campaigns",
    campaigns.map((campaign) => {
      const classification = campaignClassifications.get(stringField(campaign.id) || "") ||
        classifyCampaignUmbrella({ campaignName: stringField(campaign.name) });
      return buildCampaignCatalogRow(campaign, classification, {
        brandId,
        accountRowId: accountRow.id,
        metaAccountId,
        now,
        statusOnly: refreshAdStatusesOnly,
      });
    }),
    "meta_account_id,campaign_id",
  );
  const campaignByMetaId = new Map(campaignRows.map((row) => [String(row.campaign_id), row]));

  const adSetClassifications = new Map<string, CampaignUmbrellaClassification>();
  for (const adSet of adSets) {
    const adSetId = stringField(adSet.id);
    if (!adSetId) continue;
    const campaignId = stringField(adSet.campaign_id);
    const campaign = campaignId ? campaignRawByMetaId.get(campaignId) : undefined;
    adSetClassifications.set(
      adSetId,
      classifyCampaignUmbrella({
        campaignName: stringField(campaign?.name),
        adSetName: stringField(adSet.name),
        inherited: campaignId ? campaignClassifications.get(campaignId) : null,
        override: getUmbrellaOverride(overrides, "ad_set", adSetId),
      }),
    );
  }

  const adSetRows = await upsertMany(
    "meta_ad_sets",
    adSets.map((adSet) => {
      const classification = adSetClassifications.get(stringField(adSet.id) || "") ||
        classifyCampaignUmbrella({ adSetName: stringField(adSet.name) });
      return buildAdSetCatalogRow(adSet, classification, {
        brandId,
        accountRowId: accountRow.id,
        metaAccountId,
        now,
        statusOnly: refreshAdStatusesOnly,
        campaignByMetaId,
      });
    }),
    "meta_account_id,ad_set_id",
  );
  const adSetByMetaId = new Map(adSetRows.map((row) => [String(row.ad_set_id), row]));

  // Restrict /ads to the slice of inventory a dashboard cares about. By
  // default Meta returns EVERY ad ever attached to the account — including
  // ARCHIVED + DELETED + DISAPPROVED entries from years of rotation, which
  // for HP comes to 10,000+ rows and trips META_SYNC_MAX_AD_PAGES.
  //
  // The included statuses cover anything that can still spend or be
  // re-activated. Insights for old archived/deleted ads remain intact in
  // meta_daily_insights — they're fetched via the /insights endpoint which
  // doesn't honor this filter. The backfill flow is unaffected.
  const ads = refreshAdCatalog
    ? await fetchMetaAdsForCatalogRefresh(metaAccountId, {
        enrichment,
        account: account.brandCode,
      })
    : refreshAdStatusesOnly
      ? await fetchMetaAdsForStatusRefresh(metaAccountId)
      : [];
  const storedAdRows = refreshAdCatalog ? [] : await fetchStoredAdRows(metaAccountId);
  const storedCreativeRows = refreshAdCatalog ? [] : await fetchStoredCreativeRows(metaAccountId);

  const previewByAdId = new Map<string, { previewHtml: string | null; previewUrl: string | null }>();
  if (refreshPreviews) {
    for (const ad of ads) {
      const adId = stringField(ad.id);
      if (!adId) continue;
      const creative = recordField(ad.creative);
      const preview = chooseStoredPreview(creative, null);
      if (preview.previewSource === "fallback") {
        const adPreview = await fetchAdPreview(adId);
        previewByAdId.set(adId, adPreview);
      }
    }
  }

  const creativeRowContext: CreativeCatalogRowContext = {
    brandId,
    accountRowId: accountRow.id,
    metaAccountId,
    now,
    refreshPreviews,
    previewByAdId,
  };
  const creativeRowsInput = refreshAdCatalog
    ? (ads
        .map((ad) => buildCreativeCatalogRow(ad, creativeRowContext))
        .filter(Boolean) as JsonRecord[])
    : [];

  const creativeRows = await upsertMany(
    "meta_creatives",
    uniqueBy(creativeRowsInput, (row) => String(row.creative_id)),
    "meta_account_id,creative_id",
  );
  const activeCreativeRows = refreshAdCatalog ? creativeRows : storedCreativeRows;
  const creativeByMetaId = new Map(activeCreativeRows.map((row) => [String(row.creative_id), row]));

  const adClassifications = new Map<string, CampaignUmbrellaClassification>();
  if (refreshAdCatalog || refreshAdStatusesOnly) {
    for (const ad of ads) {
      const adId = stringField(ad.id);
      if (!adId) continue;
      const campaignId = stringField(ad.campaign_id);
      const adSetId = stringField(ad.adset_id);
      const campaign = campaignId ? campaignRawByMetaId.get(campaignId) : undefined;
      const adSet = adSetId ? adSetRawByMetaId.get(adSetId) : undefined;
      adClassifications.set(
        adId,
        classifyCampaignUmbrella({
          campaignName: stringField(campaign?.name),
          adSetName: stringField(adSet?.name),
          inherited: (adSetId && adSetClassifications.get(adSetId)) ||
            (campaignId && campaignClassifications.get(campaignId)) ||
            null,
          override: getUmbrellaOverride(overrides, "ad", adId),
        }),
      );
    }
  } else {
    storedAdRows.forEach((ad) => {
      const adId = stringField(ad.ad_id);
      const storedClassification = storedCampaignClassification(ad);
      if (adId && storedClassification) adClassifications.set(adId, storedClassification);
    });
  }

  const adRows = refreshAdCatalog
    ? await upsertMany(
        "meta_ads",
        ads.map((ad) =>
          buildAdCatalogRow(ad, {
            ...creativeRowContext,
            classifications: adClassifications,
            campaignByMetaId,
            adSetByMetaId,
            creativeByMetaId,
          }),
        ),
        "meta_account_id,ad_id",
      )
    : refreshAdStatusesOnly
      ? mergeRowsByKey(
          storedAdRows,
          await upsertMany(
            "meta_ads",
            ads.map((ad) => {
              const creative = recordField(ad.creative);
              const creativeId = stringField(creative.id);
              const adId = stringField(ad.id);
              const classification = adClassifications.get(adId || "") ||
                classifyCampaignUmbrella({ campaignName: stringField(ad.name) });
              return {
                brand_id: brandId,
                account_id: accountRow.id,
                campaign_ref_id: campaignByMetaId.get(String(ad.campaign_id))?.id || null,
                ad_set_ref_id: adSetByMetaId.get(String(ad.adset_id))?.id || null,
                creative_ref_id: creativeByMetaId.get(creativeId || "")?.id || null,
                meta_account_id: metaAccountId,
                campaign_id: stringField(ad.campaign_id),
                ad_set_id: stringField(ad.adset_id),
                ad_id: adId,
                creative_id: creativeId,
                name: stringField(ad.name),
                status: stringField(ad.status),
                configured_status: stringField(ad.configured_status),
                effective_status: stringField(ad.effective_status),
                created_time: stringField(ad.created_time),
                updated_time: stringField(ad.updated_time),
                ...umbrellaColumns(classification),
                raw_json: ad,
                last_synced_at: now,
              };
            }),
            "meta_account_id,ad_id",
          ),
          "ad_id",
        )
    : storedAdRows;
  const adByMetaId = new Map(adRows.map((row) => [String(row.ad_id), row]));

  if (refreshAdCatalog) {
    await syncOptionalCatalogEnrichments(metaAccountId, now, enrichment);
  }

  const insightRange = options.insights || getSyncInsightDateRange();
  const [insights, rankingByAdId] = await Promise.all([
    fetchInsights(metaAccountId, insightRange, { includeCreativeDiagnostics }),
    refreshRankingDiagnostics
      ? fetchInsightRankingDiagnostics(metaAccountId, insightRange)
      : Promise.resolve(new Map<string, InsightRankingDiagnostics>()),
  ]);
  const allowFinalizedUpdates = options.allowFinalizedInsightUpdates === true;
  const finalizedCutoff = allowFinalizedUpdates ? null : finalizedInsightCutoffDate();
  const mappedInsightRows = insights.map((insight) =>
    mapInsightToDailyRow({
      insight,
      brandId,
      accountRow,
      metaAccountId,
      campaignByMetaId,
      adSetByMetaId,
      adByMetaId,
      creativeByMetaId,
      adClassifications,
      adSetClassifications,
      campaignClassifications,
      rankingByAdId,
    }),
  );
  const validInsightRows = mappedInsightRows.filter(isValidInsightRow);
  const skippedInvalidRows = mappedInsightRows.length - validInsightRows.length;
  const refreshableInsightRows = finalizedCutoff
    ? validInsightRows.filter((row) => String(row.date_start) >= finalizedCutoff)
    : validInsightRows;
  const skippedFinalizedRows = validInsightRows.length - refreshableInsightRows.length;
  const { rows: dedupedInsightRows, duplicateCount } = dedupeInsightRows(refreshableInsightRows);
  const fetchedRange = dateRangeForRows(dedupedInsightRows);
  const affectedRange = replacementRangeForInsightSync(insightRange, finalizedCutoff, fetchedRange);
  const before = await insightAggregateSnapshot(metaAccountId, affectedRange);
  const beforeBuckets = await insightBucketSnapshots(metaAccountId, affectedRange);

  await replaceStoredInsightRows(metaAccountId, affectedRange, dedupedInsightRows);
  await upsertInsightEnrichments(dedupedInsightRows, enrichment, account.brandCode, metaAccountId);

  const after = await insightAggregateSnapshot(metaAccountId, affectedRange);
  const afterBuckets = await insightBucketSnapshots(metaAccountId, affectedRange);
  const audit = buildAccountSyncAudit({
    account,
    metaAccountId,
    range: insightRange,
    fetchedRows: insights.length,
    validRows: validInsightRows.length,
    storedRows: dedupedInsightRows.length,
    skippedFinalizedRows,
    skippedInvalidRows,
    duplicateFetchedRows: duplicateCount,
    allowFinalizedUpdates,
    finalizedCutoffDate: finalizedCutoff,
    affectedRange,
    before,
    after,
    beforeBuckets,
    afterBuckets,
  });

  return {
    campaigns: campaigns.length,
    adSets: adSets.length,
    ads: ads.length,
    creatives: creativeRows.length,
    insightRows: insights.length,
    previewRefreshes: refreshPreviews ? previewByAdId.size + creativeRows.length : 0,
    enrichment,
    audit,
  };
}

function mapInsightToDailyRow(input: {
  insight: JsonRecord;
  brandId: string | null;
  accountRow: JsonRecord;
  metaAccountId: string;
  campaignByMetaId: Map<string, JsonRecord>;
  adSetByMetaId: Map<string, JsonRecord>;
  adByMetaId: Map<string, JsonRecord>;
  creativeByMetaId: Map<string, JsonRecord>;
  adClassifications: Map<string, CampaignUmbrellaClassification>;
  adSetClassifications: Map<string, CampaignUmbrellaClassification>;
  campaignClassifications: Map<string, CampaignUmbrellaClassification>;
  rankingByAdId: Map<string, InsightRankingDiagnostics>;
}) {
  const adId = stringField(input.insight.ad_id);
  const ranking = adId ? input.rankingByAdId.get(adId) : undefined;
  const ad = input.adByMetaId.get(adId || "");
  const creativeId = stringField(ad?.creative_id);
  const campaignId = stringField(input.insight.campaign_id);
  const adSetId = stringField(input.insight.adset_id);
  const campaignName = stringField(input.insight.campaign_name);
  const adSetName = stringField(input.insight.adset_name);
  const objective = stringField(input.insight.objective) || ranking?.objective || null;
  const optimizationGoal =
    stringField(input.insight.optimization_goal) || ranking?.optimizationGoal || null;
  const inheritedClassification = (adId && input.adClassifications.get(adId)) ||
    (adSetId && input.adSetClassifications.get(adSetId)) ||
    (campaignId && input.campaignClassifications.get(campaignId)) ||
    null;
  const classification = inheritedClassification ||
    classifyCampaignUmbrella({
      campaignName,
      adSetName,
    });
  const kpi = resolveMetaKpi({
    spend: numberField(input.insight.spend) || 0,
    actions: input.insight.actions,
    costPerActionType: input.insight.cost_per_action_type,
    campaignName,
    adSetName,
    campaignUmbrella: classification.umbrella,
    objective,
    optimizationGoal,
  });

  return {
    brand_id: input.brandId,
    account_id: input.accountRow.id,
    campaign_ref_id: input.campaignByMetaId.get(String(campaignId))?.id || null,
    ad_set_ref_id: input.adSetByMetaId.get(String(adSetId))?.id || null,
    ad_ref_id: ad?.id || null,
    creative_ref_id: input.creativeByMetaId.get(creativeId || "")?.id || null,
    meta_account_id: input.metaAccountId,
    campaign_id: campaignId,
    campaign_name: campaignName,
    objective,
    ad_set_id: adSetId,
    ad_set_name: adSetName,
    optimization_goal: optimizationGoal,
    ad_id: adId,
    ad_name: stringField(input.insight.ad_name),
    creative_id: creativeId,
    date_start: stringField(input.insight.date_start),
    date_stop: stringField(input.insight.date_stop),
    spend: numberString(input.insight.spend),
    impressions: numberString(input.insight.impressions),
    reach: numberString(input.insight.reach),
    frequency: numberString(input.insight.frequency),
    cpm: numberString(input.insight.cpm),
    cpc: numberString(input.insight.cpc),
    ctr: numberString(input.insight.ctr),
    clicks: numberString(input.insight.clicks),
    inline_link_clicks: numberString(input.insight.inline_link_clicks),
    unique_clicks: numberString(input.insight.unique_clicks),
    cost_per_action_type: Array.isArray(input.insight.cost_per_action_type)
      ? input.insight.cost_per_action_type
      : [],
    quality_ranking: stringField(input.insight.quality_ranking) || ranking?.qualityRanking || null,
    engagement_rate_ranking:
      stringField(input.insight.engagement_rate_ranking) || ranking?.engagementRateRanking || null,
    conversion_rate_ranking:
      stringField(input.insight.conversion_rate_ranking) || ranking?.conversionRateRanking || null,
    kpi_label: kpi.resultKpiLabel,
    kpi_action_type: kpi.resultActionType,
    kpi_value: kpi.resultCount,
    cost_per_kpi: kpi.costPerResult,
    conversions: extractActionCount(input.insight.actions, ["offsite_conversion", "purchase", "complete_registration"]),
    leads: extractExactActionCount(input.insight.actions, [
      "lead",
      "onsite_conversion.lead",
      "onsite_conversion.lead_grouped",
      "onsite_web_lead",
      "offsite_conversion.fb_pixel_lead",
    ]),
    bookings:
      classification.umbrella === "Book Appts US"
        ? extractExactActionCount(input.insight.actions, ["offsite_conversion.fb_pixel_custom"])
        : extractExactActionCount(input.insight.actions, [
            "schedule",
            "submit_application",
            "booking",
            "appointment",
          ]),
    video_metrics: {
      video_play_actions: input.insight.video_play_actions || [],
      video_30_sec_watched_actions: input.insight.video_30_sec_watched_actions || [],
      video_avg_time_watched_actions: input.insight.video_avg_time_watched_actions || [],
      video_p25_watched_actions: input.insight.video_p25_watched_actions || [],
      video_p50_watched_actions: input.insight.video_p50_watched_actions || [],
      video_p75_watched_actions: input.insight.video_p75_watched_actions || [],
      video_p95_watched_actions: input.insight.video_p95_watched_actions || [],
      video_p100_watched_actions: input.insight.video_p100_watched_actions || [],
      video_thruplay_watched_actions: input.insight.video_thruplay_watched_actions || [],
    },
    actions: Array.isArray(input.insight.actions) ? input.insight.actions : [],
    action_values: Array.isArray(input.insight.action_values) ? input.insight.action_values : [],
    ...umbrellaColumns(classification),
    raw_json: input.insight,
  };
}

function isValidInsightRow(row: JsonRecord) {
  return Boolean(row.meta_account_id && row.ad_id && row.date_start);
}

function dedupeInsightRows(inputRows: JsonRecord[]) {
  const byKey = new Map<string, JsonRecord>();
  let duplicateCount = 0;

  inputRows.forEach((row) => {
    const key = `${row.meta_account_id}|${row.ad_id}|${row.date_start}`;
    if (byKey.has(key)) duplicateCount += 1;
    byKey.set(key, row);
  });

  return { rows: Array.from(byKey.values()), duplicateCount };
}

function dateRangeForRows(inputRows: JsonRecord[]) {
  return inputRows.reduce<{ start: string | null; end: string | null }>(
    (range, row) => {
      const date = stringField(row.date_start);
      if (!date) return range;
      return {
        start: !range.start || date < range.start ? date : range.start,
        end: !range.end || date > range.end ? date : range.end,
      };
    },
    { start: null, end: null },
  );
}

function replacementRangeForInsightSync(
  insightRange: InsightDateRange,
  finalizedCutoff: string | null,
  fallbackRange: { start: string | null; end: string | null },
) {
  if (insightRange.kind !== "range") return fallbackRange;

  const start = finalizedCutoff && insightRange.since < finalizedCutoff
    ? finalizedCutoff
    : insightRange.since;
  const end = insightRange.until;
  if (!start || !end || start > end) return fallbackRange;
  return { start, end };
}

async function replaceStoredInsightRows(
  metaAccountId: string,
  range: { start: string | null; end: string | null },
  rowsToInsert: JsonRecord[],
) {
  if (!range.start || !range.end) return;

  const supabase = createAdsAnalystClient("worker");
  const query = supabase
    .from("meta_daily_insights")
    .delete()
    .eq("meta_account_id", metaAccountId)
    .gte("date_start", range.start)
    .lte("date_start", range.end);
  const scopedQuery = usesLimitedAdsAnalystDbAccess()
    ? (query as unknown as { eq: (column: string, value: string) => typeof query }).eq(
        "environment",
        getAdsAnalystEnvironment(),
      )
    : query;

  const { error } = await scopedQuery;

  if (error) throw error;
  if (!rowsToInsert.length) return;

  await upsertMany("meta_daily_insights", rowsToInsert, "meta_account_id,ad_id,date_start");
}

async function upsertInsightEnrichments(
  insightRows: JsonRecord[],
  enrichment: SyncEnrichmentMetrics,
  account: string,
  metaAccountId: string,
) {
  const rowsToInsert = insightRows
    .map(mapInsightToEnrichmentRow)
    .filter((row) => row.meta_account_id && row.ad_id && row.date_start);

  if (!rowsToInsert.length) return;

  try {
    const rows = await upsertMany(
      "meta_daily_insight_enrichments",
      rowsToInsert,
      "environment,meta_account_id,ad_id,date_start",
    );
    enrichment.insightSidecarRows += rows.length;
  } catch (error) {
    recordSkippedEnrichment(
      enrichment,
      account,
      "daily_insight_enrichments",
      `Sidecar upsert failed for ${metaAccountId}: ${errorToMessage(error)}`,
    );
  }
}

export function mapInsightToEnrichmentRow(row: JsonRecord) {
  const raw = recordField(row.raw_json);

  return {
    brand_id: row.brand_id || null,
    account_id: row.account_id || null,
    campaign_ref_id: row.campaign_ref_id || null,
    ad_set_ref_id: row.ad_set_ref_id || null,
    ad_ref_id: row.ad_ref_id || null,
    creative_ref_id: row.creative_ref_id || null,
    meta_account_id: stringField(row.meta_account_id),
    campaign_id: stringField(row.campaign_id),
    ad_set_id: stringField(row.ad_set_id),
    ad_id: stringField(row.ad_id),
    creative_id: stringField(row.creative_id),
    date_start: stringField(row.date_start),
    date_stop: stringField(row.date_stop),
    account_currency: stringField(raw.account_currency),
    attribution_setting: stringField(raw.attribution_setting),
    cost_per_result: arrayField(raw.cost_per_result),
    result_rate: arrayField(raw.result_rate),
    outbound_clicks: arrayField(raw.outbound_clicks),
    unique_outbound_clicks: arrayField(raw.unique_outbound_clicks),
    cost_per_outbound_click: arrayField(raw.cost_per_outbound_click),
    website_ctr: arrayField(raw.website_ctr),
    landing_page_view_per_link_click: numberField(raw.landing_page_view_per_link_click),
    landing_page_view_actions_per_link_click: numberField(raw.landing_page_view_actions_per_link_click),
    inline_post_engagement: numberField(raw.inline_post_engagement),
    instagram_profile_visits: numberField(raw.instagram_profile_visits),
    social_spend: numberField(raw.social_spend),
    cost_per_inline_link_click: numberField(raw.cost_per_inline_link_click),
    cost_per_inline_post_engagement: numberField(raw.cost_per_inline_post_engagement),
    meta_conversions: arrayField(raw.conversions),
    raw_json: raw,
    last_synced_at: new Date().toISOString(),
  };
}

async function insightAggregateSnapshot(
  metaAccountId: string,
  range: { start: string | null; end: string | null },
): Promise<InsightAggregateSnapshot> {
  return aggregateStoredInsightRows(await fetchStoredInsightRows(metaAccountId, range));
}

async function insightBucketSnapshots(
  metaAccountId: string,
  range: { start: string | null; end: string | null },
) {
  const buckets = new Map<string, InsightBucketSnapshot>();
  const storedRows = await fetchStoredInsightRows(metaAccountId, range);

  storedRows.forEach((row) => {
    const month = String(row.date_start || "").slice(0, 7) || "unknown";
    const campaignUmbrella = stringField(row.campaign_umbrella) || "Needs review";
    const key = `${month}|${campaignUmbrella}`;
    const current = buckets.get(key) || {
      month,
      campaignUmbrella,
      ...emptyInsightSnapshot(),
    };
    addInsightRowToSnapshot(current, row);
    buckets.set(key, current);
  });

  return Array.from(buckets.values()).sort((a, b) =>
    `${a.month}|${a.campaignUmbrella}`.localeCompare(`${b.month}|${b.campaignUmbrella}`),
  );
}

async function fetchStoredInsightRows(
  metaAccountId: string,
  range: { start: string | null; end: string | null },
) {
  if (!range.start || !range.end) return [];

  const supabase = createAdsAnalystClient("worker") as unknown as SupabaseSelectClient;
  const output: JsonRecord[] = [];
  const pageSize = 1000;

  for (let from = 0; ; from += pageSize) {
    const query = supabase
      .from("meta_daily_insights")
      .select("date_start,campaign_umbrella,spend,impressions,clicks,leads,bookings,conversions")
      .eq("meta_account_id", metaAccountId)
      .gte("date_start", range.start)
      .lte("date_start", range.end)
      .range(from, from + pageSize - 1);
    const response = await query;

    if (response.error) throw response.error;

    const page = rows<JsonRecord>(response.data);
    output.push(...page);
    if (page.length < pageSize) break;
  }

  return output;
}

async function fetchStoredAdRows(metaAccountId: string) {
  const supabase = createAdsAnalystClient("worker") as unknown as SupabaseSelectClient;
  const output: JsonRecord[] = [];
  const pageSize = 1000;

  for (let from = 0; ; from += pageSize) {
    const response = await supabase
      .from("meta_ads")
      .select(
        [
          "id",
          "brand_id",
          "account_id",
          "campaign_ref_id",
          "ad_set_ref_id",
          "creative_ref_id",
          "meta_account_id",
          "campaign_id",
          "ad_set_id",
          "ad_id",
          "creative_id",
          "name",
          "status",
          "effective_status",
          "campaign_umbrella",
          "campaign_umbrella_confidence",
          "campaign_umbrella_source",
          "campaign_umbrella_reason",
        ].join(","),
      )
      .eq("meta_account_id", metaAccountId)
      .range(from, from + pageSize - 1);

    if (response.error) throw response.error;

    const page = rows<JsonRecord>(response.data);
    output.push(...page);
    if (page.length < pageSize) break;
  }

  return output;
}

async function fetchStoredCreativeRows(metaAccountId: string) {
  const supabase = createAdsAnalystClient("worker") as unknown as SupabaseSelectClient;
  const output: JsonRecord[] = [];
  const pageSize = 1000;

  for (let from = 0; ; from += pageSize) {
    const response = await supabase
      .from("meta_creatives")
      .select("id,meta_account_id,creative_id")
      .eq("meta_account_id", metaAccountId)
      .range(from, from + pageSize - 1);

    if (response.error) throw response.error;

    const page = rows<JsonRecord>(response.data);
    output.push(...page);
    if (page.length < pageSize) break;
  }

  return output;
}

async function syncOptionalCatalogEnrichments(
  metaAccountId: string,
  now: string,
  enrichment: SyncEnrichmentMetrics,
) {
  if (shouldSkipOptionalMetaWork()) {
    recordSkippedEnrichment(
      enrichment,
      metaAccountId,
      "catalog_edges",
      `Meta usage crossed ${getMetaApiUsageWarnPercent()}%; optional catalog edges skipped.`,
    );
    return;
  }

  enrichment.adLabels += await syncOptionalCatalogEdge({
    account: metaAccountId,
    group: "ad_labels",
    fetchRows: () => fetchMetaAdLabels(metaAccountId),
    mapRow: (row) => ({
      meta_account_id: metaAccountId,
      meta_id: stringField(row.id),
      name: stringField(row.name),
      raw_json: row,
      last_synced_at: now,
    }),
    table: "meta_ad_labels",
    onConflict: "environment,meta_account_id,meta_id",
    enrichment,
  });

  if (shouldSkipOptionalMetaWork()) {
    recordSkippedEnrichment(
      enrichment,
      metaAccountId,
      "ad_pixels_custom_conversions",
      `Meta usage crossed ${getMetaApiUsageWarnPercent()}%; remaining catalog edges skipped.`,
    );
    return;
  }

  enrichment.adPixels += await syncOptionalCatalogEdge({
    account: metaAccountId,
    group: "ad_pixels",
    fetchRows: () => fetchMetaAdPixels(metaAccountId),
    mapRow: (row) => ({
      meta_account_id: metaAccountId,
      meta_id: stringField(row.id),
      name: stringField(row.name),
      last_fired_time: stringField(row.last_fired_time),
      is_unavailable: booleanField(row.is_unavailable),
      raw_json: row,
      last_synced_at: now,
    }),
    table: "meta_ad_pixels",
    onConflict: "environment,meta_account_id,meta_id",
    enrichment,
  });

  if (shouldSkipOptionalMetaWork()) {
    recordSkippedEnrichment(
      enrichment,
      metaAccountId,
      "custom_conversions",
      `Meta usage crossed ${getMetaApiUsageWarnPercent()}%; custom conversions skipped.`,
    );
    return;
  }

  enrichment.customConversions += await syncOptionalCatalogEdge({
    account: metaAccountId,
    group: "custom_conversions",
    fetchRows: () => fetchMetaCustomConversions(metaAccountId),
    mapRow: (row) => ({
      meta_account_id: metaAccountId,
      meta_id: stringField(row.id),
      name: stringField(row.name),
      custom_event_type: stringField(row.custom_event_type),
      event_source_type: stringField(row.event_source_type),
      creation_time: stringField(row.creation_time),
      last_fired_time: stringField(row.last_fired_time),
      is_archived: booleanField(row.is_archived),
      is_unavailable: booleanField(row.is_unavailable),
      raw_json: row,
      last_synced_at: now,
    }),
    table: "meta_custom_conversions",
    onConflict: "environment,meta_account_id,meta_id",
    enrichment,
  });
}

async function syncOptionalCatalogEdge(input: {
  account: string;
  group: string;
  fetchRows: () => Promise<JsonRecord[]>;
  mapRow: (row: JsonRecord) => JsonRecord;
  table: string;
  onConflict: string;
  enrichment: SyncEnrichmentMetrics;
}) {
  try {
    const rows = (await input.fetchRows()).map(input.mapRow).filter((row) => row.meta_id);
    const storedRows = await upsertMany(input.table, rows, input.onConflict);
    return storedRows.length;
  } catch (error) {
    recordSkippedEnrichment(input.enrichment, input.account, input.group, errorToMessage(error));
    return 0;
  }
}

function aggregateStoredInsightRows(inputRows: JsonRecord[]) {
  const snapshot = emptyInsightSnapshot();
  inputRows.forEach((row) => addInsightRowToSnapshot(snapshot, row));
  return snapshot;
}

function emptyInsightSnapshot(): InsightAggregateSnapshot {
  return {
    rows: 0,
    spend: 0,
    impressions: 0,
    clicks: 0,
    leads: 0,
    bookings: 0,
    conversions: 0,
  };
}

function addInsightRowToSnapshot(snapshot: InsightAggregateSnapshot, row: JsonRecord) {
  snapshot.rows += 1;
  snapshot.spend = roundCurrency(snapshot.spend + (numberField(row.spend) || 0));
  snapshot.impressions += Math.round(numberField(row.impressions) || 0);
  snapshot.clicks += Math.round(numberField(row.clicks) || 0);
  snapshot.leads += Math.round(numberField(row.leads) || 0);
  snapshot.bookings += Math.round(numberField(row.bookings) || 0);
  snapshot.conversions += Math.round(numberField(row.conversions) || 0);
}

function buildAccountSyncAudit(input: {
  account: SyncAccountConfig;
  metaAccountId: string;
  range: InsightDateRange;
  fetchedRows: number;
  validRows: number;
  storedRows: number;
  skippedFinalizedRows: number;
  skippedInvalidRows: number;
  duplicateFetchedRows: number;
  allowFinalizedUpdates: boolean;
  finalizedCutoffDate: string | null;
  affectedRange: { start: string | null; end: string | null };
  before: InsightAggregateSnapshot;
  after: InsightAggregateSnapshot;
  beforeBuckets: InsightBucketSnapshot[];
  afterBuckets: InsightBucketSnapshot[];
}): AccountSyncAudit {
  const warnings: string[] = [];

  if (input.skippedInvalidRows) {
    warnings.push(`${input.account.brandCode}: skipped ${input.skippedInvalidRows} invalid insight row(s).`);
  }
  if (input.duplicateFetchedRows) {
    warnings.push(`${input.account.brandCode}: collapsed ${input.duplicateFetchedRows} duplicate fetched insight row(s).`);
  }
  if (input.skippedFinalizedRows) {
    warnings.push(
      `${input.account.brandCode}: skipped ${input.skippedFinalizedRows} finalized insight row(s) before ${input.finalizedCutoffDate}.`,
    );
  }

  const changedBuckets = changedInsightBuckets(input.beforeBuckets, input.afterBuckets);
  changedBuckets
    .filter((bucket) => bucket.rows > 0 && bucket.spend > 500)
    .slice(0, 5)
    .forEach((bucket) => {
      warnings.push(
        `${input.account.brandCode}: ${bucket.month} ${bucket.campaignUmbrella} spend changed by ${formatMoneyForAudit(bucket.spend)} during sync.`,
      );
    });

  return {
    brandCode: input.account.brandCode,
    metaAccountId: input.metaAccountId,
    requestedRange: describeInsightRange(input.range),
    fetchedRows: input.fetchedRows,
    validRows: input.validRows,
    storedRows: input.storedRows,
    skippedFinalizedRows: input.skippedFinalizedRows,
    skippedInvalidRows: input.skippedInvalidRows,
    duplicateFetchedRows: input.duplicateFetchedRows,
    allowFinalizedUpdates: input.allowFinalizedUpdates,
    finalizedCutoffDate: input.finalizedCutoffDate,
    affectedRange: input.affectedRange,
    before: input.before,
    after: input.after,
    delta: diffInsightSnapshot(input.before, input.after),
    changedBuckets,
    warnings,
  };
}

function changedInsightBuckets(before: InsightBucketSnapshot[], after: InsightBucketSnapshot[]) {
  const beforeByKey = new Map(before.map((bucket) => [`${bucket.month}|${bucket.campaignUmbrella}`, bucket]));
  const afterByKey = new Map(after.map((bucket) => [`${bucket.month}|${bucket.campaignUmbrella}`, bucket]));
  const keys = Array.from(new Set([...beforeByKey.keys(), ...afterByKey.keys()]));

  return keys
    .map((key) => {
      const afterBucket = afterByKey.get(key);
      const [month, campaignUmbrella] = key.split("|");
      return {
        month,
        campaignUmbrella,
        ...diffInsightSnapshot(beforeByKey.get(key) || emptyInsightSnapshot(), afterBucket || emptyInsightSnapshot()),
      };
    })
    .filter((bucket) =>
      bucket.rows !== 0 ||
      bucket.spend !== 0 ||
      bucket.impressions !== 0 ||
      bucket.clicks !== 0 ||
      bucket.leads !== 0 ||
      bucket.bookings !== 0 ||
      bucket.conversions !== 0,
    )
    .sort((a, b) => Math.abs(b.spend) - Math.abs(a.spend));
}

function diffInsightSnapshot(before: InsightAggregateSnapshot, after: InsightAggregateSnapshot) {
  return {
    rows: after.rows - before.rows,
    spend: roundCurrency(after.spend - before.spend),
    impressions: after.impressions - before.impressions,
    clicks: after.clicks - before.clicks,
    leads: after.leads - before.leads,
    bookings: after.bookings - before.bookings,
    conversions: after.conversions - before.conversions,
  };
}

function describeInsightRange(range: InsightDateRange) {
  if (range.kind === "range") return `${range.since} to ${range.until}`;
  return range.datePreset || getSyncDatePreset();
}

function roundCurrency(value: number) {
  return Math.round(value * 100) / 100;
}

function formatMoneyForAudit(value: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 2,
  }).format(value);
}

async function fetchInsights(
  metaAccountId: string,
  range?: InsightDateRange,
  options: { includeCreativeDiagnostics?: boolean } = {},
) {
  const creativeDiagnosticFields = [
    "video_play_actions",
    "video_30_sec_watched_actions",
    "video_avg_time_watched_actions",
    "video_p25_watched_actions",
    "video_p50_watched_actions",
    "video_p75_watched_actions",
    "video_p95_watched_actions",
    "video_p100_watched_actions",
    "video_thruplay_watched_actions",
  ];
  const fields = [
    ...META_INSIGHT_CORE_FIELDS,
    ...META_INSIGHT_ENRICHMENT_FIELDS,
    ...(options.includeCreativeDiagnostics === false ? [] : creativeDiagnosticFields),
  ].join(",");

  try {
    return await graphPages<JsonRecord>(`${metaAccountId}/insights`, {
      level: "ad",
      time_increment: "1",
      ...buildInsightDateParams(range || { kind: "preset", datePreset: getSyncDatePreset() }),
      fields,
      limit: "100",
    }, { maxPages: getSyncMaxPages("META_SYNC_MAX_INSIGHT_PAGES", 100) });
  } catch (error) {
    const minimalFields = [
      "campaign_id",
      "campaign_name",
      "adset_id",
      "adset_name",
      "ad_id",
      "ad_name",
      "date_start",
      "date_stop",
      "spend",
      "impressions",
      "reach",
      "frequency",
      "cpm",
      "cpc",
      "ctr",
      "clicks",
      "actions",
    ].join(",");

    if (error instanceof MetaGraphError) {
      return graphPages<JsonRecord>(`${metaAccountId}/insights`, {
        level: "ad",
        time_increment: "1",
        ...buildInsightDateParams(range || { kind: "preset", datePreset: getSyncDatePreset() }),
        fields: minimalFields,
        limit: "100",
      }, { maxPages: getSyncMaxPages("META_SYNC_MAX_INSIGHT_PAGES", 100) });
    }
    throw error;
  }
}

async function fetchInsightRankingDiagnostics(metaAccountId: string, range: InsightDateRange) {
  try {
    const rows = await graphPages<JsonRecord>(`${metaAccountId}/insights`, {
      level: "ad",
      time_increment: "all_days",
      ...buildInsightDateParams(range),
      fields: [
        "ad_id",
        "objective",
        "optimization_goal",
        "quality_ranking",
        "engagement_rate_ranking",
        "conversion_rate_ranking",
      ].join(","),
      limit: "100",
    }, { maxPages: getSyncMaxPages("META_SYNC_MAX_RANKING_PAGES", 30) });

    return new Map(
      rows
        .map((row) => {
          const adId = stringField(row.ad_id);
          if (!adId) return null;
          return [
            adId,
            {
              objective: stringField(row.objective),
              optimizationGoal: stringField(row.optimization_goal),
              qualityRanking: stringField(row.quality_ranking),
              engagementRateRanking: stringField(row.engagement_rate_ranking),
              conversionRateRanking: stringField(row.conversion_rate_ranking),
            } satisfies InsightRankingDiagnostics,
          ] as const;
        })
        .filter((entry): entry is readonly [string, InsightRankingDiagnostics] => Boolean(entry)),
    );
  } catch {
    return new Map<string, InsightRankingDiagnostics>();
  }
}

async function fetchAccountInsightsTotal(
  metaAccountId: string,
  range: { since: string; until: string },
) {
  try {
    return await graphPages<JsonRecord>(`${metaAccountId}/insights`, {
      level: "account",
      time_increment: "all_days",
      ...buildInsightDateParams({ kind: "range", since: range.since, until: range.until }),
      fields: "spend,impressions,clicks,actions",
      limit: "25",
    }, { maxPages: 5 });
  } catch (error) {
    if (error instanceof MetaGraphError) {
      return graphPages<JsonRecord>(`${metaAccountId}/insights`, {
        level: "account",
        time_increment: "all_days",
        ...buildInsightDateParams({ kind: "range", since: range.since, until: range.until }),
        fields: "spend,impressions,clicks",
        limit: "25",
      }, { maxPages: 5 });
    }
    throw error;
  }
}

export async function fetchMetaInsightBreakdownDailyRows(input: {
  metaAccountId: string;
  since: string;
  until: string;
  breakdownSet: MetaInsightBreakdownSet;
}) {
  const breakdownFields = metaInsightBreakdownFieldsForSet(input.breakdownSet);
  const rows = await graphPages<JsonRecord>(`${input.metaAccountId}/insights`, {
    level: "ad",
    time_increment: "1",
    ...buildInsightDateParams({ kind: "range", since: input.since, until: input.until }),
    breakdowns: breakdownFields.join(","),
    fields: [...META_INSIGHT_BREAKDOWN_CORE_FIELDS, ...breakdownFields].join(","),
    limit: "100",
  }, { maxPages: getSyncMaxPages("META_BREAKDOWN_MAX_INSIGHT_PAGES", 30) });

  const now = new Date().toISOString();
  return rows.map((row) => mapMetaInsightBreakdownRow(input.metaAccountId, input.breakdownSet, row, now));
}

export function metaInsightBreakdownFieldsForSet(set: MetaInsightBreakdownSet) {
  return META_INSIGHT_BREAKDOWN_FIELDS_BY_SET[set];
}

export function mapMetaInsightBreakdownRow(
  metaAccountId: string,
  breakdownSet: MetaInsightBreakdownSet,
  row: JsonRecord,
  now = new Date().toISOString(),
) {
  const breakdownValues = metaInsightBreakdownValues(breakdownSet, row);

  return {
    meta_account_id: metaAccountId,
    level: "ad",
    breakdown_set: breakdownSet,
    breakdown_key: stableMetaInsightBreakdownKey({
      campaignId: stringField(row.campaign_id),
      adSetId: stringField(row.adset_id),
      adId: stringField(row.ad_id),
      breakdownValues,
    }),
    breakdown_values: breakdownValues,
    date_start: stringField(row.date_start),
    date_stop: stringField(row.date_stop),
    campaign_id: stringField(row.campaign_id),
    ad_set_id: stringField(row.adset_id),
    ad_id: stringField(row.ad_id),
    spend: numberField(row.spend) || 0,
    impressions: Math.round(numberField(row.impressions) || 0),
    reach: Math.round(numberField(row.reach) || 0),
    clicks: Math.round(numberField(row.clicks) || 0),
    inline_link_clicks: Math.round(numberField(row.inline_link_clicks) || 0),
    actions: arrayField(row.actions),
    raw_json: row,
    last_synced_at: now,
  };
}

function metaInsightBreakdownValues(
  breakdownSet: MetaInsightBreakdownSet,
  row: JsonRecord,
) {
  return metaInsightBreakdownFieldsForSet(breakdownSet).reduce<JsonRecord>((values, field) => {
    values[field] = stringField(row[field]);
    return values;
  }, {});
}

export function stableMetaInsightBreakdownKey(input: {
  campaignId: string | null;
  adSetId: string | null;
  adId: string | null;
  breakdownValues: JsonRecord;
}) {
  const entityKey = [
    input.campaignId || "unknown_campaign",
    input.adSetId || "unknown_ad_set",
    input.adId || "unknown_ad",
  ].join("|");
  const breakdownKey = Object.keys(input.breakdownValues)
    .sort()
    .map((key) => `${key}:${String(input.breakdownValues[key] || "")}`)
    .join("|");

  return `${entityKey}|${breakdownKey}`;
}

async function fetchCreativeAnalysisInsights(
  metaAccountId: string,
  range: { since: string; until: string; signal?: AbortSignal },
) {
  const coreFields = [
    "campaign_id",
    "campaign_name",
    "objective",
    "adset_id",
    "adset_name",
    "optimization_goal",
    "ad_id",
    "ad_name",
    "date_start",
    "date_stop",
    "spend",
    "impressions",
    "reach",
    "frequency",
    "cpm",
    "clicks",
    "inline_link_clicks",
    "ctr",
    "cpc",
    "actions",
  ];
  const optionalFields = [
    "inline_link_click_ctr",
    "cost_per_action_type",
    "video_play_actions",
    "video_p25_watched_actions",
    "video_p50_watched_actions",
    "video_p75_watched_actions",
    "video_p95_watched_actions",
    "video_p100_watched_actions",
    "video_thruplay_watched_actions",
    "quality_ranking",
    "engagement_rate_ranking",
    "conversion_rate_ranking",
  ];
  let fields = [...coreFields, ...optionalFields];
  const unavailableFields = new Set<string>();

  for (let attempt = 0; attempt < optionalFields.length + 3; attempt += 1) {
    try {
      const rows = await graphPages<JsonRecord>(`${metaAccountId}/insights`, {
        level: "ad",
        time_increment: "all_days",
        ...buildInsightDateParams({ kind: "range", since: range.since, until: range.until }),
        fields: fields.join(","),
        limit: "100",
      }, {
        maxPages: getSyncMaxPages("META_CREATIVE_ANALYSIS_MAX_INSIGHT_PAGES", 30),
        signal: range.signal,
      });

      return {
        rows,
        unavailableFields: Array.from(unavailableFields),
      };
    } catch (error) {
      if (!(error instanceof MetaGraphError)) throw error;

      const message = error.message.toLowerCase();
      const unavailableField = fields
        .filter((field) => !coreFields.includes(field))
        .find((field) => message.includes(field.toLowerCase()));

      if (unavailableField) {
        unavailableFields.add(unavailableField);
        fields = fields.filter((field) => field !== unavailableField);
        continue;
      }

      if (fields.length !== coreFields.length) {
        fields
          .filter((field) => !coreFields.includes(field))
          .forEach((field) => unavailableFields.add(field));
        fields = coreFields;
        continue;
      }

      throw error;
    }
  }

  return {
    rows: [],
    unavailableFields: Array.from(unavailableFields),
  };
}

async function fetchAdPreview(adId: string) {
  try {
    const previews = await graphPages<JsonRecord>(`${adId}/previews`, {
      ad_format: "DESKTOP_FEED_STANDARD",
    });
    const first = previews[0];
    return {
      previewHtml: stringField(first?.body),
      previewUrl: stringField(first?.iframe_url) || stringField(first?.url),
    };
  } catch {
    return { previewHtml: null, previewUrl: null };
  }
}

function chooseStoredPreview(
  creative: JsonRecord,
  adPreview: { previewHtml: string | null; previewUrl: string | null } | null,
) {
  const thumbnailUrl = stringField(creative.thumbnail_url);
  const imageUrl = stringField(creative.image_url);
  const videoThumbnailUrl = stringField(creative.video_thumbnail_url);

  if (thumbnailUrl) {
    return { previewSource: "thumbnail", previewUrl: thumbnailUrl, previewHtml: null };
  }
  if (imageUrl) {
    return { previewSource: "image", previewUrl: imageUrl, previewHtml: null };
  }
  if (adPreview?.previewHtml || adPreview?.previewUrl) {
    return {
      previewSource: "ad_preview",
      previewUrl: adPreview.previewUrl,
      previewHtml: adPreview.previewHtml,
    };
  }
  if (videoThumbnailUrl) {
    return { previewSource: "video_thumbnail", previewUrl: videoThumbnailUrl, previewHtml: null };
  }
  return { previewSource: "fallback", previewUrl: null, previewHtml: null };
}

/**
 * Meta error codes that mean "back off and retry", per Meta Graph API docs.
 *   4    — App-level rate limit reached
 *  17    — User request limit reached
 *  32    — Page-level throttling
 *  613   — Calls to this api have exceeded the rate limit (custom audiences)
 *  368   — Temporarily blocked for policies violations (sometimes transient)
 *  80004 — Business use case usage limit
 * Subcode 2446079 maps to throttling as well.
 *
 * On any of these, sleep with exponential backoff and retry. Other errors
 * (token expired, permission missing, malformed call) are not retried —
 * they fail fast so the operator sees them.
 */
const META_RETRYABLE_CODES = new Set([4, 17, 32, 613, 368, 80004]);
const META_USAGE_PERCENT_KEYS = new Set([
  "call_count",
  "total_cputime",
  "total_time",
  "acc_id_util_pct",
]);
const metaUsageStorage = new AsyncLocalStorage<MetaUsageCollector[]>();

function emptyEnrichmentMetrics(): SyncEnrichmentMetrics {
  return {
    insightSidecarRows: 0,
    adLabels: 0,
    adPixels: 0,
    customConversions: 0,
    skipped: [],
  };
}

function mergeEnrichmentMetrics(target: SyncEnrichmentMetrics, source: SyncEnrichmentMetrics) {
  target.insightSidecarRows += source.insightSidecarRows;
  target.adLabels += source.adLabels;
  target.adPixels += source.adPixels;
  target.customConversions += source.customConversions;
  target.skipped.push(...source.skipped);
}

function recordSkippedEnrichment(
  enrichment: SyncEnrichmentMetrics,
  account: string,
  group: string,
  reason: string,
) {
  enrichment.skipped.push({ account, group, reason });
}

export function createMetaUsageCollector(): MetaUsageCollector {
  const samples: MetaUsageSample[] = [];

  return {
    record(sample) {
      samples.push(sample);
    },
    summary() {
      return summarizeMetaUsage(samples);
    },
  };
}

export function withMetaUsageCollector<T>(
  collector: MetaUsageCollector,
  fn: () => Promise<T>,
): Promise<T> {
  const current = metaUsageStorage.getStore() || [];
  return metaUsageStorage.run([...current, collector], fn);
}

function recordMetaUsageFromResponse(path: string, response: Response) {
  const sample = parseMetaUsageHeaders(path, response.headers);
  if (!sample) return;

  for (const collector of metaUsageStorage.getStore() || []) {
    collector.record(sample);
  }
}

export function parseMetaUsageHeaders(path: string, headers: Pick<Headers, "get">) {
  const app = parseMetaUsageHeader(headers.get("x-app-usage"));
  const adAccount = parseMetaUsageHeader(headers.get("x-ad-account-usage"));
  const businessUseCase = parseMetaUsageHeader(headers.get("x-business-use-case-usage"));
  const maxPercent = Math.max(
    maxMetaUsagePercent(app),
    maxMetaUsagePercent(adAccount),
    maxMetaUsagePercent(businessUseCase),
  );

  if (!app && !adAccount && !businessUseCase) return null;

  return {
    path,
    maxPercent,
    observedAt: new Date().toISOString(),
    ...(app ? { app } : {}),
    ...(adAccount ? { adAccount } : {}),
    ...(businessUseCase ? { businessUseCase } : {}),
  } satisfies MetaUsageSample;
}

function parseMetaUsageHeader(value: string | null) {
  if (!value) return null;

  try {
    const parsed = JSON.parse(value);
    return isRecord(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export function maxMetaUsagePercent(value: unknown): number {
  if (Array.isArray(value)) {
    return value.reduce((max, item) => Math.max(max, maxMetaUsagePercent(item)), 0);
  }

  if (!isRecord(value)) return 0;

  return Object.entries(value).reduce((max, [key, nestedValue]) => {
    const direct =
      META_USAGE_PERCENT_KEYS.has(key) && typeof nestedValue === "number" && Number.isFinite(nestedValue)
        ? nestedValue
        : 0;
    return Math.max(max, direct, maxMetaUsagePercent(nestedValue));
  }, 0);
}

function summarizeMetaUsage(samples: MetaUsageSample[]): MetaUsageSummary {
  const byPath = samples.reduce<Record<string, { maxPercent: number; samples: number }>>(
    (summary, sample) => {
      const current = summary[sample.path] || { maxPercent: 0, samples: 0 };
      summary[sample.path] = {
        maxPercent: Math.max(current.maxPercent, sample.maxPercent),
        samples: current.samples + 1,
      };
      return summary;
    },
    {},
  );
  const maxPercent = samples.reduce((max, sample) => Math.max(max, sample.maxPercent), 0);
  const thresholdPercent = getMetaApiUsageWarnPercent();

  return {
    maxPercent,
    thresholdPercent,
    overThreshold: maxPercent >= thresholdPercent,
    byPath,
    samples: samples.slice(-100),
  };
}

export function getMetaApiUsageWarnPercent(env: Record<string, string | undefined> = process.env) {
  const value = Number(env.META_API_USAGE_WARN_PERCENT);
  return Number.isFinite(value) && value > 0 ? Math.floor(value) : 80;
}

function currentMetaUsageSummary() {
  const collectors = metaUsageStorage.getStore() || [];
  return collectors.length ? collectors[collectors.length - 1].summary() : summarizeMetaUsage([]);
}

export function isMetaUsageOverThreshold(summary: Pick<MetaUsageSummary, "maxPercent" | "thresholdPercent">) {
  return summary.maxPercent >= summary.thresholdPercent;
}

function shouldSkipOptionalMetaWork() {
  return isMetaUsageOverThreshold(currentMetaUsageSummary());
}

function isMetaRetryable(json: unknown): boolean {
  if (!isRecord(json)) return false;
  const error = isRecord(json.error) ? json.error : null;
  if (!error) return false;
  const code = typeof error.code === "number" ? error.code : Number(error.code);
  if (Number.isFinite(code) && META_RETRYABLE_CODES.has(code)) return true;
  if (typeof error.message === "string" && /request limit reached|rate.*limit|throttle/i.test(error.message)) {
    return true;
  }
  return false;
}

async function graphFetch<T>(
  path: string,
  params: Record<string, string | undefined>,
  options: { retries?: number; initialDelayMs?: number } = {},
) {
  const url = graphUrl(path, params);
  const maxRetries = options.retries ?? 3;
  const initialDelayMs = options.initialDelayMs ?? 2_000;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const response = await fetch(url, { cache: "no-store" });
    recordMetaUsageFromResponse(path, response);
    const json = (await response.json()) as MetaPaging<T> | T;

    const ok = response.ok && !(isRecord(json) && "error" in json);
    if (ok) {
      if (isRecord(json) && Array.isArray(json.data)) {
        return json.data as T;
      }
      return json as T;
    }

    if (attempt < maxRetries && isMetaRetryable(json)) {
      // Exponential backoff with jitter: 2s, 5s, 15s (+/- ~25%).
      const base = initialDelayMs * Math.pow(2.5, attempt);
      const jitter = base * (0.75 + Math.random() * 0.5);
      await new Promise((resolve) => setTimeout(resolve, Math.round(jitter)));
      continue;
    }

    const error = isRecord(json) ? json.error : undefined;
    throw new MetaGraphError(
      isRecord(error) && typeof error.message === "string"
        ? error.message
        : `Meta Graph API request failed for ${path}`,
      json,
    );
  }

  // Unreachable in practice; the loop returns or throws.
  throw new MetaGraphError(`Meta Graph API exhausted retries for ${path}`);
}

async function fetchGrantedMetaPermissions() {
  const permissions = await graphFetch<MetaPermission[]>("me/permissions", {});
  return new Set(
    permissions
      .filter((permission) => permission.status === "granted")
      .map((permission) => permission.permission),
  );
}

function buildPermissionStatus(
  granted: Set<string>,
  required: string[],
  options: { optional?: string[]; warnings?: string[] } = {},
): PermissionStatus {
  const missing = required.filter((permission) => !granted.has(permission));
  const optionalMissing = options.optional?.filter((permission) => !granted.has(permission));
  const warnings = [
    ...(options.warnings || []).filter(() => missing.length > 0),
    ...((optionalMissing || []).length
      ? [`Optional permission(s) missing: ${(optionalMissing || []).join(", ")}.`]
      : []),
  ];

  return {
    ok: missing.length === 0,
    required,
    missing,
    ...(optionalMissing ? { optionalMissing } : {}),
    ...(warnings.length ? { warnings } : {}),
  };
}

async function graphPages<T>(
  path: string,
  params: Record<string, string | undefined>,
  options: PageOptions = {},
) {
  const data: T[] = [];
  let nextUrl: string | undefined = graphUrl(path, params);
  let page = 0;
  const maxRetries = getSyncMaxPages("META_SYNC_PAGE_MAX_RETRIES", 6);

  while (nextUrl && (!options.maxPages || page < options.maxPages)) {
    // Retry the SAME cursor on retryable Meta errors (rate limits / throttling).
    // Unlike graphFetch, pagination previously had no backoff, so a single
    // throttle mid-walk aborted the whole catalog/insights refresh. Large
    // accounts (HP: ~6.6k active+paused ads = ~130 pages) routinely trip Meta's
    // user request limit before finishing; resuming after a backoff lets the
    // walk grind through. User-level limits can need minutes to clear, so the
    // backoff is capped high (see metaPageBackoffMs).
    let json: MetaPaging<T> | undefined;
    for (let attempt = 0; ; attempt++) {
      const response = await fetch(nextUrl, { cache: "no-store", signal: options.signal });
      recordMetaUsageFromResponse(path, response);
      const body = (await response.json()) as MetaPaging<T>;

      if (response.ok && !body.error) {
        json = body;
        break;
      }

      if (attempt < maxRetries && isMetaRetryable(body)) {
        await new Promise((resolve) =>
          setTimeout(resolve, metaPageBackoffMs(attempt), undefined),
        );
        continue;
      }

      throw new MetaGraphError(
        body.error?.message || `Meta Graph API request failed for ${path}`,
        body,
      );
    }

    // json is always assigned here: the loop above only exits via break (which
    // sets it) or throw.
    data.push(...(json!.data || []));
    nextUrl = json!.paging?.next;
    page += 1;
  }

  if (nextUrl && options.maxPages && page >= options.maxPages) {
    const limitHint = path.includes("/insights")
      ? "increase the page limit or reduce the requested date range"
      : "increase the page limit or run a smaller explicit catalog refresh";
    throw new MetaGraphError(
      `Meta Graph API pagination limit reached for ${path}; ${limitHint}.`,
    );
  }

  return data;
}

// Backoff between retries of a paginated Meta walk. Exponential with jitter,
// capped at 60s so a single stuck cursor can wait out a multi-minute user-level
// rate limit across the default 6 retries (~3s, 8s, 19s, 47s, 60s, 60s) instead
// of aborting the entire refresh.
function metaPageBackoffMs(attempt: number) {
  const base = Math.min(3_000 * Math.pow(2.5, attempt), 60_000);
  const jitter = base * (0.75 + Math.random() * 0.5);
  return Math.round(jitter);
}

function getSyncDatePreset() {
  return incrementalDatePreset();
}

function getSyncInsightDateRange(): InsightDateRange {
  const until = todayString();
  const sinceDate = new Date(`${until}T00:00:00Z`);
  sinceDate.setUTCDate(sinceDate.getUTCDate() - incrementalSyncDays() + 1);

  return {
    kind: "range",
    since: toGraphDateString(sinceDate),
    until,
  };
}

function toGraphDateString(value: Date) {
  return value.toISOString().slice(0, 10);
}

function getSyncMaxPages(name: string, fallback: number) {
  const value = Number(process.env[name]);
  return Number.isFinite(value) && value > 0 ? Math.floor(value) : fallback;
}

function catalogThumbnailCacheLimit() {
  const value = Number(process.env.META_CATALOG_THUMBNAIL_CACHE_LIMIT);
  return Number.isFinite(value) && value > 0 ? Math.floor(value) : 100;
}

function graphUrl(path: string, params: Record<string, string | undefined>) {
  const url = new URL(`https://graph.facebook.com/${getMetaApiVersion()}/${path.replace(/^\//, "")}`);
  url.searchParams.set("access_token", requireMetaAccessToken());
  for (const [key, value] of Object.entries(params)) {
    if (value) url.searchParams.set(key, value);
  }
  return url.toString();
}

export function getConfiguredAccounts(): SyncAccountConfig[] {
  const hp = process.env.META_HP_AD_ACCOUNT_ID;
  const vvs = process.env.META_VVS_AD_ACCOUNT_ID;
  const missing = [
    !hp ? "META_HP_AD_ACCOUNT_ID" : null,
    !process.env.META_ACCESS_TOKEN ? "META_ACCESS_TOKEN" : null,
  ].filter(Boolean) as string[];

  if (missing.length) {
    throw new ConfigurationError(
      `Missing Meta configuration: ${missing.join(", ")}`,
      missing,
    );
  }

  const accounts: SyncAccountConfig[] = [
    { brandCode: "HP", brandName: "Hung Phat", accountId: hp! },
  ];

  if (vvs?.trim()) {
    accounts.push({ brandCode: "VVS", brandName: "VVS", accountId: vvs });
  }

  return accounts;
}

function requireMetaAccessToken() {
  const accessToken = process.env.META_ACCESS_TOKEN;
  if (!accessToken) {
    throw new ConfigurationError("Missing META_ACCESS_TOKEN", ["META_ACCESS_TOKEN"]);
  }
  return accessToken;
}

async function ensureBrands(accounts: SyncAccountConfig[]) {
  const supabase = createAdsAnalystClient("worker");
  const { data, error } = await supabase
    .from("brands")
    .upsert(
      withAdsAnalystEnvironmentRows(
        accounts.map((account) => ({ code: account.brandCode, name: account.brandName })),
      ),
      { onConflict: adsAnalystOnConflict("code") },
    )
    .select("*");

  if (error) throw error;
  return (data || []) as JsonRecord[];
}

async function fetchCampaignUmbrellaOverrides(metaAccountId: string) {
  const supabase = createAdsAnalystClient("worker");
  const { data, error } = await supabase
    .from("campaign_umbrella_overrides")
    .select("entity_type, entity_id, campaign_umbrella, reason")
    .eq("meta_account_id", metaAccountId);

  if (error) throw error;

  return rows<JsonRecord>(data).reduce((overrides, row) => {
    const entityType = stringField(row.entity_type);
    const entityId = stringField(row.entity_id);
    const umbrella = stringField(row.campaign_umbrella);
    if (!entityType || !entityId || !isCampaignUmbrella(umbrella)) return overrides;
    overrides.set(`${entityType}:${entityId}`, {
      umbrella,
      reason: stringField(row.reason),
    });
    return overrides;
  }, new Map<string, CampaignUmbrellaOverride>());
}

function getUmbrellaOverride(
  overrides: Map<string, CampaignUmbrellaOverride>,
  entityType: "campaign" | "ad_set" | "ad",
  entityId: string | null,
) {
  if (!entityId) return null;
  return overrides.get(`${entityType}:${entityId}`) || null;
}

function umbrellaColumns(classification: CampaignUmbrellaClassification) {
  return {
    campaign_umbrella: classification.umbrella,
    campaign_umbrella_confidence: classification.confidence,
    campaign_umbrella_source: classification.source,
    campaign_umbrella_reason: classification.reason,
  };
}

function storedCampaignClassification(row: JsonRecord): CampaignUmbrellaClassification | null {
  const umbrella = stringField(row.campaign_umbrella);
  if (!isCampaignUmbrella(umbrella)) return null;

  return {
    umbrella,
    confidence: storedCampaignUmbrellaConfidence(row.campaign_umbrella_confidence),
    source: storedCampaignUmbrellaSource(row.campaign_umbrella_source),
    reason: stringField(row.campaign_umbrella_reason) || "Stored campaign umbrella classification.",
    region: "Unknown",
    matchedTerms: [],
  };
}

function storedCampaignUmbrellaConfidence(value: unknown): CampaignUmbrellaClassification["confidence"] {
  if (value === "high" || value === "medium" || value === "low" || value === "override") {
    return value;
  }
  return "low";
}

function storedCampaignUmbrellaSource(value: unknown): CampaignUmbrellaClassification["source"] {
  if (
    value === "campaign_name" ||
    value === "ad_set_name" ||
    value === "inherited" ||
    value === "override" ||
    value === "fallback"
  ) {
    return value;
  }
  return "fallback";
}

async function upsertSingle(table: string, row: JsonRecord, onConflict: string) {
  const rows = await upsertMany(table, [row], onConflict);
  return rows[0];
}

export async function upsertMany(
  table: string,
  rows: JsonRecord[],
  onConflict: string,
  client?: DynamicSupabaseClient,
) {
  if (!rows.length) return [];
  const supabase = client ?? (createAdsAnalystClient("worker") as unknown as DynamicSupabaseClient);
  const results: JsonRecord[] = [];

  for (const chunk of chunks(rows, 500)) {
    const { data, error } = await supabase
      .from(table)
      .upsert(withAdsAnalystEnvironmentRows(chunk), {
        onConflict: adsAnalystOnConflict(onConflict),
        // Columns missing from some rows in a bulk upsert must fall back to
        // their DB DEFAULT, not NULL. Several enrichment columns are NOT NULL
        // DEFAULT; without this the sync throws a not-null violation and aborts
        // before writing any meta_daily_insights rows.
        defaultToNull: false,
      })
      .select("*");

    if (error) throw error;
    results.push(...((data || []) as JsonRecord[]));
  }

  return results;
}

function mergeRowsByKey(
  storedRows: JsonRecord[],
  refreshedRows: JsonRecord[],
  key: string,
) {
  const rowsByKey = new Map<string, JsonRecord>();

  for (const row of storedRows) {
    const value = stringField(row[key]);
    if (value) rowsByKey.set(value, row);
  }

  for (const row of refreshedRows) {
    const value = stringField(row[key]);
    if (value) rowsByKey.set(value, row);
  }

  return Array.from(rowsByKey.values());
}

function normalizeAccountId(accountId: string) {
  return accountId.trim().replace(/^act_/, "");
}

function chunks<T>(items: T[], size: number) {
  const output: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    output.push(items.slice(index, index + size));
  }
  return output;
}

function uniqueBy<T>(items: T[], keyFn: (item: T) => string) {
  const seen = new Set<string>();
  return items.filter((item) => {
    const key = keyFn(item);
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function groupAdSetNamesByCampaignId(adSets: JsonRecord[]) {
  return adSets.reduce((groups, adSet) => {
    const campaignId = stringField(adSet.campaign_id);
    const name = stringField(adSet.name);
    if (!campaignId || !name) return groups;
    groups.set(campaignId, [...(groups.get(campaignId) || []), name]);
    return groups;
  }, new Map<string, string[]>());
}

function recordField(value: unknown): JsonRecord {
  return isRecord(value) ? value : {};
}

function hasMetaField(row: JsonRecord, field: string) {
  return Object.prototype.hasOwnProperty.call(row, field);
}

function arrayField(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function stringField(value: unknown): string | null {
  if (typeof value === "string" && value.length) return value;
  if (typeof value === "number") return String(value);
  return null;
}

function booleanField(value: unknown): boolean | null {
  if (typeof value === "boolean") return value;
  if (typeof value === "string") {
    if (value === "true") return true;
    if (value === "false") return false;
  }
  return null;
}

function numberField(value: unknown): number | null {
  if (typeof value === "number") return value;
  if (typeof value === "string" && value.length) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function numberString(value: unknown): string {
  return String(numberField(value) || 0);
}

function moneyCents(value: unknown): number | null {
  const amount = numberField(value);
  return amount === null ? null : amount / 100;
}

function rows<T>(data: unknown): T[] {
  return Array.isArray(data) ? (data as T[]) : [];
}

function actionMetricRows(value: unknown): MetaActionMetricRows {
  return Array.isArray(value) ? value.filter(isRecord) : [];
}

function extractActionCount(actions: unknown, actionTypes: string[]) {
  if (!Array.isArray(actions)) return 0;
  return actions.reduce((sum, action) => {
    if (!isRecord(action)) return sum;
    const type = String(action.action_type || "");
    if (!actionTypes.some((target) => type.includes(target))) return sum;
    return sum + (numberField(action.value) || 0);
  }, 0);
}

function extractExactActionCount(actions: unknown, actionTypes: string[]) {
  if (!Array.isArray(actions)) return 0;
  return actions.reduce((sum, action) => {
    if (!isRecord(action)) return sum;
    const type = String(action.action_type || "");
    if (!actionTypes.includes(type)) return sum;
    return sum + (numberField(action.value) || 0);
  }, 0);
}

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

// Re-export the shared helper. The sync pipeline used to produce
// "[object Object]" in stored sync_runs.errors entries for any non-Error
// thrown value (Supabase client errors are plain objects, not Error
// instances). Using the centralized helper keeps every error path human-
// readable.
import { safeErrorMessage as errorToMessage } from "./error-message.ts";

function isAbortError(error: unknown) {
  return error instanceof Error && error.name === "AbortError";
}
