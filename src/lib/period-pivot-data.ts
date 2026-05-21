/**
 * Period-pivot data fetcher for the /optimize tree+pivot table.
 *
 * Issues N RPC calls in parallel (one per tree level — campaign, ad set,
 * creative) over the same date range, returning rows already pivoted by
 * period. The /optimize page wires the result into TanStack's expandable
 * row model.
 *
 * Why three eager fetches instead of lazy-on-expand:
 *   - Each call is small (max ~5k rows after the RPC's grouping).
 *   - Parallel network is faster than serial round-trips.
 *   - The user can expand any campaign without latency.
 *
 * If the data volume ever forces it, swap to lazy fetch by accepting a
 * `parentFilter` and only resolving children when a row is expanded.
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

export type PeriodPivotPayload = {
  configured: boolean;
  missingEnv: string[];
  periods: PeriodWindow[];
  metric: PeriodMetric;
  /** Top of the tree. */
  campaigns: PivotedRow[];
  /** Children. `parentIds.campaign_id` links each row to its campaign. */
  adSets: PivotedRow[];
  /** Grandchildren. `parentIds.ad_set_id` links each row to its ad set. */
  creatives: PivotedRow[];
  /**
   * Creative metadata keyed by creative_id. Tree-table uses this to swap
   * the cryptic creative_id for the real creative name + thumbnail.
   */
  creativeAssets: Record<string, CreativeAsset>;
};

const EMPTY_PIVOT_PAYLOAD: Omit<PeriodPivotPayload, "missingEnv" | "periods" | "metric"> = {
  configured: false,
  campaigns: [],
  adSets: [],
  creatives: [],
  creativeAssets: {},
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
  const missingEnv = getMissingDashboardEnv();
  const periods = lastNPeriods(input.now ?? new Date(), input.periodCount, input.frequency);
  const empty: PeriodPivotPayload = {
    ...EMPTY_PIVOT_PAYLOAD,
    missingEnv,
    periods,
    metric: input.metric,
  };

  if (missingEnv.length) {
    return empty;
  }

  const start = periods[0].start;
  const end = periods[periods.length - 1].end;
  const filters: MetaInsightFilter[] = [];
  if (input.brand && input.brand !== "all") {
    filters.push({ field: "brand", operator: "equals", value: input.brand });
  }
  if (input.group && input.group !== "all") {
    filters.push({ field: "campaign_umbrella", operator: "equals", value: input.group });
  }

  const periodDim = FREQUENCY_KEY_FIELD[input.frequency];

  // Parallel: one RPC per tree level. Sort by spend desc so the top-of-grid
  // rows are the highest-spend entities — matches what the analyst expects
  // to see first.
  const [campaignRows, adSetRows, creativeRows] = await Promise.all([
    aggregateMetaInsights({
      start,
      end,
      dimensions: [periodDim, "campaign"],
      filters,
      sortField: "spend",
      sortDirection: "desc",
      limit: 5000,
    }),
    aggregateMetaInsights({
      start,
      end,
      dimensions: [periodDim, "campaign", "ad_set"],
      filters,
      sortField: "spend",
      sortDirection: "desc",
      limit: 10000,
    }),
    aggregateMetaInsights({
      start,
      end,
      dimensions: [periodDim, "campaign", "ad_set", "creative"],
      filters,
      sortField: "spend",
      sortDirection: "desc",
      limit: 10000,
    }),
  ]);

  // Pivot each level. Pre-compute the "value" field by metric so the rest
  // of the pipeline doesn't need to know about metric-specific quirks
  // (e.g. cost_per_primary_results = spend / primary_results).
  const campaigns = pivotByPeriod(
    rowsWithMetric(campaignRows, input.metric),
    {
      periods,
      entityIdField: "campaign_id",
      displayField: "campaign",
      periodKeyField: periodDim as keyof MetaInsightAggregateRow,
      valueField: "metricValue",
      // Campaign sits at the top of the tree — no parent.
    },
  );

  const adSets = pivotByPeriod(
    rowsWithMetric(adSetRows, input.metric),
    {
      periods,
      entityIdField: "ad_set_id",
      displayField: "ad_set",
      periodKeyField: periodDim as keyof MetaInsightAggregateRow,
      valueField: "metricValue",
      parentIdFields: ["campaign_id"],
    },
  );

  const creatives = pivotByPeriod(
    rowsWithMetric(creativeRows, input.metric),
    {
      periods,
      entityIdField: "creative_id",
      displayField: "creative",
      periodKeyField: periodDim as keyof MetaInsightAggregateRow,
      valueField: "metricValue",
      // Two parents: campaign and ad_set. Both preserved so the consumer
      // can attach a creative to its ad-set regardless of which level is
      // currently expanded.
      parentIdFields: ["campaign_id", "ad_set_id"],
    },
  );

  // Enrich creative rows with real names + thumbnails. The aggregate RPC
  // only emits creative_id; the meta_creatives table carries the human-
  // friendly fields. One scoped IN query, ~hundreds of IDs max.
  const creativeAssets = await fetchCreativeAssets(creatives.map((c) => c.entityId));

  return {
    configured: true,
    missingEnv: [],
    periods,
    metric: input.metric,
    campaigns,
    adSets,
    creatives,
    creativeAssets,
  };
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
