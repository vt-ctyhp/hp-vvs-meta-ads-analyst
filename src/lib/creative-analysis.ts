import { differenceInCalendarDays, subDays } from "date-fns";
import { unstable_cache } from "next/cache.js";

import {
  buildCreativeDiagnostics,
  type CreativeDiagnostic,
  type CreativeScoreInput,
  type CreativeStatus,
} from "./creative-score";
import { classifyCampaignUmbrella } from "./campaign-umbrellas";
import { ConfigurationError, getMissingDashboardEnv } from "./env";
import {
  fetchMetaCreativeAnalysisInsightsForRange,
  type MetaCreativeAnalysisInsight,
} from "./meta";
import { resolveMetaKpi } from "./meta-kpi";
import { createAdsAnalystClient } from "./ads-analyst-db";
import { normalizeOptimizeDeliveryStatus } from "./optimize-filters";

type JsonRecord = Record<string, unknown>;

export type CreativeAnalysisDateRangeInput = {
  days?: number;
  startDate?: string | null;
  endDate?: string | null;
  includeLive?: boolean;
  brand?: string | null;
  group?: string | null;
  status?: string | null;
};

export type CreativeAnalysisPayload = {
  configured: boolean;
  missingEnv: string[];
  rows: CreativeAnalysisRow[];
  warnings: string[];
  sourceTransparency: {
    timeRange: { start: string | null; end: string | null; days: number };
    comparisonRange: { start: string | null; end: string | null; days: number };
    adAccountsAnalyzed: string[];
    dataSource: "meta_live" | "stored_fallback" | "none";
    unavailableFields: string[];
    recordCounts: Record<string, number>;
  };
  generatedAt: string;
};

export type CreativeAnalysisRow = CreativeDiagnostic & {
  brandCode: string;
  brandName: string | null;
  metaAccountId: string;
  adId: string;
  adName: string;
  adConfiguredStatus: string | null;
  adEffectiveStatus: string | null;
  adStatusSyncedAt: string | null;
  campaignId: string | null;
  campaignName: string;
  campaignUmbrella: string | null;
  adSetId: string | null;
  adSetName: string;
  objective: string | null;
  optimizationGoal: string | null;
  creativeId: string | null;
  creativeName: string | null;
  creativeTitle: string | null;
  creativeBody: string | null;
  objectStoryId: string | null;
  effectiveObjectStoryId: string | null;
  previewUrl: string | null;
  previewHtml: string | null;
  previewSource: string | null;
  thumbnailUrl: string | null;
  imageUrl: string | null;
  videoThumbnailUrl: string | null;
  spend: number;
  impressions: number;
  reach: number;
  frequency: number;
  cpm: number;
  clicks: number;
  inlineLinkClicks: number;
  ctr: number;
  inlineLinkClickCtr: number | null;
  cpc: number;
  qualityRanking: string | null;
  engagementRateRanking: string | null;
  conversionRateRanking: string | null;
  rawMetrics: {
    actions: unknown;
    costPerActionType: unknown;
    videoPlayActions: unknown;
    videoP25WatchedActions: unknown;
    videoP50WatchedActions: unknown;
    videoP75WatchedActions: unknown;
    videoP95WatchedActions: unknown;
    videoP100WatchedActions: unknown;
    videoThruplayWatchedActions: unknown;
  };
  dataSource: "meta_live" | "stored_history";
};

type RawCreativeInsight = CreativeScoreInput & {
  brandCode: string;
  metaAccountId: string;
  adId: string;
  adName: string;
  campaignId: string | null;
  campaignName: string;
  campaignUmbrella: string | null;
  adSetId: string | null;
  adSetName: string;
  objective: string | null;
  optimizationGoal: string | null;
  creativeId: string | null;
  dataSource: "meta_live" | "stored_history";
};

type StoredKpiAggregate = {
  label: string;
  actionType: string | null;
  count: number;
  spend: number;
  latestDate: string;
};

type BrandRow = { id: string; code: string; name: string | null };
type AccountRow = { brand_id: string | null; meta_account_id: string; name: string | null };
type AdRow = {
  brand_id: string | null;
  meta_account_id: string;
  ad_id: string;
  creative_id: string | null;
  status: string | null;
  effective_status: string | null;
  last_synced_at: string | null;
  preview_url: string | null;
  preview_html: string | null;
  preview_source: string | null;
};
type CreativeRow = {
  brand_id: string | null;
  meta_account_id: string;
  creative_id: string;
  name: string | null;
  title: string | null;
  body: string | null;
  object_story_id: string | null;
  effective_object_story_id: string | null;
  thumbnail_url: string | null;
  image_url: string | null;
  video_thumbnail_url: string | null;
  preview_url: string | null;
  preview_html: string | null;
  preview_source: string | null;
};
type AdDeliveryRow = {
  ad_id: string | null;
  status: string | null;
  effective_status: string | null;
};
type StoredInsightRow = {
  brand_id: string | null;
  meta_account_id: string;
  campaign_id: string | null;
  campaign_name: string | null;
  campaign_umbrella: string | null;
  ad_set_id: string | null;
  ad_set_name: string | null;
  ad_id: string | null;
  ad_name: string | null;
  creative_id: string | null;
  objective: string | null;
  optimization_goal: string | null;
  date_start: string;
  spend: number | string | null;
  impressions: number | string | null;
  reach: number | string | null;
  frequency: number | string | null;
  cpm: number | string | null;
  clicks: number | string | null;
  inline_link_clicks: number | string | null;
  ctr: number | string | null;
  cpc: number | string | null;
  cost_per_action_type: unknown;
  quality_ranking: string | null;
  engagement_rate_ranking: string | null;
  conversion_rate_ranking: string | null;
  kpi_label: string | null;
  kpi_action_type: string | null;
  kpi_value: number | string | null;
  cost_per_kpi: number | string | null;
  actions: unknown;
  video_metrics: unknown;
  raw_json?: unknown;
};
type StoredInsightFilters = {
  brandId: string | null;
  campaignUmbrella: string | null;
  adIds: string[] | null;
  empty: boolean;
};

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const LIVE_META_TIMEOUT_MS = 12000;
export const CREATIVE_ANALYSIS_CACHE_TAG = "creative-analysis";
export const CREATIVE_ANALYSIS_REVALIDATE_SECONDS = 300;

export function emptyCreativeAnalysisPayload(
  missingEnv = getMissingDashboardEnv(["META_ACCESS_TOKEN", "META_HP_AD_ACCOUNT_ID"]),
): CreativeAnalysisPayload {
  return {
    configured: missingEnv.length === 0,
    missingEnv,
    rows: [],
    warnings: [],
    sourceTransparency: {
      timeRange: { start: null, end: null, days: 30 },
      comparisonRange: { start: null, end: null, days: 30 },
      adAccountsAnalyzed: [],
      dataSource: "none",
      unavailableFields: [],
      recordCounts: {},
    },
    generatedAt: new Date().toISOString(),
  };
}

function emptyLiveCreativeInsights() {
  return {
    rows: [],
    warnings: [],
    unavailableFields: [],
    adAccounts: [],
  };
}

function fetchLiveCreativeInsights(range: { start: string; end: string }) {
  const liveController = new AbortController();
  const liveTimeout = setTimeout(() => liveController.abort(), LIVE_META_TIMEOUT_MS);

  return fetchMetaCreativeAnalysisInsightsForRange({
    since: range.start,
    until: range.end,
    signal: liveController.signal,
  })
    .catch((error) => ({
      rows: [],
      warnings: [`Live Meta Insights request failed: ${errorToMessage(error)}`],
      unavailableFields: [],
      adAccounts: [],
    }))
    .finally(() => clearTimeout(liveTimeout));
}

export async function fetchCreativeAnalysisData(
  dateRangeInput: CreativeAnalysisDateRangeInput = { days: 30 },
): Promise<CreativeAnalysisPayload> {
  const missingEnv = getMissingDashboardEnv(["META_ACCESS_TOKEN", "META_HP_AD_ACCOUNT_ID"]);
  if (missingEnv.length) return emptyCreativeAnalysisPayload(missingEnv);

  try {
    const supabase = createAdsAnalystClient("web");
    const dateRange = resolveDateRange(dateRangeInput);
    const comparisonRange = resolveComparisonRange(dateRange);
    const includeLive = dateRangeInput.includeLive === true;
    const deliveryStatus = normalizeOptimizeDeliveryStatus(dateRangeInput.status);
    const livePromise = includeLive
      ? fetchLiveCreativeInsights(dateRange)
      : Promise.resolve(emptyLiveCreativeInsights());
    const baseMetadataPromise = Promise.all([
      supabase.from("brands").select("id,code,name"),
      supabase.from("meta_ad_accounts").select("brand_id,meta_account_id,name"),
    ]);
    const deliveryAdIdsPromise = fetchAdIdsForDeliveryStatus(supabase, deliveryStatus);

    const [live, [brandsRes, accountsRes], deliveryAdIds] =
      await Promise.all([
        livePromise,
        baseMetadataPromise,
        deliveryAdIdsPromise,
      ]);

    if (brandsRes.error) throw brandsRes.error;
    if (accountsRes.error) throw accountsRes.error;

    const brands = rows<BrandRow>(brandsRes.data);
    const accounts = rows<AccountRow>(accountsRes.data);
    const brandById = new Map(brands.map((brand) => [brand.id, brand]));
    const accountByMetaId = new Map(accounts.map((account) => [account.meta_account_id, account]));
    const storedFilters = buildStoredInsightFilters(dateRangeInput, brands, deliveryAdIds);
    const [currentStoredRows, previousStoredRows] = await Promise.all([
      fetchStoredInsightRows(supabase, dateRange, storedFilters),
      fetchStoredInsightRows(supabase, comparisonRange, storedFilters),
    ]);

    const currentRows = live.rows.length
      ? live.rows.map(mapLiveInsight)
      : aggregateStoredInsightRows(currentStoredRows, brandById);
    const previousByKey = new Map(
      aggregateStoredInsightRows(previousStoredRows, brandById).map((row) => [row.id, row]),
    );
    const rowsWithHistory = currentRows.map((row) => ({
      ...row,
      previous: previousByKey.get(row.id) || null,
    }));
    const metadata = await fetchCreativeMetadata(supabase, rowsWithHistory);
    const diagnostics = buildCreativeDiagnostics(rowsWithHistory);
    const diagnosticById = new Map(diagnostics.map((diagnostic) => [diagnostic.id, diagnostic]));
    const outputRows = rowsWithHistory
      .map((row) =>
        enrichCreativeRow({
          row,
          diagnostic: diagnosticById.get(row.id),
          brandById,
          accountByMetaId,
          metadata,
        }),
      )
      .filter((row): row is CreativeAnalysisRow => Boolean(row))
      .sort((a, b) => b.spend - a.spend);

    const dataSource = live.rows.length ? "meta_live" : currentStoredRows.length ? "stored_fallback" : "none";
    const warnings = [
      ...live.warnings,
      ...(includeLive && !live.rows.length && currentStoredRows.length
        ? ["Showing stored Supabase insight history because live Meta Insights returned no ad rows."]
        : []),
    ];

    return {
      configured: true,
      missingEnv: [],
      rows: outputRows,
      warnings,
      sourceTransparency: {
        timeRange: {
          start: dateRange.start,
          end: dateRange.end,
          days: dateRange.days,
        },
        comparisonRange,
        adAccountsAnalyzed:
          live.adAccounts.length > 0
            ? live.adAccounts.map((account) => `${account.brandCode} ${account.metaAccountId}`)
            : accounts.map((account) => account.name || account.meta_account_id),
        dataSource,
        unavailableFields: live.unavailableFields,
        recordCounts: {
          live_insight_rows: live.rows.length,
          stored_current_rows: currentStoredRows.length,
          stored_previous_rows: previousStoredRows.length,
          creative_rows: outputRows.length,
          meta_ads_metadata: metadata.ads.size,
          meta_creatives_metadata: metadata.creatives.size,
        },
      },
      generatedAt: new Date().toISOString(),
    };
  } catch (error) {
    if (error instanceof ConfigurationError) {
      return emptyCreativeAnalysisPayload(error.missing);
    }
    throw error;
  }
}

export async function cachedFetchCreativeAnalysisData(
  dateRangeInput: CreativeAnalysisDateRangeInput = { days: 30 },
): Promise<CreativeAnalysisPayload> {
  return cachedFetchCreativeAnalysisDataImpl(normalizeCreativeAnalysisCacheInput(dateRangeInput));
}

const cachedFetchCreativeAnalysisDataImpl = unstable_cache(
  async (dateRangeInput: CreativeAnalysisDateRangeInput) =>
    fetchCreativeAnalysisData(dateRangeInput),
  ["creative-analysis-v1"],
  {
    revalidate: CREATIVE_ANALYSIS_REVALIDATE_SECONDS,
    tags: [CREATIVE_ANALYSIS_CACHE_TAG],
  },
);

function mapLiveInsight(row: MetaCreativeAnalysisInsight): RawCreativeInsight {
  const adId = stringField(row.ad_id) || "unknown";
  const metaAccountId = stringField(row.meta_account_id) || "unknown";
  const impressions = numberValue(row.impressions);
  const clicks = numberValue(row.clicks);
  const inlineLinkClicks = numberValue(row.inline_link_clicks);
  const spend = numberValue(row.spend);
  const campaignName = stringField(row.campaign_name) || "Unknown campaign";
  const adSetName = stringField(row.adset_name) || "Unknown ad set";
  const campaignUmbrella = classifyCampaignUmbrella({
    campaignName,
    adSetName,
  }).umbrella;

  return {
    id: insightKey(metaAccountId, adId),
    brandCode: stringField(row.brand_code) || "Unassigned",
    metaAccountId,
    adId,
    adName: stringField(row.ad_name) || "Unknown ad",
    campaignId: stringField(row.campaign_id),
    campaignName,
    campaignUmbrella,
    adSetId: stringField(row.adset_id),
    adSetName,
    objective: stringField(row.objective),
    optimizationGoal: stringField(row.optimization_goal),
    creativeId: null,
    dataSource: "meta_live",
    spend,
    impressions,
    reach: numberValue(row.reach),
    frequency: numberValue(row.frequency),
    cpm: numberValue(row.cpm) || (impressions > 0 ? (spend / impressions) * 1000 : 0),
    clicks,
    inlineLinkClicks,
    ctr: numberValue(row.ctr) || (impressions > 0 ? (clicks / impressions) * 100 : 0),
    inlineLinkClickCtr:
      numberOrNull(row.inline_link_click_ctr) ??
      (impressions > 0 ? (inlineLinkClicks / impressions) * 100 : null),
    cpc: numberValue(row.cpc) || (clicks > 0 ? spend / clicks : 0),
    actions: arrayValue(row.actions),
    costPerActionType: arrayValue(row.cost_per_action_type),
    videoPlayActions: firstNonEmptyActionArray(
      row.video_play_actions,
      exactActionRecords(row.actions, ["video_view"]),
    ),
    videoP25WatchedActions: arrayValue(row.video_p25_watched_actions),
    videoP50WatchedActions: arrayValue(row.video_p50_watched_actions),
    videoP75WatchedActions: arrayValue(row.video_p75_watched_actions),
    videoP95WatchedActions: arrayValue(row.video_p95_watched_actions),
    videoP100WatchedActions: arrayValue(row.video_p100_watched_actions),
    videoThruplayWatchedActions: arrayValue(row.video_thruplay_watched_actions),
    qualityRanking: stringField(row.quality_ranking),
    engagementRateRanking: stringField(row.engagement_rate_ranking),
    conversionRateRanking: stringField(row.conversion_rate_ranking),
  };
}

function aggregateStoredInsightRows(
  storedRows: StoredInsightRow[],
  brandById: Map<string, BrandRow>,
): RawCreativeInsight[] {
  const grouped = new Map<string, RawCreativeInsight>();
  const actionGroups = new Map<string, ActionAccumulator>();
  const storedKpiGroups = new Map<string, Map<string, StoredKpiAggregate>>();

  for (const storedRow of storedRows) {
    const adId = storedRow.ad_id || "unknown";
    const metaAccountId = storedRow.meta_account_id;
    const key = insightKey(metaAccountId, adId);
    const brandCode = (storedRow.brand_id && brandById.get(storedRow.brand_id)?.code) || "Unassigned";
    const campaignName = storedRow.campaign_name || "Unknown campaign";
    const adSetName = storedRow.ad_set_name || "Unknown ad set";
    const campaignUmbrella =
      storedRow.campaign_umbrella ||
      classifyCampaignUmbrella({
        campaignName,
        adSetName,
      }).umbrella;
    const current = grouped.get(key) || {
      id: key,
      brandCode,
      metaAccountId,
      adId,
      adName: storedRow.ad_name || "Unknown ad",
      campaignId: storedRow.campaign_id,
      campaignName,
      campaignUmbrella,
      adSetId: storedRow.ad_set_id,
      adSetName,
      objective: storedRow.objective,
      optimizationGoal: storedRow.optimization_goal,
      creativeId: storedRow.creative_id,
      dataSource: "stored_history" as const,
      spend: 0,
      impressions: 0,
      reach: 0,
      frequency: 0,
      cpm: 0,
      clicks: 0,
      inlineLinkClicks: 0,
      ctr: 0,
      inlineLinkClickCtr: null,
      cpc: 0,
      actions: [],
      costPerActionType: [],
      videoPlayActions: [],
      videoP25WatchedActions: [],
      videoP50WatchedActions: [],
      videoP75WatchedActions: [],
      videoP95WatchedActions: [],
      videoP100WatchedActions: [],
      videoThruplayWatchedActions: [],
      qualityRanking: null,
      engagementRateRanking: null,
      conversionRateRanking: null,
    };

    current.spend += numberValue(storedRow.spend);
    current.impressions += numberValue(storedRow.impressions);
    current.reach += numberValue(storedRow.reach);
    current.clicks += numberValue(storedRow.clicks);
    current.inlineLinkClicks += numberValue(storedRow.inline_link_clicks);
    current.creativeId ||= storedRow.creative_id;
    current.campaignUmbrella ||= campaignUmbrella;
    current.objective ||= storedRow.objective;
    current.optimizationGoal ||= storedRow.optimization_goal;

    const rawJson = recordValue(storedRow.raw_json);
    const videoMetrics = recordValue(storedRow.video_metrics);
    const actions = actionAccumulator(actionGroups, `${key}:actions`);
    const costs = actionAccumulator(actionGroups, `${key}:costs`);
    const play = actionAccumulator(actionGroups, `${key}:play`);
    const p25 = actionAccumulator(actionGroups, `${key}:p25`);
    const p50 = actionAccumulator(actionGroups, `${key}:p50`);
    const p75 = actionAccumulator(actionGroups, `${key}:p75`);
    const p95 = actionAccumulator(actionGroups, `${key}:p95`);
    const p100 = actionAccumulator(actionGroups, `${key}:p100`);
    const thruplay = actionAccumulator(actionGroups, `${key}:thruplay`);

    mergeActions(actions, storedRow.actions);
    mergeActions(costs, firstNonEmptyActionArray(storedRow.cost_per_action_type, rawJson.cost_per_action_type));
    mergeActions(
      play,
      firstNonEmptyActionArray(
        rawJson.video_play_actions,
        videoMetrics.video_play_actions,
        exactActionRecords(storedRow.actions, ["video_view"]),
      ),
    );
    mergeActions(p25, firstNonEmptyActionArray(rawJson.video_p25_watched_actions, videoMetrics.video_p25_watched_actions));
    mergeActions(p50, firstNonEmptyActionArray(rawJson.video_p50_watched_actions, videoMetrics.video_p50_watched_actions));
    mergeActions(p75, firstNonEmptyActionArray(rawJson.video_p75_watched_actions, videoMetrics.video_p75_watched_actions));
    mergeActions(p95, firstNonEmptyActionArray(rawJson.video_p95_watched_actions, videoMetrics.video_p95_watched_actions));
    mergeActions(p100, firstNonEmptyActionArray(rawJson.video_p100_watched_actions, videoMetrics.video_p100_watched_actions));
    mergeActions(
      thruplay,
      firstNonEmptyActionArray(
        rawJson.video_thruplay_watched_actions,
        videoMetrics.video_thruplay_watched_actions,
      ),
    );
    mergeStoredKpi(storedKpiGroups, key, storedRow);

    current.qualityRanking ||=
      stringField(storedRow.quality_ranking) || stringField(rawJson.quality_ranking);
    current.engagementRateRanking ||=
      stringField(storedRow.engagement_rate_ranking) || stringField(rawJson.engagement_rate_ranking);
    current.conversionRateRanking ||=
      stringField(storedRow.conversion_rate_ranking) || stringField(rawJson.conversion_rate_ranking);

    grouped.set(key, current);
  }

  return Array.from(grouped.values()).map((row) => {
    row.frequency = row.reach > 0 ? round(row.impressions / row.reach) : 0;
    row.cpm = row.impressions > 0 ? round((row.spend / row.impressions) * 1000) : 0;
    row.ctr = row.impressions > 0 ? round((row.clicks / row.impressions) * 100) : 0;
    row.inlineLinkClickCtr =
      row.impressions > 0 ? round((row.inlineLinkClicks / row.impressions) * 100) : null;
    row.cpc = row.clicks > 0 ? round(row.spend / row.clicks) : 0;
    row.spend = round(row.spend);
    row.actions = actionAccumulatorRows(actionGroups, `${row.id}:actions`);
    row.costPerActionType = actionAccumulatorRows(actionGroups, `${row.id}:costs`);
    row.videoPlayActions = actionAccumulatorRows(actionGroups, `${row.id}:play`);
    row.videoP25WatchedActions = actionAccumulatorRows(actionGroups, `${row.id}:p25`);
    row.videoP50WatchedActions = actionAccumulatorRows(actionGroups, `${row.id}:p50`);
    row.videoP75WatchedActions = actionAccumulatorRows(actionGroups, `${row.id}:p75`);
    row.videoP95WatchedActions = actionAccumulatorRows(actionGroups, `${row.id}:p95`);
    row.videoP100WatchedActions = actionAccumulatorRows(actionGroups, `${row.id}:p100`);
    row.videoThruplayWatchedActions = actionAccumulatorRows(actionGroups, `${row.id}:thruplay`);
    const storedKpi = chooseStoredKpi(row, storedKpiGroups.get(row.id));
    row.storedResultKpiLabel = storedKpi?.label || null;
    row.storedResultActionType = storedKpi?.actionType || null;
    row.storedResultCount = storedKpi ? round(storedKpi.count) : null;
    row.storedCostPerResult =
      storedKpi && storedKpi.count > 0 ? round(storedKpi.spend / storedKpi.count) : null;
    return row;
  });
}

async function fetchCreativeMetadata(
  supabase: ReturnType<typeof createAdsAnalystClient>,
  insightRows: RawCreativeInsight[],
) {
  const adIds = unique(insightRows.map((row) => row.adId));
  const adRows = await selectRowsByRemoteId<AdRow>(
    supabase,
    "meta_ads",
    "brand_id,meta_account_id,ad_id,creative_id,status,effective_status,last_synced_at,preview_url,preview_html,preview_source",
    "ad_id",
    adIds,
  );
  const creativeIds = unique([
    ...insightRows.map((row) => row.creativeId),
    ...adRows.map((row) => row.creative_id),
  ]);
  const creativeRows = await selectRowsByRemoteId<CreativeRow>(
    supabase,
    "meta_creatives",
    [
      "brand_id",
      "meta_account_id",
      "creative_id",
      "name",
      "title",
      "body",
      "object_story_id",
      "effective_object_story_id",
      "thumbnail_url",
      "image_url",
      "video_thumbnail_url",
      "preview_url",
      "preview_html",
      "preview_source",
    ].join(","),
    "creative_id",
    creativeIds,
  );

  return {
    ads: new Map(adRows.map((row) => [insightKey(row.meta_account_id, row.ad_id), row])),
    creatives: new Map(creativeRows.map((row) => [insightKey(row.meta_account_id, row.creative_id), row])),
  };
}

async function fetchAdIdsForDeliveryStatus(
  supabase: ReturnType<typeof createAdsAnalystClient>,
  status: ReturnType<typeof normalizeOptimizeDeliveryStatus>,
): Promise<string[] | null> {
  if (!status) return null;
  if (status === "live") return fetchLiveAdIds(supabase);

  const output: AdDeliveryRow[] = [];
  const pageSize = 1000;

  for (let from = 0; ; from += pageSize) {
    const { data, error } = await supabase
      .from("meta_ads")
      .select("ad_id,status,effective_status")
      .range(from, from + pageSize - 1);

    if (error) throw error;

    const page = rows<AdDeliveryRow>(data);
    output.push(...page);
    if (page.length < pageSize) break;
  }

  return unique(
    output
      .filter((row) => deliveryState(row) === status)
      .map((row) => row.ad_id),
  );
}

async function fetchLiveAdIds(supabase: ReturnType<typeof createAdsAnalystClient>) {
  const [effectiveActive, configuredActive] = await Promise.all([
    supabase
      .from("meta_ads")
      .select("ad_id,status,effective_status")
      .eq("effective_status", "ACTIVE"),
    supabase
      .from("meta_ads")
      .select("ad_id,status,effective_status")
      .is("effective_status", null)
      .eq("status", "ACTIVE"),
  ]);

  if (effectiveActive.error) throw effectiveActive.error;
  if (configuredActive.error) throw configuredActive.error;

  return unique(
    [
      ...rows<AdDeliveryRow>(effectiveActive.data),
      ...rows<AdDeliveryRow>(configuredActive.data),
    ].map((row) => row.ad_id),
  );
}

function buildStoredInsightFilters(
  input: CreativeAnalysisDateRangeInput,
  brands: BrandRow[],
  adIds: string[] | null,
): StoredInsightFilters {
  const brand = normalizeStoredFilter(input.brand);
  const group = normalizeStoredFilter(input.group);
  const brandId = brand
    ? brands.find((row) => row.code === brand || row.name === brand)?.id || null
    : null;

  return {
    brandId,
    campaignUmbrella: group,
    adIds,
    empty: Boolean((brand && !brandId) || (adIds && adIds.length === 0)),
  };
}

function enrichCreativeRow(input: {
  row: RawCreativeInsight;
  diagnostic: CreativeDiagnostic | undefined;
  brandById: Map<string, BrandRow>;
  accountByMetaId: Map<string, AccountRow>;
  metadata: {
    ads: Map<string, AdRow>;
    creatives: Map<string, CreativeRow>;
  };
}): CreativeAnalysisRow | null {
  if (!input.diagnostic) return null;

  const ad = input.metadata.ads.get(input.row.id);
  const creativeId = input.row.creativeId || ad?.creative_id || null;
  const creative = creativeId
    ? input.metadata.creatives.get(insightKey(input.row.metaAccountId, creativeId))
    : undefined;
  const account = input.accountByMetaId.get(input.row.metaAccountId);
  const brand = (creative?.brand_id && input.brandById.get(creative.brand_id)) ||
    (ad?.brand_id && input.brandById.get(ad.brand_id)) ||
    (account?.brand_id && input.brandById.get(account.brand_id)) ||
    null;
  const brandCode = brand?.code || input.row.brandCode;

  return {
    ...input.diagnostic,
    brandCode,
    brandName: brand?.name || null,
    metaAccountId: input.row.metaAccountId,
    adId: input.row.adId,
    adName: input.row.adName,
    adConfiguredStatus: ad?.status || null,
    adEffectiveStatus: ad?.effective_status || null,
    adStatusSyncedAt: ad?.last_synced_at || null,
    campaignId: input.row.campaignId,
    campaignName: input.row.campaignName,
    campaignUmbrella: input.row.campaignUmbrella,
    adSetId: input.row.adSetId,
    adSetName: input.row.adSetName,
    objective: input.row.objective,
    optimizationGoal: input.row.optimizationGoal,
    creativeId,
    creativeName: creative?.name || null,
    creativeTitle: creative?.title || null,
    creativeBody: creative?.body || null,
    objectStoryId: creative?.object_story_id || null,
    effectiveObjectStoryId: creative?.effective_object_story_id || null,
    previewUrl: creative?.preview_url || ad?.preview_url || creative?.thumbnail_url || creative?.image_url || null,
    previewHtml: creative?.preview_html || ad?.preview_html || null,
    previewSource: creative?.preview_source || ad?.preview_source || null,
    thumbnailUrl: creative?.thumbnail_url || null,
    imageUrl: creative?.image_url || null,
    videoThumbnailUrl: creative?.video_thumbnail_url || null,
    spend: round(input.row.spend),
    impressions: Math.round(input.row.impressions),
    reach: Math.round(input.row.reach),
    frequency: round(input.row.frequency),
    cpm: round(input.row.cpm),
    clicks: Math.round(input.row.clicks),
    inlineLinkClicks: Math.round(input.row.inlineLinkClicks),
    ctr: round(input.row.ctr),
    inlineLinkClickCtr:
      input.row.inlineLinkClickCtr === null ? null : round(input.row.inlineLinkClickCtr),
    cpc: round(input.row.cpc),
    qualityRanking: stringField(input.row.qualityRanking),
    engagementRateRanking: stringField(input.row.engagementRateRanking),
    conversionRateRanking: stringField(input.row.conversionRateRanking),
    rawMetrics: {
      actions: input.row.actions,
      costPerActionType: input.row.costPerActionType,
      videoPlayActions: input.row.videoPlayActions,
      videoP25WatchedActions: input.row.videoP25WatchedActions,
      videoP50WatchedActions: input.row.videoP50WatchedActions,
      videoP75WatchedActions: input.row.videoP75WatchedActions,
      videoP95WatchedActions: input.row.videoP95WatchedActions,
      videoP100WatchedActions: input.row.videoP100WatchedActions,
      videoThruplayWatchedActions: input.row.videoThruplayWatchedActions,
    },
    dataSource: input.row.dataSource,
  };
}

async function fetchStoredInsightRows(
  supabase: ReturnType<typeof createAdsAnalystClient>,
  range: { start: string; end: string },
  filters: StoredInsightFilters = {
    brandId: null,
    campaignUmbrella: null,
    adIds: null,
    empty: false,
  },
) {
  if (filters.empty) return [];

  const output: StoredInsightRow[] = [];
  const pageSize = 1000;
  const adIdChunks = filters.adIds ? chunks(filters.adIds, 200) : [null];

  for (const adIdChunk of adIdChunks) {
    for (let from = 0; ; from += pageSize) {
      let query = supabase
        .from("meta_daily_insights")
        .select(
          [
            "brand_id",
            "meta_account_id",
            "campaign_id",
            "campaign_name",
            "campaign_umbrella",
            "ad_set_id",
            "ad_set_name",
            "ad_id",
            "ad_name",
            "creative_id",
            "objective",
            "optimization_goal",
            "date_start",
            "spend",
            "impressions",
            "reach",
            "frequency",
            "cpm",
            "clicks",
            "inline_link_clicks",
            "ctr",
            "cpc",
            "cost_per_action_type",
            "quality_ranking",
            "engagement_rate_ranking",
            "conversion_rate_ranking",
            "kpi_label",
            "kpi_action_type",
            "kpi_value",
            "cost_per_kpi",
            "actions",
            "video_metrics",
          ].join(","),
        )
        .gte("date_start", range.start)
        .lte("date_start", range.end);

      if (filters.brandId) {
        query = query.eq("brand_id", filters.brandId);
      }
      if (filters.campaignUmbrella) {
        query = query.eq("campaign_umbrella", filters.campaignUmbrella);
      }
      if (adIdChunk) {
        query = query.in("ad_id", adIdChunk);
      }

      const { data, error } = await query.range(from, from + pageSize - 1);

      if (error) throw error;
      const page = rows<StoredInsightRow>(data);
      output.push(...page);
      if (page.length < pageSize) break;
    }
  }

  return output;
}

async function selectRowsByRemoteId<T>(
  supabase: ReturnType<typeof createAdsAnalystClient>,
  table: string,
  columns: string,
  idColumn: string,
  ids: string[],
): Promise<T[]> {
  if (!ids.length) return [];

  const client = supabase as unknown as {
    from: (tableName: string) => {
      select: (columnList: string) => {
        in: (
          columnName: string,
          values: string[],
        ) => Promise<{ data: T[] | null; error: Error | null }>;
      };
    };
  };
  const output: T[] = [];

  for (const chunk of chunks(ids, 500)) {
    const { data, error } = await client.from(table).select(columns).in(idColumn, chunk);
    if (error) throw error;
    output.push(...rows<T>(data));
  }

  return output;
}

function resolveDateRange(input: CreativeAnalysisDateRangeInput) {
  const fallbackDays = normalizeDays(input.days);
  const fallbackEnd = toDateString(new Date());
  const fallbackStart = toDateString(subDays(parseDate(fallbackEnd), fallbackDays - 1));
  let start = normalizeDateString(input.startDate) || fallbackStart;
  let end = normalizeDateString(input.endDate) || fallbackEnd;

  if (start > end) [start, end] = [end, start];

  return {
    start,
    end,
    days: differenceInCalendarDays(parseDate(end), parseDate(start)) + 1,
  };
}

function resolveComparisonRange(range: { start: string; days: number }) {
  const endDate = subDays(parseDate(range.start), 1);
  const startDate = subDays(endDate, range.days - 1);

  return {
    start: toDateString(startDate),
    end: toDateString(endDate),
    days: range.days,
  };
}

function normalizeDays(days: number | null | undefined) {
  return Number.isFinite(days) && Number(days) > 0 ? Math.floor(Number(days)) : 30;
}

function normalizeCreativeAnalysisCacheInput(
  input: CreativeAnalysisDateRangeInput,
): CreativeAnalysisDateRangeInput {
  return {
    days: normalizeDays(input.days),
    startDate: normalizeDateString(input.startDate),
    endDate: normalizeDateString(input.endDate),
    includeLive: input.includeLive === true,
    brand: normalizeStoredFilter(input.brand),
    group: normalizeStoredFilter(input.group),
    status: normalizeOptimizeDeliveryStatus(input.status),
  };
}

function normalizeDateString(value: string | null | undefined) {
  return value && DATE_PATTERN.test(value) ? value : null;
}

function normalizeStoredFilter(value: string | null | undefined) {
  return value && value !== "all" ? value : null;
}

function deliveryState(row: AdDeliveryRow) {
  const state = (row.effective_status || row.status || "").toLowerCase();
  if (state.includes("active")) return "live";
  if (state.includes("paused")) return "paused";
  return "off";
}

function parseDate(value: string) {
  return new Date(`${value}T00:00:00Z`);
}

function toDateString(value: Date) {
  return value.toISOString().slice(0, 10);
}

function insightKey(metaAccountId: string, adId: string) {
  return `${metaAccountId}:${adId}`;
}

type ActionAccumulator = Map<string, number>;

function actionAccumulator(groups: Map<string, ActionAccumulator>, key: string) {
  const existing = groups.get(key);
  if (existing) return existing;
  const next: ActionAccumulator = new Map();
  groups.set(key, next);
  return next;
}

function mergeActions(accumulator: ActionAccumulator, value: unknown) {
  if (!Array.isArray(value)) return;

  for (const item of value) {
    if (!isRecord(item)) continue;
    const actionType = stringField(item.action_type);
    if (!actionType) continue;
    accumulator.set(actionType, (accumulator.get(actionType) || 0) + numberValue(item.value));
  }
}

function actionAccumulatorRows(groups: Map<string, ActionAccumulator>, key: string) {
  return Array.from((groups.get(key) || new Map()).entries()).map(([action_type, value]) => ({
    action_type,
    value,
  }));
}

function firstNonEmptyActionArray(...values: unknown[]) {
  for (const value of values) {
    if (Array.isArray(value) && value.length) return value;
  }
  return [];
}

function exactActionRecords(value: unknown, actionTypes: string[]) {
  if (!Array.isArray(value)) return [];
  return value.filter(
    (item) =>
      isRecord(item) &&
      typeof item.action_type === "string" &&
      actionTypes.includes(item.action_type),
  );
}

function mergeStoredKpi(
  groups: Map<string, Map<string, StoredKpiAggregate>>,
  key: string,
  storedRow: StoredInsightRow,
) {
  const label = stringField(storedRow.kpi_label);
  if (!label) return;

  const actionType = stringField(storedRow.kpi_action_type);
  const kpiKey = `${label}:${actionType || ""}`;
  const group = groups.get(key) || new Map<string, StoredKpiAggregate>();
  const current = group.get(kpiKey) || {
    label,
    actionType,
    count: 0,
    spend: 0,
    latestDate: storedRow.date_start,
  };

  current.count += numberValue(storedRow.kpi_value);
  current.spend += numberValue(storedRow.spend);
  if (storedRow.date_start > current.latestDate) current.latestDate = storedRow.date_start;
  group.set(kpiKey, current);
  groups.set(key, group);
}

function chooseStoredKpi(
  row: RawCreativeInsight,
  groups: Map<string, StoredKpiAggregate> | undefined,
) {
  if (!groups?.size) return null;

  const preferredLabel = resolveMetaKpi({
    spend: row.spend,
    actions: row.actions,
    costPerActionType: row.costPerActionType,
    campaignName: row.campaignName,
    adSetName: row.adSetName,
    campaignUmbrella: row.campaignUmbrella,
    objective: row.objective,
    optimizationGoal: row.optimizationGoal,
  }).resultKpiLabel;
  const candidates = Array.from(groups.values());
  const matching = candidates.filter((candidate) => candidate.label === preferredLabel);

  return (matching.length ? matching : candidates).sort(compareStoredKpi)[0] || null;
}

function compareStoredKpi(a: StoredKpiAggregate, b: StoredKpiAggregate) {
  return b.count - a.count || b.spend - a.spend || b.latestDate.localeCompare(a.latestDate);
}

function arrayValue(value: unknown) {
  return Array.isArray(value) ? value : [];
}

function recordValue(value: unknown): JsonRecord {
  return isRecord(value) ? value : {};
}

function rows<T>(data: unknown): T[] {
  return Array.isArray(data) ? (data as T[]) : [];
}

function chunks<T>(items: T[], size: number) {
  const output: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    output.push(items.slice(index, index + size));
  }
  return output;
}

function unique(values: Array<string | null | undefined>) {
  return Array.from(new Set(values.filter((value): value is string => Boolean(value && value !== "unknown"))));
}

function stringField(value: unknown): string | null {
  if (typeof value === "string" && value.length) return value;
  if (typeof value === "number") return String(value);
  return null;
}

function numberOrNull(value: unknown): number | null {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value === "string" && value.length) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function numberValue(value: unknown): number {
  return numberOrNull(value) || 0;
}

function round(value: number, precision = 2) {
  const factor = 10 ** precision;
  return Math.round(value * factor) / factor;
}

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function errorToMessage(error: unknown) {
  if (error instanceof Error) return error.message;
  return String(error);
}

export const CREATIVE_STATUS_OPTIONS: CreativeStatus[] = [
  "Scale Candidate",
  "Needs Hook Improvement",
  "Needs Retention Improvement",
  "Clickbait Risk",
  "Fatigue Watch",
  "Brand Fit Review",
];
