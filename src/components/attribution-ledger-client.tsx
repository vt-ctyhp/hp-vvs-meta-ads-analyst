"use client";

import {
  Activity,
  CalendarRange,
  CheckCircle2,
  Database,
  MousePointerClick,
  type LucideIcon,
} from "lucide-react";
import { useCallback, useState } from "react";

import type { AttributionLedgerData, AttributionLedgerRow } from "@/lib/attribution-ledger";

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
  const capiTotal = data.summary.capiStatuses.reduce((sum, row) => sum + row.count, 0);

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
                    <AttributionLedgerTableRow key={row.visitorId} row={row} />
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
    </main>
  );
}

function AttributionLedgerTableRow({ row }: { row: AttributionLedgerRow }) {
  return (
    <tr className="border-t border-hp-rule align-top">
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

function formatCapiSummary(statuses: AttributionLedgerData["summary"]["capiStatuses"]) {
  if (!statuses.length) return "No CAPI statuses";
  return statuses.map((row) => `${row.status}: ${formatNumber(row.count)}`).join(" · ");
}

function formatDateTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString();
}

function formatNumber(value: number) {
  return NUMBER_FORMATTER.format(value);
}
