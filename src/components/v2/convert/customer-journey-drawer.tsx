"use client";

import {
  Activity,
  AlertCircle,
  ArrowRight,
  CalendarCheck2,
  CheckCircle2,
  Clock3,
  ExternalLink,
  ImageIcon,
  Link2,
  Loader2,
  MousePointerClick,
  ShieldCheck,
  UserRound,
  X,
  type LucideIcon,
} from "lucide-react";
import { useState, type ReactNode } from "react";

import { TechnicalId } from "@/components/technical-id";
import type { CustomerLedgerRow } from "@/lib/convert-customer-ledger";
import type {
  CustomerJourneyLedgerDetailData,
  CustomerJourneyLedgerTimelineEvent,
  CustomerJourneyLedgerTouchSummary,
} from "@/lib/customer-journey-ledger";
import { formatTimeToBook } from "@/lib/time-to-book";

type Props = {
  detail: CustomerJourneyLedgerDetailData | null;
  error: string | null;
  isLinkCopied: boolean;
  isLoading: boolean;
  onClose: () => void;
  onCopyLink: () => void;
  row: CustomerLedgerRow | null;
  timelineLink: string | null;
};

const NUMBER_FORMATTER = new Intl.NumberFormat("en-US", {
  maximumFractionDigits: 0,
});

export function CustomerJourneyDrawer({
  detail,
  error,
  isLinkCopied,
  isLoading,
  onClose,
  onCopyLink,
  row,
  timelineLink,
}: Props) {
  if (!row) return null;

  const title =
    row.customerName ||
    (row.acuityAppointmentId ? `Acuity ${row.acuityAppointmentId}` : "Visitor journey");
  const bookingTime = detail?.booking?.bookingTime || (row.hasConversion ? row.occurredAt : null);

  return (
    <div className="fixed inset-0 z-50 flex">
      <button
        type="button"
        aria-label="Close customer journey detail"
        onClick={onClose}
        className="flex-1 bg-hp-ink/35 transition-opacity"
      />
      <aside
        role="dialog"
        aria-modal="true"
        aria-labelledby="customer-journey-title"
        className="flex h-full w-full max-w-[720px] flex-col border-l border-hp-rule bg-hp-card shadow-[-12px_0_32px_rgba(42,39,37,0.10)]"
      >
        <header className="border-b border-hp-rule bg-hp-inset px-5 py-4">
          <div className="flex items-start justify-between gap-4">
            <div className="flex min-w-0 gap-4">
              <CreativePreview
                className="h-28 w-28 shrink-0 border border-hp-rule bg-hp-card"
                preview={row.creativePreview}
                title={title}
              />
              <div className="min-w-0">
                <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-hp-muted">
                  Customer journey
                </p>
                <h3
                  id="customer-journey-title"
                  className="mt-1 font-[family-name:var(--font-title)] text-2xl leading-tight text-hp-ink [overflow-wrap:anywhere]"
                >
                  {title}
                </h3>
                <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-hp-muted">
                  <span>
                    Booking:{" "}
                    <span className="text-hp-ink">
                      {bookingTime ? formatDateTime(bookingTime) : "none found"}
                    </span>
                  </span>
                  {row.customerEmail ? <span>{row.customerEmail}</span> : null}
                  {row.customerPhone ? <span>{row.customerPhone}</span> : null}
                </div>
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  {row.brand ? <BrandChip value={row.brand} /> : null}
                  <CapiStatusChip status={detail?.capi.status || row.capiStatus} />
                </div>
              </div>
            </div>

            <div className="flex shrink-0 items-center gap-2">
              <button
                type="button"
                onClick={onCopyLink}
                disabled={!timelineLink}
                className="inline-flex h-9 items-center gap-2 border border-hp-rule bg-hp-card px-3 text-[11px] font-medium text-hp-muted transition hover:border-hp-ink hover:text-hp-ink disabled:opacity-50"
              >
                {isLinkCopied ? <CheckCircle2 size={14} /> : <Link2 size={14} />}
                {isLinkCopied ? "Copied" : "Copy"}
              </button>
              <button
                type="button"
                onClick={onClose}
                className="inline-flex h-9 w-9 items-center justify-center border border-hp-rule bg-hp-card text-hp-muted transition hover:border-hp-ink hover:text-hp-ink"
                aria-label="Close customer journey detail"
                title="Close"
              >
                <X size={17} />
              </button>
            </div>
          </div>
        </header>

        <div className="flex-1 overflow-y-auto">
          {isLoading ? <DetailLoadingState /> : null}
          {error ? <DetailErrorState message={error} /> : null}
          {!isLoading && !error && detail ? (
            <CustomerJourneyDetailContent detail={detail} row={row} />
          ) : null}
        </div>
      </aside>
    </div>
  );
}

function CustomerJourneyDetailContent({
  detail,
  row,
}: {
  detail: CustomerJourneyLedgerDetailData;
  row: CustomerLedgerRow;
}) {
  const conversionAt = row.occurredAt;
  const creditedTouchAt = detail.creditedTouch?.capturedAt ?? null;
  const deltaMs =
    conversionAt && creditedTouchAt
      ? Date.parse(conversionAt) - Date.parse(creditedTouchAt)
      : null;
  const timeToBook = formatTimeToBook(deltaMs);
  const attributedCreative =
    detail.creditedTouch?.content || detail.creditedTouch?.adId || null;

  return (
    <>
      <section className="border-b border-hp-rule p-5">
        <p className="text-sm leading-6 text-hp-body">
          {detail.summary || "No booking conversion was found for this visitor."}
        </p>
        <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <DetailMiniMetric
            icon={ShieldCheck}
            label="Match"
            value={confidenceLabel(detail.confidence.level)}
          />
          <DetailMiniMetric
            icon={Activity}
            label="Meta CAPI"
            value={detail.capi.status || row.capiStatus || "n/a"}
          />
          <DetailMiniMetric
            icon={Clock3}
            label="Timeline"
            value={`${formatNumber(detail.timeline.length)} events`}
          />
          <DetailMiniMetric
            icon={Clock3}
            label="Time to book"
            value={
              timeToBook.unit ? (
                <span>
                  <span className="font-[family-name:var(--font-title)] tabular-nums">
                    {timeToBook.value}
                  </span>{" "}
                  <span className="text-[10px] uppercase tracking-[0.14em] text-hp-muted">
                    {timeToBook.unit}
                  </span>
                </span>
              ) : (
                "—"
              )
            }
          />
        </div>
        <div className="mt-4 border-t border-hp-rule-soft pt-4">
          <p className="text-[10px] uppercase tracking-[0.14em] text-hp-muted">
            Attributed creative
          </p>
          <p className="mt-1 font-[family-name:var(--font-title)] text-lg italic text-hp-ink">
            {attributedCreative ?? "—"}
          </p>
        </div>
      </section>

      <CreativePreviewPanel row={row} />

      <section className="grid gap-4 border-b border-hp-rule p-5 lg:grid-cols-2">
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

      <section className="grid gap-4 border-b border-hp-rule p-5 lg:grid-cols-2">
        <DetailPanel title="Booking and customer" icon={CalendarCheck2}>
          <DetailField label="Appointment" value={detail.booking?.appointmentType || row.appointmentType} />
          <DetailField label="Brand" value={row.brand} />
          <DetailField label="Email" value={row.customerEmail} />
          <DetailField label="Phone" value={row.customerPhone} />
          <DetailIdField
            label="Acuity ID"
            value={detail.acuityAppointmentId || row.acuityAppointmentId}
          />
          <DetailIdField label="Event ID" value={detail.booking?.eventId || row.eventId} />
        </DetailPanel>
        <DetailPanel title="Browser context" icon={UserRound}>
          <DetailField label="Device" value={row.deviceBrowser} />
          <DetailField label="Approx. location" value={formatApproxLocation(detail, row)} />
          <DetailField label="Timezone" value={detail.geoTimezone || row.geoTimezone} />
          <DetailUrl label="First page" value={row.firstPage} />
          <DetailIdField label="Visitor ID" value={row.visitorId} />
          <DetailIdField label="Session ID" value={detail.booking?.sessionId || row.sessionId} />
          <DetailIdField label="Meta event" value={detail.booking?.metaEventId || detail.capi.eventId} />
        </DetailPanel>
      </section>

      <TimelineSection events={detail.timeline} />

      <section className="border-t border-hp-rule p-5">
        <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-hp-muted">
          Confidence
        </div>
        <p className="mt-2 text-sm leading-6 text-hp-body">
          {detail.confidence.explanation}
        </p>
        {detail.confidence.signals.length ? (
          <ul className="mt-3 space-y-2 text-sm text-hp-muted">
            {detail.confidence.signals.map((signal) => (
              <li key={signal} className="flex gap-2">
                <span aria-hidden className="mt-2 h-1.5 w-1.5 shrink-0 bg-hp-muted" />
                <span>{signal}</span>
              </li>
            ))}
          </ul>
        ) : null}
      </section>
    </>
  );
}

function CreativePreviewPanel({ row }: { row: CustomerLedgerRow }) {
  const preview = row.creativePreview;
  const title =
    preview?.creativeName ||
    preview?.title ||
    preview?.adName ||
    row.paidTouchCampaign ||
    row.paidTouchSource ||
    "No paid creative attached";

  return (
    <section className="grid gap-4 border-b border-hp-rule p-5 lg:grid-cols-[220px_1fr]">
      <CreativePreview
        className="aspect-[4/3] w-full border border-hp-rule bg-hp-inset"
        preview={preview}
        title={title}
      />
      <div className="min-w-0">
        <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-hp-muted">
          Ad creative
        </p>
        <h4 className="mt-1 font-[family-name:var(--font-title)] text-lg text-hp-ink [overflow-wrap:anywhere]">
          {title}
        </h4>
        {preview?.body ? (
          <p className="mt-2 line-clamp-3 text-sm leading-6 text-hp-body">
            {preview.body}
          </p>
        ) : null}
        <dl className="mt-4 grid gap-2 text-sm sm:grid-cols-2">
          <DetailField label="Source" value={joinedDetail(row.paidTouchSource, row.sourceType)} />
          <DetailField label="Placement" value={row.placement} />
          <DetailIdField label="Campaign ID" value={row.campaignId} />
          <DetailIdField label="Ad set ID" value={row.adsetId} />
          <DetailIdField label="Ad ID" value={row.adId} />
          <DetailIdField label="Creative ID" value={preview?.creativeId} />
        </dl>
        <DetailUrl label="Preview URL" value={preview?.previewUrl || null} />
      </div>
    </section>
  );
}

function CreativePreview({
  className,
  preview,
  title,
}: {
  className: string;
  preview: CustomerLedgerRow["creativePreview"];
  title: string;
}) {
  const [failedSrc, setFailedSrc] = useState<string | null>(null);
  const imageSrc = preview?.thumbnailUrl || preview?.imageUrl;
  const failed = Boolean(imageSrc && failedSrc === imageSrc);

  if (preview?.previewHtml && preview.previewSource === "ad_preview") {
    return (
      <iframe
        title={`${title} preview`}
        srcDoc={preview.previewHtml}
        sandbox=""
        className={className}
      />
    );
  }

  if (imageSrc && !failed) {
    return (
      <img
        src={imageSrc}
        alt={title}
        className={`object-cover ${className}`}
        loading="lazy"
        referrerPolicy="no-referrer"
        onError={() => setFailedSrc(imageSrc)}
      />
    );
  }

  return (
    <div className={`flex items-center justify-center text-hp-muted ${className}`}>
      <ImageIcon size={20} aria-hidden />
    </div>
  );
}

function BrandChip({ value }: { value: string }) {
  return (
    <span className="inline-flex h-6 items-center border border-hp-rule bg-hp-card px-2 text-[10px] font-bold uppercase tracking-[0.14em] text-hp-ink">
      {value}
    </span>
  );
}

function CapiStatusChip({ status }: { status: string | null | undefined }) {
  const label = status || "n/a";
  return (
    <span
      className={`inline-flex h-6 items-center border px-2 text-[10px] font-bold uppercase tracking-[0.14em] ${capiStatusClass(
        label,
      )}`}
    >
      CAPI {label}
    </span>
  );
}

function capiStatusClass(status: string) {
  const value = status.toLowerCase();
  if (value === "success" || value === "sent") {
    return "border-signal-positive bg-signal-positive-bg text-signal-positive";
  }
  if (value === "queued" || value === "pending") {
    return "border-signal-warning bg-signal-warning-bg text-signal-warning";
  }
  if (value === "error" || value === "failed" || value === "missing") {
    return "border-signal-danger bg-signal-danger-bg text-signal-danger";
  }
  return "border-hp-rule bg-hp-card text-hp-muted";
}

function DetailMiniMetric({
  icon: Icon,
  label,
  value,
}: {
  icon: LucideIcon;
  label: string;
  value: ReactNode;
}) {
  const title = typeof value === "string" ? value : undefined;
  return (
    <div className="border border-hp-rule bg-hp-inset p-3">
      <div className="flex items-center justify-between gap-3">
        <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-hp-muted">
          {label}
        </p>
        <Icon size={15} className="text-hp-muted" />
      </div>
      <p className="mt-2 truncate font-[family-name:var(--font-title)] text-[22px] leading-none text-hp-ink" title={title}>
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
  touch: CustomerJourneyLedgerTouchSummary | null;
}) {
  return (
    <DetailPanel title={title} icon={MousePointerClick}>
      {touch ? (
        <>
          <DetailField label="Captured" value={touch.capturedAt ? formatDateTime(touch.capturedAt) : null} />
          <DetailField label="Source" value={joinedDetail(touch.source, touch.medium)} />
          <DetailField label="Content" value={touch.content} />
          <DetailField label="Placement" value={touch.placement} />
          <DetailIdField label="Campaign ID" value={touch.campaignId} />
          <DetailIdField label="Ad set ID" value={touch.adsetId} />
          <DetailIdField label="Ad ID" value={touch.adId} />
          <PresencePills touch={touch} />
          <DetailUrl label="Page URL" value={touch.pageUrl} />
          <DetailUrl label="Referrer" value={touch.referrer} />
        </>
      ) : (
        <p className="text-sm leading-6 text-hp-muted">{emptyMessage}</p>
      )}
    </DetailPanel>
  );
}

function DetailPanel({
  children,
  icon: Icon,
  title,
}: {
  children: ReactNode;
  icon: LucideIcon;
  title: string;
}) {
  return (
    <section className="border border-hp-rule bg-hp-card p-4">
      <div className="mb-4 flex items-center justify-between gap-3">
        <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-hp-muted">
          {title}
        </p>
        <Icon size={15} className="text-hp-muted" />
      </div>
      <div className="space-y-3">{children}</div>
    </section>
  );
}

function PresencePills({ touch }: { touch: CustomerJourneyLedgerTouchSummary }) {
  const signals = [
    ["fbclid", touch.fbclidPresent],
    ["_fbc", touch.fbcPresent],
    ["_fbp", touch.fbpPresent],
  ] as const;

  return (
    <div className="flex flex-wrap gap-1.5">
      {signals.map(([label, present]) => (
        <span
          key={label}
          className={`border px-2 py-1 text-[10px] font-medium ${
            present
              ? "border-signal-positive bg-signal-positive-bg text-signal-positive"
              : "border-hp-rule bg-hp-card text-hp-muted"
          }`}
        >
          {label} {present ? "yes" : "no"}
        </span>
      ))}
    </div>
  );
}

function TimelineSection({ events }: { events: CustomerJourneyLedgerTimelineEvent[] }) {
  return (
    <section className="p-5">
      <div className="flex items-end justify-between gap-4">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-hp-muted">
            Event path
          </p>
          <h4 className="mt-1 font-[family-name:var(--font-title)] text-xl text-hp-ink">Timeline</h4>
        </div>
        <p className="text-xs text-hp-muted">{formatNumber(events.length)} events</p>
      </div>

      {events.length ? (
        <ol className="mt-5">
          {events.map((event, index) => (
            <TimelineEventItem
              key={`${event.occurredAt}-${event.eventId || event.label}-${index}`}
              event={event}
              isLast={index === events.length - 1}
            />
          ))}
        </ol>
      ) : (
        <p className="mt-4 border border-hp-rule bg-hp-inset p-4 text-sm text-hp-muted">
          No curated timeline events were found for this journey.
        </p>
      )}
    </section>
  );
}

function TimelineEventItem({
  event,
  isLast,
}: {
  event: CustomerJourneyLedgerTimelineEvent;
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
    <li className="grid grid-cols-[78px_22px_1fr] gap-3">
      <time
        className="pt-0.5 text-[10px] uppercase leading-5 tracking-[0.12em] text-hp-muted"
        dateTime={event.occurredAt}
      >
        {formatTimelineDate(event.occurredAt)}
      </time>
      <div className="relative flex justify-center">
        {!isLast ? (
          <span aria-hidden className="absolute top-5 bottom-0 w-px bg-hp-rule-soft" />
        ) : null}
        <span
          aria-hidden
          className={`relative z-10 mt-1 h-3 w-3 border ${timelineDotClass(event.category)}`}
        />
      </div>
      <div className={`min-w-0 pb-5 ${isLast ? "" : "border-b border-hp-rule-soft"}`}>
        <div className="flex flex-wrap items-center gap-2">
          <h5 className="font-[family-name:var(--font-title)] text-base text-hp-ink">{event.label}</h5>
          <span className="text-[10px] uppercase tracking-[0.14em] text-hp-muted">
            {categoryLabel(event.category)}
          </span>
        </div>

        <div className="mt-1 flex flex-wrap items-center gap-2 text-xs leading-5 text-hp-muted">
          <span>
            {joinedDetail(event.source, event.medium, event.content, event.placement) ||
              "No source detail"}
          </span>
          {event.eventId ? (
            <>
              <ArrowRight size={12} aria-hidden />
              <TechnicalId value={event.eventId} label="Event ID" truncateTo={22} size="xs" />
            </>
          ) : null}
        </div>

        {hasIds ? (
          <dl className="mt-3 grid gap-2 text-xs sm:grid-cols-3">
            {idFields.map(([label, value]) => (
              <div key={label}>
                <dt className="uppercase tracking-[0.14em] text-hp-muted">{label}</dt>
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
                className="border border-signal-positive bg-signal-positive-bg px-2 py-1 text-[10px] font-medium text-signal-positive"
              >
                {signal}
              </span>
            ))}
          </div>
        ) : null}

        <div className="mt-3 space-y-2">
          <DetailUrl label="Page URL" value={event.pageUrl} />
          <DetailUrl label="Referrer" value={event.referrer} />
        </div>
      </div>
    </li>
  );
}

function DetailLoadingState() {
  return (
    <div className="flex min-h-[320px] items-center justify-center p-8 text-sm text-hp-muted">
      <div className="text-center">
        <Loader2 className="mx-auto animate-spin text-hp-ink" size={24} />
        <p className="mt-4">Loading customer journey...</p>
      </div>
    </div>
  );
}

function DetailErrorState({ message }: { message: string }) {
  return (
    <div className="p-5">
      <div className="border border-signal-danger bg-signal-danger-bg p-4 text-sm text-signal-danger">
        <div className="flex items-start gap-3">
          <AlertCircle className="mt-0.5 shrink-0" size={18} />
          <div>
            <p className="font-medium">Journey detail could not be loaded.</p>
            <p className="mt-1 leading-6">{message}</p>
          </div>
        </div>
      </div>
    </div>
  );
}

function DetailField({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div className="grid grid-cols-[88px_1fr] gap-3 text-sm">
      <dt className="text-[10px] font-medium uppercase tracking-[0.14em] text-hp-muted">
        {label}
      </dt>
      <dd className="min-w-0 text-hp-body [overflow-wrap:anywhere]">{value || "n/a"}</dd>
    </div>
  );
}

function DetailIdField({
  label,
  value,
}: {
  label: string;
  value: string | null | undefined;
}) {
  return (
    <div className="grid grid-cols-[88px_1fr] gap-3 text-sm">
      <dt className="text-[10px] font-medium uppercase tracking-[0.14em] text-hp-muted">
        {label}
      </dt>
      <dd className="min-w-0">
        <TechnicalId value={value} label={label} truncateTo={22} size="xs" />
      </dd>
    </div>
  );
}

function DetailUrl({
  label,
  value,
}: {
  label: string;
  value: string | null | undefined;
}) {
  if (!value) return null;

  const displayValue = value.trim();
  const safeHref = /^https?:\/\//i.test(displayValue) ? displayValue : null;

  return (
    <div className="text-xs">
      <div className="mb-1 text-[10px] font-medium uppercase tracking-[0.14em] text-hp-muted">
        {label}
      </div>
      {safeHref ? (
        <a
          href={safeHref}
          target="_blank"
          rel="noreferrer noopener"
          className="inline-flex max-w-full items-start gap-1.5 text-hp-muted transition hover:text-hp-ink"
        >
          <span className="break-all">{displayValue}</span>
          <ExternalLink className="mt-0.5 shrink-0" size={12} />
        </a>
      ) : (
        <span className="inline-flex max-w-full break-all text-hp-muted">{displayValue}</span>
      )}
    </div>
  );
}

function confidenceLabel(level: CustomerJourneyLedgerDetailData["confidence"]["level"]) {
  const labels: Record<CustomerJourneyLedgerDetailData["confidence"]["level"], string> = {
    browser_session: "Same session",
    browser_visitor: "Same visitor",
    conversion_only: "Booking only",
    unmatched: "Unmatched",
  };
  return labels[level];
}

function categoryLabel(category: CustomerJourneyLedgerTimelineEvent["category"]) {
  const labels: Record<CustomerJourneyLedgerTimelineEvent["category"], string> = {
    ad_touch: "Ad touch",
    booking: "Booking",
    capi: "CAPI",
    conversion: "Conversion",
    engagement: "Engagement",
    page: "Page",
  };
  return labels[category];
}

function timelineDotClass(category: CustomerJourneyLedgerTimelineEvent["category"]) {
  if (category === "ad_touch") {
    return "border-hp-pink bg-hp-pink";
  }
  if (category === "booking" || category === "conversion") {
    return "border-signal-positive bg-signal-positive";
  }
  return "border-hp-rule bg-hp-card";
}

function joinedDetail(...values: Array<string | null | undefined>) {
  return values.filter(Boolean).join(" / ") || null;
}

function formatApproxLocation(
  detail: CustomerJourneyLedgerDetailData,
  row: CustomerLedgerRow,
) {
  const city = detail.geoCity || row.geoCity;
  const region = detail.geoRegion || row.geoRegion;
  const country = detail.geoCountry || row.geoCountry;
  return [city, region, country].filter(Boolean).join(", ") || null;
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
