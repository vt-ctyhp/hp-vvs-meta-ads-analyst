"use client";

import {
  flexRender,
  getCoreRowModel,
  getSortedRowModel,
  useReactTable,
  type ColumnDef,
  type SortingState,
} from "@tanstack/react-table";
import { useMemo, useState } from "react";

/**
 * Customer ledger for the Convert room.
 *
 * Each row = one website_conversion. Columns: customer, source, paid touch,
 * CAPI status, booking time. Sortable by every column. Click row to expand
 * details (drawer wired in a follow-up commit).
 *
 * Source: website_conversions table via the limited web client. Limited mode
 * RLS restricts visible rows to environment='staging' on the preview, so the
 * ledger doubles as a staging-data correctness check.
 */

export type CustomerLedgerRow = {
  eventId: string;
  occurredAt: string;
  customerName: string | null;
  customerEmail: string | null;
  brand: string | null;
  sourceType: string | null;
  paidTouchSource: string | null;
  paidTouchCampaign: string | null;
  capiStatus: string | null;
  acuityAppointmentId: string | null;
  appointmentType: string | null;
};

type Props = {
  rows: CustomerLedgerRow[];
};

const DATE_FMT = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
});

export function CustomerLedger({ rows }: Props) {
  const [sorting, setSorting] = useState<SortingState>([
    { id: "occurredAt", desc: true },
  ]);

  const columns = useMemo<ColumnDef<CustomerLedgerRow>[]>(
    () => [
      {
        accessorKey: "customerName",
        header: "Customer",
        size: 200,
        cell: ({ row }) => (
          <div className="flex flex-col gap-0.5">
            <span className="line-clamp-1 text-sm font-medium text-stone-900">
              {row.original.customerName ?? "—"}
            </span>
            {row.original.customerEmail ? (
              <span className="line-clamp-1 text-[11px] text-stone-500">
                {row.original.customerEmail}
              </span>
            ) : null}
          </div>
        ),
      },
      {
        accessorKey: "occurredAt",
        header: "Booking",
        size: 130,
        cell: ({ getValue }) => (
          <span className="text-xs tabular-nums">
            {DATE_FMT.format(new Date(getValue<string>()))}
          </span>
        ),
      },
      {
        accessorKey: "brand",
        header: "Brand",
        size: 70,
        cell: ({ getValue }) => (
          <span className="text-xs">{getValue<string>() ?? "—"}</span>
        ),
      },
      {
        accessorKey: "sourceType",
        header: "Source",
        size: 120,
        cell: ({ row }) => (
          <SourceChip
            type={row.original.sourceType ?? null}
            campaign={row.original.paidTouchCampaign}
          />
        ),
      },
      {
        accessorKey: "capiStatus",
        header: "CAPI",
        size: 90,
        cell: ({ getValue }) => <CapiChip status={getValue<string>() ?? null} />,
      },
      {
        accessorKey: "appointmentType",
        header: "Type",
        size: 140,
        cell: ({ getValue }) => (
          <span className="line-clamp-1 text-xs text-stone-700">
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

  if (rows.length === 0) {
    return (
      <div className="rounded-xl border border-stone-200 bg-white px-4 py-10 text-center text-sm text-stone-600">
        No conversions in this range yet.
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-xl border border-stone-200 bg-white">
      <header className="flex items-baseline justify-between border-b border-stone-200 bg-stone-50 px-4 py-2 text-[10px] uppercase tracking-wider text-stone-600">
        <span>Customer ledger</span>
        <span>{rows.length}</span>
      </header>
      <div className="max-h-[480px] overflow-auto">
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
                      <button
                        type="button"
                        onClick={header.column.getToggleSortingHandler()}
                        className="inline-flex items-center gap-1 hover:text-stone-900"
                      >
                        {flexRender(header.column.columnDef.header, header.getContext())}
                        {sortDir === "asc" ? "↑" : sortDir === "desc" ? "↓" : ""}
                      </button>
                    </th>
                  );
                })}
              </tr>
            ))}
          </thead>
          <tbody>
            {table.getRowModel().rows.map((row) => (
              <tr key={row.id} className="border-b border-stone-100 hover:bg-stone-50">
                {row.getVisibleCells().map((cell) => (
                  <td
                    key={cell.id}
                    className="px-3 py-2 align-middle"
                    style={{ width: cell.column.getSize() }}
                  >
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function SourceChip({
  type,
  campaign,
}: {
  type: string | null;
  campaign: string | null;
}) {
  if (!type) {
    return <span className="text-xs text-stone-400">Direct / unattributed</span>;
  }
  const label =
    type === "paid_meta"
      ? "Paid Meta"
      : type === "paid_search"
        ? "Paid search"
        : type === "paid_social"
          ? "Paid social"
          : type === "paid_other"
            ? "Paid other"
            : type === "organic"
              ? "Organic"
              : type;
  const style = type.startsWith("paid_")
    ? "border-sky-200 bg-sky-50 text-sky-800"
    : "border-emerald-200 bg-emerald-50 text-emerald-800";
  return (
    <div className="flex flex-col gap-0.5">
      <span
        className={`inline-flex h-5 w-fit items-center rounded-full border px-2 text-[10px] font-medium ${style}`}
      >
        {label}
      </span>
      {campaign ? (
        <span className="line-clamp-1 text-[10px] text-stone-500">{campaign}</span>
      ) : null}
    </div>
  );
}

function CapiChip({ status }: { status: string | null }) {
  if (!status)
    return (
      <span className="inline-flex h-5 items-center rounded-full border border-stone-200 bg-stone-50 px-2 text-[10px] text-stone-600">
        none
      </span>
    );
  const lower = status.toLowerCase();
  const style =
    lower === "success" || lower === "sent"
      ? "border-emerald-200 bg-emerald-50 text-emerald-800"
      : lower === "queued" || lower === "pending"
        ? "border-amber-200 bg-amber-50 text-amber-800"
        : "border-rose-200 bg-rose-50 text-rose-800";
  return (
    <span
      className={`inline-flex h-5 items-center rounded-full border px-2 text-[10px] font-medium capitalize ${style}`}
    >
      {status}
    </span>
  );
}
