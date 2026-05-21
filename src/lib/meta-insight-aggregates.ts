import { unstable_cache } from "next/cache.js";

import { createAdsAnalystClient } from "./ads-analyst-db.ts";

export type MetaInsightDimension =
  | "date"
  | "week"
  | "month"
  | "quarter"
  | "brand"
  | "campaign_umbrella"
  | "campaign"
  | "ad_set"
  | "ad"
  | "creative";

export type MetaInsightFilter = {
  field:
    | "search"
    | "brand"
    | "campaign_umbrella"
    | "campaign"
    | "ad_set"
    | "ad"
    | "creative"
    | "delivery_status";
  operator: "contains" | "equals";
  value: string;
};

export type MetaInsightAggregateRow = {
  date: string | null;
  week: string | null;
  month: string | null;
  quarter: string | null;
  brand: string | null;
  campaign_umbrella: string | null;
  campaign: string | null;
  campaign_id: string | null;
  ad_set: string | null;
  ad_set_id: string | null;
  ad: string | null;
  ad_id: string | null;
  creative: string | null;
  creative_id: string | null;
  spend: number;
  monthly_budget: number;
  impressions: number;
  reach: number;
  clicks: number;
  leads: number;
  bookings: number;
  conversions: number;
  website_bookings: number;
  messaging_contacts: number;
  new_messaging_contacts: number;
  primary_results: number;
  secondary_results: number;
  ctr: number;
  cpm: number;
  cpc: number;
  cpl: number | null;
  frequency: number;
  source_rows: number;
};

export type AggregateInput = {
  start: string;
  end: string;
  dimensions: MetaInsightDimension[];
  filters?: MetaInsightFilter[];
  sortField?: string;
  sortDirection?: "asc" | "desc";
  limit?: number;
};

export async function aggregateMetaInsights(input: AggregateInput) {
  return aggregateMetaInsightsUncached(normalizeAggregateInput(input));
}

export const META_INSIGHT_AGGREGATES_CACHE_TAG = "meta-insight-aggregates";
export const META_INSIGHT_AGGREGATES_REVALIDATE_SECONDS = 60;

export async function cachedAggregateMetaInsights(input: AggregateInput) {
  return cachedAggregateMetaInsightsImpl(normalizeAggregateInput(input));
}

type NormalizedAggregateInput = {
  start: string;
  end: string;
  dimensions: MetaInsightDimension[];
  filters: MetaInsightFilter[];
  sortField: string;
  sortDirection: "asc" | "desc";
  limit: number;
};

const cachedAggregateMetaInsightsImpl = unstable_cache(
  async (input: NormalizedAggregateInput) => aggregateMetaInsightsUncached(input),
  ["meta-insight-aggregates-v1"],
  {
    revalidate: META_INSIGHT_AGGREGATES_REVALIDATE_SECONDS,
    tags: [META_INSIGHT_AGGREGATES_CACHE_TAG],
  },
);

async function aggregateMetaInsightsUncached(input: NormalizedAggregateInput) {
  const supabase = createAdsAnalystClient("web") as unknown as {
    rpc: (
      name: string,
      args: Record<string, unknown>,
    ) => Promise<{ data: Record<string, unknown>[] | null; error: Error | null }>;
  };
  const { data, error } = await supabase.rpc("aggregate_meta_daily_insights", {
    p_start: input.start,
    p_end: input.end,
    p_dimensions: input.dimensions,
    p_filters: input.filters,
    p_sort_field: input.sortField,
    p_sort_direction: input.sortDirection,
    p_limit: input.limit,
  });

  if (error) throw error;
  return rows(data).map(mapAggregateRow);
}

export function normalizeAggregateInput(input: AggregateInput): NormalizedAggregateInput {
  return {
    start: input.start,
    end: input.end,
    dimensions: [...input.dimensions],
    filters: [...(input.filters || [])].sort(compareFilters),
    sortField: input.sortField || "spend",
    sortDirection: input.sortDirection || "desc",
    limit: input.limit || 100,
  };
}

function compareFilters(a: MetaInsightFilter, b: MetaInsightFilter) {
  return `${a.field}\0${a.operator}\0${a.value}`.localeCompare(
    `${b.field}\0${b.operator}\0${b.value}`,
  );
}

export function mapAggregateRow(row: Record<string, unknown>): MetaInsightAggregateRow {
  return {
    date: stringOrNull(row.date),
    week: stringOrNull(row.week),
    month: stringOrNull(row.month),
    quarter: stringOrNull(row.quarter),
    brand: stringOrNull(row.brand),
    campaign_umbrella: stringOrNull(row.campaign_umbrella),
    campaign: stringOrNull(row.campaign),
    campaign_id: stringOrNull(row.campaign_id),
    ad_set: stringOrNull(row.ad_set),
    ad_set_id: stringOrNull(row.ad_set_id),
    ad: stringOrNull(row.ad),
    ad_id: stringOrNull(row.ad_id),
    creative: stringOrNull(row.creative),
    creative_id: stringOrNull(row.creative_id),
    spend: numberValue(row.spend),
    monthly_budget: numberValue(row.monthly_budget),
    impressions: numberValue(row.impressions),
    reach: numberValue(row.reach),
    clicks: numberValue(row.clicks),
    leads: numberValue(row.leads),
    bookings: numberValue(row.bookings),
    conversions: numberValue(row.conversions),
    website_bookings: numberValue(row.website_bookings),
    messaging_contacts: numberValue(row.messaging_contacts),
    new_messaging_contacts: numberValue(row.new_messaging_contacts),
    primary_results: numberValue(row.primary_results),
    secondary_results: numberValue(row.secondary_results),
    ctr: numberValue(row.ctr),
    cpm: numberValue(row.cpm),
    cpc: numberValue(row.cpc),
    cpl: row.cpl === null || row.cpl === undefined ? null : numberValue(row.cpl),
    frequency: numberValue(row.frequency),
    source_rows: numberValue(row.source_rows),
  };
}

function rows(data: unknown): Record<string, unknown>[] {
  return Array.isArray(data) ? (data as Record<string, unknown>[]) : [];
}

function stringOrNull(value: unknown) {
  if (typeof value === "string" && value.length) return value;
  if (typeof value === "number") return String(value);
  return null;
}

function numberValue(value: unknown) {
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  if (typeof value === "string" && value.length) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}
