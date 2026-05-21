"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
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
  PeriodPivotChildrenPayload,
  PeriodPivotParentLevel,
  PeriodPivotPayload,
} from "@/lib/period-pivot-data";
import type { PivotedRow } from "@/lib/pivot-by-period";

import { CreativeDetailDrawer } from "./creative-detail-drawer";
import { formatDelta, formatMetric } from "./metric-format";

/**
 * The hierarchy + period-pivot table for /optimize.
 *
 * Builds a 3-level tree (Campaign → Ad Set → Creative). Campaigns are in
 * the first server payload; ad sets and creatives/assets are fetched when
 * their parent row is expanded.
 * Renders one row per entity with one column per period plus a Δ
 * column comparing the first → last period.
 *
 * Empty cells (no row for that entity-period combination) render as "—".
 * Period values are formatted per the active metric (currency, count,
 * or percent) via formatMetric.
 *
 * v1 scope:
 *   - 3 levels (skip the "ad" envelope; analysts care about creatives).
 *   - Lazy-loaded children on expand.
 *   - Sort: spend-desc inherited from the server.
 *   - Δ is always first → last period, not user-configurable.
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

  useEffect(() => {
    setData(buildTree(payload));
    setExpanded({});
    setSelectedCreative(null);
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

    for (const period of payload.periods) {
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
          <span className="block tabular-nums text-right">
            {row.original.periodValues[period.key] === undefined
              ? "—"
              : formatMetric(row.original.periodValues[period.key], payload.metric)}
          </span>
        ),
        size: 110,
      });
    }

    if (payload.periods.length > 1) {
      const firstKey = payload.periods[0].key;
      const lastKey = payload.periods[payload.periods.length - 1].key;
      cols.push({
        id: "delta",
        header: () => (
          <span className="block whitespace-nowrap text-right" title={`${firstKey} → ${lastKey}`}>
            Δ P1→P{payload.periods.length}
          </span>
        ),
        cell: ({ row }) => {
          const delta = formatDelta(
            row.original.periodValues[lastKey],
            row.original.periodValues[firstKey],
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
        size: 90,
      });
    }

    return cols;
  }, [handleToggle, payload.metric, payload.periods]);

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
        className="overflow-hidden rounded-xl border border-stone-200 bg-white"
      >
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-stone-50 text-[11px] uppercase tracking-wider text-stone-500">
              {table.getHeaderGroups().map((headerGroup) => (
                <tr key={headerGroup.id}>
                  {headerGroup.headers.map((header) => (
                    <th
                      key={header.id}
                      style={{ width: header.getSize() }}
                      className="border-b border-stone-200 px-3 py-2 text-left first:sticky first:left-0 first:bg-stone-50"
                    >
                      {flexRender(header.column.columnDef.header, header.getContext())}
                    </th>
                  ))}
                </tr>
              ))}
            </thead>
            <tbody>
              {table.getRowModel().rows.map((row) => (
                <tr
                  key={row.id}
                  className={[
                    "border-b border-stone-100 last:border-b-0",
                    row.depth === 0 ? "bg-white" : "bg-stone-50/60",
                  ].join(" ")}
                >
                  {row.getVisibleCells().map((cell) => (
                    <td
                      key={cell.id}
                      className="px-3 py-2 align-top first:sticky first:left-0 first:bg-inherit"
                    >
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </td>
                  ))}
                </tr>
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
  // Prefer the permanent Supabase Storage URL stamped by
  // /api/cron/cache-thumbnails — never expires. Meta CDN URLs are the
  // fallback for creatives the cron hasn't reached yet.
  const thumb = isCreative
    ? (asset?.supabaseThumbnailUrl ??
       asset?.thumbnailUrl ??
       asset?.imageUrl ??
       asset?.videoThumbnailUrl)
    : null;

  return (
    <div style={{ paddingLeft: pad }} className="flex items-center gap-2">
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
          className="truncate text-left font-medium text-stone-900 hover:text-[#E14B7B] hover:underline"
          title="Open creative detail"
        >
          {renderedLabel}
        </button>
      ) : (
        <span className="truncate font-medium text-stone-900" title={renderedLabel}>
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

/**
 * Small img-with-fallback so a broken Meta CDN URL (expired signed link)
 * renders the dashed placeholder instead of Chrome's torn-photo icon.
 *
 * Meta thumbnails expire ~24-48h after sync; the /api/cron/cache-thumbnails
 * job copies them into Supabase Storage so they stop expiring, but until
 * the cron has caught up to a given creative we still try the Meta URL.
 * onError swaps cleanly to the placeholder so the row never looks broken.
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
  return `/api/optimize/pivot-children?${params.toString()}`;
}
