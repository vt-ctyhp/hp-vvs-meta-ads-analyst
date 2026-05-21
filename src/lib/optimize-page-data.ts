import { differenceInCalendarDays, subDays } from "date-fns";

import { isCampaignUmbrella, type CampaignUmbrella } from "./campaign-umbrellas.ts";
import { ConfigurationError, getMissingDashboardEnv } from "./env.ts";
import {
  cachedAggregateMetaInsights as aggregateMetaInsights,
  type MetaInsightAggregateRow,
  type MetaInsightFilter,
} from "./meta-insight-aggregates.ts";
import type { DailyTrendRow, MetricSummary } from "./analytics.ts";

export type OptimizeSummaryInput = {
  days?: number;
  startDate?: string | null;
  endDate?: string | null;
  brand?: string | null;
  group?: string | null;
};

export type OptimizeBrandOption = {
  value: string;
  label: string;
};

export type OptimizeSummaryPayload = {
  configured: boolean;
  missingEnv: string[];
  timeRange: { start: string | null; end: string | null; days: number };
  brandOptions: OptimizeBrandOption[];
  dailyTrend: DailyTrendRow[];
  creativeCount: number;
  winnersCount: number;
  criticalCount: number;
  generatedAt: string;
};

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
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

export function emptyOptimizeSummaryPayload(
  missingEnv = getMissingDashboardEnv(),
): OptimizeSummaryPayload {
  return {
    configured: missingEnv.length === 0,
    missingEnv,
    timeRange: { start: null, end: null, days: 30 },
    brandOptions: [],
    dailyTrend: [],
    creativeCount: 0,
    winnersCount: 0,
    criticalCount: 0,
    generatedAt: new Date().toISOString(),
  };
}

export async function fetchOptimizeSummaryData(
  input: OptimizeSummaryInput = {},
): Promise<OptimizeSummaryPayload> {
  const missingEnv = getMissingDashboardEnv();
  if (missingEnv.length) {
    return emptyOptimizeSummaryPayload(missingEnv);
  }

  try {
    const startedAt = performance.now();
    const dateRange = resolveOptimizeDateRange(input);
    const filters = buildInsightFilters(input);

    const [
      brandRows,
      overviewRows,
      dailyTrendRows,
      creativeRows,
    ] = await Promise.all([
      aggregateMetaInsights({
        start: dateRange.start,
        end: dateRange.end,
        dimensions: ["brand"],
        sortField: "spend",
        sortDirection: "desc",
        limit: 100,
      }),
      aggregateMetaInsights({
        start: dateRange.start,
        end: dateRange.end,
        dimensions: [],
        filters,
        sortField: "spend",
        sortDirection: "desc",
        limit: 1,
      }),
      aggregateMetaInsights({
        start: dateRange.start,
        end: dateRange.end,
        dimensions: ["date", "brand", "campaign_umbrella"],
        filters,
        sortField: "date",
        sortDirection: "asc",
        limit: Math.max(1000, dateRange.days * 100),
      }),
      aggregateMetaInsights({
        start: dateRange.start,
        end: dateRange.end,
        dimensions: ["creative"],
        filters,
        sortField: "spend",
        sortDirection: "desc",
        limit: 5000,
      }),
    ]);

    const summary = buildOptimizeSummaryFromAggregates({
      overviewRows,
      dailyTrendRows,
      creativeRows,
      dateRangeStart: dateRange.start,
    });

    const payload = {
      configured: true,
      missingEnv: [],
      timeRange: dateRange,
      brandOptions: buildBrandOptions(brandRows),
      ...summary,
      generatedAt: new Date().toISOString(),
    };

    console.log("[optimize] summary payload sizes", {
      elapsedMs: Math.round(performance.now() - startedAt),
      brands: payload.brandOptions.length,
      dailyTrend: payload.dailyTrend.length,
      creatives: payload.creativeCount,
      winners: payload.winnersCount,
      critical: payload.criticalCount,
      generatedAt: payload.generatedAt,
    });

    return payload;
  } catch (error) {
    if (error instanceof ConfigurationError) {
      return emptyOptimizeSummaryPayload(error.missing);
    }
    throw error;
  }
}

export function buildOptimizeSummaryFromAggregates({
  overviewRows,
  dailyTrendRows,
  creativeRows,
  dateRangeStart,
}: {
  overviewRows: MetaInsightAggregateRow[];
  dailyTrendRows: MetaInsightAggregateRow[];
  creativeRows: MetaInsightAggregateRow[];
  dateRangeStart: string;
}) {
  const overview = summaryFromAggregate(overviewRows[0]);
  const leanCreatives = creativeRows
    .map((row) => {
      const metrics = summaryFromAggregate(row, resolveUmbrella(row.campaign_umbrella));
      return {
        id: row.creative_id || row.creative || "unknown",
        name: row.creative || row.creative_id || "Unknown creative",
        ...metrics,
        riskLevel: getFatigueRisk(metrics, overview).level,
      };
    })
    .sort((a, b) => b.spend - a.spend);

  const fatigueRisks = leanCreatives
    .filter((creative) => creative.riskLevel === "high" || creative.riskLevel === "medium")
    .sort(
      (a, b) =>
        riskRank(b.riskLevel) - riskRank(a.riskLevel) || b.spend - a.spend,
    )
    .slice(0, 10);

  const underperformers = leanCreatives
    .filter(
      (creative) =>
        creative.spend > overview.spend * 0.03 &&
        creative.ctr < overview.ctr * 0.75,
    )
    .slice(0, 10);

  const winnersCount = leanCreatives
    .filter(
      (creative) =>
        creative.clicks >= 20 &&
        (overview.ctr > 0 ? creative.ctr > overview.ctr * 1.25 : creative.ctr > 0) &&
        creative.primaryResults >= 1,
    )
    .sort((a, b) => b.primaryResults - a.primaryResults || b.ctr - a.ctr)
    .slice(0, 3).length;

  return {
    dailyTrend: dailyTrendRows
      .map((row) => {
        const campaignUmbrella = resolveUmbrella(row.campaign_umbrella);
        const metrics = summaryFromAggregate(row, campaignUmbrella);
        return {
          date: row.date || dateRangeStart,
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
      .sort((a, b) => a.date.localeCompare(b.date)),
    creativeCount: leanCreatives.length,
    winnersCount,
    criticalCount: fatigueRisks.slice(0, 3).length + underperformers.slice(0, 3).length,
  };
}

function buildBrandOptions(rows: MetaInsightAggregateRow[]): OptimizeBrandOption[] {
  return rows
    .map((row) => {
      const brand = row.brand || "Unassigned";
      return { value: brand, label: brand };
    })
    .filter((brand, index, all) => all.findIndex((item) => item.value === brand.value) === index);
}

function buildInsightFilters(input: OptimizeSummaryInput): MetaInsightFilter[] {
  const filters: MetaInsightFilter[] = [];
  if (input.brand && input.brand !== "all") {
    filters.push({ field: "brand", operator: "equals", value: input.brand });
  }
  if (input.group && input.group !== "all") {
    filters.push({
      field: "campaign_umbrella",
      operator: "equals",
      value: input.group,
    });
  }
  return filters;
}

function summaryFromAggregate(
  row?: MetaInsightAggregateRow,
  umbrella?: CampaignUmbrella,
): MetricSummary {
  const profile = getKpiProfile(umbrella);
  return deriveRates({
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
  });
}

function deriveRates(metrics: MetricSummary): MetricSummary {
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

function round(value: number, precision = 2): number {
  const factor = 10 ** precision;
  return Math.round(value * factor) / factor;
}

function roundMoney(value: number): number {
  return round(value, 2);
}

function getKpiProfile(umbrella?: CampaignUmbrella) {
  if (umbrella === "Book Appts US") {
    return {
      primaryResultLabel: "Website Bookings",
      secondaryResultLabel: null,
    };
  }

  if (umbrella === "Facebook US Product" || umbrella === "Facebook VN Product") {
    return {
      primaryResultLabel: "Messaging Contacts",
      secondaryResultLabel: "New Msg Contacts",
    };
  }

  return {
    primaryResultLabel: "Primary Results",
    secondaryResultLabel: null,
  };
}

function resolveUmbrella(value: string | null | undefined): CampaignUmbrella {
  return isCampaignUmbrella(value) ? value : "Needs review";
}

function getFatigueRisk(metrics: MetricSummary, benchmark: MetricSummary) {
  if (metrics.frequency >= 4 && metrics.ctr < benchmark.ctr * 0.8) {
    return { level: "high" as const };
  }

  if (metrics.frequency >= 3 || metrics.ctr < benchmark.ctr * 0.65) {
    return { level: "medium" as const };
  }

  return { level: "low" as const };
}

function riskRank(level?: "low" | "medium" | "high") {
  if (level === "high") return 3;
  if (level === "medium") return 2;
  if (level === "low") return 1;
  return 0;
}

function resolveOptimizeDateRange(input: OptimizeSummaryInput) {
  const today = new Date();
  const fallbackDays = normalizeDays(input.days);
  const fallbackEnd = toDateString(today);
  const fallbackStart = toDateString(subDays(today, fallbackDays - 1));
  let start = normalizeDateString(input.startDate) || fallbackStart;
  let end = normalizeDateString(input.endDate) || fallbackEnd;

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
