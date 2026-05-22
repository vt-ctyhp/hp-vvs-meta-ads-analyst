"use client";

import {
  flexRender,
  getCoreRowModel,
  getSortedRowModel,
  useReactTable,
  type ColumnDef,
  type SortingState,
} from "@tanstack/react-table";
import { ImageIcon, MapPin } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";

import {
  customerLedgerDetailUrl,
  type CustomerLedgerRow,
} from "@/lib/convert-customer-ledger";
import type { CustomerJourneyLedgerDetailData } from "@/lib/customer-journey-ledger";

import { CustomerJourneyDrawer } from "./customer-journey-drawer";

/**
 * Customer ledger for the Convert room.
 *
 * Each row = one customer journey from the shared website attribution read
 * model. Conversion fields are present only when the visitor has a booking.
 */

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
  const [selectedRow, setSelectedRow] = useState<CustomerLedgerRow | null>(null);
  const [detail, setDetail] = useState<CustomerJourneyLedgerDetailData | null>(null);
  const [detailError, setDetailError] = useState<string | null>(null);
  const [isLoadingDetail, setIsLoadingDetail] = useState(false);
  const [timelineLink, setTimelineLink] = useState<string | null>(null);
  const [isTimelineLinkCopied, setIsTimelineLinkCopied] = useState(false);
  const [hasOpenedInitialTimelineLink, setHasOpenedInitialTimelineLink] = useState(false);

  const openJourneyDrawer = useCallback(
    (row: CustomerLedgerRow, options?: { syncUrl?: boolean }) => {
      const link =
        options?.syncUrl === false ? currentJourneyUrl(row) : writeJourneyUrl(row);
      setDetail(null);
      setDetailError(null);
      setIsLoadingDetail(true);
      setTimelineLink(link);
      setIsTimelineLinkCopied(false);
      setSelectedRow(row);
    },
    [],
  );

  const closeJourneyDrawer = useCallback(() => {
    clearJourneyUrl();
    setSelectedRow(null);
    setDetail(null);
    setDetailError(null);
    setIsLoadingDetail(false);
    setTimelineLink(null);
    setIsTimelineLinkCopied(false);
  }, []);

  const copyJourneyLink = useCallback(async () => {
    if (!timelineLink || typeof navigator === "undefined" || !navigator.clipboard) return;

    try {
      await navigator.clipboard.writeText(timelineLink);
      setIsTimelineLinkCopied(true);
    } catch {
      // Clipboard permissions can be blocked; the deep link still remains in the URL.
    }
  }, [timelineLink]);

  useEffect(() => {
    if (!selectedRow) return;

    const controller = new AbortController();

    fetch(customerLedgerDetailUrl(selectedRow), {
      credentials: "same-origin",
      signal: controller.signal,
    })
      .then(async (response) => {
        const payload = await response.json().catch(() => null);
        if (!response.ok) {
          const message =
            payload && typeof payload === "object" && "error" in payload
              ? String(payload.error)
              : "Could not load customer journey detail.";
          throw new Error(message);
        }
        return payload as CustomerJourneyLedgerDetailData;
      })
      .then((payload) => {
        if (!controller.signal.aborted) setDetail(payload);
      })
      .catch((error) => {
        if (controller.signal.aborted) return;
        setDetailError(
          error instanceof Error ? error.message : "Could not load customer journey detail.",
        );
      })
      .finally(() => {
        if (!controller.signal.aborted) setIsLoadingDetail(false);
      });

    return () => controller.abort();
  }, [selectedRow]);

  useEffect(() => {
    if (hasOpenedInitialTimelineLink || selectedRow) return;

    const handle = window.setTimeout(() => {
      const row = journeyRowFromCurrentUrl(rows);
      if (row) openJourneyDrawer(row, { syncUrl: false });
      setHasOpenedInitialTimelineLink(true);
    }, 0);

    return () => window.clearTimeout(handle);
  }, [hasOpenedInitialTimelineLink, openJourneyDrawer, rows, selectedRow]);

  useEffect(() => {
    if (!selectedRow) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") closeJourneyDrawer();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [closeJourneyDrawer, selectedRow]);

  useEffect(() => {
    if (!isTimelineLinkCopied) return;
    const handle = window.setTimeout(() => setIsTimelineLinkCopied(false), 1500);
    return () => window.clearTimeout(handle);
  }, [isTimelineLinkCopied]);

  const columns = useMemo<ColumnDef<CustomerLedgerRow>[]>(
    () => [
      {
        id: "creative",
        header: "Creative",
        size: 250,
        enableSorting: false,
        cell: ({ row }) => <CreativeCell row={row.original} />,
      },
      {
        accessorKey: "customerName",
        header: "Customer",
        size: 200,
        cell: ({ row }) => (
          <div className="flex flex-col gap-0.5">
            <span className="line-clamp-1 font-[family-name:var(--font-title)] text-base text-hp-ink">
              {row.original.customerName ?? "—"}
            </span>
            {row.original.customerEmail ? (
              <span className="line-clamp-1 text-[11px] text-hp-muted">
                {row.original.customerEmail}
              </span>
            ) : null}
          </div>
        ),
      },
      {
        accessorKey: "occurredAt",
        header: "Activity",
        size: 130,
        cell: ({ getValue }) => (
          <span className="text-xs tabular-nums text-hp-body">
            {formatDate(getValue<string>())}
          </span>
        ),
      },
      {
        id: "location",
        header: "Location",
        size: 130,
        enableSorting: false,
        cell: ({ row }) => <LocationCell row={row.original} />,
      },
      {
        accessorKey: "brand",
        header: "Brand",
        size: 70,
        cell: ({ getValue }) => (
          <span className="inline-block border border-hp-rule px-2 py-[1px] text-[11px] uppercase tracking-[0.10em] text-hp-ink">
            {getValue<string>() ?? "—"}
          </span>
        ),
      },
      {
        accessorKey: "sourceType",
        header: "Source",
        size: 120,
        cell: ({ row }) => (
          <SourceChip
            type={row.original.sourceType ?? null}
            source={row.original.paidTouchSource}
            campaign={row.original.paidTouchCampaign}
          />
        ),
      },
      {
        accessorKey: "capiStatus",
        header: "CAPI",
        size: 90,
        cell: ({ row }) => (
          <CapiChip
            hasConversion={row.original.hasConversion}
            status={row.original.capiStatus}
          />
        ),
      },
      {
        accessorKey: "appointmentType",
        header: "Type",
        size: 140,
        cell: ({ getValue }) => (
          <span className="line-clamp-1 text-xs text-hp-body">
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
      <>
        <div className="border border-hp-rule bg-hp-card px-4 py-10 text-center text-sm text-hp-muted">
          No customer journeys in this range yet.
        </div>
        <CustomerJourneyDrawer
          detail={detail}
          error={detailError}
          isLinkCopied={isTimelineLinkCopied}
          isLoading={isLoadingDetail}
          onClose={closeJourneyDrawer}
          onCopyLink={copyJourneyLink}
          row={selectedRow}
          timelineLink={timelineLink}
        />
      </>
    );
  }

  return (
    <>
      <div className="overflow-hidden border border-hp-rule bg-hp-card">
        <header className="flex items-baseline justify-between border-b border-hp-rule bg-hp-inset px-5 py-3 text-[11px] uppercase tracking-[0.14em] text-hp-muted">
          <span>Customer ledger</span>
          <span>{rows.length}</span>
        </header>
        <div className="max-h-[520px] overflow-auto">
          <table className="w-full min-w-[1040px] border-collapse text-sm">
            <thead className="sticky top-0 z-10 bg-hp-inset">
              {table.getHeaderGroups().map((hg) => (
                <tr key={hg.id} className="border-b border-hp-rule">
                  {hg.headers.map((header) => {
                    const sortDir = header.column.getIsSorted();
                    const canSort = header.column.getCanSort();
                    return (
                      <th
                        key={header.id}
                        className="px-3 py-2 text-left text-[10px] font-semibold uppercase tracking-[0.14em] text-hp-muted"
                        style={{ width: header.getSize() }}
                      >
                        {canSort ? (
                          <button
                            type="button"
                            onClick={header.column.getToggleSortingHandler()}
                            className="inline-flex items-center gap-1 hover:text-hp-ink"
                          >
                            {flexRender(header.column.columnDef.header, header.getContext())}
                            {sortDir === "asc" ? "↑" : sortDir === "desc" ? "↓" : ""}
                          </button>
                        ) : (
                          flexRender(header.column.columnDef.header, header.getContext())
                        )}
                      </th>
                    );
                  })}
                </tr>
              ))}
            </thead>
            <tbody>
              {table.getRowModel().rows.map((row) => (
                <tr
                  key={row.original.rowId}
                  tabIndex={0}
                  aria-label="Open customer journey"
                  onClick={() => openJourneyDrawer(row.original)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      openJourneyDrawer(row.original);
                    }
                  }}
                  className="cursor-pointer border-b border-hp-rule-soft outline-none transition-colors hover:bg-hp-inset focus:bg-hp-inset focus:ring-2 focus:ring-inset focus:ring-hp-pink"
                >
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
      <CustomerJourneyDrawer
        detail={detail}
        error={detailError}
        isLinkCopied={isTimelineLinkCopied}
        isLoading={isLoadingDetail}
        onClose={closeJourneyDrawer}
        onCopyLink={copyJourneyLink}
        row={selectedRow}
        timelineLink={timelineLink}
      />
    </>
  );
}

function LocationCell({ row }: { row: CustomerLedgerRow }) {
  const primary = formatLocationPrimary(row);
  const secondary = formatLocationSecondary(row);

  if (!primary) {
    return <span className="text-xs text-hp-muted">n/a</span>;
  }

  return (
    <div className="flex min-w-0 items-start gap-2">
      <MapPin className="mt-0.5 shrink-0 text-hp-muted" size={13} aria-hidden />
      <div className="min-w-0">
        <span className="line-clamp-1 text-xs font-medium text-hp-ink">
          {primary}
        </span>
        {secondary ? (
          <span className="line-clamp-1 text-[10px] text-hp-muted">
            {secondary}
          </span>
        ) : null}
      </div>
    </div>
  );
}

function CreativeCell({ row }: { row: CustomerLedgerRow }) {
  const preview = row.creativePreview;
  const label =
    preview?.creativeName ||
    preview?.title ||
    preview?.adName ||
    row.paidTouchCampaign ||
    row.paidTouchSource ||
    "Direct / unattributed";
  const sublabel = row.adId
    ? joinedDetail(row.sourceType, row.placement) || row.adId
    : row.hasPaidTouch
      ? "Paid signal, no ad ID"
      : "No ad creative";

  return (
    <div className="flex min-w-0 items-center gap-3">
      <CreativeThumb
        alt={`${label} creative preview`}
        expected={Boolean(row.adId)}
        src={preview?.thumbnailUrl || preview?.imageUrl}
      />
      <div className="min-w-0">
        <span className="line-clamp-1 font-[family-name:var(--font-title)] text-base text-hp-ink">
          {label}
        </span>
        <span className="line-clamp-1 text-[11px] text-hp-muted">
          {sublabel}
        </span>
      </div>
    </div>
  );
}

function CreativeThumb({
  alt,
  expected,
  src,
}: {
  alt: string;
  expected: boolean;
  src?: string | null;
}) {
  const [failedSrc, setFailedSrc] = useState<string | null>(null);
  const failed = Boolean(src && failedSrc === src);

  if (!expected) {
    return (
      <div
        aria-label="No ad creative"
        className="flex h-12 w-12 shrink-0 items-center justify-center border border-hp-rule bg-hp-inset text-[10px] font-medium uppercase tracking-wide text-hp-muted"
      >
        n/a
      </div>
    );
  }

  if (!src || failed) {
    return (
      <div className="flex h-12 w-12 shrink-0 items-center justify-center border border-hp-rule bg-hp-inset text-hp-muted">
        <ImageIcon size={18} aria-hidden />
      </div>
    );
  }

  return (
    <img
      alt={alt}
      className="h-12 w-12 shrink-0 border border-hp-rule bg-hp-inset object-cover"
      onError={() => setFailedSrc(src)}
      src={src}
    />
  );
}

function SourceChip({
  type,
  campaign,
  source,
}: {
  type: string | null;
  campaign: string | null;
  source: string | null;
}) {
  if (!type) {
    if (source) {
      return <span className="line-clamp-1 text-xs text-hp-body">{source}</span>;
    }
    return <span className="text-xs text-hp-muted">Direct / unattributed</span>;
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
    ? "border-signal-info bg-signal-info-bg text-signal-info"
    : "border-signal-positive bg-signal-positive-bg text-signal-positive";
  return (
    <div className="flex flex-col gap-0.5">
      <span
        className={`inline-flex h-[22px] w-fit items-center border px-2 text-[10px] font-bold uppercase tracking-[0.14em] ${style}`}
      >
        {label}
      </span>
      {campaign ? (
        <span className="line-clamp-1 text-[10px] text-hp-muted">{campaign}</span>
      ) : source ? (
        <span className="line-clamp-1 text-[10px] text-hp-muted">{source}</span>
      ) : null}
    </div>
  );
}

function CapiChip({
  hasConversion,
  status,
}: {
  hasConversion: boolean;
  status: string | null;
}) {
  if (!hasConversion) {
    return (
      <span
        title="No booking conversion"
        className="inline-flex h-7 items-center justify-center whitespace-nowrap border border-hp-rule bg-hp-card px-2 text-[9px] font-bold uppercase leading-none tracking-[0.06em] text-hp-muted"
      >
        no booking
      </span>
    );
  }
  if (!status)
    return (
      <span className="inline-flex h-[22px] items-center whitespace-nowrap border border-hp-rule bg-hp-card px-2 text-[10px] font-bold uppercase tracking-[0.14em] text-hp-muted">
        none
      </span>
    );
  const lower = status.toLowerCase();
  const style =
    lower === "success" || lower === "sent"
      ? "border-signal-positive bg-signal-positive-bg text-signal-positive"
      : lower === "queued" || lower === "pending"
        ? "border-signal-warning bg-signal-warning-bg text-signal-warning"
        : "border-signal-danger bg-signal-danger-bg text-signal-danger";
  return (
    <span
      className={`inline-flex h-[22px] items-center whitespace-nowrap border px-2 text-[10px] font-bold uppercase tracking-[0.14em] ${style}`}
    >
      {status}
    </span>
  );
}

function journeyRowFromCurrentUrl(rows: CustomerLedgerRow[]) {
  if (typeof window === "undefined") return null;

  const params = new URLSearchParams(window.location.search);
  const visitorId = params.get("visitorId")?.trim() || null;
  const acuityAppointmentId = params.get("acuityAppointmentId")?.trim() || null;
  const eventId = params.get("eventId")?.trim() || null;

  if (!visitorId && !acuityAppointmentId && !eventId) return null;

  const exactMatch = rows.find((row) => {
    if (visitorId && row.visitorId !== visitorId) return false;
    if (acuityAppointmentId && row.acuityAppointmentId !== acuityAppointmentId) {
      return false;
    }
    if (eventId && row.eventId !== eventId) return false;
    return true;
  });

  if (exactMatch) return exactMatch;

  return emptyJourneyRow(visitorId, acuityAppointmentId, eventId);
}

function emptyJourneyRow(
  visitorId: string | null,
  acuityAppointmentId: string | null,
  eventId: string | null,
): CustomerLedgerRow {
  return {
    adId: null,
    adsetId: null,
    acuityAppointmentId,
    appointmentType: null,
    brand: null,
    campaignId: null,
    capiStatus: null,
    creativePreview: null,
    customerEmail: null,
    customerName: null,
    customerPhone: null,
    deviceBrowser: null,
    eventId,
    firstPage: null,
    geoCity: null,
    geoCountry: null,
    geoRegion: null,
    geoTimezone: null,
    hasConversion: Boolean(acuityAppointmentId || eventId),
    hasPaidTouch: false,
    occurredAt: "",
    paidTouchCampaign: null,
    paidTouchSource: null,
    placement: null,
    rowId: visitorId || eventId || acuityAppointmentId || "journey-detail",
    sessionId: null,
    sourceType: null,
    visitorId,
  };
}

function writeJourneyUrl(row: CustomerLedgerRow) {
  const url = currentJourneyUrlObject(row);
  if (!url) return null;
  window.history.replaceState(null, "", url.toString());
  return url.toString();
}

function currentJourneyUrl(row: CustomerLedgerRow) {
  return currentJourneyUrlObject(row)?.toString() || null;
}

function currentJourneyUrlObject(row: CustomerLedgerRow) {
  if (typeof window === "undefined") return null;
  const url = new URL(window.location.href);
  if (row.visitorId) {
    url.searchParams.set("visitorId", row.visitorId);
  } else {
    url.searchParams.delete("visitorId");
  }
  if (row.acuityAppointmentId) {
    url.searchParams.set("acuityAppointmentId", row.acuityAppointmentId);
    url.searchParams.delete("eventId");
  } else if (row.eventId) {
    url.searchParams.delete("acuityAppointmentId");
    url.searchParams.set("eventId", row.eventId);
  } else {
    url.searchParams.delete("acuityAppointmentId");
    url.searchParams.delete("eventId");
  }
  return url;
}

function clearJourneyUrl() {
  if (typeof window === "undefined") return;
  const url = new URL(window.location.href);
  url.searchParams.delete("visitorId");
  url.searchParams.delete("acuityAppointmentId");
  url.searchParams.delete("eventId");
  window.history.replaceState(null, "", url.toString());
}

function joinedDetail(...values: Array<string | null | undefined>) {
  return values.filter(Boolean).join(" / ") || null;
}

function formatLocationPrimary(row: CustomerLedgerRow) {
  if (row.geoCity && row.geoRegion) return `${row.geoCity}, ${row.geoRegion}`;
  return row.geoCity || row.geoRegion || row.geoCountry || null;
}

function formatLocationSecondary(row: CustomerLedgerRow) {
  if (row.geoCity || row.geoRegion) return row.geoCountry;
  return null;
}

function formatDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return DATE_FMT.format(date);
}
