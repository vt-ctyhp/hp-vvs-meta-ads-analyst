/**
 * Period-pivot data fetcher for the /optimize tree+pivot table.
 *
 * The first page load only fetches campaign rows. Expanding a campaign asks
 * the API for ad-set rows; expanding an ad set asks for creative rows and
 * their assets. That keeps initial /optimize rendering focused on the rows
 * the operator can see immediately.
 */

import { createAdsAnalystClient } from "./ads-analyst-db.ts";
import { getMissingDashboardEnv } from "./env.ts";
import {
  cachedAggregateMetaInsights as aggregateMetaInsights,
  type MetaInsightAggregateRow,
  type MetaInsightDimension,
  type MetaInsightFilter,
} from "./meta-insight-aggregates.ts";
import {
  lastNPeriods,
  type Frequency,
  type PeriodWindow,
} from "./period-windows.ts";
import {
  pivotByPeriod,
  type PivotedRow,
} from "./pivot-by-period.ts";
import { normalizeOptimizeDeliveryStatus } from "./optimize-filters.ts";

/**
 * Metrics exposed in the trend-mode dropdown. Each maps to a single column
 * we can either pull directly from the RPC row or derive from spend +
 * primary_results. We deliberately stick to metrics that are meaningful for
 * EVERY campaign objective (so a Book-Appts campaign and a Messaging
 * campaign read in the same units, just with different `primary_results`
 * resolutions handled inside the RPC).
 */
export type PeriodMetric =
  | "spend"
  | "primary_results"
  | "cost_per_primary_results"
  | "ctr"
  | "impressions"
  | "cpc";

export const ALLOWED_PERIOD_COUNTS = [1, 4, 8, 12] as const;
export const ALLOWED_PERIOD_METRICS: PeriodMetric[] = [
  "spend",
  "primary_results",
  "cost_per_primary_results",
  "ctr",
  "impressions",
  "cpc",
];

export const PERIOD_METRIC_LABELS: Record<PeriodMetric, string> = {
  spend: "Spend",
  primary_results: "Primary KPI",
  cost_per_primary_results: "$/Primary KPI",
  ctr: "CTR",
  impressions: "Impressions",
  cpc: "CPC",
};

export type TreeLevel = "campaign" | "ad_set" | "creative";

export type PeriodPivotInput = {
  /** Anchor `now`. Defaults to current time at call site. */
  now?: Date;
  /** 1, 4, 8, or 12. Validated by lastNPeriods. */
  periodCount: number;
  /** Day, Week (Mon-Sun ISO), Month, Quarter. */
  frequency: Frequency;
  /** Which metric the pivot cells render. */
  metric: PeriodMetric;
  /** Optional brand filter — `null` means all brands. */
  brand?: string | null;
  /** Optional campaign-umbrella ("group") filter — `null` means all groups. */
  group?: string | null;
  /** Optional delivery-status filter — `null` means all statuses. */
  status?: string | null;
  /** Optional page-level date range start. */
  startDate?: string | null;
  /** Optional page-level date range end. */
  endDate?: string | null;
};

export type PeriodPivotQuery = {
  anchor: string;
  periodCount: number;
  frequency: Frequency;
  metric: PeriodMetric;
  brand: string | null;
  group: string | null;
  status: string | null;
  start: string;
  end: string;
};

export type PeriodPivotParentLevel = "campaign" | "ad_set";

export type PeriodPivotChildrenInput = PeriodPivotInput & {
  parentLevel: PeriodPivotParentLevel;
  parentId: string;
};

export type CreativeAsset = {
  creativeId: string;
  name: string | null;
  title: string | null;
  /**
   * Permanent ~150px thumbnail URL backed by Supabase Storage. Tree-table
   * cell prefers this — never expires. Stamped by /api/cron/cache-thumbnails.
   */
  supabaseThumbnailUrl: string | null;
  /**
   * Permanent full-resolution image URL backed by Supabase Storage. Drawer
   * preview prefers this so the larger render stays sharp instead of
   * pixelating a 150px thumb. Stamped by the same cron job.
   */
  supabaseImageUrl: string | null;
  thumbnailUrl: string | null;
  imageUrl: string | null;
  videoThumbnailUrl: string | null;
  previewUrl: string | null;
};

/**
 * In snapshot mode (`periodCount === 1`) the tree-table renders one column
 * per metric instead of one column per period. We carry the full metric
 * breakdown per entity so the table doesn't have to re-fetch.
 *
 * Spend, Primary KPI, $/Primary KPI, and CTR are the four canonical
 * snapshot columns per PRD §6. The remaining metrics are included so
 * future column toggles can read them without another round-trip.
 */
export type SnapshotMetrics = Record<PeriodMetric, number>;

export type PeriodPivotPayload = {
  configured: boolean;
  missingEnv: string[];
  periods: PeriodWindow[];
  metric: PeriodMetric;
  query: PeriodPivotQuery | null;
  /** Top of the tree. */
  campaigns: PivotedRow[];
  /** Optional eager children. Lazy /optimize payloads leave this empty. */
  adSets: PivotedRow[];
  /** Optional eager grandchildren. Lazy /optimize payloads leave this empty. */
  creatives: PivotedRow[];
  /**
   * Creative metadata keyed by creative_id. Tree-table uses this to swap
   * the cryptic creative_id for the real creative name + thumbnail. Lazy
   * payloads only populate this when creative children are fetched.
   */
  creativeAssets: Record<string, CreativeAsset>;
  /**
   * Populated only when `periodCount === 1` — keyed by entityId
   * (campaign_id at the top level, ad_set_id or creative_id at children).
   * Tree-table reads this in snapshot mode to render multiple metric
   * columns; in multi-period mode it is `{}` and tree-table reads
   * `periodValues` instead.
   */
  snapshotByEntity: Record<string, SnapshotMetrics>;
};

export type PeriodPivotChildrenPayload = {
  configured: boolean;
  missingEnv: string[];
  parentLevel: PeriodPivotParentLevel;
  parentId: string;
  level: "ad_set" | "creative";
  rows: PivotedRow[];
  creativeAssets: Record<string, CreativeAsset>;
  /** Same shape + role as PeriodPivotPayload.snapshotByEntity. */
  snapshotByEntity: Record<string, SnapshotMetrics>;
};

const EMPTY_PIVOT_PAYLOAD: Omit<PeriodPivotPayload, "missingEnv" | "periods" | "metric"> = {
  configured: false,
  query: null,
  campaigns: [],
  adSets: [],
  creatives: [],
  creativeAssets: {},
  snapshotByEntity: {},
};

/**
 * The RPC's dim column name for each frequency. The `key` field on
 * PeriodWindow already encodes the same value, so we just need this to
 * tell `pivotByPeriod` which row field to bucket by.
 */
const FREQUENCY_KEY_FIELD: Record<Frequency, MetaInsightDimension> = {
  day: "date",
  week: "week",
  month: "month",
  quarter: "quarter",
};

export async function fetchPeriodPivot(
  input: PeriodPivotInput,
): Promise<PeriodPivotPayload> {
  const context = buildPeriodPivotContext(input);
  const empty: PeriodPivotPayload = {
    ...EMPTY_PIVOT_PAYLOAD,
    missingEnv: context.missingEnv,
    periods: context.periods,
    metric: input.metric,
    query: context.query,
  };

  if (context.missingEnv.length) {
    return empty;
  }

  const { pivoted: campaigns, snapshotByEntity } = await fetchCampaignPivotRows(context);

  return {
    configured: true,
    missingEnv: [],
    periods: context.periods,
    metric: input.metric,
    query: context.query,
    campaigns,
    adSets: [],
    creatives: [],
    creativeAssets: {},
    snapshotByEntity,
  };
}

export async function fetchPeriodPivotChildren(
  input: PeriodPivotChildrenInput,
): Promise<PeriodPivotChildrenPayload> {
  const context = buildPeriodPivotContext(input);
  const empty: PeriodPivotChildrenPayload = {
    configured: false,
    missingEnv: context.missingEnv,
    parentLevel: input.parentLevel,
    parentId: input.parentId,
    level: input.parentLevel === "campaign" ? "ad_set" : "creative",
    rows: [],
    creativeAssets: {},
    snapshotByEntity: {},
  };

  if (context.missingEnv.length) return empty;

  if (input.parentLevel === "campaign") {
    const { pivoted, snapshotByEntity } = await fetchAdSetPivotRows(
      context,
      input.parentId,
    );
    return {
      ...empty,
      configured: true,
      missingEnv: [],
      rows: pivoted,
      snapshotByEntity,
    };
  }

  const { pivoted, snapshotByEntity } = await fetchCreativePivotRows(
    context,
    input.parentId,
  );
  const creativeAssets = await fetchCreativeAssets(pivoted.map((row) => row.entityId));
  return {
    ...empty,
    configured: true,
    missingEnv: [],
    rows: pivoted,
    creativeAssets,
    snapshotByEntity,
  };
}

export function isPeriodMetric(value: unknown): value is PeriodMetric {
  return typeof value === "string" && ALLOWED_PERIOD_METRICS.includes(value as PeriodMetric);
}

export function normalizePeriodCount(value: unknown) {
  const requested = Number(value);
  return ALLOWED_PERIOD_COUNTS.includes(requested as (typeof ALLOWED_PERIOD_COUNTS)[number])
    ? requested
    : 4;
}

type PeriodPivotContext = {
  missingEnv: string[];
  periods: PeriodWindow[];
  start: string;
  end: string;
  periodDim: MetaInsightDimension;
  filters: MetaInsightFilter[];
  metric: PeriodMetric;
  query: PeriodPivotQuery;
};

function buildPeriodPivotContext(input: PeriodPivotInput): PeriodPivotContext {
  const missingEnv = getMissingDashboardEnv();
  const anchor = input.now ?? new Date();
  const periods = lastNPeriods(anchor, input.periodCount, input.frequency);
  const filters = buildPeriodPivotInsightFilters(input);
  const status = normalizeOptimizeDeliveryStatus(input.status);

  const rangeStart = normalizeDateString(input.startDate);
  const rangeEnd = normalizeDateString(input.endDate);
  const start = rangeStart ?? periods[0].start;
  const end = rangeEnd ?? periods[periods.length - 1].end;

  return {
    missingEnv,
    periods,
    start,
    end,
    periodDim: FREQUENCY_KEY_FIELD[input.frequency],
    filters,
    metric: input.metric,
    query: {
      anchor: anchor.toISOString(),
      periodCount: input.periodCount,
      frequency: input.frequency,
      metric: input.metric,
      brand: input.brand && input.brand !== "all" ? input.brand : null,
      group: input.group && input.group !== "all" ? input.group : null,
      status,
      start,
      end,
    },
  };
}

export function buildPeriodPivotInsightFilters(
  input: Pick<PeriodPivotInput, "brand" | "group" | "status">,
): MetaInsightFilter[] {
  const filters: MetaInsightFilter[] = [];
  if (input.brand && input.brand !== "all") {
    filters.push({ field: "brand", operator: "equals", value: input.brand });
  }
  if (input.group && input.group !== "all") {
    filters.push({ field: "campaign_umbrella", operator: "equals", value: input.group });
  }
  const status = normalizeOptimizeDeliveryStatus(input.status);
  if (status) {
    filters.push({ field: "delivery_status", operator: "equals", value: status });
  }
  return filters;
}

async function fetchCampaignPivotRows(context: PeriodPivotContext) {
  const rows = await aggregateMetaInsights({
    start: context.start,
    end: context.end,
    dimensions: [context.periodDim, "campaign"],
    filters: context.filters,
    sortField: "spend",
    sortDirection: "desc",
    limit: 5000,
  });

  const pivoted = pivotByPeriod(rowsWithMetric(rows, context.metric), {
    periods: context.periods,
    entityIdField: "campaign_id",
    displayField: "campaign",
    periodKeyField: context.periodDim as keyof MetaInsightAggregateRow,
    valueField: "metricValue",
  });
  const snapshotByEntity = context.periods.length === 1
    ? buildSnapshotByEntity(rows, "campaign_id")
    : {};
  return { pivoted, snapshotByEntity };
}

async function fetchAdSetPivotRows(context: PeriodPivotContext, campaignId: string) {
  const rows = await aggregateMetaInsights({
    start: context.start,
    end: context.end,
    dimensions: [context.periodDim, "campaign", "ad_set"],
    filters: [
      ...context.filters,
      { field: "campaign", operator: "contains", value: campaignId },
    ],
    sortField: "spend",
    sortDirection: "desc",
    limit: 10000,
  });

  const pivoted = pivotByPeriod(rowsWithMetric(rows, context.metric), {
    periods: context.periods,
    entityIdField: "ad_set_id",
    displayField: "ad_set",
    periodKeyField: context.periodDim as keyof MetaInsightAggregateRow,
    valueField: "metricValue",
    parentIdFields: ["campaign_id"],
  });
  const snapshotByEntity = context.periods.length === 1
    ? buildSnapshotByEntity(rows, "ad_set_id")
    : {};
  return { pivoted, snapshotByEntity };
}

async function fetchCreativePivotRows(context: PeriodPivotContext, adSetId: string) {
  const rows = await aggregateMetaInsights({
    start: context.start,
    end: context.end,
    dimensions: [context.periodDim, "campaign", "ad_set", "creative"],
    filters: [
      ...context.filters,
      { field: "ad_set", operator: "contains", value: adSetId },
    ],
    sortField: "spend",
    sortDirection: "desc",
    limit: 10000,
  });

  const pivoted = pivotByPeriod(rowsWithMetric(rows, context.metric), {
    periods: context.periods,
    entityIdField: "creative_id",
    displayField: "creative",
    periodKeyField: context.periodDim as keyof MetaInsightAggregateRow,
    valueField: "metricValue",
    parentIdFields: ["campaign_id", "ad_set_id"],
  });
  const snapshotByEntity = context.periods.length === 1
    ? buildSnapshotByEntity(rows, "creative_id")
    : {};
  return { pivoted, snapshotByEntity };
}

type DynamicCreativesClient = {
  from: (table: "meta_creatives") => {
    select: (cols: string) => {
      in: (
        col: string,
        values: string[],
      ) => Promise<{ data: unknown; error: Error | null }>;
    };
  };
};

async function fetchCreativeAssets(
  creativeIds: string[],
): Promise<Record<string, CreativeAsset>> {
  if (creativeIds.length === 0) return {};
  // Dedupe up front; the pivot already groups by creative_id, but be safe.
  const unique = Array.from(new Set(creativeIds.filter(Boolean)));
  if (unique.length === 0) return {};

  try {
    const supabase = createAdsAnalystClient("web") as unknown as DynamicCreativesClient;
    const { data, error } = await supabase
      .from("meta_creatives")
      .select(
        "creative_id,name,title,supabase_thumbnail_url,supabase_image_url,thumbnail_url,image_url,video_thumbnail_url,preview_url",
      )
      .in("creative_id", unique);
    if (error) {
      console.error("[period-pivot] creative metadata fetch failed:", error);
      return {};
    }
    const rows = Array.isArray(data) ? (data as Record<string, unknown>[]) : [];
    const out: Record<string, CreativeAsset> = {};
    for (const row of rows) {
      const id = typeof row.creative_id === "string" ? row.creative_id : null;
      if (!id) continue;
      out[id] = {
        creativeId: id,
        name: stringOrNull(row.name),
        title: stringOrNull(row.title),
        supabaseThumbnailUrl: stringOrNull(row.supabase_thumbnail_url),
        supabaseImageUrl: stringOrNull(row.supabase_image_url),
        thumbnailUrl: stringOrNull(row.thumbnail_url),
        imageUrl: stringOrNull(row.image_url),
        videoThumbnailUrl: stringOrNull(row.video_thumbnail_url),
        previewUrl: stringOrNull(row.preview_url),
      };
    }
    return out;
  } catch (e) {
    console.error("[period-pivot] creative metadata fetch threw:", e);
    return {};
  }
}

function stringOrNull(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value : null;
}

/**
 * Annotate each RPC row with a `metricValue` field that resolves the
 * requested metric. Cost-per-Primary-KPI is computed; everything else
 * just reads the corresponding column. Returning a new row shape keeps
 * pivotByPeriod's type signature simple (one field, one value).
 */
type RowWithMetric = MetaInsightAggregateRow & { metricValue: number };

function rowsWithMetric(
  rows: MetaInsightAggregateRow[],
  metric: PeriodMetric,
): RowWithMetric[] {
  return rows.map((row) => ({
    ...row,
    metricValue: resolveMetric(row, metric),
  }));
}

function resolveMetric(row: MetaInsightAggregateRow, metric: PeriodMetric): number {
  switch (metric) {
    case "spend":
      return row.spend;
    case "primary_results":
      return row.primary_results;
    case "cost_per_primary_results":
      return row.primary_results > 0 ? row.spend / row.primary_results : 0;
    case "ctr":
      return row.ctr;
    case "impressions":
      return row.impressions;
    case "cpc":
      return row.cpc;
    default: {
      const exhaustive: never = metric;
      throw new Error(`Unknown metric: ${String(exhaustive)}`);
    }
  }
}

function normalizeDateString(value: string | null | undefined) {
  return value && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : null;
}

/**
 * Roll up the aggregate rows by entity and compute a full metric breakdown
 * per entity. Used in snapshot mode (`periodCount === 1`) so the tree-table
 * can render one column per metric.
 *
 * `entityField` is the column name on MetaInsightAggregateRow that holds
 * the entity id ("campaign_id" / "ad_set_id" / "creative_id"). All rows
 * sharing the same entity id are summed; cost/CTR derivations are then
 * computed from the totals (the right level of arithmetic — averaging
 * pre-computed CTRs would be incorrect when impressions vary).
 */
export function buildSnapshotByEntity(
  rows: MetaInsightAggregateRow[],
  entityField: keyof MetaInsightAggregateRow,
): Record<string, SnapshotMetrics> {
  type Totals = {
    spend: number;
    impressions: number;
    clicks: number;
    primary_results: number;
  };
  const totals = new Map<string, Totals>();
  for (const row of rows) {
    const id = row[entityField];
    if (typeof id !== "string" || !id) continue;
    const acc = totals.get(id) ?? {
      spend: 0,
      impressions: 0,
      clicks: 0,
      primary_results: 0,
    };
    acc.spend += row.spend ?? 0;
    acc.impressions += row.impressions ?? 0;
    acc.clicks += row.clicks ?? 0;
    acc.primary_results += row.primary_results ?? 0;
    totals.set(id, acc);
  }

  const out: Record<string, SnapshotMetrics> = {};
  for (const [id, t] of totals.entries()) {
    out[id] = {
      spend: t.spend,
      primary_results: t.primary_results,
      cost_per_primary_results:
        t.primary_results > 0 ? t.spend / t.primary_results : 0,
      ctr: t.impressions > 0 ? t.clicks / t.impressions : 0,
      impressions: t.impressions,
      cpc: t.clicks > 0 ? t.spend / t.clicks : 0,
    };
  }
  return out;
}
