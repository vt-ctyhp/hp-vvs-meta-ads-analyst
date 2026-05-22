"use client";

import {
  flexRender,
  getCoreRowModel,
  getSortedRowModel,
  useReactTable,
  type ColumnDef,
  type SortingState,
} from "@tanstack/react-table";
import { useVirtualizer } from "@tanstack/react-virtual";
import { useMemo, useRef, useState } from "react";

import type { PerformanceRow } from "@/lib/analytics";

/**
 * Creative grid (TanStack Table + virtualized rows).
 *
 * Columns are deliberately dense:
 *   thumbnail | name | status | score | spend | KPI | CTR | CPC | freq | group
 *
 * Sorting works on every numeric column. Click a row → fires `onSelect` so
 * the parent can open the drawer (drawer wired in a follow-up commit). We do
 * not paginate; the dataset is bounded by the dashboard payload (typically
 * < 500 rows) and virtualization handles 10k+ smoothly.
 */

type Props = {
  rows: PerformanceRow[];
  onSelect?: (row: PerformanceRow) => void;
};

const money = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
});
const moneyCents = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 2,
});
const num = new Intl.NumberFormat("en-US");

export function CreativeGrid({ rows, onSelect }: Props) {
  const [sorting, setSorting] = useState<SortingState>([
    { id: "spend", desc: true },
  ]);

  const columns = useMemo<ColumnDef<PerformanceRow>[]>(
    () => [
      {
        id: "preview",
        header: "",
        size: 60,
        cell: ({ row }) => (
          <Thumb
            src={
              row.original.thumbnailUrl ??
              row.original.imageUrl ??
              null
            }
            alt={row.original.name}
          />
        ),
        enableSorting: false,
      },
      {
        accessorKey: "name",
        header: "Creative",
        size: 280,
        cell: ({ row }) => (
          <div className="flex flex-col gap-0.5">
            <span className="line-clamp-1 text-sm font-medium text-stone-900">
              {row.original.name || row.original.id}
            </span>
            {row.original.campaignName ? (
              <span className="line-clamp-1 text-[11px] text-stone-500">
                {row.original.campaignName}
              </span>
            ) : null}
          </div>
        ),
      },
      {
        accessorKey: "effectiveStatus",
        header: "Status",
        size: 80,
        cell: ({ row }) => {
          const label = formatStatus(
            row.original.effectiveStatus ?? row.original.status,
          );
          return <StatusChip label={label} />;
        },
      },
      {
        id: "risk",
        header: "Risk",
        size: 70,
        cell: ({ row }) =>
          row.original.riskLevel ? (
            <RiskChip level={row.original.riskLevel} />
          ) : (
            <span className="text-stone-300">—</span>
          ),
      },
      {
        accessorKey: "spend",
        header: "Spend",
        size: 90,
        cell: ({ getValue }) => (
          <span className="tabular-nums">{money.format(getValue<number>())}</span>
        ),
      },
      {
        id: "primaryResults",
        header: "Primary",
        size: 110,
        accessorFn: (row) => row.primaryResults,
        cell: ({ row }) => (
          <span className="tabular-nums">
            {num.format(row.original.primaryResults)}{" "}
            <span className="text-[10px] uppercase text-stone-500">
              {row.original.primaryResultLabel}
            </span>
          </span>
        ),
      },
      {
        id: "costPerPrimary",
        header: "Cost/result",
        size: 100,
        accessorFn: (row) => row.costPerPrimaryResult ?? Number.POSITIVE_INFINITY,
        cell: ({ row }) =>
          row.original.costPerPrimaryResult == null ? (
            <span className="text-stone-300">—</span>
          ) : (
            <span className="tabular-nums">
              {moneyCents.format(row.original.costPerPrimaryResult)}
            </span>
          ),
      },
      {
        accessorKey: "ctr",
        header: "CTR",
        size: 70,
        cell: ({ getValue }) => (
          <span className="tabular-nums">
            {(getValue<number>() ?? 0).toFixed(2)}%
          </span>
        ),
      },
      {
        accessorKey: "cpc",
        header: "CPC",
        size: 70,
        cell: ({ getValue }) => (
          <span className="tabular-nums">
            {moneyCents.format(getValue<number>() ?? 0)}
          </span>
        ),
      },
      {
        accessorKey: "frequency",
        header: "Freq",
        size: 60,
        cell: ({ getValue }) => (
          <span className="tabular-nums">
            {(getValue<number>() ?? 0).toFixed(2)}
          </span>
        ),
      },
      {
        accessorKey: "campaignUmbrella",
        header: "Group",
        size: 160,
        cell: ({ getValue }) => (
          <span className="line-clamp-1 text-[11px] text-stone-600">
            {getValue<string>() ?? "—"}
          </span>
        ),
      },
    ],
    [],
  );

  const table = useReactTable({
    data: rows,
    columns,
    state: { sorting },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
  });

  const parentRef = useRef<HTMLDivElement>(null);
  const rowVirtualizer = useVirtualizer({
    count: table.getRowModel().rows.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 56,
    overscan: 12,
  });

  if (rows.length === 0) {
    return (
      <div className="rounded-xl border border-stone-200 bg-white px-6 py-10 text-center text-sm text-stone-600">
        No creatives in this filter range. Widen the date range or check the
        latest sync.
      </div>
    );
  }

  const virtualRows = rowVirtualizer.getVirtualItems();
  const totalSize = rowVirtualizer.getTotalSize();
  const paddingTop = virtualRows.length ? virtualRows[0].start : 0;
  const paddingBottom = virtualRows.length
    ? totalSize - virtualRows[virtualRows.length - 1].end
    : 0;

  return (
    <div className="overflow-hidden rounded-xl border border-stone-200 bg-white">
      <div
        ref={parentRef}
        className="max-h-[640px] overflow-auto"
        role="region"
        aria-label="Creative table"
      >
        <table className="w-full border-collapse text-sm">
          <thead className="sticky top-0 z-10 bg-stone-50">
            {table.getHeaderGroups().map((hg) => (
              <tr key={hg.id} className="border-b border-stone-200">
                {hg.headers.map((header) => {
                  const sortDir = header.column.getIsSorted();
                  return (
                    <th
                      key={header.id}
                      className="px-3 py-2 text-left text-[10px] font-semibold uppercase tracking-wider text-stone-500"
                      style={{ width: header.getSize() }}
                    >
                      {header.column.getCanSort() ? (
                        <button
                          type="button"
                          onClick={header.column.getToggleSortingHandler()}
                          className="inline-flex items-center gap-1 hover:text-stone-900"
                        >
                          {flexRender(
                            header.column.columnDef.header,
                            header.getContext(),
                          )}
                          {sortDir === "asc" ? "↑" : sortDir === "desc" ? "↓" : ""}
                        </button>
                      ) : (
                        flexRender(
                          header.column.columnDef.header,
                          header.getContext(),
                        )
                      )}
                    </th>
                  );
                })}
              </tr>
            ))}
          </thead>
          <tbody>
            {paddingTop > 0 ? (
              <tr style={{ height: paddingTop }}>
                <td colSpan={columns.length} />
              </tr>
            ) : null}
            {virtualRows.map((vRow) => {
              const row = table.getRowModel().rows[vRow.index];
              return (
                <tr
                  key={row.id}
                  onClick={() => onSelect?.(row.original)}
                  className="cursor-pointer border-b border-stone-100 hover:bg-stone-50"
                >
                  {row.getVisibleCells().map((cell) => (
                    <td
                      key={cell.id}
                      className="px-3 py-2 align-middle"
                      style={{ width: cell.column.getSize() }}
                    >
                      {flexRender(
                        cell.column.columnDef.cell,
                        cell.getContext(),
                      )}
                    </td>
                  ))}
                </tr>
              );
            })}
            {paddingBottom > 0 ? (
              <tr style={{ height: paddingBottom }}>
                <td colSpan={columns.length} />
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
      <footer className="flex items-center justify-between border-t border-stone-200 bg-stone-50 px-3 py-1.5 text-[11px] text-stone-500">
        <span>{rows.length} creatives</span>
        <span>Click row for details</span>
      </footer>
    </div>
  );
}

// ── small atoms ─────────────────────────────────────────────────────────────

function Thumb({ src, alt }: { src: string | null; alt: string }) {
  if (!src) {
    return (
      <div className="h-10 w-10 rounded bg-stone-100 text-[10px] text-stone-400 grid place-items-center">
        no img
      </div>
    );
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt={alt}
      loading="lazy"
      className="h-10 w-10 rounded object-cover"
    />
  );
}

function StatusChip({ label }: { label: string }) {
  const style =
    label === "Live"
      ? "bg-emerald-50 text-emerald-800 border-emerald-200"
      : label === "Paused"
        ? "bg-amber-50 text-amber-800 border-amber-200"
        : "bg-stone-100 text-stone-700 border-stone-200";
  return (
    <span
      className={`inline-flex h-5 items-center rounded-full border px-2 text-[10px] font-medium ${style}`}
    >
      {label}
    </span>
  );
}

function RiskChip({ level }: { level: "low" | "medium" | "high" }) {
  const style =
    level === "high"
      ? "bg-rose-50 text-rose-800 border-rose-200"
      : level === "medium"
        ? "bg-amber-50 text-amber-800 border-amber-200"
        : "bg-emerald-50 text-emerald-800 border-emerald-200";
  return (
    <span
      className={`inline-flex h-5 items-center rounded-full border px-2 text-[10px] font-medium capitalize ${style}`}
    >
      {level}
    </span>
  );
}

function formatStatus(value: string | null | undefined): string {
  if (!value) return "—";
  const lower = value.toLowerCase();
  if (lower.includes("active")) return "Live";
  if (lower.includes("paused")) return "Paused";
  if (
    lower.includes("delete") ||
    lower.includes("archived") ||
    lower.includes("disapproved")
  ) {
    return "Off";
  }
  return value;
}
