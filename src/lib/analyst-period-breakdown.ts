import type { AnalystPeriodWindow } from "./analyst-periods.ts";
import { isCampaignUmbrella } from "./campaign-umbrellas.ts";
import type { MetaInsightAggregateRow } from "./meta-insight-aggregates.ts";
import type { PeriodMetric } from "./period-pivot-data.ts";

export type AnalystPeriodMetricValues = Record<PeriodMetric, number>;

export type AnalystPeriodEntityValues = Record<
  string,
  Record<string, AnalystPeriodMetricValues>
>;

export type AnalystPeriodBreakdown = {
  periods: AnalystPeriodWindow[];
  byUmbrella: AnalystPeriodEntityValues;
  campaigns: AnalystPeriodEntityValues;
  adSets: AnalystPeriodEntityValues;
  creatives: AnalystPeriodEntityValues;
};

export type AnalystPeriodAggregateBucket = {
  period: AnalystPeriodWindow;
  byUmbrellaRows: MetaInsightAggregateRow[];
  campaignRows: MetaInsightAggregateRow[];
  adSetRows: MetaInsightAggregateRow[];
  creativeRows: MetaInsightAggregateRow[];
};

export function buildAnalystPeriodBreakdown(
  buckets: AnalystPeriodAggregateBucket[],
): AnalystPeriodBreakdown {
  const breakdown: AnalystPeriodBreakdown = {
    periods: buckets.map((bucket) => bucket.period),
    byUmbrella: {},
    campaigns: {},
    adSets: {},
    creatives: {},
  };

  for (const bucket of buckets) {
    addPeriodRows(
      breakdown.byUmbrella,
      bucket.period,
      bucket.byUmbrellaRows,
      (row) => normalizeUmbrella(row.campaign_umbrella),
    );
    addPeriodRows(
      breakdown.campaigns,
      bucket.period,
      bucket.campaignRows,
      (row) => row.campaign_id || "unknown",
    );
    addPeriodRows(
      breakdown.adSets,
      bucket.period,
      bucket.adSetRows,
      (row) => row.ad_set_id || "unknown",
    );
    addPeriodRows(
      breakdown.creatives,
      bucket.period,
      bucket.creativeRows,
      (row) => row.creative_id || "unknown",
    );
  }

  return breakdown;
}

type PeriodTotals = {
  spend: number;
  impressions: number;
  clicks: number;
  primaryResults: number;
};

function addPeriodRows(
  target: AnalystPeriodEntityValues,
  period: AnalystPeriodWindow,
  rows: MetaInsightAggregateRow[],
  getEntityId: (row: MetaInsightAggregateRow) => string | null,
) {
  const totalsByEntity = new Map<string, PeriodTotals>();

  for (const row of rows) {
    const entityId = getEntityId(row);
    if (!entityId) continue;
    const totals = totalsByEntity.get(entityId) || {
      spend: 0,
      impressions: 0,
      clicks: 0,
      primaryResults: 0,
    };
    totals.spend += row.spend;
    totals.impressions += row.impressions;
    totals.clicks += row.clicks;
    totals.primaryResults += row.primary_results;
    totalsByEntity.set(entityId, totals);
  }

  for (const [entityId, totals] of totalsByEntity.entries()) {
    target[entityId] = target[entityId] || {};
    target[entityId][period.key] = metricValuesFromTotals(totals);
  }
}

function metricValuesFromTotals(totals: PeriodTotals): AnalystPeriodMetricValues {
  return {
    spend: roundMoney(totals.spend),
    primary_results: totals.primaryResults,
    cost_per_primary_results:
      totals.primaryResults > 0 ? roundMoney(totals.spend / totals.primaryResults) : 0,
    ctr:
      totals.impressions > 0
        ? round((totals.clicks / totals.impressions) * 100, 2)
        : 0,
    impressions: totals.impressions,
    cpc: totals.clicks > 0 ? roundMoney(totals.spend / totals.clicks) : 0,
  };
}

function normalizeUmbrella(value: string | null | undefined) {
  return isCampaignUmbrella(value) ? value : "Needs review";
}

function round(value: number, precision = 2): number {
  const factor = 10 ** precision;
  return Math.round(value * factor) / factor;
}

function roundMoney(value: number): number {
  return round(value, 2);
}
