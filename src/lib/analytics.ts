import { differenceInCalendarDays, subDays } from "date-fns";

import {
  CAMPAIGN_UMBRELLAS,
  classifyCampaignUmbrella,
  isCampaignUmbrella,
  type CampaignUmbrella,
  type CampaignUmbrellaClassification,
} from "./campaign-umbrellas";
import { ConfigurationError, getMissingDashboardEnv } from "./env";
import {
  cachedAggregateMetaInsights as aggregateMetaInsights,
  type MetaInsightAggregateRow,
} from "./meta-insight-aggregates";
import { buildSharedInsightFilters } from "./optimize-filters";
import { createAdsAnalystClient } from "./ads-analyst-db";

export type MetricSummary = {
  spend: number;
  impressions: number;
  reach: number;
  clicks: number;
  leads: number;
  bookings: number;
  websiteBookings: number;
  messagingContacts: number;
  newMessagingContacts: number;
  primaryResults: number;
  primaryResultLabel: string;
  secondaryResults: number | null;
  secondaryResultLabel: string | null;
  conversions: number;
  ctr: number;
  cpm: number;
  cpc: number;
  cpl: number | null;
  costPerPrimaryResult: number | null;
  frequency: number;
};

export type PerformanceRow = MetricSummary & {
  id: string;
  name: string;
  brandCode: string;
  status?: string | null;
  effectiveStatus?: string | null;
  objective?: string | null;
  campaignUmbrella?: CampaignUmbrella;
  campaignUmbrellaConfidence?: string | null;
  campaignUmbrellaReason?: string | null;
  previewSource?: string | null;
  previewUrl?: string | null;
  previewHtml?: string | null;
  thumbnailUrl?: string | null;
  imageUrl?: string | null;
  videoThumbnailUrl?: string | null;
  title?: string | null;
  body?: string | null;
  riskLevel?: "low" | "medium" | "high";
  riskReason?: string;
  adId?: string | null;
  adName?: string | null;
  adSetId?: string | null;
  adSetName?: string | null;
  campaignId?: string | null;
  campaignName?: string | null;
};

export type DailyTrendRow = {
  date: string;
  brandCode: string;
  campaignUmbrella: CampaignUmbrella;
  spend: number;
  impressions: number;
  clicks: number;
  leads: number;
  primaryResults: number;
  websiteBookings: number;
  messagingContacts: number;
  newMessagingContacts: number;
  ctr: number;
  cpc: number;
};

export type SourceTransparency = {
  timeRange: { start: string | null; end: string | null; days: number };
  adAccountsAnalyzed: string[];
  dataCoverage: {
    expectedDays: number;
    storedDays: number;
    missingDays: number;
    missingDateSample: string[];
    isComplete: boolean;
  };
  recordCounts: Record<string, number>;
};

export type ActionBucket = "scale" | "fix" | "watch";

export type ActionItem = {
  id: string;
  bucket: ActionBucket;
  entityType: "creative" | "campaign";
  entityId: string;
  entityName: string;
  brandCode?: string;
  campaignUmbrella?: CampaignUmbrella;
  headline: string;
  supporting: string;
};

export type ComparisonPayload = {
  timeRange: { start: string; end: string; days: number };
  overview: MetricSummary;
  byBrand: PerformanceRow[];
  byUmbrella: PerformanceRow[];
  /** Per-campaign metrics for the prior period; matches campaigns[] by id. */
  campaigns: PerformanceRow[];
  dailyTrend: DailyTrendRow[];
};

export type DashboardPayload = {
  configured: boolean;
  missingEnv: string[];
  sourceTransparency: SourceTransparency;
  overview: MetricSummary;
  byBrand: PerformanceRow[];
  byUmbrella: PerformanceRow[];
  campaignUmbrellas: CampaignUmbrella[];
  campaigns: PerformanceRow[];
  adSets: PerformanceRow[];
  creatives: PerformanceRow[];
  dailyTrend: DailyTrendRow[];
  fatigueRisks: PerformanceRow[];
  opportunities: string[];
  underperformers: PerformanceRow[];
  recommendationQueue: string[];
  actionQueue: ActionItem[];
  latestReports: StoredReport[];
  latestSyncRuns: SyncRun[];
  comparison: ComparisonPayload;
  generatedAt: string;
};

export type DashboardDateRangeInput = {
  days?: number;
  startDate?: string | null;
  endDate?: string | null;
  brand?: string | null;
  group?: string | null;
  status?: string | null;
};

export type StoredReport = {
  id: string;
  title: string;
  reportType: string;
  generatedAt: string;
  content: unknown;
  sourceTransparency: SourceTransparency;
};

export type SyncRun = {
  id: string;
  trigger: string;
  status: string;
  startedAt: string;
  completedAt: string | null;
  metrics: unknown;
  errors: unknown;
};

type BrandRow = { id: string; code: string; name: string };
type AccountRow = { id: string; brand_id: string | null; meta_account_id: string; name: string | null };
type CampaignRow = {
  id: string;
  brand_id: string | null;
  campaign_id: string;
  name: string | null;
  status: string | null;
  effective_status: string | null;
  objective: string | null;
  campaign_umbrella: string | null;
  campaign_umbrella_confidence: string | null;
  campaign_umbrella_reason: string | null;
};
type AdSetRow = {
  id: string;
  brand_id: string | null;
  ad_set_id: string;
  campaign_id: string | null;
  name: string | null;
  status: string | null;
  effective_status: string | null;
  campaign_umbrella: string | null;
  campaign_umbrella_confidence: string | null;
  campaign_umbrella_reason: string | null;
};
type AdRow = {
  id: string;
  brand_id: string | null;
  ad_id: string;
  ad_set_id: string | null;
  campaign_id: string | null;
  creative_id: string | null;
  name: string | null;
  status: string | null;
  effective_status: string | null;
  campaign_umbrella: string | null;
  campaign_umbrella_confidence: string | null;
  campaign_umbrella_reason: string | null;
};
type CreativeRow = {
  id: string;
  brand_id: string | null;
  creative_id: string;
  name: string | null;
  title: string | null;
  body: string | null;
  thumbnail_url: string | null;
  image_url: string | null;
  video_thumbnail_url: string | null;
  preview_url: string | null;
  preview_html: string | null;
  preview_source: string | null;
};
type InsightRow = {
  brand_id: string | null;
  meta_account_id: string;
  campaign_id: string | null;
  campaign_name: string | null;
  ad_set_id: string | null;
  ad_set_name: string | null;
  ad_id: string | null;
  ad_name: string | null;
  creative_id: string | null;
  campaign_umbrella: string | null;
  campaign_umbrella_confidence: string | null;
  campaign_umbrella_reason: string | null;
  date_start: string;
  spend: string | number | null;
  impressions: string | number | null;
  reach: string | number | null;
  clicks: string | number | null;
  leads: string | number | null;
  bookings: string | number | null;
  conversions: string | number | null;
  actions: unknown;
};

const BRAND_COLUMNS = "id,code,name";
const ACCOUNT_COLUMNS = "id,brand_id,meta_account_id,name";
const CAMPAIGN_COLUMNS =
  "id,brand_id,campaign_id,name,status,effective_status,objective,campaign_umbrella,campaign_umbrella_confidence,campaign_umbrella_reason";
const AD_SET_COLUMNS =
  "id,brand_id,ad_set_id,campaign_id,name,status,effective_status,campaign_umbrella,campaign_umbrella_confidence,campaign_umbrella_reason";
const AD_COLUMNS =
  "id,brand_id,ad_id,ad_set_id,campaign_id,creative_id,name,status,effective_status,campaign_umbrella,campaign_umbrella_confidence,campaign_umbrella_reason";
const CREATIVE_COLUMNS =
  "id,brand_id,creative_id,name,title,body,thumbnail_url,image_url,video_thumbnail_url,preview_url,preview_html,preview_source";

const EMPTY_METRICS: MetricSummary = {
  spend: 0,
  impressions: 0,
  reach: 0,
  clicks: 0,
  leads: 0,
  bookings: 0,
  websiteBookings: 0,
  messagingContacts: 0,
  newMessagingContacts: 0,
  primaryResults: 0,
  primaryResultLabel: "Primary Results",
  secondaryResults: null,
  secondaryResultLabel: null,
  conversions: 0,
  ctr: 0,
  cpm: 0,
  cpc: 0,
  cpl: null,
  costPerPrimaryResult: null,
  frequency: 0,
};

const WEBSITE_BOOKING_ACTION_TYPES = ["offsite_conversion.fb_pixel_custom"];
const MESSAGING_CONTACT_ACTION_TYPES = ["onsite_conversion.total_messaging_connection"];
const NEW_MESSAGING_CONTACT_ACTION_TYPES = ["onsite_conversion.messaging_first_reply"];
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export function emptyDashboardPayload(missingEnv = getMissingDashboardEnv()): DashboardPayload {
  return {
    configured: missingEnv.length === 0,
    missingEnv,
    sourceTransparency: {
      timeRange: { start: null, end: null, days: 30 },
      adAccountsAnalyzed: [],
      dataCoverage: {
        expectedDays: 0,
        storedDays: 0,
        missingDays: 0,
        missingDateSample: [],
        isComplete: true,
      },
      recordCounts: {},
    },
    overview: EMPTY_METRICS,
    byBrand: [],
    byUmbrella: [],
    campaignUmbrellas: [...CAMPAIGN_UMBRELLAS],
    campaigns: [],
    adSets: [],
    creatives: [],
    dailyTrend: [],
    fatigueRisks: [],
    opportunities: [],
    underperformers: [],
    recommendationQueue: [],
    actionQueue: [],
    latestReports: [],
    latestSyncRuns: [],
    comparison: {
      timeRange: { start: "", end: "", days: 30 },
      overview: EMPTY_METRICS,
      byBrand: [],
      byUmbrella: [],
      campaigns: [],
      dailyTrend: [],
    },
    generatedAt: new Date().toISOString(),
  };
}

export async function fetchDashboardData(
  dateRangeInput: number | DashboardDateRangeInput = 30,
): Promise<DashboardPayload> {
  const missingEnv = getMissingDashboardEnv();

  if (missingEnv.length) {
    return emptyDashboardPayload(missingEnv);
  }

  try {
    const supabase = createAdsAnalystClient("web");
    const dateRange = resolveDashboardDateRange(dateRangeInput);
    const priorRange = resolvePriorDateRange(dateRange);
    const filters = buildSharedInsightFilters(
      typeof dateRangeInput === "number" ? {} : dateRangeInput,
    );

    const coreMetadataPromise = Promise.all([
      supabase.from("brands").select(BRAND_COLUMNS),
      supabase.from("meta_ad_accounts").select(ACCOUNT_COLUMNS),
      supabase
        .from("ai_reports")
        .select("id,title,report_type,generated_at,source_transparency")
        .order("generated_at", { ascending: false })
        .limit(5),
      supabase
        .from("sync_runs")
        .select("*")
        .order("started_at", { ascending: false })
        .limit(8),
    ]);
    const metadataCountPromise = Promise.all([
      supabase.from("meta_campaigns").select("id", { count: "exact", head: true }),
      supabase.from("meta_ad_sets").select("id", { count: "exact", head: true }),
      supabase.from("meta_ads").select("id", { count: "exact", head: true }),
      supabase.from("meta_creatives").select("id", { count: "exact", head: true }),
    ]);
    const aggregateTasks = [
      () =>
        aggregateMetaInsights({
          start: dateRange.start,
          end: dateRange.end,
          dimensions: [],
          filters,
          sortField: "spend",
          sortDirection: "desc",
          limit: 1,
        }),
      () =>
        aggregateMetaInsights({
          start: dateRange.start,
          end: dateRange.end,
          dimensions: ["brand"],
          filters,
          sortField: "spend",
          sortDirection: "desc",
          limit: 100,
        }),
      () =>
        aggregateMetaInsights({
          start: dateRange.start,
          end: dateRange.end,
          dimensions: ["campaign_umbrella"],
          filters,
          sortField: "spend",
          sortDirection: "desc",
          limit: 100,
        }),
      () =>
        aggregateMetaInsights({
          start: dateRange.start,
          end: dateRange.end,
          dimensions: ["campaign"],
          filters,
          sortField: "spend",
          sortDirection: "desc",
          limit: 5000,
        }),
      () =>
        aggregateMetaInsights({
          start: dateRange.start,
          end: dateRange.end,
          dimensions: ["ad_set"],
          filters,
          sortField: "spend",
          sortDirection: "desc",
          limit: 5000,
        }),
      () =>
        aggregateMetaInsights({
          start: dateRange.start,
          end: dateRange.end,
          dimensions: ["creative"],
          filters,
          sortField: "spend",
          sortDirection: "desc",
          limit: 5000,
        }),
      () =>
        aggregateMetaInsights({
          start: dateRange.start,
          end: dateRange.end,
          dimensions: ["date", "brand", "campaign_umbrella"],
          filters,
          sortField: "date",
          sortDirection: "asc",
          limit: 10000,
        }),
      () =>
        aggregateMetaInsights({
          start: dateRange.start,
          end: dateRange.end,
          dimensions: ["date"],
          filters,
          sortField: "date",
          sortDirection: "asc",
          limit: dateRange.days + 5,
        }),
    ];
    const aggregatePromise = Promise.all(aggregateTasks.map((task) => task()));

    const priorAggregateTasks = [
      () =>
        aggregateMetaInsights({
          start: priorRange.start,
          end: priorRange.end,
          dimensions: [],
          filters,
          sortField: "spend",
          sortDirection: "desc",
          limit: 1,
        }),
      () =>
        aggregateMetaInsights({
          start: priorRange.start,
          end: priorRange.end,
          dimensions: ["brand"],
          filters,
          sortField: "spend",
          sortDirection: "desc",
          limit: 100,
        }),
      () =>
        aggregateMetaInsights({
          start: priorRange.start,
          end: priorRange.end,
          dimensions: ["campaign_umbrella"],
          filters,
          sortField: "spend",
          sortDirection: "desc",
          limit: 100,
        }),
      () =>
        aggregateMetaInsights({
          start: priorRange.start,
          end: priorRange.end,
          dimensions: ["campaign"],
          filters,
          sortField: "spend",
          sortDirection: "desc",
          limit: 5000,
        }),
      () =>
        aggregateMetaInsights({
          start: priorRange.start,
          end: priorRange.end,
          dimensions: ["date", "brand", "campaign_umbrella"],
          filters,
          sortField: "date",
          sortDirection: "asc",
          limit: 10000,
        }),
    ];
    const priorAggregatePromise = Promise.all(priorAggregateTasks.map((task) => task()));

    const [
      [
        brandsRes,
        accountsRes,
        reportsRes,
        syncRunsRes,
      ],
      [
        campaignCountRes,
        adSetCountRes,
        adCountRes,
        creativeCountRes,
      ],
      [
        overviewRows,
        byBrandRows,
        byUmbrellaRows,
        campaignAggregateRows,
        adSetAggregateRows,
        creativeAggregateRows,
        dailyTrendAggregateRows,
        dateCoverageAggregateRows,
      ],
      [
        priorOverviewRows,
        priorByBrandRows,
        priorByUmbrellaRows,
        priorCampaignAggregateRows,
        priorDailyTrendAggregateRows,
      ],
    ] = await Promise.all([
      coreMetadataPromise,
      metadataCountPromise,
      aggregatePromise,
      priorAggregatePromise,
    ]);

    const firstError = [
      brandsRes,
      accountsRes,
      reportsRes,
      syncRunsRes,
      campaignCountRes,
      adSetCountRes,
      adCountRes,
      creativeCountRes,
    ].find((res) => res.error)?.error;

    if (firstError) {
      throw firstError;
    }

    const targetedMetadata = await fetchTargetedDashboardMetadata({
      supabase,
      campaignAggregateRows,
      adSetAggregateRows,
      creativeAggregateRows,
    });
    const targetedMetadataError = [
      targetedMetadata.adsRes,
      targetedMetadata.adSetsRes,
      targetedMetadata.campaignsRes,
      targetedMetadata.creativesRes,
    ].find((res) => res.error)?.error;

    if (targetedMetadataError) {
      throw targetedMetadataError;
    }

    const brands = rows<BrandRow>(brandsRes.data);
    const accounts = rows<AccountRow>(accountsRes.data);
    const campaigns = rows<CampaignRow>(targetedMetadata.campaignsRes.data);
    const adSets = rows<AdSetRow>(targetedMetadata.adSetsRes.data);
    const ads = rows<AdRow>(targetedMetadata.adsRes.data);
    const creatives = rows<CreativeRow>(targetedMetadata.creativesRes.data);

    const brandById = new Map(brands.map((brand) => [brand.id, brand]));
    const campaignById = new Map(campaigns.map((campaign) => [campaign.campaign_id, campaign]));
    const adSetById = new Map(adSets.map((adSet) => [adSet.ad_set_id, adSet]));
    const creativeById = new Map(creatives.map((creative) => [creative.creative_id, creative]));
    const adByCreativeId = new Map(
      ads.filter((ad) => ad.creative_id).map((ad) => [ad.creative_id as string, ad]),
    );

    const getBrandCode = (brandId?: string | null) =>
      (brandId && brandById.get(brandId)?.code) || "Unassigned";

    const overview = summaryFromAggregate(overviewRows[0]);
    const byBrand = byBrandRows
      .map((row) => {
        const brandCode = row.brand || "Unassigned";
        return {
          id: brandCode,
          name: brandCode,
          brandCode,
          ...summaryFromAggregate(row),
        };
      })
      .sort(bySpendDesc);

    const byUmbrella = byUmbrellaRows
      .map((row) => {
        const umbrella = resolveUmbrella(row.campaign_umbrella);
        return {
          id: umbrella,
          name: umbrella,
          brandCode: "All",
          campaignUmbrella: umbrella,
          ...summaryFromAggregate(row, umbrella),
        };
      })
      .sort(bySpendDesc);

    const campaignUmbrellas = orderedUmbrellas([
      ...CAMPAIGN_UMBRELLAS,
      ...byUmbrella.map((row) => row.campaignUmbrella),
      ...campaigns.map((campaign) => resolveUmbrella(campaign.campaign_umbrella)),
      ...adSets.map((adSet) => resolveUmbrella(adSet.campaign_umbrella)),
    ]);

    const campaignRows = campaignAggregateRows
      .map((row) => {
        const campaignId = row.campaign_id || "unknown";
        const campaign = campaignById.get(campaignId);
        const classification = resolveCampaignClassification(
          {
            umbrella: campaign?.campaign_umbrella,
            confidence: campaign?.campaign_umbrella_confidence,
            reason: campaign?.campaign_umbrella_reason,
          },
          classifyCampaignUmbrella({
            campaignName: campaign?.name || row.campaign,
          }),
        );
        return {
          id: campaignId,
          name: campaign?.name || row.campaign || "Unknown campaign",
          brandCode: getBrandCode(campaign?.brand_id),
          status: campaign?.status,
          effectiveStatus: campaign?.effective_status,
          objective: campaign?.objective,
          campaignUmbrella: classification.umbrella,
          campaignUmbrellaConfidence: classification.confidence,
          campaignUmbrellaReason: classification.reason,
          ...summaryFromAggregate(row, classification.umbrella),
        };
      })
      .sort(bySpendDesc);

    const adSetRows = adSetAggregateRows
      .map((row) => {
        const adSetId = row.ad_set_id || "unknown";
        const adSet = adSetById.get(adSetId);
        const campaign = adSet?.campaign_id ? campaignById.get(adSet.campaign_id) : undefined;
        const classification = resolveCampaignClassification(
          {
            umbrella: adSet?.campaign_umbrella,
            confidence: adSet?.campaign_umbrella_confidence,
            reason: adSet?.campaign_umbrella_reason,
          },
          classifyCampaignUmbrella({
            campaignName: campaign?.name,
            adSetName: adSet?.name || row.ad_set,
          }),
        );
        return {
          id: adSetId,
          name: adSet?.name || row.ad_set || "Unknown ad set",
          brandCode: getBrandCode(adSet?.brand_id),
          status: adSet?.status,
          effectiveStatus: adSet?.effective_status,
          campaignUmbrella: classification.umbrella,
          campaignUmbrellaConfidence: classification.confidence,
          campaignUmbrellaReason: classification.reason,
          campaignId: adSet?.campaign_id || null,
          campaignName: campaign?.name || null,
          ...summaryFromAggregate(row, classification.umbrella),
        };
      })
      .sort(bySpendDesc);

    const creativeRows = creativeAggregateRows
      .map((row) => {
        const creativeId = row.creative_id || "unknown";
        const ad = adByCreativeId.get(creativeId);
        const adSet = ad?.ad_set_id ? adSetById.get(ad.ad_set_id) : undefined;
        const campaign = ad?.campaign_id ? campaignById.get(ad.campaign_id) : undefined;
        const creative = creativeById.get(creativeId || ad?.creative_id || "");
        const classification = resolveCampaignClassification(
          {
            umbrella: ad?.campaign_umbrella || adSet?.campaign_umbrella || campaign?.campaign_umbrella,
            confidence:
              ad?.campaign_umbrella_confidence ||
              adSet?.campaign_umbrella_confidence ||
              campaign?.campaign_umbrella_confidence,
            reason:
              ad?.campaign_umbrella_reason ||
              adSet?.campaign_umbrella_reason ||
              campaign?.campaign_umbrella_reason,
          },
          classifyCampaignUmbrella({
            campaignName: campaign?.name,
            adSetName: adSet?.name,
          }),
        );
        const metrics = summaryFromAggregate(row, classification.umbrella);
        const risk = getFatigueRisk(metrics, overview);
        return {
          id: creativeId,
          name: creative?.name || ad?.name || row.creative || "Unknown creative",
          brandCode: getBrandCode(creative?.brand_id || ad?.brand_id),
          status: ad?.status,
          effectiveStatus: ad?.effective_status,
          campaignUmbrella: classification.umbrella,
          campaignUmbrellaConfidence: ad?.campaign_umbrella_confidence || null,
          campaignUmbrellaReason: ad?.campaign_umbrella_reason || null,
          previewSource: creative?.preview_source,
          previewUrl: creative?.preview_url,
          previewHtml: creative?.preview_html,
          thumbnailUrl: creative?.thumbnail_url,
          imageUrl: creative?.image_url,
          videoThumbnailUrl: creative?.video_thumbnail_url,
          title: creative?.title,
          body: creative?.body,
          riskLevel: risk.level,
          riskReason: risk.reason,
          adId: ad?.ad_id || null,
          adName: ad?.name || null,
          adSetId: adSet?.ad_set_id || ad?.ad_set_id || null,
          adSetName: adSet?.name || null,
          campaignId: campaign?.campaign_id || ad?.campaign_id || null,
          campaignName: campaign?.name || null,
          ...metrics,
        };
      })
      .sort(bySpendDesc);

    const dailyTrend = dailyTrendAggregateRows
      .map((row) => {
        const campaignUmbrella = resolveUmbrella(row.campaign_umbrella);
        const metrics = summaryFromAggregate(row, campaignUmbrella);
        return {
          date: row.date || dateRange.start,
          brandCode: row.brand || "Unassigned",
          campaignUmbrella,
          spend: metrics.spend,
          impressions: metrics.impressions,
          clicks: metrics.clicks,
          leads: metrics.leads,
          primaryResults: metrics.primaryResults,
          websiteBookings: metrics.websiteBookings,
          messagingContacts: metrics.messagingContacts,
          newMessagingContacts: metrics.newMessagingContacts,
          ctr: metrics.ctr,
          cpc: metrics.cpc,
        };
      })
      .sort((a, b) => a.date.localeCompare(b.date));
    const dataCoverage = buildDataCoverage(
      dateRange.start,
      dateRange.end,
      dateCoverageAggregateRows.map((row) => row.date),
    );

    const fatigueRisks = creativeRows
      .filter((creative) => creative.riskLevel === "high" || creative.riskLevel === "medium")
      .sort((a, b) => {
        const riskDelta = riskRank(b.riskLevel) - riskRank(a.riskLevel);
        return riskDelta || b.spend - a.spend;
      })
      .slice(0, 10);

    const underperformers = creativeRows
      .filter((row) => row.spend > overview.spend * 0.03 && row.ctr < overview.ctr * 0.75)
      .slice(0, 10);

    const opportunities = buildOpportunities(creativeRows, campaignRows, overview);
    const recommendationQueue = buildRecommendations(fatigueRisks, underperformers, creativeRows);
    const actionQueue = buildActionQueue({
      creatives: creativeRows,
      fatigueRisks,
      underperformers,
      overview,
    });

    const priorOverview = summaryFromAggregate(priorOverviewRows[0]);
    const priorByBrand = priorByBrandRows
      .map((row) => {
        const brandCode = row.brand || "Unassigned";
        return {
          id: brandCode,
          name: brandCode,
          brandCode,
          ...summaryFromAggregate(row),
        };
      })
      .sort(bySpendDesc);
    const priorByUmbrella = priorByUmbrellaRows
      .map((row) => {
        const umbrella = resolveUmbrella(row.campaign_umbrella);
        return {
          id: umbrella,
          name: umbrella,
          brandCode: "All",
          campaignUmbrella: umbrella,
          ...summaryFromAggregate(row, umbrella),
        };
      })
      .sort(bySpendDesc);
    const priorCampaigns = priorCampaignAggregateRows
      .map((row) => {
        const campaignId = row.campaign_id || "unknown";
        const campaign = campaignById.get(campaignId);
        const classification = resolveCampaignClassification(
          {
            umbrella: campaign?.campaign_umbrella,
            confidence: campaign?.campaign_umbrella_confidence,
            reason: campaign?.campaign_umbrella_reason,
          },
          classifyCampaignUmbrella({
            campaignName: campaign?.name || row.campaign,
          }),
        );
        return {
          id: campaignId,
          name: campaign?.name || row.campaign || "Unknown campaign",
          brandCode: getBrandCode(campaign?.brand_id),
          status: campaign?.status,
          effectiveStatus: campaign?.effective_status,
          objective: campaign?.objective,
          campaignUmbrella: classification.umbrella,
          campaignUmbrellaConfidence: classification.confidence,
          campaignUmbrellaReason: classification.reason,
          ...summaryFromAggregate(row, classification.umbrella),
        };
      })
      .sort(bySpendDesc);
    const priorDailyTrend = priorDailyTrendAggregateRows
      .map((row) => {
        const campaignUmbrella = resolveUmbrella(row.campaign_umbrella);
        const metrics = summaryFromAggregate(row, campaignUmbrella);
        return {
          date: row.date || priorRange.start,
          brandCode: row.brand || "Unassigned",
          campaignUmbrella,
          spend: metrics.spend,
          impressions: metrics.impressions,
          clicks: metrics.clicks,
          leads: metrics.leads,
          primaryResults: metrics.primaryResults,
          websiteBookings: metrics.websiteBookings,
          messagingContacts: metrics.messagingContacts,
          newMessagingContacts: metrics.newMessagingContacts,
          ctr: metrics.ctr,
          cpc: metrics.cpc,
        };
      })
      .sort((a, b) => a.date.localeCompare(b.date));

    const sourceTransparency: SourceTransparency = {
      timeRange: {
        start: dateRange.start,
        end: dateRange.end,
        days: dateRange.days,
      },
      adAccountsAnalyzed: accounts.map((account) => account.name || account.meta_account_id),
      dataCoverage,
      recordCounts: {
        brands: brands.length,
        meta_ad_accounts: accounts.length,
        meta_campaigns: campaignCountRes.count || campaigns.length,
        meta_ad_sets: adSetCountRes.count || adSets.length,
        meta_ads: adCountRes.count || ads.length,
        meta_creatives: creativeCountRes.count || creatives.length,
        meta_daily_insights: overviewRows[0]?.source_rows || 0,
        aggregate_by_brand: byBrandRows.length,
        aggregate_by_umbrella: byUmbrellaRows.length,
        aggregate_campaigns: campaignAggregateRows.length,
        aggregate_ad_sets: adSetAggregateRows.length,
        aggregate_creatives: creativeAggregateRows.length,
        aggregate_daily_trend: dailyTrendAggregateRows.length,
        aggregate_date_coverage: dateCoverageAggregateRows.length,
        campaign_umbrellas: campaignUmbrellas.length,
      },
    };

    return {
      configured: true,
      missingEnv: [],
      sourceTransparency,
      overview,
      byBrand,
      byUmbrella,
      campaignUmbrellas,
      campaigns: campaignRows,
      adSets: adSetRows,
      creatives: creativeRows,
      dailyTrend,
      fatigueRisks,
      opportunities,
      underperformers,
      recommendationQueue,
      actionQueue,
      latestReports: rows<Record<string, unknown>>(reportsRes.data).map((report) => ({
        id: String(report.id),
        title: String(report.title),
        reportType: String(report.report_type),
        generatedAt: String(report.generated_at),
        content: null,
        sourceTransparency: (report.source_transparency || sourceTransparency) as SourceTransparency,
      })),
      comparison: {
        timeRange: {
          start: priorRange.start,
          end: priorRange.end,
          days: priorRange.days,
        },
        overview: priorOverview,
        byBrand: priorByBrand,
        byUmbrella: priorByUmbrella,
        campaigns: priorCampaigns,
        dailyTrend: priorDailyTrend,
      },
      latestSyncRuns: rows<Record<string, unknown>>(syncRunsRes.data).map((run) => ({
        id: String(run.id),
        trigger: String(run.trigger),
        status: String(run.status),
        startedAt: String(run.started_at),
        completedAt: typeof run.completed_at === "string" ? run.completed_at : null,
        metrics: run.metrics,
        errors: run.errors,
      })),
      generatedAt: new Date().toISOString(),
    };
  } catch (error) {
    if (error instanceof ConfigurationError) {
      return emptyDashboardPayload(error.missing);
    }
    throw error;
  }
}

async function fetchTargetedDashboardMetadata({
  supabase,
  campaignAggregateRows,
  adSetAggregateRows,
  creativeAggregateRows,
}: {
  supabase: ReturnType<typeof createAdsAnalystClient>;
  campaignAggregateRows: MetaInsightAggregateRow[];
  adSetAggregateRows: MetaInsightAggregateRow[];
  creativeAggregateRows: MetaInsightAggregateRow[];
}) {
  const creativeIds = uniqueRemoteIds(creativeAggregateRows.map((row) => row.creative_id));
  const campaignAggregateIds = uniqueRemoteIds(campaignAggregateRows.map((row) => row.campaign_id));
  const adSetAggregateIds = uniqueRemoteIds(adSetAggregateRows.map((row) => row.ad_set_id));

  const [adsRes, creativesRes] = await Promise.all([
    selectRowsByRemoteId<AdRow>(supabase, "meta_ads", AD_COLUMNS, "creative_id", creativeIds),
    selectRowsByRemoteId<CreativeRow>(
      supabase,
      "meta_creatives",
      CREATIVE_COLUMNS,
      "creative_id",
      creativeIds,
    ),
  ]);

  const ads = rows<AdRow>(adsRes.data);
  const adSetIds = uniqueRemoteIds([
    ...adSetAggregateIds,
    ...ads.map((ad) => ad.ad_set_id),
  ]);
  const adSetsRes = await selectRowsByRemoteId<AdSetRow>(
    supabase,
    "meta_ad_sets",
    AD_SET_COLUMNS,
    "ad_set_id",
    adSetIds,
  );

  const adSets = rows<AdSetRow>(adSetsRes.data);
  const campaignIds = uniqueRemoteIds([
    ...campaignAggregateIds,
    ...ads.map((ad) => ad.campaign_id),
    ...adSets.map((adSet) => adSet.campaign_id),
  ]);
  const campaignsRes = await selectRowsByRemoteId<CampaignRow>(
    supabase,
    "meta_campaigns",
    CAMPAIGN_COLUMNS,
    "campaign_id",
    campaignIds,
  );

  return {
    adsRes,
    adSetsRes,
    campaignsRes,
    creativesRes,
  };
}

type MetadataQueryResult<T> = {
  data: T[] | null;
  error: Error | null;
};

async function selectRowsByRemoteId<T>(
  supabase: ReturnType<typeof createAdsAnalystClient>,
  table: string,
  columns: string,
  idColumn: string,
  ids: string[],
): Promise<MetadataQueryResult<T>> {
  if (!ids.length) return { data: [], error: null };

  const client = supabase as unknown as {
    from: (tableName: string) => {
      select: (columnList: string) => {
        in: (columnName: string, values: string[]) => Promise<MetadataQueryResult<T>>;
      };
    };
  };

  return client.from(table).select(columns).in(idColumn, ids);
}

function uniqueRemoteIds(values: Array<string | null | undefined>) {
  return Array.from(
    new Set(values.filter((value): value is string => Boolean(value && value !== "unknown"))),
  );
}

function summaryFromAggregate(
  row?: MetaInsightAggregateRow,
  umbrella?: CampaignUmbrella,
): MetricSummary {
  const profile = umbrella
    ? getKpiProfile(umbrella)
    : {
        primaryResultLabel: "Primary Results",
        secondaryResultLabel: null,
      };
  const metrics: MetricSummary = {
    ...EMPTY_METRICS,
    spend: row?.spend || 0,
    impressions: row?.impressions || 0,
    reach: row?.reach || 0,
    clicks: row?.clicks || 0,
    leads: row?.leads || 0,
    bookings: row?.bookings || 0,
    websiteBookings: row?.website_bookings || 0,
    messagingContacts: row?.messaging_contacts || 0,
    newMessagingContacts: row?.new_messaging_contacts || 0,
    primaryResults: row?.primary_results || 0,
    primaryResultLabel: profile.primaryResultLabel,
    secondaryResults:
      profile.secondaryResultLabel && row?.secondary_results
        ? row.secondary_results
        : null,
    secondaryResultLabel: profile.secondaryResultLabel,
    conversions: row?.conversions || 0,
  };

  return deriveRates(metrics);
}

export function summarize(
  insights: InsightRow[],
  getUmbrella: (row: InsightRow) => CampaignUmbrella = (row) => resolveUmbrella(row.campaign_umbrella),
): MetricSummary {
  const base = insights.reduce(
    (acc, row) => {
      acc.spend += toNumber(row.spend);
      acc.impressions += toNumber(row.impressions);
      acc.reach += toNumber(row.reach);
      acc.clicks += toNumber(row.clicks);
      acc.leads += toNumber(row.leads);
      acc.bookings += toNumber(row.bookings);
      acc.conversions += toNumber(row.conversions);
      return acc;
    },
    { ...EMPTY_METRICS },
  );

  return deriveRates({
    ...base,
    ...summarizePrimaryOutcomes(insights, getUmbrella),
  });
}

export function deriveRates(metrics: MetricSummary): MetricSummary {
  const ctr = metrics.impressions > 0 ? (metrics.clicks / metrics.impressions) * 100 : 0;
  const cpm = metrics.impressions > 0 ? (metrics.spend / metrics.impressions) * 1000 : 0;
  const cpc = metrics.clicks > 0 ? metrics.spend / metrics.clicks : 0;
  const cpl = metrics.leads > 0 ? metrics.spend / metrics.leads : null;
  const costPerPrimaryResult =
    metrics.primaryResults > 0 ? metrics.spend / metrics.primaryResults : null;
  const frequency = metrics.reach > 0 ? metrics.impressions / metrics.reach : 0;

  return {
    ...metrics,
    spend: roundMoney(metrics.spend),
    ctr: round(ctr, 2),
    cpm: roundMoney(cpm),
    cpc: roundMoney(cpc),
    cpl: cpl === null ? null : roundMoney(cpl),
    costPerPrimaryResult:
      costPerPrimaryResult === null ? null : roundMoney(costPerPrimaryResult),
    frequency: round(frequency, 2),
  };
}

export function formatMetric(value: number | null, kind: "money" | "number" | "percent") {
  if (value === null || Number.isNaN(value)) return "n/a";
  if (kind === "money") {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      maximumFractionDigits: value >= 100 ? 0 : 2,
    }).format(value);
  }
  if (kind === "percent") return `${value.toFixed(2)}%`;
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(value);
}

function rows<T>(data: unknown): T[] {
  return Array.isArray(data) ? (data as T[]) : [];
}

function resolveDashboardDateRange(input: number | DashboardDateRangeInput) {
  const requested = typeof input === "number" ? { days: input } : input;
  const today = new Date();
  const fallbackDays = normalizeDays(requested.days);
  const fallbackEnd = toDateString(today);
  const fallbackStart = toDateString(subDays(today, fallbackDays - 1));
  let start = normalizeDateString(requested.startDate) || fallbackStart;
  let end = normalizeDateString(requested.endDate) || fallbackEnd;

  if (start > end) {
    [start, end] = [end, start];
  }

  return {
    start,
    end,
    days: differenceInCalendarDays(parseDate(end), parseDate(start)) + 1,
  };
}

function resolvePriorDateRange(current: { start: string; end: string; days: number }) {
  const end = toDateString(subDays(parseDate(current.start), 1));
  const start = toDateString(subDays(parseDate(end), current.days - 1));
  return { start, end, days: current.days };
}

function normalizeDays(days: number | null | undefined) {
  return Number.isFinite(days) && Number(days) > 0 ? Math.floor(Number(days)) : 30;
}

function normalizeDateString(value: string | null | undefined) {
  return value && DATE_PATTERN.test(value) ? value : null;
}

function buildDataCoverage(start: string, end: string, storedDateValues: Array<string | null | undefined>) {
  const storedDates = new Set(
    storedDateValues.filter((value): value is string => Boolean(value && DATE_PATTERN.test(value))),
  );
  const missingDateSample: string[] = [];
  const endDate = parseDate(end);
  const cursor = parseDate(start);
  let expectedDays = 0;
  let storedDays = 0;

  while (cursor <= endDate) {
    const dateKey = toDateString(cursor);
    expectedDays += 1;
    if (storedDates.has(dateKey)) {
      storedDays += 1;
    } else if (missingDateSample.length < 31) {
      missingDateSample.push(dateKey);
    }
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }

  const missingDays = Math.max(0, expectedDays - storedDays);
  return {
    expectedDays,
    storedDays,
    missingDays,
    missingDateSample,
    isComplete: missingDays === 0,
  };
}

function parseDate(value: string) {
  return new Date(`${value}T00:00:00Z`);
}

function toDateString(value: Date) {
  return value.toISOString().slice(0, 10);
}

function toNumber(value: string | number | null | undefined): number {
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  if (!value) return 0;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function round(value: number, precision = 2): number {
  const factor = 10 ** precision;
  return Math.round(value * factor) / factor;
}

function roundMoney(value: number): number {
  return round(value, 2);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function summarizePrimaryOutcomes(
  insights: InsightRow[],
  getUmbrella: (row: InsightRow) => CampaignUmbrella,
) {
  const umbrellas = new Set<CampaignUmbrella>();
  const totals = insights.reduce(
    (acc, row) => {
      const umbrella = getUmbrella(row);
      const rowOutcome = getPrimaryOutcome(row, umbrella);
      umbrellas.add(umbrella);
      acc.websiteBookings += rowOutcome.websiteBookings;
      acc.messagingContacts += rowOutcome.messagingContacts;
      acc.newMessagingContacts += rowOutcome.newMessagingContacts;
      acc.primaryResults += rowOutcome.primaryResults;
      if (rowOutcome.secondaryResults !== null) {
        acc.secondaryResults = (acc.secondaryResults || 0) + rowOutcome.secondaryResults;
      }
      return acc;
    },
    {
      websiteBookings: 0,
      messagingContacts: 0,
      newMessagingContacts: 0,
      primaryResults: 0,
      primaryResultLabel: "Primary Results",
      secondaryResults: null as number | null,
      secondaryResultLabel: null as string | null,
    },
  );

  if (umbrellas.size === 1) {
    const profile = getKpiProfile(Array.from(umbrellas)[0]);
    totals.primaryResultLabel = profile.primaryResultLabel;
    totals.secondaryResultLabel = profile.secondaryResultLabel;
  }

  return totals;
}

function getPrimaryOutcome(row: InsightRow, umbrella: CampaignUmbrella) {
  const websiteBookings = actionCount(row.actions, WEBSITE_BOOKING_ACTION_TYPES);
  const messagingContacts = actionCount(row.actions, MESSAGING_CONTACT_ACTION_TYPES);
  const newMessagingContacts = actionCount(row.actions, NEW_MESSAGING_CONTACT_ACTION_TYPES);
  const profile = getKpiProfile(umbrella);

  return {
    websiteBookings,
    messagingContacts,
    newMessagingContacts,
    primaryResults: profile.primaryMetric === "websiteBookings" ? websiteBookings : messagingContacts,
    secondaryResults:
      profile.secondaryMetric === "newMessagingContacts" ? newMessagingContacts : null,
  };
}

function getKpiProfile(umbrella: CampaignUmbrella) {
  if (umbrella === "Book Appts US") {
    return {
      primaryMetric: "websiteBookings" as const,
      primaryResultLabel: "Website Bookings",
      secondaryMetric: null,
      secondaryResultLabel: null,
    };
  }

  if (umbrella === "Facebook US Product" || umbrella === "Facebook VN Product") {
    return {
      primaryMetric: "messagingContacts" as const,
      primaryResultLabel: "Messaging Contacts",
      secondaryMetric: "newMessagingContacts" as const,
      secondaryResultLabel: "New Msg Contacts",
    };
  }

  return {
    primaryMetric: "messagingContacts" as const,
    primaryResultLabel: "Messaging Contacts",
    secondaryMetric: null,
    secondaryResultLabel: null,
  };
}

function actionCount(actions: unknown, exactActionTypes: string[]) {
  if (!Array.isArray(actions)) return 0;
  return actions.reduce((sum, action) => {
    if (!isRecord(action)) return sum;
    const type = String(action.action_type || "");
    if (!exactActionTypes.includes(type)) return sum;
    return sum + toNumber(action.value as string | number | null | undefined);
  }, 0);
}

function resolveUmbrella(...values: Array<string | null | undefined>): CampaignUmbrella {
  const match = values.find(isCampaignUmbrella);
  return match || "Needs review";
}

function resolveCampaignClassification(
  stored: {
    umbrella?: string | null;
    confidence?: string | null;
    reason?: string | null;
  },
  fallback: CampaignUmbrellaClassification,
) {
  if (isCampaignUmbrella(stored.umbrella)) {
    return {
      umbrella: stored.umbrella,
      confidence: stored.confidence || fallback.confidence,
      reason: stored.reason || fallback.reason,
    };
  }

  return {
    umbrella: fallback.umbrella,
    confidence: fallback.confidence,
    reason: fallback.reason,
  };
}

function orderedUmbrellas(values: Array<string | null | undefined>) {
  const present = new Set(values.filter(isCampaignUmbrella));
  return CAMPAIGN_UMBRELLAS.filter((umbrella) => present.has(umbrella));
}

function bySpendDesc(a: MetricSummary, b: MetricSummary) {
  return b.spend - a.spend;
}

function getFatigueRisk(metrics: MetricSummary, benchmark: MetricSummary) {
  if (metrics.frequency >= 4 && metrics.ctr < benchmark.ctr * 0.8) {
    return {
      level: "high" as const,
      reason: `Frequency ${metrics.frequency}x with CTR below benchmark ${benchmark.ctr.toFixed(2)}%.`,
    };
  }

  if (metrics.frequency >= 3 || metrics.ctr < benchmark.ctr * 0.65) {
    return {
      level: "medium" as const,
      reason: `Watch frequency ${metrics.frequency}x and CTR ${metrics.ctr.toFixed(2)}%.`,
    };
  }

  return { level: "low" as const, reason: "No major fatigue signal in the selected range." };
}

function riskRank(level?: PerformanceRow["riskLevel"]) {
  if (level === "high") return 3;
  if (level === "medium") return 2;
  if (level === "low") return 1;
  return 0;
}

function buildOpportunities(
  creatives: PerformanceRow[],
  campaigns: PerformanceRow[],
  overview: MetricSummary,
) {
  const messages: string[] = [];
  const efficientCreatives = creatives
    .filter((creative) => creative.clicks >= 20 && creative.ctr > overview.ctr * 1.25)
    .sort((a, b) => b.ctr - a.ctr)
    .slice(0, 3);

  for (const creative of efficientCreatives) {
    messages.push(
      `${creative.name} is outperforming CTR benchmark (${creative.ctr.toFixed(2)}% vs ${overview.ctr.toFixed(2)}%) with ${formatMetric(creative.spend, "money")} in spend.`,
    );
  }

  const resultEfficient = creatives
    .filter((creative) => creative.primaryResults >= 2 && creative.costPerPrimaryResult !== null)
    .sort(
      (a, b) =>
        (a.costPerPrimaryResult || Infinity) - (b.costPerPrimaryResult || Infinity),
    )
    .slice(0, 3);

  for (const creative of resultEfficient) {
    messages.push(
      `${creative.name} has the strongest ${creative.primaryResultLabel.toLowerCase()} efficiency at ${formatMetric(creative.costPerPrimaryResult, "money")} per result.`,
    );
  }

  const bestCampaign = campaigns[0];
  if (bestCampaign) {
    messages.push(
      `${bestCampaign.name} is the largest spend center at ${formatMetric(bestCampaign.spend, "money")} and should be reviewed for budget efficiency before scaling.`,
    );
  }

  return messages.slice(0, 6);
}

function buildRecommendations(
  fatigueRisks: PerformanceRow[],
  underperformers: PerformanceRow[],
  creatives: PerformanceRow[],
) {
  const recommendations = new Set<string>();

  if (fatigueRisks[0]) {
    recommendations.add(
      `Refresh or rotate ${fatigueRisks[0].name}; it has the clearest fatigue risk in the selected period.`,
    );
  }

  if (underperformers[0]) {
    recommendations.add(
      `Audit ${underperformers[0].name} for mismatch between hook, audience, and landing intent before allocating more spend.`,
    );
  }

  const topCreative = creatives.find((creative) => creative.spend > 0);
  if (topCreative) {
    recommendations.add(
      `Use ${topCreative.name} as the immediate benchmark for new creative tests and compare hooks, offer framing, and visual format.`,
    );
  }

  recommendations.add("Maintain daily sync coverage and review preview freshness because Meta creative URLs can expire.");
  recommendations.add("Prioritize tests that isolate one variable: hook, format, offer, or audience.");

  return Array.from(recommendations).slice(0, 6);
}

function buildActionQueue({
  creatives,
  fatigueRisks,
  underperformers,
  overview,
}: {
  creatives: PerformanceRow[];
  fatigueRisks: PerformanceRow[];
  underperformers: PerformanceRow[];
  overview: MetricSummary;
}): ActionItem[] {
  const seen = new Set<string>();
  const items: ActionItem[] = [];
  const push = (item: ActionItem) => {
    const key = `${item.bucket}:${item.entityId}`;
    if (seen.has(key)) return;
    seen.add(key);
    items.push(item);
  };

  const benchmarkCtr = overview.ctr;

  const scaleCandidates = creatives
    .filter(
      (creative) =>
        creative.clicks >= 20 &&
        (benchmarkCtr > 0 ? creative.ctr > benchmarkCtr * 1.25 : creative.ctr > 0) &&
        creative.primaryResults >= 1,
    )
    .sort((a, b) => b.primaryResults - a.primaryResults || b.ctr - a.ctr)
    .slice(0, 3);
  for (const creative of scaleCandidates) {
    push({
      id: `scale-${creative.id}`,
      bucket: "scale",
      entityType: "creative",
      entityId: creative.id,
      entityName: creative.name,
      brandCode: creative.brandCode,
      campaignUmbrella: creative.campaignUmbrella,
      headline: `${formatMetric(creative.primaryResults, "number")} ${creative.primaryResultLabel.toLowerCase()} · ${formatMetric(creative.costPerPrimaryResult, "money")} per result`,
      supporting: `CTR ${creative.ctr.toFixed(2)}% vs ${benchmarkCtr.toFixed(2)}% benchmark · ${formatMetric(creative.spend, "money")} spend`,
    });
  }

  const fixCandidates = fatigueRisks.slice(0, 3);
  for (const creative of fixCandidates) {
    push({
      id: `fix-${creative.id}`,
      bucket: "fix",
      entityType: "creative",
      entityId: creative.id,
      entityName: creative.name,
      brandCode: creative.brandCode,
      campaignUmbrella: creative.campaignUmbrella,
      headline:
        creative.riskLevel === "high"
          ? "Fatigue risk — rotate or refresh"
          : "Early fatigue — watch closely",
      supporting: `Freq ${creative.frequency.toFixed(2)}x · CTR ${creative.ctr.toFixed(2)}% · ${formatMetric(creative.spend, "money")} spend`,
    });
  }

  const watchCandidates = underperformers.slice(0, 3);
  for (const creative of watchCandidates) {
    push({
      id: `watch-${creative.id}`,
      bucket: "watch",
      entityType: "creative",
      entityId: creative.id,
      entityName: creative.name,
      brandCode: creative.brandCode,
      campaignUmbrella: creative.campaignUmbrella,
      headline: "Spending without efficiency",
      supporting: `${formatMetric(creative.spend, "money")} spend · CTR ${creative.ctr.toFixed(2)}% (benchmark ${benchmarkCtr.toFixed(2)}%)`,
    });
  }

  return items;
}
