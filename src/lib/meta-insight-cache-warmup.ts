import { revalidateTag } from "next/cache.js";
import { subDays } from "date-fns";

import {
  cachedAggregateMetaInsights,
  META_INSIGHT_AGGREGATES_CACHE_TAG,
  normalizeAggregateInput,
  type AggregateInput,
} from "./meta-insight-aggregates.ts";
import {
  normalizeAnalystPeriodCount,
  rollingAnalystPeriods,
  type AnalystPeriodCount,
} from "./analyst-periods.ts";

export type MetaInsightCacheWarmupResult = {
  requested: number;
  fulfilled: number;
  rejected: number;
};

export async function revalidateAndWarmMetaInsightAggregateCache() {
  revalidateTag(META_INSIGHT_AGGREGATES_CACHE_TAG, { expire: 0 });
  return warmMetaInsightAggregateCache();
}

export async function warmMetaInsightAggregateCache(
  input: { now?: Date; days?: number; periodCount?: AnalystPeriodCount } = {},
): Promise<MetaInsightCacheWarmupResult> {
  const warmupInputs = buildMetaInsightAggregateWarmupInputs(input);
  const results = await Promise.allSettled(
    warmupInputs.map((warmupInput) => cachedAggregateMetaInsights(warmupInput)),
  );

  return {
    requested: warmupInputs.length,
    fulfilled: results.filter((result) => result.status === "fulfilled").length,
    rejected: results.filter((result) => result.status === "rejected").length,
  };
}

export function buildMetaInsightAggregateWarmupInputs(
  input: { now?: Date; days?: number; periodCount?: AnalystPeriodCount } = {},
): AggregateInput[] {
  const days = normalizeDays(input.days);
  const now = input.now ?? new Date();
  const end = toDateString(now);
  const start = toDateString(subDays(now, days - 1));
  const current = { start, end, days };
  const priorEnd = toDateString(subDays(parseDate(start), 1));
  const priorStart = toDateString(subDays(parseDate(priorEnd), days - 1));
  const prior = { start: priorStart, end: priorEnd, days };
  const periods = rollingAnalystPeriods(
    current,
    normalizeAnalystPeriodCount(input.periodCount),
  );

  return uniqueAggregateInputs([
    ...dashboardAggregateInputs(current),
    ...priorDashboardAggregateInputs(prior),
    ...periodAggregateInputs(periods),
  ]);
}

function dashboardAggregateInputs(range: { start: string; end: string; days: number }): AggregateInput[] {
  return [
    aggregateInput(range, [], "spend", "desc", 1),
    aggregateInput(range, ["brand"], "spend", "desc", 100),
    aggregateInput(range, ["campaign_umbrella"], "spend", "desc", 100),
    aggregateInput(range, ["campaign"], "spend", "desc", 5000),
    aggregateInput(range, ["date", "brand", "campaign_umbrella"], "date", "asc", 10000),
    aggregateInput(range, ["date"], "date", "asc", range.days + 5),
  ];
}

function priorDashboardAggregateInputs(range: { start: string; end: string; days: number }): AggregateInput[] {
  return [
    aggregateInput(range, [], "spend", "desc", 1),
    aggregateInput(range, ["brand"], "spend", "desc", 100),
    aggregateInput(range, ["campaign_umbrella"], "spend", "desc", 100),
    aggregateInput(range, ["campaign"], "spend", "desc", 5000),
    aggregateInput(range, ["date", "brand", "campaign_umbrella"], "date", "asc", 10000),
  ];
}

function periodAggregateInputs(
  periods: Array<{ start: string; end: string }>,
): AggregateInput[] {
  return periods.flatMap((period) => [
    aggregateInput(period, ["campaign_umbrella"], "spend", "desc", 100),
    aggregateInput(period, ["campaign"], "spend", "desc", 5000),
  ]);
}

function aggregateInput(
  range: { start: string; end: string },
  dimensions: AggregateInput["dimensions"],
  sortField: string,
  sortDirection: "asc" | "desc",
  limit: number,
): AggregateInput {
  return {
    start: range.start,
    end: range.end,
    dimensions,
    filters: [],
    sortField,
    sortDirection,
    limit,
  };
}

function uniqueAggregateInputs(inputs: AggregateInput[]) {
  const seen = new Set<string>();
  return inputs.filter((input) => {
    const normalized = normalizeAggregateInput(input);
    const key = JSON.stringify(normalized);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function normalizeDays(days: number | null | undefined) {
  return Number.isFinite(days) && Number(days) > 0 ? Math.floor(Number(days)) : 30;
}

function parseDate(value: string) {
  return new Date(`${value}T00:00:00Z`);
}

function toDateString(value: Date) {
  return value.toISOString().slice(0, 10);
}
