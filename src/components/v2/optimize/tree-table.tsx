"use client";

import { Fragment, useCallback, useEffect, useMemo, useState } from "react";
import {
  flexRender,
  getCoreRowModel,
  getExpandedRowModel,
  useReactTable,
  type ColumnDef,
  type ExpandedState,
} from "@tanstack/react-table";

import type {
  CreativeAsset,
  PeriodMetric,
  PeriodPivotChildrenPayload,
  PeriodPivotParentLevel,
  PeriodPivotPayload,
  SnapshotMetrics,
} from "@/lib/period-pivot-data";
import type { PivotedRow } from "@/lib/pivot-by-period";
import { periodsNewestFirst } from "@/lib/period-windows";

import { CreativeDetailDrawer } from "./creative-detail-drawer";
import { formatDelta, formatMetric } from "./metric-format";

/**
 * Snapshot mode columns: when periods=1, the table renders these four
 * metric columns instead of one column per period. Order matches PRD §6
 * Convert/Optimize scoreboard.
 */
const SNAPSHOT_COLUMNS = [
  { metric: "spend" as const, label: "Spend" },
  { metric: "primary_results" as const, label: "Primary KPI" },
  { metric: "cost_per_primary_results" as const, label: "$/Primary KPI" },
  { metric: "ctr" as const, label: "CTR" },
];

/**
 * The hierarchy + period-pivot table for /optimize.
 *
 * Builds a 3-level tree (Campaign → Ad Set → Creative). Campaigns are in
 * the first server payload; ad sets and creatives/assets are fetched when
 * their parent row is expanded.
 * Renders one row per entity with one column per period, newest period
 * first, plus a Δ column comparing oldest → newest.
 *
 * Empty cells (no row for that entity-period combination) render as "—".
 * Period values are formatted per the active metric (currency, count,
 * or percent) via formatMetric.
 *
 * v1 scope:
 *   - 3 levels (skip the "ad" envelope; analysts care about creatives).
 *   - Lazy-loaded children on expand.
 *   - Sort: spend-desc inherited from the server.
 *   - Δ is always oldest → newest period, not user-configurable.
 *
 * v2:
 *   - Sparkline cell next to the Δ.
 *   - Sort by clicking any column header.
 */

type TreeRow = PivotedRow & {
  level: "campaign" | "ad_set" | "creative";
  asset?: CreativeAsset;
  canHaveChildren?: boolean;
  childrenLoaded?: boolean;
  childrenLoading?: boolean;
  childError?: string | null;
  subRows?: TreeRow[];
};

type Props = {
  payload: PeriodPivotPayload;
};

export function TreeTable({ payload }: Props) {
  const [data, setData] = useState<TreeRow[]>(() => buildTree(payload));
  const [expanded, setExpanded] = useState<ExpandedState>({});
  const [selectedCreative, setSelectedCreative] = useState<{
    row: TreeRow;
    asset: CreativeAsset | undefined;
  } | null>(null);
  // In snapshot mode (periods=1) the table renders one column per metric
  // and reads values from this map by entityId. We merge in child payloads
  // as the operator expands campaigns / ad-sets so the new rows get their
  // own metric breakdowns without re-fetching the whole payload.
  const [snapshotMap, setSnapshotMap] = useState<Record<string, SnapshotMetrics>>(
    () => payload.snapshotByEntity ?? {},
  );
  const hasLoadingChildren = useMemo(() => treeHasLoadingChildren(data), [data]);
  const snapshotMode = payload.periods.length === 1;

  useEffect(() => {
    setData(buildTree(payload));
    setExpanded({});
    setSelectedCreative(null);
    setSnapshotMap(payload.snapshotByEntity ?? {});
  }, [payload]);

  const loadChildren = useCallback(
    async (row: TreeRow) => {
      if (!payload.query || row.level === "creative") return;

      const parentLevel: PeriodPivotParentLevel =
        row.level === "campaign" ? "campaign" : "ad_set";
      setData((current) =>
        updateTreeRow(current, row.level, row.entityId, (target) => ({
          ...target,
          childrenLoading: true,
          childError: null,
        })),
      );

      try {
        const url = buildChildrenUrl(payload, parentLevel, row.entityId);
        const response = await fetch(url, { credentials: "same-origin" });
        if (!response.ok) {
          throw new Error(`Child fetch failed with ${response.status}`);
        }
        const childPayload = (await response.json()) as PeriodPivotChildrenPayload;
        if (!childPayload.configured) {
          throw new Error(
            `Missing module credentials: ${childPayload.missingEnv.join(", ") || "unknown"}`,
          );
        }

        const childRows = toTreeRows(childPayload);
        setData((current) =>
          updateTreeRow(current, row.level, row.entityId, (target) => ({
            ...target,
            canHaveChildren: childRows.length > 0,
            childrenLoaded: true,
            childrenLoading: false,
            childError: null,
            subRows: childRows,
          })),
        );
        // In snapshot mode, fold the child entities' metric breakdown into
        // the running map so the new rows render their Spend / KPI / etc.
        // columns immediately. Multi-period mode leaves snapshotByEntity
        // empty server-side, so this is effectively a no-op there.
        if (childPayload.snapshotByEntity) {
          setSnapshotMap((prev) => ({
            ...prev,
            ...childPayload.snapshotByEntity,
          }));
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        setData((current) =>
          updateTreeRow(current, row.level, row.entityId, (target) => ({
            ...target,
            childrenLoading: false,
            childError: message,
          })),
        );
      }
    },
    [payload],
  );

  const handleToggle = useCallback(
    (row: TreeRow, isExpanded: boolean, toggle: () => void) => {
      toggle();
      if (
        !isExpanded &&
        row.canHaveChildren &&
        !row.childrenLoaded &&
        !row.childrenLoading
      ) {
        void loadChildren(row);
      }
    },
    [loadChildren],
  );

  const columns = useMemo<ColumnDef<TreeRow>[]>(() => {
    const cols: ColumnDef<TreeRow>[] = [
      {
        id: "name",
        header: "Name",
        size: 360,
        cell: ({ row }) => (
          <NameCell
            depth={row.depth}
            canExpand={row.getCanExpand()}
            isExpanded={row.getIsExpanded()}
            onToggle={() =>
              handleToggle(
                row.original,
                row.getIsExpanded(),
                row.getToggleExpandedHandler(),
              )
            }
            level={row.original.level}
            label={row.original.displayName}
            asset={row.original.asset}
            loading={row.original.childrenLoading}
            error={row.original.childError}
            onCreativeClick={
              row.original.level === "creative"
                ? () =>
                    setSelectedCreative({
                      row: row.original,
                      asset: row.original.asset,
                    })
                : undefined
            }
          />
        ),
      },
    ];

    if (snapshotMode) {
      // Single-period mode: surface a 4-metric scoreboard instead of one
      // column for the selected metric. The window label sits in the
      // header tooltip so the operator can still see which range
      // generated the totals.
      const window = payload.periods[0];
      const windowTitle = window ? `${window.start} → ${window.end}` : undefined;
      for (const { metric, label } of SNAPSHOT_COLUMNS) {
        cols.push({
          id: `metric_${metric}`,
          header: () => (
            <span className="block whitespace-nowrap text-right" title={windowTitle}>
              {label}
              {window?.isCurrent ? (
                <span className="ml-1 align-top text-[9px] uppercase tracking-wider text-amber-700">
                  so far
                </span>
              ) : null}
            </span>
          ),
          cell: ({ row }) => {
            const totals = snapshotMap[row.original.entityId];
            const value = totals ? totals[metric] : undefined;
            return (
              <MetricValueCell
                value={value}
                metric={metric}
                row={row.original}
              />
            );
          },
          size: 110,
        });
      }
    } else {
      const displayPeriods = periodsNewestFirst(payload.periods);

      for (const period of displayPeriods) {
        cols.push({
          id: `period_${period.key}`,
          header: () => (
            <span className="block whitespace-nowrap text-right" title={`${period.start} → ${period.end}`}>
              {period.label}
              {period.isCurrent ? (
                <span className="ml-1 align-top text-[9px] uppercase tracking-wider text-amber-700">so far</span>
              ) : null}
            </span>
          ),
          cell: ({ row }) => (
            <MetricValueCell
              value={row.original.periodValues[period.key]}
              metric={payload.metric}
              row={row.original}
            />
          ),
          size: 110,
        });
      }

      if (payload.periods.length > 1) {
        const newestPeriod = displayPeriods[0];
        const oldestPeriod = displayPeriods[displayPeriods.length - 1];
        cols.push({
          id: "delta",
          header: () => (
            <span
              className="block whitespace-nowrap text-right"
              title={`${oldestPeriod.start} → ${newestPeriod.end}`}
            >
              Δ old→new
            </span>
          ),
          cell: ({ row }) => {
            const delta = formatDelta(
              row.original.periodValues[newestPeriod.key],
              row.original.periodValues[oldestPeriod.key],
            );
            if (!delta) return <span className="block text-right text-stone-400">—</span>;
            return (
              <span
                className={[
                  "block tabular-nums text-right text-xs font-medium",
                  delta.positive ? "text-emerald-700" : "text-rose-700",
                ].join(" ")}
              >
                {delta.text}
              </span>
            );
          },
          size: 100,
        });
      }
    }

    return cols;
  }, [handleToggle, payload.metric, payload.periods, snapshotMap, snapshotMode]);

  // eslint-disable-next-line react-hooks/incompatible-library
  const table = useReactTable({
    data,
    columns,
    state: { expanded },
    onExpandedChange: setExpanded,
    getCoreRowModel: getCoreRowModel(),
    getExpandedRowModel: getExpandedRowModel(),
    getSubRows: (row) => row.subRows,
    getRowCanExpand: (row) => Boolean(row.original.canHaveChildren),
  });
  // Width used for colspan when filling out the "loading children" row.
  // Snapshot mode emits 4 metric columns; multi-period mode emits N period
  // columns + an optional Δ column.
  const periodColumnCount = snapshotMode
    ? SNAPSHOT_COLUMNS.length
    : payload.periods.length + (payload.periods.length > 1 ? 1 : 0);

  if (!payload.configured) {
    return (
      <section
        aria-label="Period pivot table"
        className="rounded-xl border border-dashed border-stone-300 bg-white p-6 text-sm text-stone-600"
      >
        Limited-access mode is missing one or more module credentials:{" "}
        <code className="rounded bg-stone-100 px-1">{payload.missingEnv.join(", ") || "—"}</code>.
        Check Vercel env vars before rendering live data.
      </section>
    );
  }

  if (data.length === 0) {
    return (
      <section className="rounded-xl border border-dashed border-stone-300 bg-white p-6 text-sm text-stone-600">
        No campaigns delivered in this range. Widen the period span or run a Meta sync.
      </section>
    );
  }

  return (
    <>
      <section
        aria-label="Campaign → Ad Set → Creative tree, pivoted by period"
        aria-busy={hasLoadingChildren}
        className="overflow-hidden rounded-xl border border-stone-200 bg-white"
      >
        <div className="overflow-x-auto">
          <table className="w-full table-fixed text-sm" style={{ minWidth: table.getTotalSize() }}>
            <thead className="bg-stone-50 text-[11px] uppercase tracking-wider text-stone-500">
              {table.getHeaderGroups().map((headerGroup) => (
                <tr key={headerGroup.id}>
                  {headerGroup.headers.map((header) => {
                    const isNameColumn = header.column.id === "name";
                    return (
                      <th
                        key={header.id}
                        style={{ width: header.getSize() }}
                        className={[
                          "border-b border-stone-200 px-3 py-2 text-left align-top",
                          isNameColumn ? "sticky left-0 z-20 bg-stone-50" : "",
                        ].join(" ")}
                      >
                        {flexRender(header.column.columnDef.header, header.getContext())}
                      </th>
                    );
                  })}
                </tr>
              ))}
            </thead>
            <tbody>
              {table.getRowModel().rows.map((row) => (
                <Fragment key={row.id}>
                  <tr
                    className={[
                      "border-b border-stone-100 last:border-b-0",
                      row.depth === 0 ? "bg-white" : "bg-stone-50/60",
                    ].join(" ")}
                  >
                    {row.getVisibleCells().map((cell) => {
                      const isNameColumn = cell.column.id === "name";
                      return (
                        <td
                          key={cell.id}
                          style={{ width: cell.column.getSize() }}
                          className={[
                            "px-3 py-2 align-top",
                            isNameColumn ? "sticky left-0 z-10 max-w-0 bg-inherit" : "",
                          ].join(" ")}
                        >
                          {flexRender(cell.column.columnDef.cell, cell.getContext())}
                        </td>
                      );
                    })}
                  </tr>
                  {row.original.childrenLoading && row.getIsExpanded() ? (
                    <TreeLoadingRows
                      depth={row.depth + 1}
                      periodColumnCount={periodColumnCount}
                      count={row.original.level === "campaign" ? 3 : 2}
                    />
                  ) : null}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <CreativeDetailDrawer
        open={selectedCreative !== null}
        onClose={() => setSelectedCreative(null)}
        creativeId={selectedCreative?.row.entityId ?? null}
        asset={selectedCreative?.asset}
        adSetId={selectedCreative?.row.parentIds.ad_set_id ?? null}
        campaignId={selectedCreative?.row.parentIds.campaign_id ?? null}
        displayName={selectedCreative?.row.displayName ?? null}
        periodValues={selectedCreative?.row.periodValues ?? null}
        periods={payload.periods}
        metric={payload.metric}
      />
    </>
  );
}

function TreeLoadingRows({
  depth,
  periodColumnCount,
  count,
}: {
  depth: number;
  periodColumnCount: number;
  count: number;
}) {
  return (
    <>
      {Array.from({ length: count }).map((_, rowIndex) => (
        <tr key={`loading-${depth}-${rowIndex}`} className="border-b border-stone-100 bg-stone-50/50">
          <td className="px-3 py-2 align-top first:sticky first:left-0 first:bg-inherit">
            <div
              className="flex items-center gap-2"
              style={{ paddingLeft: depth * 16 }}
              aria-hidden
            >
              <SkeletonBlock className="h-5 w-5" />
              <SkeletonBlock className="h-5 w-7" />
              <SkeletonBlock
                className={[
                  "h-4",
                  rowIndex % 3 === 0
                    ? "w-56"
                    : rowIndex % 3 === 1
                      ? "w-44"
                      : "w-64",
                ].join(" ")}
              />
            </div>
          </td>
          {Array.from({ length: periodColumnCount }).map((_, cellIndex) => (
            <td key={cellIndex} className="px-3 py-2 align-top">
              <SkeletonBlock
                className={[
                  "ml-auto h-4",
                  cellIndex % 2 === 0 ? "w-16" : "w-12",
                ].join(" ")}
              />
            </td>
          ))}
        </tr>
      ))}
    </>
  );
}

function SkeletonBlock({ className }: { className: string }) {
  return (
    <span
      aria-hidden
      className={["block animate-pulse rounded bg-stone-200/80", className].join(" ")}
    />
  );
}

function MetricValueCell({
  value,
  metric,
  row,
}: {
  value: number | undefined;
  metric: PeriodMetric;
  row: TreeRow;
}) {
  const label = metricCellLabel(row, metric);

  return (
    <span className="block text-right">
      <span className="block tabular-nums text-stone-900">
        {value === undefined ? "—" : formatMetric(value, metric)}
      </span>
      <span className="block pt-0.5 text-[10px] uppercase leading-none tracking-wider text-stone-400">
        {label}
      </span>
    </span>
  );
}

function metricCellLabel(row: TreeRow, metric: PeriodMetric) {
  const primary = (row.primaryResultLabel ?? "Messages").toLowerCase();
  switch (metric) {
    case "primary_results":
      return primary;
    case "cost_per_primary_results":
      return `per ${singularizeMetricLabel(primary)}`;
    case "spend":
      return "spend";
    case "ctr":
      return "ctr";
    case "impressions":
      return "impressions";
    case "cpc":
      return "cpc";
    default: {
      const exhaustive: never = metric;
      return exhaustive;
    }
  }
}

function singularizeMetricLabel(label: string) {
  return label.endsWith("s") ? label.slice(0, -1) : label;
}

function NameCell({
  depth,
  canExpand,
  isExpanded,
  onToggle,
  level,
  label,
  asset,
  loading,
  error,
  onCreativeClick,
}: {
  depth: number;
  canExpand: boolean;
  isExpanded: boolean;
  onToggle: () => void;
  level: TreeRow["level"];
  label: string;
  asset?: CreativeAsset;
  loading?: boolean;
  error?: string | null;
  onCreativeClick?: () => void;
}) {
  const pad = depth * 16;
  const isCreative = level === "creative";
  // For creative rows, render thumbnail + creative name (not the bare id).
  // The creative name comes from meta_creatives via the asset enrichment;
  // displayName is the fallback (already the creative_id from the RPC).
  const renderedLabel = isCreative
    ? (asset?.name ?? asset?.title ?? label)
    : label;
  // These display URLs are Supabase-cached only. If the cache has not
  // materialized an asset yet, render the placeholder instead of trying an
  // expiring Meta CDN URL.
  const thumb = isCreative
    ? (asset?.thumbnailUrl ?? asset?.imageUrl)
    : null;

  return (
    <div style={{ paddingLeft: pad }} className="flex min-w-0 max-w-full items-center gap-2">
      {canExpand ? (
        <button
          type="button"
          onClick={onToggle}
          aria-label={isExpanded ? "Collapse" : "Expand"}
          aria-expanded={isExpanded}
          className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded text-stone-500 hover:bg-stone-100"
        >
          {isExpanded ? "▾" : "▸"}
        </button>
      ) : (
        <span className="inline-block w-5 shrink-0" aria-hidden />
      )}
      {isCreative ? (
        <ThumbnailWithFallback src={thumb ?? null} />
      ) : (
        <span
          className="inline-flex h-5 shrink-0 items-center text-[10px] uppercase tracking-wider text-stone-400"
          title={`Tree level: ${level}`}
        >
          {LEVEL_BADGE[level]}
        </span>
      )}
      {onCreativeClick ? (
        <button
          type="button"
          onClick={onCreativeClick}
          className={[
            TREE_NAME_LABEL_CLASS,
            "hover:text-[#E14B7B] hover:underline focus-visible:text-[#E14B7B] focus-visible:underline",
          ].join(" ")}
          title={renderedLabel}
          aria-label={`Open creative detail for ${renderedLabel}`}
        >
          {renderedLabel}
        </button>
      ) : (
        <span className={TREE_NAME_LABEL_CLASS} title={renderedLabel}>
          {renderedLabel}
        </span>
      )}
      {loading ? (
        <span className="shrink-0 text-[11px] text-stone-400">Loading...</span>
      ) : null}
      {error ? (
        <span className="shrink-0 text-[11px] text-rose-600" title={error}>
          Could not load
        </span>
      ) : null}
    </div>
  );
}

const LEVEL_BADGE: Record<TreeRow["level"], string> = {
  campaign: "C",
  ad_set: "AS",
  creative: "Cr",
};

const TREE_NAME_LABEL_CLASS =
  "breakdown-name-label text-left font-medium leading-snug text-stone-900 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#E14B7B]";

/**
 * Small img-with-fallback. Sources should already be durable Supabase
 * Storage URLs; onError still swaps to the placeholder so bad cached objects
 * never show Chrome's torn-photo icon.
 */
function ThumbnailWithFallback({ src }: { src: string | null }) {
  const [failed, setFailed] = useState(false);
  if (!src || failed) {
    return (
      <span
        className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded border border-dashed border-stone-300 text-[9px] text-stone-400"
        aria-hidden
      >
        no img
      </span>
    );
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt=""
      className="h-8 w-8 shrink-0 rounded border border-stone-200 object-cover"
      loading="lazy"
      onError={() => setFailed(true)}
    />
  );
}

/**
 * Stitch the three flat arrays into a tree. PivotedRow.parentIds carries
 * the FK references back to the parent level.
 */
function buildTree(payload: PeriodPivotPayload): TreeRow[] {
  const creativesByAdSet = new Map<string, TreeRow[]>();
  for (const creative of payload.creatives) {
    const parentId = creative.parentIds.ad_set_id;
    if (!parentId) continue;
    const arr = creativesByAdSet.get(parentId) ?? [];
    arr.push({
      ...creative,
      level: "creative",
      asset: payload.creativeAssets[creative.entityId],
      childrenLoaded: true,
      canHaveChildren: false,
    });
    creativesByAdSet.set(parentId, arr);
  }

  const adSetsByCampaign = new Map<string, TreeRow[]>();
  for (const adSet of payload.adSets) {
    const parentId = adSet.parentIds.campaign_id;
    if (!parentId) continue;
    const arr = adSetsByCampaign.get(parentId) ?? [];
    arr.push({
      ...adSet,
      level: "ad_set",
      canHaveChildren: true,
      childrenLoaded: payload.creatives.length > 0,
      subRows: creativesByAdSet.get(adSet.entityId) ?? undefined,
    });
    adSetsByCampaign.set(parentId, arr);
  }

  return payload.campaigns.map((campaign) => ({
    ...campaign,
    level: "campaign",
    canHaveChildren: true,
    childrenLoaded: payload.adSets.length > 0,
    subRows: adSetsByCampaign.get(campaign.entityId) ?? undefined,
  }));
}

function toTreeRows(payload: PeriodPivotChildrenPayload): TreeRow[] {
  if (payload.level === "ad_set") {
    return payload.rows.map((row) => ({
      ...row,
      level: "ad_set",
      canHaveChildren: true,
      childrenLoaded: false,
      subRows: undefined,
    }));
  }

  return payload.rows.map((row) => ({
    ...row,
    level: "creative",
    asset: payload.creativeAssets[row.entityId],
    canHaveChildren: false,
    childrenLoaded: true,
  }));
}

function updateTreeRow(
  rows: TreeRow[],
  level: TreeRow["level"],
  entityId: string,
  update: (row: TreeRow) => TreeRow,
): TreeRow[] {
  return rows.map((row) => {
    const nextRow =
      row.level === level && row.entityId === entityId ? update(row) : row;
    if (!nextRow.subRows) return nextRow;
    return {
      ...nextRow,
      subRows: updateTreeRow(nextRow.subRows, level, entityId, update),
    };
  });
}

function treeHasLoadingChildren(rows: TreeRow[]): boolean {
  return rows.some(
    (row) =>
      Boolean(row.childrenLoading) ||
      (row.subRows ? treeHasLoadingChildren(row.subRows) : false),
  );
}

function buildChildrenUrl(
  payload: PeriodPivotPayload,
  parentLevel: PeriodPivotParentLevel,
  parentId: string,
) {
  const params = new URLSearchParams();
  const query = payload.query;
  if (!query) return "/api/optimize/pivot-children";

  params.set("parentLevel", parentLevel);
  params.set("parentId", parentId);
  params.set("anchor", query.anchor);
  params.set("periodCount", String(query.periodCount));
  params.set("frequency", query.frequency);
  params.set("metric", query.metric);
  if (query.brand) params.set("brand", query.brand);
  if (query.group) params.set("group", query.group);
  if (query.status) params.set("status", query.status);
  params.set("start", query.start);
  params.set("end", query.end);
  return `/api/optimize/pivot-children?${params.toString()}`;
}
