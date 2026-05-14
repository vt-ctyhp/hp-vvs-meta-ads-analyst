import { subDays } from "date-fns";

import { ConfigurationError, getMissingRequiredEnv } from "./env";
import { createServiceClient } from "./supabase";

export type MetricSummary = {
  spend: number;
  impressions: number;
  reach: number;
  clicks: number;
  leads: number;
  bookings: number;
  conversions: number;
  ctr: number;
  cpm: number;
  cpc: number;
  cpl: number | null;
  frequency: number;
};

export type PerformanceRow = MetricSummary & {
  id: string;
  name: string;
  brandCode: string;
  status?: string | null;
  effectiveStatus?: string | null;
  objective?: string | null;
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
  spend: number;
  impressions: number;
  clicks: number;
  leads: number;
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
};
type AdSetRow = {
  id: string;
  brand_id: string | null;
  ad_set_id: string;
  campaign_id: string | null;
  name: string | null;
  status: string | null;
  effective_status: string | null;
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
  date_start: string;
  spend: string | number | null;
  impressions: string | number | null;
  reach: string | number | null;
  clicks: string | number | null;
  leads: string | number | null;
  bookings: string | number | null;
  conversions: string | number | null;
};

const EMPTY_METRICS: MetricSummary = {
  spend: 0,
  impressions: 0,
  reach: 0,
  clicks: 0,
  leads: 0,
  bookings: 0,
  conversions: 0,
  ctr: 0,
  cpm: 0,
  cpc: 0,
  cpl: null,
  frequency: 0,
};

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

export async function fetchDashboardData(days = 30): Promise<DashboardPayload> {
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
    const startDate = subDays(new Date(), days).toISOString().slice(0, 10);

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
        .gte("date_start", startDate)
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

    const overview = summarize(insights);
    const byBrand = Array.from(groupInsights(insights, (row) => getBrandCode(row.brand_id)).entries())
      .map(([brandCode, groupRows]) => ({
        id: brandCode,
        name: brandCode,
        brandCode,
        ...summarize(groupRows),
      }))
      .sort(bySpendDesc);

    const campaignRows = Array.from(
      groupInsights(insights, (row) => row.campaign_id || "unknown").entries(),
    )
      .map(([campaignId, groupRows]) => {
        const campaign = campaignById.get(campaignId);
        const first = groupRows[0];
        return {
          id: campaignId,
          name: campaign?.name || first?.campaign_name || "Unknown campaign",
          brandCode: getBrandCode(campaign?.brand_id || first?.brand_id),
          status: campaign?.status,
          effectiveStatus: campaign?.effective_status,
          objective: campaign?.objective,
          ...summarize(groupRows),
        };
      })
      .sort(bySpendDesc);

    const adSetRows = Array.from(groupInsights(insights, (row) => row.ad_set_id || "unknown").entries())
      .map(([adSetId, groupRows]) => {
        const adSet = adSetById.get(adSetId);
        const first = groupRows[0];
        return {
          id: adSetId,
          name: adSet?.name || first?.ad_set_name || "Unknown ad set",
          brandCode: getBrandCode(adSet?.brand_id || first?.brand_id),
          status: adSet?.status,
          effectiveStatus: adSet?.effective_status,
          ...summarize(groupRows),
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
        const metrics = summarize(groupRows);
        const risk = getFatigueRisk(metrics, overview);
        return {
          id: creativeId,
          name: creative?.name || ad?.name || first?.ad_name || "Unknown creative",
          brandCode: getBrandCode(creative?.brand_id || ad?.brand_id || first?.brand_id),
          status: ad?.status,
          effectiveStatus: ad?.effective_status,
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
      groupInsights(insights, (row) => `${row.date_start}::${getBrandCode(row.brand_id)}`).entries(),
    )
      .map(([key, groupRows]) => {
        const [date, brandCode] = key.split("::");
        const metrics = summarize(groupRows);
        return {
          date,
          brandCode,
          spend: metrics.spend,
          impressions: metrics.impressions,
          clicks: metrics.clicks,
          leads: metrics.leads,
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

    const dates = insights.map((row) => row.date_start).sort();
    const sourceTransparency: SourceTransparency = {
      timeRange: {
        start: dates[0] || null,
        end: dates.at(-1) || null,
        days,
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
      },
    };

    return {
      configured: true,
      missingEnv: [],
      sourceTransparency,
      overview,
      byBrand,
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

export function summarize(insights: InsightRow[]): MetricSummary {
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

  return deriveRates(base);
}

export function deriveRates(metrics: MetricSummary): MetricSummary {
  const ctr = metrics.impressions > 0 ? (metrics.clicks / metrics.impressions) * 100 : 0;
  const cpm = metrics.impressions > 0 ? (metrics.spend / metrics.impressions) * 1000 : 0;
  const cpc = metrics.clicks > 0 ? metrics.spend / metrics.clicks : 0;
  const cpl = metrics.leads > 0 ? metrics.spend / metrics.leads : null;
  const frequency = metrics.reach > 0 ? metrics.impressions / metrics.reach : 0;

  return {
    ...metrics,
    spend: roundMoney(metrics.spend),
    ctr: round(ctr, 2),
    cpm: roundMoney(cpm),
    cpc: roundMoney(cpc),
    cpl: cpl === null ? null : roundMoney(cpl),
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

function groupInsights(rowsToGroup: InsightRow[], keyFn: (row: InsightRow) => string) {
  return rowsToGroup.reduce((groups, row) => {
    const key = keyFn(row) || "unknown";
    groups.set(key, [...(groups.get(key) || []), row]);
    return groups;
  }, new Map<string, InsightRow[]>());
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

  const leadEfficient = creatives
    .filter((creative) => creative.leads >= 2 && creative.cpl !== null)
    .sort((a, b) => (a.cpl || Infinity) - (b.cpl || Infinity))
    .slice(0, 3);

  for (const creative of leadEfficient) {
    messages.push(
      `${creative.name} has the strongest lead efficiency at ${formatMetric(creative.cpl, "money")} CPL.`,
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
