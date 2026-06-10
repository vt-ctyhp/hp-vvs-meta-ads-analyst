import { createAdsAnalystClient } from "./ads-analyst-db.ts";
import {
  auditRangeForTimeframe,
  buildAuditPeriods,
  buildAuditSentence,
  buildAuditTotals,
  classifyAuditStatus,
  isDateString,
  mondayOf,
  periodBounds,
  type AuditPeriod,
  type AuditRange,
  type AuditStatus,
  type AuditTimeframe,
  type AuditTotals,
} from "./financial-audit.ts";
import {
  cachedAggregateMetaInsights,
  type MetaInsightAggregateRow,
  type MetaInsightDimension,
} from "./meta-insight-aggregates.ts";

export type AuditCampaignRow = {
  campaignId: string;
  campaign: string;
  spend: number;
  budget: number;
  variance: number;
  status: AuditStatus;
};

export type FinancialAuditPayload = {
  timeframe: AuditTimeframe;
  range: AuditRange;
  latestSyncedDate: string;
  sentence: string;
  periods: AuditPeriod[];
  totals: AuditTotals;
  /** Campaign breakdown for the in-progress period (the last row of `periods`). */
  currentPeriod: AuditPeriod | null;
  campaigns: AuditCampaignRow[];
};

const TIMEFRAME_DIMENSION: Record<AuditTimeframe, MetaInsightDimension> = {
  daily: "date",
  weekly: "week",
  monthly: "month",
};

export async function loadFinancialAudit(
  timeframe: AuditTimeframe,
): Promise<FinancialAuditPayload | null> {
  const latestSyncedDate = await fetchLatestSyncedInsightDate();
  if (!latestSyncedDate) return null;

  const range = auditRangeForTimeframe(timeframe, latestSyncedDate);
  const dimension = TIMEFRAME_DIMENSION[timeframe];

  const currentKey =
    timeframe === "monthly"
      ? latestSyncedDate.slice(0, 7)
      : timeframe === "weekly"
        ? mondayOf(latestSyncedDate)
        : latestSyncedDate;
  const currentBounds = periodBounds(timeframe, currentKey);
  const currentStart = currentBounds.start > range.start ? currentBounds.start : range.start;

  const [periodRows, campaignRows] = await Promise.all([
    cachedAggregateMetaInsights({
      start: range.start,
      end: range.end,
      dimensions: [dimension],
      sortField: dimension,
      sortDirection: "asc",
      limit: 400,
    }),
    cachedAggregateMetaInsights({
      start: currentStart,
      end: range.end,
      dimensions: ["campaign"],
      sortField: "spend",
      sortDirection: "desc",
      limit: 50,
    }),
  ]);

  const periods = buildAuditPeriods(
    timeframe,
    range,
    periodRows.map((row) => ({
      periodKey: periodKeyFromRow(row, timeframe) ?? "",
      spend: row.spend,
      dailyBudget: row.daily_budget,
    })),
  );
  const totals = buildAuditTotals(periods);
  const currentPeriod = periods[periods.length - 1] ?? null;
  const currentDays = currentPeriod?.daysCovered ?? 0;

  return {
    timeframe,
    range,
    latestSyncedDate,
    sentence: buildAuditSentence(timeframe, totals),
    periods,
    totals,
    currentPeriod,
    campaigns: campaignRows
      .filter((row) => row.spend > 0 || row.daily_budget > 0)
      .map((row) => {
        const budget = Math.round(row.daily_budget * currentDays * 100) / 100;
        const variance = Math.round((row.spend - budget) * 100) / 100;
        return {
          campaignId: row.campaign_id ?? "unknown",
          campaign: row.campaign ?? "Unknown campaign",
          spend: row.spend,
          budget,
          variance,
          status: classifyAuditStatus(row.spend, budget),
        };
      }),
  };
}

function periodKeyFromRow(row: MetaInsightAggregateRow, timeframe: AuditTimeframe) {
  if (timeframe === "daily") return row.date;
  if (timeframe === "weekly") return row.week;
  return row.month;
}

async function fetchLatestSyncedInsightDate(): Promise<string | null> {
  const supabase = createAdsAnalystClient("web");
  const response = await supabase
    .from("meta_daily_insights")
    .select("date_start")
    .order("date_start", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (response.error) throw response.error;
  const value = (response.data as { date_start?: unknown } | null)?.date_start;
  return isDateString(value) ? value : null;
}
