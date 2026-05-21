"use client";

import {
  Activity,
  AlertCircle,
  ArrowRight,
  CalendarRange,
  CheckCircle2,
  Clock3,
  Database,
  ExternalLink,
  Link2,
  Loader2,
  MousePointerClick,
  ShieldCheck,
  X,
  type LucideIcon,
} from "lucide-react";
import { useCallback, useEffect, useState } from "react";

import type {
  AttributionLedgerData,
  AttributionLedgerDetailData,
  AttributionLedgerRow,
  AttributionLedgerTimelineEvent,
  AttributionLedgerTouchSummary,
} from "@/lib/attribution-ledger";

import { TechnicalId } from "./technical-id";

type Props = {
  initialData: AttributionLedgerData;
};

const NUMBER_FORMATTER = new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 });

export function AttributionLedgerClient({ initialData }: Props) {
  const data = initialData;
  const [startDate, setStartDate] = useState(data.timeRange.start);
  const [endDate, setEndDate] = useState(data.timeRange.end);
  const [isApplyingRange, setIsApplyingRange] = useState(false);
  const [selectedRow, setSelectedRow] = useState<AttributionLedgerRow | null>(null);
  const [detail, setDetail] = useState<AttributionLedgerDetailData | null>(null);
  const [detailError, setDetailError] = useState<string | null>(null);
  const [isLoadingDetail, setIsLoadingDetail] = useState(false);
  const [timelineLink, setTimelineLink] = useState<string | null>(null);
  const [isTimelineLinkCopied, setIsTimelineLinkCopied] = useState(false);
  const [hasOpenedInitialTimelineLink, setHasOpenedInitialTimelineLink] = useState(false);
  const capiTotal = data.summary.capiStatuses.reduce((sum, row) => sum + row.count, 0);

  useEffect(() => {
    if (!selectedRow) return;

    const controller = new AbortController();
    const params = new URLSearchParams({ visitorId: selectedRow.visitorId });
    if (selectedRow.acuityAppointmentId) {
      params.set("acuityAppointmentId", selectedRow.acuityAppointmentId);
    }

    fetch(`/api/attribution-ledger/detail?${params.toString()}`, {
      signal: controller.signal,
    })
      .then(async (response) => {
        const payload = await response.json().catch(() => null);
        if (!response.ok) {
          const message =
            payload && typeof payload === "object" && "error" in payload
              ? String(payload.error)
              : "Could not load attribution detail.";
          throw new Error(message);
        }
        return payload as AttributionLedgerDetailData;
      })
      .then((payload) => {
        if (!controller.signal.aborted) setDetail(payload);
      })
      .catch((error) => {
        if (controller.signal.aborted) return;
        setDetailError(
          error instanceof Error ? error.message : "Could not load attribution detail.",
        );
      })
      .finally(() => {
        if (!controller.signal.aborted) setIsLoadingDetail(false);
      });

    return () => controller.abort();
  }, [selectedRow]);

  const applyDateRange = useCallback(
    function applyDateRange(nextStart = startDate, nextEnd = endDate) {
      if (!nextStart || !nextEnd) return;
      const url = new URL(window.location.href);
      url.searchParams.set("start", nextStart);
      url.searchParams.set("end", nextEnd);
      url.searchParams.delete("days");
      setIsApplyingRange(true);
      window.location.assign(url.toString());
    },
    [endDate, startDate],
  );
  const openDetailDrawer = useCallback((row: AttributionLedgerRow, options?: { syncUrl?: boolean }) => {
    const link =
      options?.syncUrl === false ? currentTimelineUrl(row) : writeTimelineUrl(row);
    setDetail(null);
    setDetailError(null);
    setIsLoadingDetail(true);
    setTimelineLink(link);
    setIsTimelineLinkCopied(false);
    setSelectedRow(row);
  }, []);
  const closeDetailDrawer = useCallback(() => {
    clearTimelineUrl();
    setSelectedRow(null);
    setDetail(null);
    setDetailError(null);
    setIsLoadingDetail(false);
    setTimelineLink(null);
    setIsTimelineLinkCopied(false);
  }, []);
  const copyTimelineLink = useCallback(async () => {
    if (!timelineLink || typeof navigator === "undefined" || !navigator.clipboard) return;

    try {
      await navigator.clipboard.writeText(timelineLink);
      setIsTimelineLinkCopied(true);
    } catch {
      // Clipboard permissions can be blocked by the browser; the link still remains in the URL.
    }
  }, [timelineLink]);

  useEffect(() => {
    if (hasOpenedInitialTimelineLink || selectedRow) return;

    const handle = window.setTimeout(() => {
      const row = timelineRowFromCurrentUrl(data.rows);
      if (row) openDetailDrawer(row, { syncUrl: false });
      setHasOpenedInitialTimelineLink(true);
    }, 0);

    return () => window.clearTimeout(handle);
  }, [data.rows, hasOpenedInitialTimelineLink, openDetailDrawer, selectedRow]);

  useEffect(() => {
    if (!selectedRow) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") closeDetailDrawer();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [closeDetailDrawer, selectedRow]);

  useEffect(() => {
    if (!isTimelineLinkCopied) return;
    const handle = window.setTimeout(() => setIsTimelineLinkCopied(false), 1500);
    return () => window.clearTimeout(handle);
  }, [isTimelineLinkCopied]);

  return (
    <main className="min-h-screen bg-hp-foundation text-hp-body">
      <section className="border-b border-hp-rule bg-hp-card">
        <div className="mx-auto flex max-w-7xl flex-col gap-6 px-4 py-8 md:flex-row md:items-end md:justify-between md:px-8">
          <div>
            <p className="text-[11px] uppercase tracking-[0.16em] text-hp-muted">
              First-party attribution
            </p>
            <h1 className="mt-2 font-title text-4xl font-normal text-hp-ink">
              Attribution Ledger
            </h1>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-hp-muted">
              Visitor-level booking, paid touch, and CAPI context from the Supabase
              ledger.
            </p>
            <p className="mt-4 text-sm text-hp-muted">
              {formatNumber(data.summary.visitorsShown)} visitors shown from{" "}
              <span className="text-hp-ink">{data.timeRange.start}</span> to{" "}
              <span className="text-hp-ink">{data.timeRange.end}</span>
            </p>
          </div>

          <div className="flex flex-wrap items-end gap-3">
            <label className="grid gap-1 text-[11px] uppercase tracking-[0.14em] text-hp-muted">
              Start
              <input
                className="h-10 border border-hp-rule bg-white px-3 text-sm normal-case tracking-normal text-hp-body"
                type="date"
                value={startDate}
                onChange={(event) => setStartDate(event.target.value)}
              />
            </label>
            <label className="grid gap-1 text-[11px] uppercase tracking-[0.14em] text-hp-muted">
              End
              <input
                className="h-10 border border-hp-rule bg-white px-3 text-sm normal-case tracking-normal text-hp-body"
                type="date"
                value={endDate}
                onChange={(event) => setEndDate(event.target.value)}
              />
            </label>
            <button
              className="flex h-10 items-center gap-2 border border-hp-ink bg-hp-ink px-4 text-[11px] uppercase tracking-[0.14em] text-hp-foundation disabled:opacity-60"
              disabled={isApplyingRange}
              onClick={() => applyDateRange()}
            >
              <CalendarRange size={15} />
              {isApplyingRange ? "Loading" : "Apply"}
            </button>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-4 py-8 md:px-8">
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <MetricCard
            icon={Database}
            label="Visitors shown"
            value={data.summary.visitorsShown}
            note="Newest visitor IDs in range"
          />
          <MetricCard
            icon={CheckCircle2}
            label="With conversions"
            value={data.summary.visitorsWithConversions}
            note="Latest booking context found"
          />
          <MetricCard
            icon={MousePointerClick}
            label="With paid touch"
            value={data.summary.visitorsWithPaidTouch}
            note="Meta or paid identifiers retained"
          />
          <MetricCard
            icon={Activity}
            label="CAPI statuses"
            value={capiTotal}
            note={formatCapiSummary(data.summary.capiStatuses)}
          />
        </div>

        <section className="mt-8 border border-hp-rule bg-white">
          <div className="flex flex-col gap-2 border-b border-hp-rule p-5 md:flex-row md:items-end md:justify-between">
            <div>
              <p className="text-[11px] uppercase tracking-[0.16em] text-hp-muted">
                Visitor ledger
              </p>
              <h2 className="mt-1 font-title text-2xl font-normal text-hp-ink">
                Browser IDs linked to bookings and paid touch context
              </h2>
            </div>
            <p className="text-xs text-hp-muted">
              Limited to the newest {formatNumber(data.summary.visitorsShown)} rows
            </p>
          </div>

          {data.rows.length ? (
            <div className="overflow-x-auto scrollbar-thin">
              <table className="min-w-[3000px] text-sm">
                <thead className="bg-hp-inset text-left text-[11px] uppercase tracking-[0.14em] text-hp-muted">
                  <tr>
                    <HeaderCell>Timeline</HeaderCell>
                    <HeaderCell>Visitor ID</HeaderCell>
                    <HeaderCell>Session ID</HeaderCell>
                    <HeaderCell>Customer name</HeaderCell>
                    <HeaderCell>Email</HeaderCell>
                    <HeaderCell>Phone</HeaderCell>
                    <HeaderCell>Acuity appointment ID</HeaderCell>
                    <HeaderCell>Appointment type</HeaderCell>
                    <HeaderCell>Booking time</HeaderCell>
                    <HeaderCell>First page</HeaderCell>
                    <HeaderCell>Last paid source</HeaderCell>
                    <HeaderCell>Campaign ID</HeaderCell>
                    <HeaderCell>Ad set ID</HeaderCell>
                    <HeaderCell>Ad ID</HeaderCell>
                    <HeaderCell>Placement</HeaderCell>
                    <HeaderCell>_fbc</HeaderCell>
                    <HeaderCell>_fbp</HeaderCell>
                    <HeaderCell>Meta event ID</HeaderCell>
                    <HeaderCell>CAPI status</HeaderCell>
                    <HeaderCell>Device/browser</HeaderCell>
                    <HeaderCell>Last seen</HeaderCell>
                  </tr>
                </thead>
                <tbody>
                  {data.rows.map((row) => (
                    <AttributionLedgerTableRow
                      key={row.visitorId}
                      row={row}
                      onSelect={() => openDetailDrawer(row)}
                    />
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="px-5 py-12 text-sm text-hp-muted">
              No visitor ledger rows in this date range.
            </div>
          )}
        </section>
      </section>

      <AttributionDetailDrawer
        detail={detail}
        error={detailError}
        isLinkCopied={isTimelineLinkCopied}
        isLoading={isLoadingDetail}
        onCopyLink={copyTimelineLink}
        onClose={closeDetailDrawer}
        row={selectedRow}
        timelineLink={timelineLink}
      />
    </main>
  );
}

function AttributionLedgerTableRow({
  onSelect,
  row,
}: {
  onSelect: () => void;
  row: AttributionLedgerRow;
}) {
  return (
    <tr
      className="cursor-pointer border-t border-hp-rule align-top transition-colors duration-150 hover:bg-hp-card/70"
      onClick={onSelect}
      title="Open attribution timeline"
    >
      <td className="whitespace-nowrap px-5 py-4">
        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation();
            onSelect();
          }}
          className="inline-flex items-center gap-2 border border-hp-rule px-3 py-1.5 text-[10px] uppercase tracking-[0.14em] text-hp-ink transition-colors duration-150 hover:border-hp-ink hover:bg-hp-ink hover:text-hp-foundation"
        >
          <Clock3 size={13} />
          View
        </button>
      </td>
      <td className="px-5 py-4">
        <TechnicalId value={row.visitorId} label="Visitor ID" truncateTo={18} />
      </td>
      <td className="px-5 py-4">
        <TechnicalId value={row.sessionId} label="Session ID" truncateTo={18} />
      </td>
      <TextCell value={row.customerName} />
      <TextCell value={row.customerEmail} className="max-w-[220px]" />
      <TextCell value={row.customerPhone} />
      <td className="px-5 py-4">
        <TechnicalId
          value={row.acuityAppointmentId}
          label="Acuity appointment ID"
          truncateTo={16}
        />
      </td>
      <TextCell value={row.appointmentType} className="max-w-[220px]" />
      <DateCell value={row.bookingTime} />
      <TextCell value={row.firstPage} className="max-w-[280px]" />
      <TextCell value={row.lastPaidSource} />
      <td className="px-5 py-4">
        <TechnicalId value={row.campaignId} label="Campaign ID" truncateTo={16} />
      </td>
      <td className="px-5 py-4">
        <TechnicalId value={row.adsetId} label="Ad set ID" truncateTo={16} />
      </td>
      <td className="px-5 py-4">
        <TechnicalId value={row.adId} label="Ad ID" truncateTo={16} />
      </td>
      <TextCell value={row.placement} />
      <td className="px-5 py-4">
        <TechnicalId value={row.fbc} label="_fbc" truncateTo={20} />
      </td>
      <td className="px-5 py-4">
        <TechnicalId value={row.fbp} label="_fbp" truncateTo={20} />
      </td>
      <td className="px-5 py-4">
        <TechnicalId value={row.metaEventId} label="Meta event ID" truncateTo={18} />
      </td>
      <td className="px-5 py-4">
        <CapiStatus value={row.capiStatus} />
      </td>
      <TextCell value={row.deviceBrowser} className="max-w-[220px]" />
      <DateCell value={row.lastSeen} />
    </tr>
  );
}

function AttributionDetailDrawer({
  detail,
  error,
  isLinkCopied,
  isLoading,
  onCopyLink,
  onClose,
  row,
  timelineLink,
}: {
  detail: AttributionLedgerDetailData | null;
  error: string | null;
  isLinkCopied: boolean;
  isLoading: boolean;
  onCopyLink: () => void;
  onClose: () => void;
  row: AttributionLedgerRow | null;
  timelineLink: string | null;
}) {
  if (!row) return null;
  const title =
    row.customerName ||
    (row.acuityAppointmentId ? `Acuity ${row.acuityAppointmentId}` : "Visitor detail");
  const bookingTime = detail?.booking?.bookingTime || row.bookingTime;

  return (
    <div className="fixed inset-0 z-50 flex">
      <button
        type="button"
        aria-label="Close attribution detail"
        onClick={onClose}
        className="flex-1 bg-hp-ink/40 transition-opacity duration-150"
      />
      <aside
        role="dialog"
        aria-modal="true"
        aria-labelledby="attribution-detail-title"
        className="flex h-full w-full max-w-[680px] flex-col border-l border-hp-rule bg-hp-card shadow-[-8px_0_24px_rgba(42,39,37,0.08)]"
      >
        <header className="flex items-start justify-between gap-4 border-b border-hp-rule px-6 py-5">
          <div className="min-w-0">
            <p className="text-[10px] uppercase tracking-[0.14em] text-hp-muted">
              Attribution timeline
            </p>
            <h3
              id="attribution-detail-title"
              className="mt-1 font-title text-2xl leading-tight text-hp-ink [overflow-wrap:anywhere]"
            >
              {title}
            </h3>
            <div className="mt-3 flex flex-wrap items-center gap-3 text-[11px] text-hp-muted">
              <span>
                Booking:{" "}
                <span className="text-hp-ink">
                  {bookingTime ? formatDateTime(bookingTime) : "n/a"}
                </span>
              </span>
              {row.acuityAppointmentId ? (
                <TechnicalId
                  value={row.acuityAppointmentId}
                  label="Acuity appointment ID"
                  truncateTo={18}
                  size="xs"
                />
              ) : null}
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <button
              type="button"
              onClick={onCopyLink}
              disabled={!timelineLink}
              className="inline-flex items-center gap-2 border border-hp-rule px-3 py-2 text-[10px] uppercase tracking-[0.14em] text-hp-muted transition-colors duration-150 hover:border-hp-ink hover:text-hp-ink disabled:hover:border-hp-rule disabled:hover:text-hp-muted"
            >
              {isLinkCopied ? <CheckCircle2 size={14} /> : <Link2 size={14} />}
              {isLinkCopied ? "Copied" : "Copy link"}
            </button>
            <button
              type="button"
              onClick={onClose}
              className="border border-hp-rule p-2 text-hp-muted transition-colors duration-150 hover:border-hp-ink hover:text-hp-ink"
              aria-label="Close attribution detail"
              title="Close"
            >
              <X size={17} />
            </button>
          </div>
        </header>

        <div className="flex-1 overflow-y-auto">
          {isLoading ? <DetailLoadingState /> : null}
          {error ? <DetailErrorState message={error} /> : null}
          {!isLoading && !error && detail ? <AttributionDetailContent detail={detail} row={row} /> : null}
        </div>
      </aside>
    </div>
  );
}

function DetailLoadingState() {
  return (
    <div className="flex min-h-[360px] items-center justify-center p-8 text-sm text-hp-muted">
      <div className="text-center">
        <Loader2 className="mx-auto animate-spin text-hp-ink" size={24} />
        <p className="mt-4">Loading attribution timeline...</p>
      </div>
    </div>
  );
}

function DetailErrorState({ message }: { message: string }) {
  return (
    <div className="p-6">
      <div className="border border-signal-danger/30 bg-signal-danger/10 p-5 text-sm text-signal-danger">
        <div className="flex items-start gap-3">
          <AlertCircle className="mt-0.5 shrink-0" size={18} />
          <div>
            <p className="font-medium">Timeline could not be loaded.</p>
            <p className="mt-1 leading-6">{message}</p>
          </div>
        </div>
      </div>
    </div>
  );
}

function AttributionDetailContent({
  detail,
  row,
}: {
  detail: AttributionLedgerDetailData;
  row: AttributionLedgerRow;
}) {
  return (
    <>
      <section className="border-b border-hp-rule p-6">
        {detail.summary ? (
          <p className="text-base leading-7 text-hp-ink">{detail.summary}</p>
        ) : (
          <p className="text-base leading-7 text-hp-muted">
            No booking conversion was found for this visitor.
          </p>
        )}
        <div className="mt-5 grid gap-3 md:grid-cols-3">
          <DetailMiniMetric
            label="Match confidence"
            value={confidenceLabel(detail.confidence.level)}
            icon={ShieldCheck}
          />
          <DetailMiniMetric
            label="Meta CAPI"
            value={detail.capi.status || row.capiStatus || "n/a"}
            icon={Activity}
          />
          <DetailMiniMetric
            label="Timeline events"
            value={formatNumber(detail.timeline.length)}
            icon={Clock3}
          />
        </div>
      </section>

      <section className="grid gap-4 border-b border-hp-rule p-6 lg:grid-cols-2">
        <TouchSummaryCard
          emptyMessage="No paid ad touch was found for this visitor."
          title="Credited paid touch"
          touch={detail.creditedTouch}
        />
        <TouchSummaryCard
          emptyMessage="No separate return visit was found before the booking."
          title="Return touch"
          touch={detail.returnTouch}
        />
      </section>

      <TimelineSection events={detail.timeline} />

      <section className="border-t border-hp-rule p-6">
        <div className="text-[10px] uppercase tracking-[0.14em] text-hp-muted">
          Confidence
        </div>
        <p className="mt-3 text-sm leading-6 text-hp-body">
          {detail.confidence.explanation}
        </p>
        {detail.confidence.signals.length ? (
          <ul className="mt-4 space-y-2 text-sm text-hp-muted">
            {detail.confidence.signals.map((signal) => (
              <li key={signal} className="flex gap-2">
                <span aria-hidden className="mt-2 h-1.5 w-1.5 shrink-0 bg-hp-ink" />
                <span>{signal}</span>
              </li>
            ))}
          </ul>
        ) : null}
      </section>
    </>
  );
}

function DetailMiniMetric({
  icon: Icon,
  label,
  value,
}: {
  icon: LucideIcon;
  label: string;
  value: string;
}) {
  return (
    <div className="border border-hp-rule bg-white p-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-[10px] uppercase tracking-[0.14em] text-hp-muted">{label}</p>
        <Icon size={15} className="text-hp-muted" />
      </div>
      <p className="mt-3 truncate text-sm text-hp-ink" title={value}>
        {value}
      </p>
    </div>
  );
}

function TouchSummaryCard({
  emptyMessage,
  title,
  touch,
}: {
  emptyMessage: string;
  title: string;
  touch: AttributionLedgerTouchSummary | null;
}) {
  return (
    <section className="border border-hp-rule bg-white p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[10px] uppercase tracking-[0.14em] text-hp-muted">{title}</p>
          <p className="mt-1 text-xs text-hp-muted">
            {touch?.capturedAt ? formatDateTime(touch.capturedAt) : "No timestamp"}
          </p>
        </div>
        {touch ? <PresencePills touch={touch} /> : null}
      </div>

      {touch ? (
        <div className="mt-5 space-y-4">
          <dl className="grid gap-3 text-sm">
            <DetailField label="Source" value={joinedDetail(touch.source, touch.medium)} />
            <DetailField label="Content" value={touch.content} />
            <DetailField label="Placement" value={touch.placement} />
            <DetailIdField label="Campaign ID" value={touch.campaignId} />
            <DetailIdField label="Ad set ID" value={touch.adsetId} />
            <DetailIdField label="Ad ID" value={touch.adId} />
          </dl>
          <DetailUrl label="Page URL" value={touch.pageUrl} />
          <DetailUrl label="Referrer" value={touch.referrer} />
        </div>
      ) : (
        <p className="mt-5 text-sm leading-6 text-hp-muted">{emptyMessage}</p>
      )}
    </section>
  );
}

function PresencePills({ touch }: { touch: AttributionLedgerTouchSummary }) {
  const signals = [
    ["fbclid", touch.fbclidPresent],
    ["_fbc", touch.fbcPresent],
    ["_fbp", touch.fbpPresent],
  ] as const;

  return (
    <div className="flex flex-wrap justify-end gap-1.5">
      {signals.map(([label, present]) => (
        <span
          key={label}
          className={`border px-2 py-1 text-[10px] uppercase tracking-[0.12em] ${
            present
              ? "border-signal-positive/30 bg-signal-positive/10 text-signal-positive"
              : "border-hp-rule bg-hp-card text-hp-muted"
          }`}
        >
          {label} {present ? "yes" : "no"}
        </span>
      ))}
    </div>
  );
}

function TimelineSection({ events }: { events: AttributionLedgerTimelineEvent[] }) {
  return (
    <section className="p-6">
      <div className="flex items-end justify-between gap-4">
        <div>
          <p className="text-[10px] uppercase tracking-[0.14em] text-hp-muted">
            Event path
          </p>
          <h4 className="mt-1 font-title text-2xl font-normal text-hp-ink">
            Timeline
          </h4>
        </div>
        <p className="text-xs text-hp-muted">{formatNumber(events.length)} events</p>
      </div>

      {events.length ? (
        <ol className="mt-5 border-y border-hp-rule">
          {events.map((event, index) => (
            <TimelineEventItem
              key={`${event.occurredAt}-${event.eventId || event.label}-${index}`}
              event={event}
              isLast={index === events.length - 1}
            />
          ))}
        </ol>
      ) : (
        <p className="mt-5 border border-hp-rule bg-white p-5 text-sm text-hp-muted">
          No timeline events were found for this visitor.
        </p>
      )}
    </section>
  );
}

function TimelineEventItem({
  event,
  isLast,
}: {
  event: AttributionLedgerTimelineEvent;
  isLast: boolean;
}) {
  const idFields = [
    ["Campaign", event.campaignId],
    ["Ad set", event.adsetId],
    ["Ad", event.adId],
  ] as const;
  const hasIds = idFields.some(([, value]) => Boolean(value));
  const signals = [
    event.fbclidPresent ? "fbclid present" : null,
    event.fbcPresent ? "_fbc present" : null,
    event.fbpPresent ? "_fbp present" : null,
  ].filter(Boolean);

  return (
    <li
      className={`grid gap-4 bg-white px-4 py-5 md:grid-cols-[118px_1fr] ${
        isLast ? "" : "border-b border-hp-rule"
      }`}
    >
      <time className="text-xs leading-5 text-hp-muted" dateTime={event.occurredAt}>
        {formatTimelineDate(event.occurredAt)}
      </time>
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <span
            className={`border px-2 py-1 text-[10px] uppercase tracking-[0.12em] ${timelineTone(
              event.category,
            )}`}
          >
            {categoryLabel(event.category)}
          </span>
          <h5 className="text-sm font-medium text-hp-ink">{event.label}</h5>
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-hp-muted">
          <span>{joinedDetail(event.source, event.medium, event.content, event.placement) || "No source detail"}</span>
          {event.eventId ? (
            <>
              <ArrowRight size={12} aria-hidden />
              <TechnicalId value={event.eventId} label="Event ID" truncateTo={22} size="xs" />
            </>
          ) : null}
        </div>

        {hasIds ? (
          <dl className="mt-4 grid gap-2 text-xs md:grid-cols-3">
            {idFields.map(([label, value]) => (
              <div key={label}>
                <dt className="uppercase tracking-[0.12em] text-hp-muted">{label}</dt>
                <dd className="mt-1">
                  <TechnicalId value={value} label={`${label} ID`} truncateTo={18} size="xs" />
                </dd>
              </div>
            ))}
          </dl>
        ) : null}

        {signals.length ? (
          <div className="mt-3 flex flex-wrap gap-1.5">
            {signals.map((signal) => (
              <span
                key={signal}
                className="border border-signal-positive/30 bg-signal-positive/10 px-2 py-1 text-[10px] uppercase tracking-[0.12em] text-signal-positive"
              >
                {signal}
              </span>
            ))}
          </div>
        ) : null}

        <div className="mt-4 space-y-3">
          <DetailUrl label="Page URL" value={event.pageUrl} />
          <DetailUrl label="Referrer" value={event.referrer} />
        </div>
      </div>
    </li>
  );
}

function DetailField({ label, value }: { label: string; value: string | null }) {
  return (
    <div className="grid grid-cols-[92px_1fr] gap-3">
      <dt className="text-[10px] uppercase tracking-[0.14em] text-hp-muted">{label}</dt>
      <dd className="min-w-0 text-hp-ink [overflow-wrap:anywhere]">{value || "n/a"}</dd>
    </div>
  );
}

function DetailIdField({ label, value }: { label: string; value: string | null }) {
  return (
    <div className="grid grid-cols-[92px_1fr] gap-3">
      <dt className="text-[10px] uppercase tracking-[0.14em] text-hp-muted">{label}</dt>
      <dd className="min-w-0">
        <TechnicalId value={value} label={label} truncateTo={22} size="xs" />
      </dd>
    </div>
  );
}

function DetailUrl({ label, value }: { label: string; value: string | null }) {
  if (!value) return null;

  return (
    <div className="text-xs">
      <div className="mb-1 text-[10px] uppercase tracking-[0.14em] text-hp-muted">
        {label}
      </div>
      <a
        href={value}
        target="_blank"
        rel="noreferrer noopener"
        className="inline-flex max-w-full items-start gap-1.5 text-hp-muted transition-colors duration-150 hover:text-hp-ink"
      >
        <span className="break-all">{value}</span>
        <ExternalLink className="mt-0.5 shrink-0" size={12} />
      </a>
    </div>
  );
}

function MetricCard({
  icon: Icon,
  label,
  note,
  value,
}: {
  icon: LucideIcon;
  label: string;
  note: string;
  value: number;
}) {
  return (
    <div className="border border-hp-rule bg-white p-5">
      <div className="flex items-center justify-between gap-4">
        <p className="text-[11px] uppercase tracking-[0.16em] text-hp-muted">{label}</p>
        <Icon className="text-hp-pink" size={18} />
      </div>
      <div className="mt-4 font-title text-4xl text-hp-ink">{formatNumber(value)}</div>
      <p className="mt-2 truncate text-sm text-hp-muted" title={note}>
        {note}
      </p>
    </div>
  );
}

function HeaderCell({ children }: { children: React.ReactNode }) {
  return <th className="whitespace-nowrap px-5 py-3 font-normal">{children}</th>;
}

function TextCell({
  className = "max-w-[180px]",
  value,
}: {
  className?: string;
  value: string | null;
}) {
  if (!value) {
    return <td className="px-5 py-4 text-xs italic text-hp-muted">n/a</td>;
  }

  return (
    <td className={`px-5 py-4 text-hp-muted ${className}`} title={value}>
      <div className="truncate">{value}</div>
    </td>
  );
}

function DateCell({ value }: { value: string | null }) {
  if (!value) {
    return <td className="whitespace-nowrap px-5 py-4 text-xs italic text-hp-muted">n/a</td>;
  }

  return (
    <td className="whitespace-nowrap px-5 py-4 text-hp-muted" title={value}>
      {formatDateTime(value)}
    </td>
  );
}

function CapiStatus({ value }: { value: string | null }) {
  if (!value) {
    return <span className="text-xs italic text-hp-muted">n/a</span>;
  }

  const tone = capiTone(value);
  return (
    <span className={`inline-flex whitespace-nowrap border px-2 py-1 text-xs ${tone}`}>
      {value}
    </span>
  );
}

function capiTone(value: string) {
  const normalized = value.toLowerCase();
  if (normalized.includes("sent") || normalized.includes("success")) {
    return "border-[#245D4D]/30 bg-[#245D4D]/10 text-[#245D4D]";
  }
  if (normalized.includes("fail") || normalized.includes("error")) {
    return "border-[#8D2E2E]/30 bg-[#8D2E2E]/10 text-[#8D2E2E]";
  }
  return "border-[#8B5B19]/30 bg-[#8B5B19]/10 text-[#8B5B19]";
}

function confidenceLabel(level: AttributionLedgerDetailData["confidence"]["level"]) {
  const labels: Record<AttributionLedgerDetailData["confidence"]["level"], string> = {
    browser_session: "Same browser session",
    browser_visitor: "Same browser visitor",
    unmatched: "Unmatched",
  };
  return labels[level];
}

function categoryLabel(category: AttributionLedgerTimelineEvent["category"]) {
  const labels: Record<AttributionLedgerTimelineEvent["category"], string> = {
    ad_touch: "Ad touch",
    booking: "Booking",
    capi: "CAPI",
    conversion: "Conversion",
    engagement: "Engagement",
    page: "Page",
  };
  return labels[category];
}

function timelineTone(category: AttributionLedgerTimelineEvent["category"]) {
  if (category === "ad_touch") {
    return "border-hp-ink/30 bg-hp-ink/10 text-hp-ink";
  }
  if (category === "booking" || category === "conversion") {
    return "border-signal-positive/30 bg-signal-positive/10 text-signal-positive";
  }
  if (category === "capi") {
    return "border-[#8B5B19]/30 bg-[#8B5B19]/10 text-[#8B5B19]";
  }
  return "border-hp-rule bg-hp-card text-hp-muted";
}

function joinedDetail(...values: Array<string | null | undefined>) {
  return values.filter(Boolean).join(" / ") || null;
}

function timelineRowFromCurrentUrl(rows: AttributionLedgerRow[]) {
  if (typeof window === "undefined") return null;

  const params = new URLSearchParams(window.location.search);
  const visitorId = params.get("visitorId")?.trim() || null;
  const acuityAppointmentId = params.get("acuityAppointmentId")?.trim() || null;

  if (!visitorId && !acuityAppointmentId) return null;

  const exactMatch = rows.find((row) => {
    if (visitorId && row.visitorId !== visitorId) return false;
    if (acuityAppointmentId && row.acuityAppointmentId !== acuityAppointmentId) return false;
    return true;
  });

  if (exactMatch) return exactMatch;
  if (!visitorId) return null;

  return emptyTimelineRow(visitorId, acuityAppointmentId);
}

function emptyTimelineRow(
  visitorId: string,
  acuityAppointmentId: string | null,
): AttributionLedgerRow {
  return {
    adId: null,
    adsetId: null,
    acuityAppointmentId,
    appointmentType: null,
    bookingTime: null,
    brand: null,
    browserName: null,
    campaignId: null,
    capiStatus: null,
    conversionEventId: null,
    customerEmail: null,
    customerName: null,
    customerPhone: null,
    deviceBrowser: null,
    deviceCategory: null,
    fbc: null,
    fbp: null,
    firstPage: null,
    hasConversion: Boolean(acuityAppointmentId),
    hasPaidTouch: false,
    lastPaidSource: null,
    lastPaidSourceType: null,
    lastSeen: "",
    metaEventId: null,
    osName: null,
    placement: null,
    sessionId: null,
    visitorId,
  };
}

function writeTimelineUrl(row: AttributionLedgerRow) {
  const url = currentTimelineUrlObject(row);
  if (!url) return null;
  window.history.replaceState(null, "", url.toString());
  return url.toString();
}

function currentTimelineUrl(row: AttributionLedgerRow) {
  return currentTimelineUrlObject(row)?.toString() || null;
}

function currentTimelineUrlObject(row: AttributionLedgerRow) {
  if (typeof window === "undefined") return null;
  const url = new URL(window.location.href);
  url.searchParams.set("visitorId", row.visitorId);
  if (row.acuityAppointmentId) {
    url.searchParams.set("acuityAppointmentId", row.acuityAppointmentId);
  } else {
    url.searchParams.delete("acuityAppointmentId");
  }
  return url;
}

function clearTimelineUrl() {
  if (typeof window === "undefined") return;
  const url = new URL(window.location.href);
  url.searchParams.delete("visitorId");
  url.searchParams.delete("acuityAppointmentId");
  window.history.replaceState(null, "", url.toString());
}

function formatCapiSummary(statuses: AttributionLedgerData["summary"]["capiStatuses"]) {
  if (!statuses.length) return "No CAPI statuses";
  return statuses.map((row) => `${row.status}: ${formatNumber(row.count)}`).join(" · ");
}

function formatTimelineDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString(undefined, {
    day: "2-digit",
    hour: "numeric",
    minute: "2-digit",
    month: "short",
  });
}

function formatDateTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString();
}

function formatNumber(value: number) {
  return NUMBER_FORMATTER.format(value);
}
