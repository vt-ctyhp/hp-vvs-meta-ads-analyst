/**
 * Read-only query tools for the agentic Ask AI Workbench (Phase 1).
 *
 * These are the only data surfaces the answer agent may call. They are
 * deliberately narrow and guarded (validated params, row + date-range caps)
 * instead of free-form SQL, so the model can look up real data for any
 * question while every returned number stays traceable to a query result.
 *
 *   - {@link queryPerformance} wraps the `aggregate_meta_daily_insights` RPC
 *     (spend / impressions / messaging / CTR ... over time and by group/creative).
 *   - {@link queryEntities} reads current state from the four entity tables
 *     (`meta_campaigns` / `meta_ad_sets` / `meta_ads` / `meta_creatives`):
 *     delivery status, name, budget, thumbnail. This is what "are these ads on
 *     or off?" actually needs — it does not depend on a performance date window.
 *
 * Both tools take their data access as an injected dependency so the pure
 * validation / shaping / grounding logic can be unit-tested without Supabase.
 */
import {
  WORKBENCH_DIMENSIONS,
  WORKBENCH_FILTERS,
  ANALYSIS_WORKBENCH_SEMANTIC_CATALOG,
} from "./analysis-workbench-semantic-catalog.ts";
import type {
  WorkbenchDimension,
  WorkbenchMetric,
} from "./analysis-workbench-semantic-catalog.ts";
import {
  CAMPAIGN_UMBRELLAS,
  classifyCampaignUmbrella,
  isCampaignUmbrella,
  type CampaignUmbrella,
} from "./campaign-umbrellas.ts";
import type { AnalysisWorkbenchPipelineAggregateRequest } from "./analysis-workbench-pipeline.ts";
import type {
  MetaInsightAggregateRow,
  MetaInsightDimension,
  MetaInsightFilter,
} from "./meta-insight-aggregates.ts";

// ---------------------------------------------------------------------------
// Caps & errors
// ---------------------------------------------------------------------------

export const QUERY_PERFORMANCE_MAX_LIMIT = 200;
export const QUERY_PERFORMANCE_DEFAULT_LIMIT = 50;
export const QUERY_PERFORMANCE_MAX_RANGE_DAYS = 400;
export const QUERY_ENTITIES_MAX_LIMIT = 500;
export const QUERY_ENTITIES_DEFAULT_LIMIT = 500;

/** Thrown for invalid tool input so the agent can read the message and retry. */
export class QueryToolError extends Error {
  code: string;
  constructor(code: string, message: string) {
    super(message);
    this.name = "QueryToolError";
    this.code = code;
  }
}

// ---------------------------------------------------------------------------
// query_performance
// ---------------------------------------------------------------------------

/**
 * Metrics the performance RPC actually returns. The catalog's `*_count`
 * metrics are computed by the deterministic pipeline, not the RPC, so they are
 * excluded here — entity counts come from {@link queryEntities} instead.
 */
const PERFORMANCE_METRICS = new Set<string>([
  "spend",
  "daily_budget",
  "monthly_budget",
  "lifetime_budget",
  "budget_remaining",
  "impressions",
  "reach",
  "clicks",
  "leads",
  "bookings",
  "conversions",
  "website_bookings",
  "messaging_contacts",
  "new_messaging_contacts",
  "primary_results",
  "secondary_results",
  "ctr",
  "cpm",
  "cpc",
  "cpl",
  "frequency",
]);

const SUPPORTED_FILTER_VALUES = ANALYSIS_WORKBENCH_SEMANTIC_CATALOG.supportedFilterValues;

export type QueryPerformanceFilter = {
  field: string;
  operator?: "contains" | "equals";
  value: string;
};

export type QueryPerformanceParams = {
  start: string;
  end: string;
  metrics: string[];
  dimensions?: string[];
  filters?: QueryPerformanceFilter[];
  sortField?: string;
  sortDirection?: "asc" | "desc";
  limit?: number;
};

export type QueryPerformanceRow = Record<string, string | number | null>;

export type QueryPerformanceResult = {
  rows: QueryPerformanceRow[];
  rowCount: number;
  metrics: string[];
  dimensions: string[];
  request: AnalysisWorkbenchPipelineAggregateRequest;
  summary: string;
};

export type QueryPerformanceDeps = {
  executeAggregate: (
    request: AnalysisWorkbenchPipelineAggregateRequest,
  ) => Promise<MetaInsightAggregateRow[]>;
};

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

function parseDate(value: string, label: string): number {
  if (!DATE_PATTERN.test(value)) {
    throw new QueryToolError("invalid_date", `${label} must be an ISO date (YYYY-MM-DD); got "${value}".`);
  }
  const time = Date.parse(`${value}T00:00:00.000Z`);
  if (!Number.isFinite(time)) {
    throw new QueryToolError("invalid_date", `${label} is not a valid date: "${value}".`);
  }
  return time;
}

function toIsoDate(time: number): string {
  return new Date(time).toISOString().slice(0, 10);
}

export async function queryPerformance(
  params: QueryPerformanceParams,
  deps: QueryPerformanceDeps,
): Promise<QueryPerformanceResult> {
  const metrics = params.metrics ?? [];
  if (!metrics.length) {
    throw new QueryToolError("missing_metrics", "query_performance requires at least one metric.");
  }
  for (const metric of metrics) {
    if (!PERFORMANCE_METRICS.has(metric)) {
      throw new QueryToolError(
        "invalid_metric",
        `Metric "${metric}" is not available. Valid metrics: ${[...PERFORMANCE_METRICS].join(", ")}.`,
      );
    }
  }

  const dimensions = params.dimensions ?? [];
  for (const dimension of dimensions) {
    if (!WORKBENCH_DIMENSIONS.includes(dimension as WorkbenchDimension)) {
      throw new QueryToolError(
        "invalid_dimension",
        `Dimension "${dimension}" is not available. Valid dimensions: ${WORKBENCH_DIMENSIONS.join(", ")}.`,
      );
    }
  }

  const filters = (params.filters ?? []).map(validatePerformanceFilter);

  const sortField = params.sortField ?? metrics[0];
  if (
    !PERFORMANCE_METRICS.has(sortField) &&
    !WORKBENCH_DIMENSIONS.includes(sortField as WorkbenchDimension)
  ) {
    throw new QueryToolError(
      "invalid_sort_field",
      `sortField "${sortField}" must be a requested metric or a valid dimension.`,
    );
  }

  // Caps: clamp the limit and the date range.
  const limit = clampLimit(params.limit, QUERY_PERFORMANCE_DEFAULT_LIMIT, QUERY_PERFORMANCE_MAX_LIMIT);
  const endTime = parseDate(params.end, "end");
  let startTime = parseDate(params.start, "start");
  if (startTime > endTime) {
    throw new QueryToolError("invalid_range", `start (${params.start}) must not be after end (${params.end}).`);
  }
  const maxSpan = (QUERY_PERFORMANCE_MAX_RANGE_DAYS - 1) * 86_400_000;
  if (endTime - startTime > maxSpan) {
    startTime = endTime - maxSpan;
  }

  const request: AnalysisWorkbenchPipelineAggregateRequest = {
    start: toIsoDate(startTime),
    end: toIsoDate(endTime),
    dimensions: dimensions as MetaInsightDimension[],
    metrics: metrics as WorkbenchMetric[],
    filters,
    sortField: sortField as WorkbenchMetric | WorkbenchDimension,
    sortDirection: params.sortDirection ?? "desc",
    limit,
  };

  const rawRows = await deps.executeAggregate(request);
  const rows = rawRows.map((row) => projectRow(row, dimensions, metrics));

  return {
    rows,
    rowCount: rows.length,
    metrics,
    dimensions,
    request,
    summary: summarizePerformance(request, rows),
  };
}

function validatePerformanceFilter(filter: QueryPerformanceFilter): MetaInsightFilter {
  const field = filter.field;
  if (!WORKBENCH_FILTERS.includes(field as (typeof WORKBENCH_FILTERS)[number])) {
    throw new QueryToolError(
      "invalid_filter_field",
      `Filter field "${field}" is not available. Valid fields: ${WORKBENCH_FILTERS.join(", ")}.`,
    );
  }
  const operator = filter.operator ?? "equals";
  if (operator !== "equals" && operator !== "contains") {
    throw new QueryToolError("invalid_filter_operator", `Filter operator "${operator}" must be "equals" or "contains".`);
  }
  const value = filter.value?.trim() ?? "";
  if (!value) {
    throw new QueryToolError("invalid_filter_value", `Filter "${field}" requires a non-empty value.`);
  }

  const allowed = (SUPPORTED_FILTER_VALUES as Record<string, readonly string[]>)[field];
  if (allowed && operator === "equals" && !allowed.includes(value)) {
    throw new QueryToolError(
      "invalid_filter_value",
      `Filter "${field}" value "${value}" is not supported. Allowed: ${allowed.join(", ")}.`,
    );
  }

  return { field: field as MetaInsightFilter["field"], operator, value };
}

function projectRow(
  row: MetaInsightAggregateRow,
  dimensions: string[],
  metrics: string[],
): QueryPerformanceRow {
  const projected: QueryPerformanceRow = {};
  for (const dimension of dimensions) {
    projected[dimension] = (row as Record<string, unknown>)[dimension] as string | null;
  }
  for (const metric of metrics) {
    projected[metric] = (row as Record<string, unknown>)[metric] as number | null;
  }
  return projected;
}

function summarizePerformance(
  request: AnalysisWorkbenchPipelineAggregateRequest,
  rows: QueryPerformanceRow[],
): string {
  const by = request.dimensions.length ? ` by ${request.dimensions.join(", ")}` : "";
  return `query_performance ${request.metrics.join(", ")}${by} from ${request.start} to ${request.end}: ${rows.length} row${rows.length === 1 ? "" : "s"}.`;
}

// ---------------------------------------------------------------------------
// query_entities
// ---------------------------------------------------------------------------

export const ENTITY_TYPES = ["campaign", "ad_set", "ad", "creative"] as const;
export type EntityType = (typeof ENTITY_TYPES)[number];

export type EntityDeliveryStatus = "live" | "paused" | "off";

/**
 * Pre-joined entity record supplied by the production fetcher. Status fields
 * are the raw Meta values; `campaignName`/`adSetName` carry parent context so
 * the umbrella classifier can run on any entity level.
 */
export type RawEntityRow = {
  entityType: EntityType;
  id: string;
  name: string | null;
  status: string | null;
  effectiveStatus: string | null;
  campaignName?: string | null;
  adSetName?: string | null;
  brandCode?: string | null;
  dailyBudget?: number | null;
  lifetimeBudget?: number | null;
  thumbnailUrl?: string | null;
};

export type QueryEntitiesFilters = {
  brand?: string;
  campaignUmbrella?: string;
  status?: EntityDeliveryStatus;
  nameContains?: string;
};

export type QueryEntitiesParams = {
  entityType: EntityType;
  filters?: QueryEntitiesFilters;
  limit?: number;
};

export type EntityRosterRow = {
  entityType: EntityType;
  id: string;
  name: string | null;
  status: EntityDeliveryStatus;
  statusRaw: string | null;
  campaignUmbrella: CampaignUmbrella;
  brand: string | null;
  dailyBudget: number | null;
  lifetimeBudget: number | null;
  thumbnailUrl: string | null;
  campaignName: string | null;
  adSetName: string | null;
};

export type EntityStatusBreakdown = { live: number; paused: number; off: number };

export type QueryEntitiesResult = {
  rows: EntityRosterRow[];
  rowCount: number;
  totalBeforeLimit: number;
  appliedLimit: number;
  statusBreakdown: EntityStatusBreakdown;
  summary: string;
};

export type QueryEntitiesDeps = {
  fetchEntities: (input: { entityType: EntityType }) => Promise<RawEntityRow[]>;
};

export async function queryEntities(
  params: QueryEntitiesParams,
  deps: QueryEntitiesDeps,
): Promise<QueryEntitiesResult> {
  if (!ENTITY_TYPES.includes(params.entityType)) {
    throw new QueryToolError(
      "invalid_entity_type",
      `entityType "${params.entityType}" must be one of: ${ENTITY_TYPES.join(", ")}.`,
    );
  }

  const filters = params.filters ?? {};
  if (filters.campaignUmbrella && !isCampaignUmbrella(filters.campaignUmbrella)) {
    throw new QueryToolError(
      "invalid_filter_value",
      `campaignUmbrella "${filters.campaignUmbrella}" must be one of: ${CAMPAIGN_UMBRELLAS.join(", ")}.`,
    );
  }
  if (filters.status && !["live", "paused", "off"].includes(filters.status)) {
    throw new QueryToolError("invalid_filter_value", `status "${filters.status}" must be live, paused, or off.`);
  }

  const appliedLimit = clampLimit(params.limit, QUERY_ENTITIES_DEFAULT_LIMIT, QUERY_ENTITIES_MAX_LIMIT);
  const rawRows = await deps.fetchEntities({ entityType: params.entityType });

  const nameNeedle = filters.nameContains?.trim().toLowerCase() ?? null;
  const brandNeedle = filters.brand?.trim().toLowerCase() ?? null;

  const filtered = rawRows
    .map((row) => toRosterRow(row, params.entityType))
    .filter((row) => {
      if (filters.status && row.status !== filters.status) return false;
      if (filters.campaignUmbrella && row.campaignUmbrella !== filters.campaignUmbrella) return false;
      if (brandNeedle && (row.brand ?? "").toLowerCase() !== brandNeedle) return false;
      if (nameNeedle && !(row.name ?? "").toLowerCase().includes(nameNeedle)) return false;
      return true;
    });

  const statusBreakdown = filtered.reduce<EntityStatusBreakdown>(
    (acc, row) => {
      acc[row.status] += 1;
      return acc;
    },
    { live: 0, paused: 0, off: 0 },
  );

  const rows = filtered.slice(0, appliedLimit);

  return {
    rows,
    rowCount: rows.length,
    totalBeforeLimit: filtered.length,
    appliedLimit,
    statusBreakdown,
    summary: summarizeEntities(params.entityType, filtered.length, statusBreakdown),
  };
}

function toRosterRow(row: RawEntityRow, entityType: EntityType): EntityRosterRow {
  const campaignName =
    row.campaignName ?? (entityType === "campaign" ? row.name : null) ?? null;
  const adSetName = row.adSetName ?? (entityType === "ad_set" ? row.name : null) ?? null;
  const classification = classifyCampaignUmbrella({ campaignName, adSetName });
  const statusRaw = firstNonEmpty(row.effectiveStatus, row.status);

  return {
    entityType,
    id: row.id,
    name: row.name ?? null,
    status: deriveDeliveryStatus(statusRaw),
    statusRaw,
    campaignUmbrella: classification.umbrella,
    brand: row.brandCode ?? null,
    dailyBudget: row.dailyBudget ?? null,
    lifetimeBudget: row.lifetimeBudget ?? null,
    thumbnailUrl: row.thumbnailUrl ?? null,
    campaignName,
    adSetName,
  };
}

/**
 * Mirrors the SQL `delivery_status` in `aggregate_meta_daily_insights`: exact
 * ACTIVE → live, exact PAUSED → paused, anything else → off.
 */
export function deriveDeliveryStatus(raw: string | null): EntityDeliveryStatus {
  const value = (raw ?? "").trim().toUpperCase();
  if (value === "ACTIVE") return "live";
  if (value === "PAUSED") return "paused";
  return "off";
}

function firstNonEmpty(...values: Array<string | null | undefined>): string | null {
  for (const value of values) {
    if (typeof value === "string" && value.trim().length) return value;
  }
  return null;
}

function summarizeEntities(
  entityType: EntityType,
  total: number,
  breakdown: EntityStatusBreakdown,
): string {
  return `query_entities ${entityType}: ${total} matched (${breakdown.live} live, ${breakdown.paused} paused, ${breakdown.off} off).`;
}

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

function clampLimit(value: number | undefined, fallback: number, max: number): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) return Math.min(fallback, max);
  return Math.min(Math.floor(value), max);
}

// ---------------------------------------------------------------------------
// Schema description (Unit 3) — embedded in the agent system prompt so the
// model knows what data exists without guessing.
// ---------------------------------------------------------------------------

export const QUERY_TOOLS_SCHEMA_DESCRIPTION = `Two read-only query tools are available. Numbers in your answer must come from their results.

TOOL query_performance — time-series & breakdowns over the Meta Ads daily performance table (RPC aggregate_meta_daily_insights).
  metrics (one or more): ${[...PERFORMANCE_METRICS].join(", ")}
  dimensions (zero or more, group by): ${WORKBENCH_DIMENSIONS.join(", ")}
  filters: field one of ${WORKBENCH_FILTERS.join(", ")}; operator "equals" or "contains".
    Allowed equals-values: brand ∈ {${SUPPORTED_FILTER_VALUES.brand.join(", ")}}; campaign_umbrella ∈ {${SUPPORTED_FILTER_VALUES.campaign_umbrella.join(", ")}}; delivery_status ∈ {${SUPPORTED_FILTER_VALUES.delivery_status.join(", ")}}.
  start/end are ISO dates; the range is capped at ${QUERY_PERFORMANCE_MAX_RANGE_DAYS} days and results at ${QUERY_PERFORMANCE_MAX_LIMIT} rows.
  Use this for spend, impressions, messaging contacts, CTR, budgets, trends, and per-group/creative comparisons. Only rows with insight activity in the date window appear.

TOOL query_entities — CURRENT state of advertising objects, independent of any date window. Reads meta_campaigns / meta_ad_sets / meta_ads / meta_creatives.
  entityType: ${ENTITY_TYPES.join(", ")}.
  Each row returns: id, name, status (live | paused | off), campaignUmbrella, brand, dailyBudget, lifetimeBudget, thumbnailUrl.
  status is derived from Meta delivery state: ACTIVE → live, PAUSED → paused, otherwise off.
  campaignUmbrella ∈ {${CAMPAIGN_UMBRELLAS.join(", ")}}.
  filters: brand, campaignUmbrella, status (live | paused | off), nameContains. Results capped at ${QUERY_ENTITIES_MAX_LIMIT} rows.
  Use this for "is it on or off?", rosters, counts of campaigns/ads, budgets, and which creatives exist — questions about state, not performance over time.`;
