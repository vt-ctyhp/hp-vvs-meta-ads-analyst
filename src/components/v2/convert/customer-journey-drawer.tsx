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
        className="flex-1 bg-stone-950/35 transition-opacity"
      />
      <aside
        role="dialog"
        aria-modal="true"
        aria-labelledby="customer-journey-title"
        className="flex h-full w-full max-w-[720px] flex-col border-l border-stone-200 bg-white shadow-[-12px_0_32px_rgba(41,37,36,0.16)]"
      >
        <header className="border-b border-stone-200 bg-stone-50 px-5 py-4">
          <div className="flex items-start justify-between gap-4">
            <div className="flex min-w-0 gap-3">
              <CreativeHeroThumb row={row} />
              <div className="min-w-0">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-stone-500">
                  Customer journey
                </p>
                <h3
                  id="customer-journey-title"
                  className="mt-1 text-xl font-semibold leading-tight text-stone-950 [overflow-wrap:anywhere]"
                >
                  {title}
                </h3>
                <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-stone-500">
                  <span>
                    Booking:{" "}
                    <span className="text-stone-800">
                      {bookingTime ? formatDateTime(bookingTime) : "none found"}
                    </span>
                  </span>
                  {row.customerEmail ? <span>{row.customerEmail}</span> : null}
                  {row.customerPhone ? <span>{row.customerPhone}</span> : null}
                </div>
              </div>
            </div>

            <div className="flex shrink-0 items-center gap-2">
              <button
                type="button"
                onClick={onCopyLink}
                disabled={!timelineLink}
                className="inline-flex h-9 items-center gap-2 rounded-md border border-stone-200 bg-white px-3 text-[11px] font-medium text-stone-600 transition hover:border-stone-400 hover:text-stone-950 disabled:opacity-50"
              >
                {isLinkCopied ? <CheckCircle2 size={14} /> : <Link2 size={14} />}
                {isLinkCopied ? "Copied" : "Copy"}
              </button>
              <button
                type="button"
                onClick={onClose}
                className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-stone-200 bg-white text-stone-500 transition hover:border-stone-400 hover:text-stone-950"
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
  return (
    <>
      <section className="border-b border-stone-200 p-5">
        <p className="text-sm leading-6 text-stone-800">
          {detail.summary || "No booking conversion was found for this visitor."}
        </p>
        <div className="mt-4 grid gap-3 sm:grid-cols-3">
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
        </div>
      </section>

      <CreativePreviewPanel row={row} />

      <section className="grid gap-4 border-b border-stone-200 p-5 lg:grid-cols-2">
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

      <section className="grid gap-4 border-b border-stone-200 p-5 lg:grid-cols-2">
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
          <DetailUrl label="First page" value={row.firstPage} />
          <DetailIdField label="Visitor ID" value={row.visitorId} />
          <DetailIdField label="Session ID" value={detail.booking?.sessionId || row.sessionId} />
          <DetailIdField label="Meta event" value={detail.booking?.metaEventId || detail.capi.eventId} />
        </DetailPanel>
      </section>

      <TimelineSection events={detail.timeline} />

      <section className="border-t border-stone-200 p-5">
        <div className="text-[10px] font-semibold uppercase tracking-wider text-stone-500">
          Confidence
        </div>
        <p className="mt-2 text-sm leading-6 text-stone-700">
          {detail.confidence.explanation}
        </p>
        {detail.confidence.signals.length ? (
          <ul className="mt-3 space-y-2 text-sm text-stone-500">
            {detail.confidence.signals.map((signal) => (
              <li key={signal} className="flex gap-2">
                <span aria-hidden className="mt-2 h-1.5 w-1.5 shrink-0 bg-stone-400" />
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
    <section className="grid gap-4 border-b border-stone-200 p-5 lg:grid-cols-[220px_1fr]">
      <CreativeMedia
        alt={title}
        className="aspect-[4/3] w-full rounded-md border border-stone-200 bg-stone-100"
        src={preview?.imageUrl || preview?.thumbnailUrl}
      />
      <div className="min-w-0">
        <p className="text-[10px] font-semibold uppercase tracking-wider text-stone-500">
          Ad creative
        </p>
        <h4 className="mt-1 text-base font-semibold text-stone-950 [overflow-wrap:anywhere]">
          {title}
        </h4>
        {preview?.body ? (
          <p className="mt-2 line-clamp-3 text-sm leading-6 text-stone-600">
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

function CreativeHeroThumb({ row }: { row: CustomerLedgerRow }) {
  const preview = row.creativePreview;
  const label =
    preview?.creativeName ||
    preview?.title ||
    preview?.adName ||
    row.paidTouchCampaign ||
    "Creative preview";

  return (
    <CreativeMedia
      alt={label}
      className="h-14 w-14 shrink-0 rounded-md border border-stone-200 bg-stone-100"
      src={preview?.thumbnailUrl || preview?.imageUrl}
    />
  );
}

function CreativeMedia({
  alt,
  className,
  src,
}: {
  alt: string;
  className: string;
  src?: string | null;
}) {
  const [failedSrc, setFailedSrc] = useState<string | null>(null);
  const failed = Boolean(src && failedSrc === src);

  if (!src || failed) {
    return (
      <div className={`flex items-center justify-center text-stone-400 ${className}`}>
        <ImageIcon size={20} aria-hidden />
      </div>
    );
  }

  return (
    <img
      alt={alt}
      className={`object-cover ${className}`}
      onError={() => setFailedSrc(src)}
      src={src}
    />
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
    <div className="rounded-md border border-stone-200 bg-stone-50 p-3">
      <div className="flex items-center justify-between gap-3">
        <p className="text-[10px] font-semibold uppercase tracking-wider text-stone-500">
          {label}
        </p>
        <Icon size={15} className="text-stone-400" />
      </div>
      <p className="mt-2 truncate text-sm font-medium text-stone-950" title={value}>
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
        <p className="text-sm leading-6 text-stone-500">{emptyMessage}</p>
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
    <section className="rounded-md border border-stone-200 bg-white p-4">
      <div className="mb-4 flex items-center justify-between gap-3">
        <p className="text-[10px] font-semibold uppercase tracking-wider text-stone-500">
          {title}
        </p>
        <Icon size={15} className="text-stone-400" />
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
          className={`rounded-full border px-2 py-1 text-[10px] font-medium ${
            present
              ? "border-emerald-200 bg-emerald-50 text-emerald-800"
              : "border-stone-200 bg-stone-50 text-stone-500"
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
          <p className="text-[10px] font-semibold uppercase tracking-wider text-stone-500">
            Event path
          </p>
          <h4 className="mt-1 text-lg font-semibold text-stone-950">Timeline</h4>
        </div>
        <p className="text-xs text-stone-500">{formatNumber(events.length)} events</p>
      </div>

      {events.length ? (
        <ol className="mt-4 overflow-hidden rounded-md border border-stone-200 bg-white">
          {events.map((event, index) => (
            <TimelineEventItem
              key={`${event.occurredAt}-${event.eventId || event.label}-${index}`}
              event={event}
              isLast={index === events.length - 1}
            />
          ))}
        </ol>
      ) : (
        <p className="mt-4 rounded-md border border-stone-200 bg-stone-50 p-4 text-sm text-stone-500">
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
    <li
      className={`grid gap-3 px-4 py-4 sm:grid-cols-[112px_1fr] ${
        isLast ? "" : "border-b border-stone-200"
      }`}
    >
      <time className="text-xs leading-5 text-stone-500" dateTime={event.occurredAt}>
        {formatTimelineDate(event.occurredAt)}
      </time>
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <span
            className={`rounded-full border px-2 py-1 text-[10px] font-medium ${timelineTone(
              event.category,
            )}`}
          >
            {categoryLabel(event.category)}
          </span>
          <h5 className="text-sm font-medium text-stone-950">{event.label}</h5>
        </div>

        <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-stone-500">
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
                <dt className="uppercase tracking-wider text-stone-400">{label}</dt>
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
                className="rounded-full border border-emerald-200 bg-emerald-50 px-2 py-1 text-[10px] font-medium text-emerald-800"
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
    <div className="flex min-h-[320px] items-center justify-center p-8 text-sm text-stone-500">
      <div className="text-center">
        <Loader2 className="mx-auto animate-spin text-stone-800" size={24} />
        <p className="mt-4">Loading customer journey...</p>
      </div>
    </div>
  );
}

function DetailErrorState({ message }: { message: string }) {
  return (
    <div className="p-5">
      <div className="rounded-md border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800">
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
      <dt className="text-[10px] font-medium uppercase tracking-wider text-stone-400">
        {label}
      </dt>
      <dd className="min-w-0 text-stone-800 [overflow-wrap:anywhere]">{value || "n/a"}</dd>
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
      <dt className="text-[10px] font-medium uppercase tracking-wider text-stone-400">
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
      <div className="mb-1 text-[10px] font-medium uppercase tracking-wider text-stone-400">
        {label}
      </div>
      {safeHref ? (
        <a
          href={safeHref}
          target="_blank"
          rel="noreferrer noopener"
          className="inline-flex max-w-full items-start gap-1.5 text-stone-500 transition hover:text-stone-950"
        >
          <span className="break-all">{displayValue}</span>
          <ExternalLink className="mt-0.5 shrink-0" size={12} />
        </a>
      ) : (
        <span className="inline-flex max-w-full break-all text-stone-500">{displayValue}</span>
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

function timelineTone(category: CustomerJourneyLedgerTimelineEvent["category"]) {
  if (category === "ad_touch") {
    return "border-sky-200 bg-sky-50 text-sky-800";
  }
  if (category === "booking" || category === "conversion") {
    return "border-emerald-200 bg-emerald-50 text-emerald-800";
  }
  if (category === "capi") {
    return "border-amber-200 bg-amber-50 text-amber-800";
  }
  return "border-stone-200 bg-stone-50 text-stone-600";
}

function joinedDetail(...values: Array<string | null | undefined>) {
  return values.filter(Boolean).join(" / ") || null;
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
