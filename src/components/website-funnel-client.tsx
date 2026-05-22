"use client";

import {
  Activity,
  CalendarRange,
  CheckCircle2,
  Clock3,
  type LucideIcon,
  MapPin,
  MousePointerClick,
  TrendingUp,
} from "lucide-react";
import { useCallback, useMemo, useState } from "react";
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import type { WebsiteFunnelData } from "@/lib/website-analytics";

import { StatusSentence, type StatusHighlight } from "./status-sentence";

type Props = {
  initialData: WebsiteFunnelData;
};

const NUMBER_FORMATTER = new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 });
const PERCENT_FORMATTER = new Intl.NumberFormat("en-US", {
  maximumFractionDigits: 1,
  style: "percent",
});

export function WebsiteFunnelClient({ initialData }: Props) {
  const data = initialData;
  const [startDate, setStartDate] = useState(data.sourceTransparency.timeRange.start);
  const [endDate, setEndDate] = useState(data.sourceTransparency.timeRange.end);
  const [isApplyingRange, setIsApplyingRange] = useState(false);

  const discrepancyTone = data.overview.discrepancy === 0 ? "text-emerald-700" : "text-hp-pink";
  const maxFunnel = useMemo(
    () => Math.max(...data.funnel.map((row) => row.count), 1),
    [data.funnel],
  );

  const funnelHighlights = useMemo<StatusHighlight[]>(() => {
    const highlights: StatusHighlight[] = [];
    const sessions = data.overview.sessions;
    const schedules = data.overview.schedules;
    if (sessions > 0) {
      const rate = (schedules / sessions) * 100;
      highlights.push({
        text: `${rate.toFixed(2)}% session-to-schedule rate`,
        tone: rate >= 1 ? "positive" : "neutral",
      });
    }
    const discrepancy = data.overview.discrepancy;
    if (Math.abs(discrepancy) > 0) {
      const sign = discrepancy > 0 ? "+" : "";
      highlights.push({
        text: `${sign}${discrepancy} attribution gap vs Meta`,
        tone: "warning",
      });
    }
    let biggestDropName: string | null = null;
    let biggestDropPercent = 0;
    for (let i = 1; i < data.funnel.length; i += 1) {
      const prev = data.funnel[i - 1];
      const next = data.funnel[i];
      if (prev.count === 0) continue;
      const drop = ((prev.count - next.count) / prev.count) * 100;
      if (drop > biggestDropPercent) {
        biggestDropPercent = drop;
        biggestDropName = `${prev.label} → ${next.label}`;
      }
    }
    if (biggestDropName && biggestDropPercent >= 5) {
      highlights.push({
        text: `Largest drop-off: ${biggestDropName} (${biggestDropPercent.toFixed(0)}%)`,
      });
    }
    if (highlights.length === 0) {
      highlights.push({ text: "No website activity in this range" });
    }
    return highlights;
  }, [data.funnel, data.overview.discrepancy, data.overview.schedules, data.overview.sessions]);

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
              First-party website data
            </p>
            <h1 className="mt-2 font-title text-4xl font-normal text-hp-ink">
              Website Funnel
            </h1>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-hp-muted">
              Raw Shopify and booking behavior, kept separate from Meta Ads API data so
              attribution discrepancies are visible instead of blended away.
            </p>
            <StatusSentence
              context={`${formatNumber(data.overview.sessions)} sessions in window`}
              highlights={funnelHighlights}
            />
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
            icon={Activity}
            label="Sessions"
            value={data.overview.sessions}
            note={`${formatNumber(data.overview.metaPaidSessions)} Meta-paid sessions`}
          />
          <MetricCard
            icon={Clock3}
            label="Engaged sessions"
            value={data.overview.engagedSessions}
            note="30s+ active time"
          />
          <MetricCard
            icon={MousePointerClick}
            label="Important clicks"
            value={data.overview.importantClicks}
            note={`${formatNumber(data.overview.searches)} searches`}
          />
          <MetricCard
            icon={CheckCircle2}
            label="First-party Schedule"
            value={data.overview.schedules}
            note={`${formatNumber(data.overview.completeTrackingConversions)} complete tracking records`}
          />
        </div>

        <div className="mt-5 border border-hp-rule bg-white p-5">
          <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
            <div>
              <p className="text-[11px] uppercase tracking-[0.16em] text-hp-muted">
                Discrepancy check
              </p>
              <h2 className="mt-1 font-title text-2xl font-normal text-hp-ink">
                First-party Schedule vs Meta-attributed bookings
              </h2>
            </div>
            <div className={`font-title text-4xl ${discrepancyTone}`}>
              {data.overview.discrepancy > 0 ? "+" : ""}
              {formatNumber(data.overview.discrepancy)}
            </div>
          </div>
          <p className="mt-3 text-sm leading-6 text-hp-muted">
            This difference is expected to move because Meta attribution has delay,
            attribution windows, deduplication, and campaign matching rules. First-party
            events show what happened on the website and booking API.
          </p>
        </div>

        <section className="mt-8 border border-hp-rule bg-white">
          <div className="border-b border-hp-rule p-5">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-[11px] uppercase tracking-[0.16em] text-hp-muted">
                  Visitor geography
                </p>
                <h2 className="mt-1 font-title text-2xl font-normal text-hp-ink">
                  Top locations by session
                </h2>
              </div>
              <MapPin className="text-hp-pink" size={22} />
            </div>
          </div>
          {data.locations.length ? (
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead className="bg-hp-inset text-left text-[11px] uppercase tracking-[0.14em] text-hp-muted">
                  <tr>
                    <th className="px-5 py-3 font-normal">Location</th>
                    <th className="px-5 py-3 text-right font-normal">Sessions</th>
                    <th className="px-5 py-3 text-right font-normal">Schedule</th>
                    <th className="px-5 py-3 text-right font-normal">Rate</th>
                  </tr>
                </thead>
                <tbody>
                  {data.locations.map((location) => (
                    <tr key={locationKey(location)} className="border-t border-hp-rule">
                      <td className="px-5 py-4 text-hp-ink">
                        <div>{formatLocation(location)}</div>
                        <div className="mt-1 text-xs text-hp-muted">
                          {formatRegionCountry(location)}
                        </div>
                      </td>
                      <td className="px-5 py-4 text-right">
                        {formatNumber(location.sessions)}
                      </td>
                      <td className="px-5 py-4 text-right">
                        {formatNumber(location.schedules)}
                      </td>
                      <td className="px-5 py-4 text-right">
                        {location.scheduleRate === null ? "n/a" : formatPercent(location.scheduleRate)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="px-5 py-8 text-sm text-hp-muted">
              No location data in this range yet.
            </div>
          )}
        </section>

        <div className="mt-8 grid min-w-0 gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.25fr)]">
          <section className="min-w-0 border border-hp-rule bg-white p-5">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-[11px] uppercase tracking-[0.16em] text-hp-muted">
                  Booking funnel
                </p>
                <h2 className="mt-1 font-title text-2xl font-normal text-hp-ink">
                  Drop-off by step
                </h2>
              </div>
              <TrendingUp className="text-hp-pink" size={22} />
            </div>

            <div className="mt-5 space-y-4">
              {data.funnel.map((row) => (
                <div key={row.key}>
                  <div className="mb-1 flex items-center justify-between gap-4 text-sm">
                    <span className="text-hp-ink">{row.label}</span>
                    <span className="font-medium text-hp-ink">{formatNumber(row.count)}</span>
                  </div>
                  <div className="h-2 bg-hp-inset">
                    <div
                      className="h-full bg-hp-pink"
                      style={{ width: `${Math.max(2, (row.count / maxFunnel) * 100)}%` }}
                    />
                  </div>
                  <div className="mt-1 text-xs text-hp-muted">
                    {row.rateFromPrevious === null
                      ? "Start"
                      : `${formatPercent(row.rateFromPrevious)} from previous`}
                    {row.rateFromStart !== null
                      ? ` · ${formatPercent(row.rateFromStart)} from booking page`
                      : ""}
                  </div>
                </div>
              ))}
            </div>
          </section>

          <section className="min-w-0 border border-hp-rule bg-white p-5">
            <p className="text-[11px] uppercase tracking-[0.16em] text-hp-muted">
              Daily trend
            </p>
            <h2 className="mt-1 font-title text-2xl font-normal text-hp-ink">
              Website activity vs Meta attribution
            </h2>
            <div className="mt-5 h-[320px] min-w-0">
              <ResponsiveContainer
                width="100%"
                height="100%"
                initialDimension={{ width: 1, height: 1 }}
              >
                <LineChart data={data.trend}>
                  <CartesianGrid stroke="#E5DFD3" vertical={false} />
                  <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                  <Tooltip />
                  <Line
                    type="monotone"
                    dataKey="pageViews"
                    name="Page views"
                    stroke="#2A2725"
                    dot={false}
                    strokeWidth={2}
                  />
                  <Line
                    type="monotone"
                    dataKey="schedules"
                    name="First-party Schedule"
                    stroke="#E91D79"
                    dot={false}
                    strokeWidth={2}
                  />
                  <Line
                    type="monotone"
                    dataKey="metaAttributedBookings"
                    name="Meta-attributed bookings"
                    stroke="#7C3AED"
                    dot={false}
                    strokeWidth={2}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </section>
        </div>

        <section className="mt-8 border border-hp-rule bg-white">
          <div className="border-b border-hp-rule p-5">
            <p className="text-[11px] uppercase tracking-[0.16em] text-hp-muted">
              Page performance
            </p>
            <h2 className="mt-1 font-title text-2xl font-normal text-hp-ink">
              Which pages create movement
            </h2>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-hp-inset text-left text-[11px] uppercase tracking-[0.14em] text-hp-muted">
                <tr>
                  <th className="px-5 py-3 font-normal">Page</th>
                  <th className="px-5 py-3 font-normal">Group</th>
                  <th className="px-5 py-3 text-right font-normal">Views</th>
                  <th className="px-5 py-3 text-right font-normal">Sessions</th>
                  <th className="px-5 py-3 text-right font-normal">Clicks</th>
                  <th className="px-5 py-3 text-right font-normal">Searches</th>
                  <th className="px-5 py-3 text-right font-normal">Max scroll</th>
                  <th className="px-5 py-3 text-right font-normal">Schedule</th>
                </tr>
              </thead>
              <tbody>
                {data.pages.map((page) => (
                  <tr key={`${page.pageGroup}:${page.pagePath}`} className="border-t border-hp-rule">
                    <td className="max-w-[360px] px-5 py-4 text-hp-ink">
                      <div className="truncate">{page.pageTitle}</div>
                      <div className="mt-1 truncate text-xs text-hp-muted">{page.pagePath}</div>
                    </td>
                    <td className="px-5 py-4 text-hp-muted">{page.pageGroup}</td>
                    <td className="px-5 py-4 text-right">{formatNumber(page.pageViews)}</td>
                    <td className="px-5 py-4 text-right">{formatNumber(page.sessions)}</td>
                    <td className="px-5 py-4 text-right">{formatNumber(page.importantClicks)}</td>
                    <td className="px-5 py-4 text-right">{formatNumber(page.searches)}</td>
                    <td className="px-5 py-4 text-right">{page.maxScrollDepth}%</td>
                    <td className="px-5 py-4 text-right">{formatNumber(page.schedules)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section className="mt-8 border border-hp-rule bg-white">
          <div className="border-b border-hp-rule p-5">
            <p className="text-[11px] uppercase tracking-[0.16em] text-hp-muted">
              Recent raw events
            </p>
            <h2 className="mt-1 font-title text-2xl font-normal text-hp-ink">
              Latest website signals
            </h2>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-hp-inset text-left text-[11px] uppercase tracking-[0.14em] text-hp-muted">
                <tr>
                  <th className="px-5 py-3 font-normal">Time</th>
                  <th className="px-5 py-3 font-normal">Event</th>
                  <th className="px-5 py-3 font-normal">Source</th>
                  <th className="px-5 py-3 font-normal">Page</th>
                  <th className="px-5 py-3 font-normal">Customer</th>
                  <th className="px-5 py-3 font-normal">Ad IDs</th>
                  <th className="px-5 py-3 font-normal">Event ID</th>
                </tr>
              </thead>
              <tbody>
                {data.recentEvents.map((event) => (
                  <tr key={event.eventId} className="border-t border-hp-rule">
                    <td className="whitespace-nowrap px-5 py-4 text-hp-muted">
                      {new Date(event.occurredAt).toLocaleString()}
                    </td>
                    <td className="px-5 py-4 text-hp-ink">
                      <div>{event.eventName}</div>
                      {event.acuityAppointmentId ? (
                        <div className="mt-1 text-xs text-hp-muted">
                          Acuity {event.acuityAppointmentId}
                        </div>
                      ) : null}
                    </td>
                    <td className="px-5 py-4 text-hp-muted">{event.source}</td>
                    <td className="px-5 py-4 text-hp-muted">
                      {event.pageGroup || "other"} · {event.pagePath || "(unknown)"}
                    </td>
                    <td className="max-w-[180px] truncate px-5 py-4 text-hp-muted">
                      {event.customerName || "Anonymous"}
                    </td>
                    <td className="max-w-[220px] px-5 py-4 text-xs text-hp-muted">
                      <div className="truncate">Campaign {event.campaignId || "n/a"}</div>
                      <div className="truncate">Ad set {event.adsetId || "n/a"}</div>
                      <div className="truncate">Ad {event.adId || "n/a"}</div>
                    </td>
                    <td className="max-w-[260px] truncate px-5 py-4 text-xs text-hp-muted">
                      {event.metaEventId || event.eventId}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </section>
    </main>
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
      <p className="mt-2 text-sm text-hp-muted">{note}</p>
    </div>
  );
}

function formatNumber(value: number) {
  return NUMBER_FORMATTER.format(value);
}

function formatPercent(value: number) {
  return PERCENT_FORMATTER.format(value);
}

function formatLocation(location: WebsiteFunnelData["locations"][number]) {
  return location.city || "Unknown";
}

function formatRegionCountry(location: WebsiteFunnelData["locations"][number]) {
  return [location.region, location.country].filter(Boolean).join(", ") || "Approximate IP-derived";
}

function locationKey(location: WebsiteFunnelData["locations"][number]) {
  return [location.country || "unknown", location.region || "unknown", location.city || "unknown"].join(":");
}
