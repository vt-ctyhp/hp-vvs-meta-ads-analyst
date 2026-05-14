import { differenceInCalendarDays, subDays } from "date-fns";

import {
  CAMPAIGN_UMBRELLAS,
  classifyCampaignUmbrella,
  isCampaignUmbrella,
  type CampaignUmbrella,
  type CampaignUmbrellaClassification,
} from "./campaign-umbrellas";
import { ConfigurationError, getMissingRequiredEnv } from "./env";
import { createServiceClient } from "./supabase";

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
  recordCounts: Record<string, number>;
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
  latestReports: StoredReport[];
  latestSyncRuns: SyncRun[];
  generatedAt: string;
};

export type DashboardDateRangeInput = {
  days?: number;
  startDate?: string | null;
  endDate?: string | null;
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

export function emptyDashboardPayload(missingEnv = getMissingRequiredEnv()): DashboardPayload {
  return {
    configured: missingEnv.length === 0,
    missingEnv,
    sourceTransparency: {
      timeRange: { start: null, end: null, days: 30 },
      adAccountsAnalyzed: [],
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
    latestReports: [],
    latestSyncRuns: [],
    generatedAt: new Date().toISOString(),
  };
}

export async function fetchDashboardData(
  dateRangeInput: number | DashboardDateRangeInput = 30,
): Promise<DashboardPayload> {
  const missingEnv = getMissingRequiredEnv([
    "NEXT_PUBLIC_SUPABASE_URL",
    "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
    "SUPABASE_SERVICE_ROLE_KEY",
  ]);

  if (missingEnv.length) {
    return emptyDashboardPayload(missingEnv);
  }

  try {
    const supabase = createServiceClient();
    const dateRange = resolveDashboardDateRange(dateRangeInput);

    const [
      brandsRes,
      accountsRes,
      campaignsRes,
      adSetsRes,
      adsRes,
      creativesRes,
      insightsRes,
      reportsRes,
      syncRunsRes,
    ] = await Promise.all([
      supabase.from("brands").select("*"),
      supabase.from("meta_ad_accounts").select("*"),
      supabase.from("meta_campaigns").select("*"),
      supabase.from("meta_ad_sets").select("*"),
      supabase.from("meta_ads").select("*"),
      supabase.from("meta_creatives").select("*"),
      supabase
        .from("meta_daily_insights")
        .select("*")
        .gte("date_start", dateRange.start)
        .lte("date_start", dateRange.end)
        .order("date_start", { ascending: false })
        .limit(10000),
      supabase
        .from("ai_reports")
        .select("*")
        .order("generated_at", { ascending: false })
        .limit(5),
      supabase
        .from("sync_runs")
        .select("*")
        .order("started_at", { ascending: false })
        .limit(8),
    ]);

    const firstError = [
      brandsRes,
      accountsRes,
      campaignsRes,
      adSetsRes,
      adsRes,
      creativesRes,
      insightsRes,
      reportsRes,
      syncRunsRes,
    ].find((res) => res.error)?.error;

    if (firstError) {
      throw firstError;
    }

    const brands = rows<BrandRow>(brandsRes.data);
    const accounts = rows<AccountRow>(accountsRes.data);
    const campaigns = rows<CampaignRow>(campaignsRes.data);
    const adSets = rows<AdSetRow>(adSetsRes.data);
    const ads = rows<AdRow>(adsRes.data);
    const creatives = rows<CreativeRow>(creativesRes.data);
    const insights = rows<InsightRow>(insightsRes.data);

    const brandById = new Map(brands.map((brand) => [brand.id, brand]));
    const campaignById = new Map(campaigns.map((campaign) => [campaign.campaign_id, campaign]));
    const adSetById = new Map(adSets.map((adSet) => [adSet.ad_set_id, adSet]));
    const adById = new Map(ads.map((ad) => [ad.ad_id, ad]));
    const creativeById = new Map(creatives.map((creative) => [creative.creative_id, creative]));

    const getBrandCode = (brandId?: string | null) =>
      (brandId && brandById.get(brandId)?.code) || "Unassigned";

    const getInsightUmbrella = (row: InsightRow) => {
      const campaign = row.campaign_id ? campaignById.get(row.campaign_id) : undefined;
      const adSet = row.ad_set_id ? adSetById.get(row.ad_set_id) : undefined;
      const ad = row.ad_id ? adById.get(row.ad_id) : undefined;
      return resolveUmbrella(
        row.campaign_umbrella,
        ad?.campaign_umbrella,
        adSet?.campaign_umbrella,
        campaign?.campaign_umbrella,
        classifyCampaignUmbrella({
          campaignName: campaign?.name || row.campaign_name,
          adSetName: adSet?.name || row.ad_set_name,
        }).umbrella,
      );
    };

    const overview = summarize(insights, getInsightUmbrella);
    const byBrand = Array.from(groupInsights(insights, (row) => getBrandCode(row.brand_id)).entries())
      .map(([brandCode, groupRows]) => ({
        id: brandCode,
        name: brandCode,
        brandCode,
        ...summarize(groupRows, getInsightUmbrella),
      }))
      .sort(bySpendDesc);

    const byUmbrella = Array.from(groupInsights(insights, getInsightUmbrella).entries())
      .map(([umbrella, groupRows]) => ({
        id: umbrella,
        name: umbrella,
        brandCode: "All",
        campaignUmbrella: resolveUmbrella(umbrella),
        ...summarize(groupRows, getInsightUmbrella),
      }))
      .sort(bySpendDesc);

    const campaignUmbrellas = orderedUmbrellas([
      ...byUmbrella.map((row) => row.campaignUmbrella),
      ...campaigns.map((campaign) => resolveUmbrella(campaign.campaign_umbrella)),
      ...adSets.map((adSet) => resolveUmbrella(adSet.campaign_umbrella)),
    ]);

    const campaignRows = Array.from(
      groupInsights(insights, (row) => row.campaign_id || "unknown").entries(),
    )
      .map(([campaignId, groupRows]) => {
        const campaign = campaignById.get(campaignId);
        const first = groupRows[0];
        const classification = resolveCampaignClassification(
          {
            umbrella: campaign?.campaign_umbrella,
            confidence: campaign?.campaign_umbrella_confidence,
            reason: campaign?.campaign_umbrella_reason,
          },
          classifyCampaignUmbrella({
            campaignName: campaign?.name || first?.campaign_name,
            adSetNames: uniqueStrings(groupRows.map((row) => row.ad_set_name)),
          }),
        );
        return {
          id: campaignId,
          name: campaign?.name || first?.campaign_name || "Unknown campaign",
          brandCode: getBrandCode(campaign?.brand_id || first?.brand_id),
          status: campaign?.status,
          effectiveStatus: campaign?.effective_status,
          objective: campaign?.objective,
          campaignUmbrella: classification.umbrella,
          campaignUmbrellaConfidence: classification.confidence,
          campaignUmbrellaReason: classification.reason,
          ...summarize(groupRows, getInsightUmbrella),
        };
      })
      .sort(bySpendDesc);

    const adSetRows = Array.from(groupInsights(insights, (row) => row.ad_set_id || "unknown").entries())
      .map(([adSetId, groupRows]) => {
        const adSet = adSetById.get(adSetId);
        const first = groupRows[0];
        const campaign = first?.campaign_id ? campaignById.get(first.campaign_id) : undefined;
        const classification = resolveCampaignClassification(
          {
            umbrella: adSet?.campaign_umbrella,
            confidence: adSet?.campaign_umbrella_confidence,
            reason: adSet?.campaign_umbrella_reason,
          },
          classifyCampaignUmbrella({
            campaignName: campaign?.name || first?.campaign_name,
            adSetName: adSet?.name || first?.ad_set_name,
          }),
        );
        return {
          id: adSetId,
          name: adSet?.name || first?.ad_set_name || "Unknown ad set",
          brandCode: getBrandCode(adSet?.brand_id || first?.brand_id),
          status: adSet?.status,
          effectiveStatus: adSet?.effective_status,
          campaignUmbrella: classification.umbrella,
          campaignUmbrellaConfidence: classification.confidence,
          campaignUmbrellaReason: classification.reason,
          ...summarize(groupRows, getInsightUmbrella),
        };
      })
      .sort(bySpendDesc);

    const creativeRows = Array.from(
      groupInsights(insights, (row) => {
        const ad = row.ad_id ? adById.get(row.ad_id) : undefined;
        return row.creative_id || ad?.creative_id || "unknown";
      }).entries(),
    )
      .map(([creativeId, groupRows]) => {
        const first = groupRows[0];
        const ad = first?.ad_id ? adById.get(first.ad_id) : undefined;
        const creative = creativeById.get(creativeId || ad?.creative_id || "");
        const metrics = summarize(groupRows, getInsightUmbrella);
        const risk = getFatigueRisk(metrics, overview);
        const campaignUmbrella = dominantUmbrella(groupRows, getInsightUmbrella);
        return {
          id: creativeId,
          name: creative?.name || ad?.name || first?.ad_name || "Unknown creative",
          brandCode: getBrandCode(creative?.brand_id || ad?.brand_id || first?.brand_id),
          status: ad?.status,
          effectiveStatus: ad?.effective_status,
          campaignUmbrella,
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
          ...metrics,
        };
      })
      .sort(bySpendDesc);

    const dailyTrend = Array.from(
      groupInsights(
        insights,
        (row) => `${row.date_start}::${getBrandCode(row.brand_id)}::${getInsightUmbrella(row)}`,
      ).entries(),
    )
      .map(([key, groupRows]) => {
        const [date, brandCode, campaignUmbrella] = key.split("::");
        const metrics = summarize(groupRows, getInsightUmbrella);
        return {
          date,
          brandCode,
          campaignUmbrella: resolveUmbrella(campaignUmbrella),
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

    const sourceTransparency: SourceTransparency = {
      timeRange: {
        start: dateRange.start,
        end: dateRange.end,
        days: dateRange.days,
      },
      adAccountsAnalyzed: accounts.map((account) => account.name || account.meta_account_id),
      recordCounts: {
        brands: brands.length,
        meta_ad_accounts: accounts.length,
        meta_campaigns: campaigns.length,
        meta_ad_sets: adSets.length,
        meta_ads: ads.length,
        meta_creatives: creatives.length,
        meta_daily_insights: insights.length,
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
      latestReports: rows<Record<string, unknown>>(reportsRes.data).map((report) => ({
        id: String(report.id),
        title: String(report.title),
        reportType: String(report.report_type),
        generatedAt: String(report.generated_at),
        content: report.content,
        sourceTransparency: (report.source_transparency || sourceTransparency) as SourceTransparency,
      })),
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

function normalizeDays(days: number | null | undefined) {
  return Number.isFinite(days) && Number(days) > 0 ? Math.floor(Number(days)) : 30;
}

function normalizeDateString(value: string | null | undefined) {
  return value && DATE_PATTERN.test(value) ? value : null;
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

function groupInsights(rowsToGroup: InsightRow[], keyFn: (row: InsightRow) => string) {
  return rowsToGroup.reduce((groups, row) => {
    const key = keyFn(row) || "unknown";
    groups.set(key, [...(groups.get(key) || []), row]);
    return groups;
  }, new Map<string, InsightRow[]>());
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

function uniqueStrings(values: Array<string | null | undefined>) {
  return Array.from(new Set(values.filter((value): value is string => Boolean(value))));
}

function dominantUmbrella(rowsToGroup: InsightRow[], keyFn: (row: InsightRow) => CampaignUmbrella) {
  const totals = rowsToGroup.reduce((groups, row) => {
    const key = keyFn(row);
    groups.set(key, (groups.get(key) || 0) + toNumber(row.spend));
    return groups;
  }, new Map<CampaignUmbrella, number>());

  return Array.from(totals.entries()).sort((a, b) => b[1] - a[1])[0]?.[0] || "Needs review";
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
