"use client";

/* eslint-disable @next/next/no-img-element */

import {
  AlertTriangle,
  BarChart3,
  CalendarRange,
  ExternalLink,
  GalleryHorizontalEnd,
  Info,
  Search,
  SlidersHorizontal,
  X,
} from "lucide-react";
import type { ReactNode } from "react";
import { useEffect, useMemo, useState } from "react";

import {
  CREATIVE_STATUS_OPTIONS,
  type CreativeAnalysisPayload,
  type CreativeAnalysisRow,
} from "@/lib/creative-analysis";

type Props = {
  initialData: CreativeAnalysisPayload;
};

const MONEY_FORMATTER = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 2,
});
const MONEY_COMPACT_FORMATTER = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
});
const NUMBER_FORMATTER = new Intl.NumberFormat("en-US", {
  maximumFractionDigits: 0,
});

export function CreativeAnalysisClient({ initialData }: Props) {
  const data = initialData;
  const [brand, setBrand] = useState("all");
  const [campaign, setCampaign] = useState("all");
  const [adSet, setAdSet] = useState("all");
  const [status, setStatus] = useState("all");
  const [minSpend, setMinSpend] = useState("");
  const [query, setQuery] = useState("");
  const [startDate, setStartDate] = useState(data.sourceTransparency.timeRange.start || "");
  const [endDate, setEndDate] = useState(data.sourceTransparency.timeRange.end || "");
  const [isApplyingRange, setIsApplyingRange] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [notesByCreative, setNotesByCreative] = useState<Record<string, string>>({});

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setSelectedId(null);
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  const brandOptions = useMemo(
    () => ["all", ...Array.from(new Set(data.rows.map((row) => row.brandCode))).sort()],
    [data.rows],
  );
  const filteredByBrand = useMemo(
    () => data.rows.filter((row) => brand === "all" || row.brandCode === brand),
    [brand, data.rows],
  );
  const campaignOptions = useMemo(
    () => ["all", ...Array.from(new Set(filteredByBrand.map((row) => row.campaignName))).sort()],
    [filteredByBrand],
  );
  const adSetOptions = useMemo(
    () => [
      "all",
      ...Array.from(
        new Set(
          filteredByBrand
            .filter((row) => campaign === "all" || row.campaignName === campaign)
            .map((row) => row.adSetName),
        ),
      ).sort(),
    ],
    [campaign, filteredByBrand],
  );

  const filteredRows = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    const minimumSpend = Number(minSpend);
    return data.rows
      .filter((row) => brand === "all" || row.brandCode === brand)
      .filter((row) => campaign === "all" || row.campaignName === campaign)
      .filter((row) => adSet === "all" || row.adSetName === adSet)
      .filter((row) => status === "all" || row.status === status)
      .filter((row) => !Number.isFinite(minimumSpend) || row.spend >= minimumSpend)
      .filter((row) => {
        if (!normalizedQuery) return true;
        return [row.adName, row.campaignName, row.adSetName, row.creativeName || ""]
          .join(" ")
          .toLowerCase()
          .includes(normalizedQuery);
      })
      .sort((a, b) => b.spend - a.spend);
  }, [adSet, brand, campaign, data.rows, minSpend, query, status]);

  const summary = useMemo(() => buildSummary(filteredRows), [filteredRows]);
  const selected = useMemo(
    () => data.rows.find((row) => row.id === selectedId) || null,
    [data.rows, selectedId],
  );

  function applyQuickRange(days: number) {
    const url = new URL(window.location.href);
    url.searchParams.set("days", String(days));
    url.searchParams.delete("start");
    url.searchParams.delete("end");
    setIsApplyingRange(true);
    window.location.assign(url.toString());
  }

  function applyCustomRange() {
    if (!startDate || !endDate) return;
    const url = new URL(window.location.href);
    url.searchParams.set("start", startDate);
    url.searchParams.set("end", endDate);
    url.searchParams.delete("days");
    setIsApplyingRange(true);
    window.location.assign(url.toString());
  }

  if (!data.configured) {
    return (
      <main className="min-h-screen bg-hp-foundation px-4 py-8 text-hp-body md:px-8">
        <section className="mx-auto max-w-4xl border border-hp-rule bg-hp-card p-6">
          <div className="flex items-start gap-3">
            <AlertTriangle size={20} className="mt-1 text-signal-danger" />
            <div>
              <p className="text-[11px] uppercase tracking-[0.14em] text-hp-muted">
                Creative Analysis
              </p>
              <h1 className="mt-2 font-title text-3xl text-hp-ink">Meta setup required</h1>
              <p className="mt-3 text-sm leading-6 text-hp-body">
                This page needs the existing Supabase and Meta read-only configuration before it can
                load ad-level creative insights.
              </p>
              <p className="mt-4 text-sm text-signal-danger">
                Missing: {data.missingEnv.join(", ")}
              </p>
            </div>
          </div>
        </section>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-hp-foundation px-4 py-6 text-hp-body md:px-8">
      <header className="mx-auto flex max-w-7xl flex-col gap-5 border-b border-hp-rule pb-6 md:flex-row md:items-end md:justify-between">
        <div>
          <span className="text-[11px] uppercase tracking-[0.14em] text-hp-muted">
            HP/VVS Meta Ads
          </span>
          <h1 className="mt-2 font-title text-4xl leading-tight text-hp-ink md:text-5xl">
            Creative Analysis
          </h1>
          <p className="mt-3 max-w-3xl text-sm leading-6 text-hp-body">
            Internal Creative Diagnostic Score is based on visible Meta Ads metrics and our
            internal weighting. It does not represent Meta&apos;s private algorithm or official
            ranking.
          </p>
        </div>
        <div className="border border-hp-rule bg-hp-card px-4 py-3 text-sm text-hp-body">
          <div className="flex items-start gap-2">
            <Info size={16} className="mt-0.5 text-hp-muted" />
            <p className="max-w-sm leading-5">
              HP/VVS are high-ticket luxury jewelry brands. Lower CTR can still be valuable when
              appointment quality, close rate, AOV, and brand fit are stronger.
            </p>
          </div>
        </div>
      </header>

      <section className="mx-auto mt-6 max-w-7xl border border-hp-rule bg-hp-card p-4">
        <div className="mb-4 flex items-center gap-2 text-hp-ink">
          <SlidersHorizontal size={18} />
          <span className="text-[11px] uppercase tracking-[0.14em]">Filters</span>
        </div>
        <div className="grid gap-4 lg:grid-cols-[1fr_1fr_1fr_1fr_150px]">
          <FilterSelect label="Brand/account" value={brand} onChange={setBrand} options={brandOptions} />
          <FilterSelect label="Campaign" value={campaign} onChange={setCampaign} options={campaignOptions} />
          <FilterSelect label="Ad set" value={adSet} onChange={setAdSet} options={adSetOptions} />
          <FilterSelect
            label="Creative status"
            value={status}
            onChange={setStatus}
            options={["all", ...CREATIVE_STATUS_OPTIONS]}
          />
          <label className="block">
            <span className="mb-2 block text-[10px] uppercase tracking-[0.14em] text-hp-muted">
              Min spend
            </span>
            <input
              value={minSpend}
              onChange={(event) => setMinSpend(event.target.value)}
              inputMode="decimal"
              placeholder="0"
              className="h-10 w-full border border-hp-rule bg-hp-inset px-3 text-sm outline-none focus:border-hp-pink"
            />
          </label>
        </div>
        <div className="mt-4 grid gap-4 lg:grid-cols-[1fr_340px]">
          <div className="flex flex-wrap items-end gap-3">
            <div>
              <span className="mb-2 block text-[10px] uppercase tracking-[0.14em] text-hp-muted">
                Date range
              </span>
              <div className="flex flex-wrap gap-2">
                {[7, 14, 30].map((days) => (
                  <button
                    key={days}
                    onClick={() => applyQuickRange(days)}
                    disabled={isApplyingRange}
                    className="h-10 border border-hp-rule px-4 text-[11px] uppercase tracking-[0.14em] text-hp-body transition-colors hover:border-hp-ink hover:bg-hp-inset"
                  >
                    Last {days}
                  </button>
                ))}
              </div>
            </div>
            <label>
              <span className="mb-2 block text-[10px] uppercase tracking-[0.14em] text-hp-muted">
                Start
              </span>
              <input
                type="date"
                value={startDate}
                onChange={(event) => setStartDate(event.target.value)}
                className="h-10 border border-hp-rule bg-hp-inset px-3 text-sm outline-none focus:border-hp-pink"
              />
            </label>
            <label>
              <span className="mb-2 block text-[10px] uppercase tracking-[0.14em] text-hp-muted">
                End
              </span>
              <input
                type="date"
                value={endDate}
                onChange={(event) => setEndDate(event.target.value)}
                className="h-10 border border-hp-rule bg-hp-inset px-3 text-sm outline-none focus:border-hp-pink"
              />
            </label>
            <button
              onClick={applyCustomRange}
              disabled={isApplyingRange || !startDate || !endDate}
              className="h-10 bg-hp-ink px-5 text-[11px] uppercase tracking-[0.14em] text-hp-foundation transition-colors hover:bg-hp-pink"
            >
              Apply
            </button>
          </div>
          <label className="block">
            <span className="mb-2 block text-[10px] uppercase tracking-[0.14em] text-hp-muted">
              Search
            </span>
            <div className="flex h-10 items-center gap-2 border border-hp-rule bg-hp-inset px-3">
              <Search size={15} className="text-hp-muted" />
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Ad, campaign, creative"
                className="min-w-0 flex-1 bg-transparent text-sm outline-none"
              />
            </div>
          </label>
        </div>
        {isApplyingRange ? (
          <p className="mt-4 bg-hp-inset px-3 py-2 text-[11px] uppercase tracking-[0.14em] text-hp-muted">
            Preparing creative data
          </p>
        ) : null}
      </section>

      {data.warnings.length || data.sourceTransparency.unavailableFields.length ? (
        <section className="mx-auto mt-4 max-w-7xl border border-hp-rule bg-hp-card p-4 text-sm leading-6 text-hp-body">
          <div className="mb-2 flex items-center gap-2 text-hp-ink">
            <AlertTriangle size={16} className="text-signal-warning" />
            <span className="text-[11px] uppercase tracking-[0.14em]">Data notes</span>
          </div>
          {data.warnings.map((warning) => (
            <p key={warning}>{warning}</p>
          ))}
          {data.sourceTransparency.unavailableFields.length ? (
            <p>
              Unavailable Meta fields: {data.sourceTransparency.unavailableFields.join(", ")}.
              Rankings and video metrics are shown only where Meta returns them.
            </p>
          ) : null}
        </section>
      ) : null}

      <section className="mx-auto mt-6 grid max-w-7xl gap-4 sm:grid-cols-2 xl:grid-cols-7">
        <SummaryCard label="Total spend" value={formatMoney(summary.totalSpend, true)} />
        <SummaryCard label="Bookings/leads/results" value={formatNumber(summary.totalResults)} />
        <SummaryCard label="Average CPA" value={formatMoney(summary.averageCpa)} />
        <SummaryCard label="Best CPA" value={summary.bestByCpa?.adName || "n/a"} detail={formatMoney(summary.bestByCpa?.costPerResult ?? null)} />
        <SummaryCard label="Best hook" value={summary.bestByHook?.adName || "n/a"} detail={formatRate(summary.bestByHook?.hookRate ?? null)} />
        <SummaryCard label="Fatigue count" value={formatNumber(summary.fatigueCount)} />
        <SummaryCard label="Scale candidates" value={formatNumber(summary.scaleCandidates)} />
      </section>

      <section className="mx-auto mt-6 max-w-7xl border border-hp-rule bg-hp-card">
        <div className="flex flex-col gap-3 border-b border-hp-rule p-4 md:flex-row md:items-center md:justify-between">
          <div className="flex items-center gap-2 text-hp-ink">
            <BarChart3 size={18} />
            <span className="text-[11px] uppercase tracking-[0.14em]">Creative scorecard</span>
          </div>
          <p className="text-sm text-hp-muted">
            {formatNumber(filteredRows.length)} creatives, {data.sourceTransparency.timeRange.start} to{" "}
            {data.sourceTransparency.timeRange.end}
          </p>
        </div>

        {filteredRows.length ? (
          <div className="overflow-x-auto scrollbar-thin">
            <table className="w-full min-w-[1500px] border-collapse">
              <thead>
                <tr className="bg-hp-inset">
                  {[
                    "Creative preview",
                    "Ad name",
                    "Campaign",
                    "Ad set",
                    "Spend",
                    "Impressions",
                    "Frequency",
                    "Hook rate",
                    "Hold rate",
                    "CTR",
                    "Cost per result",
                    "Quality",
                    "Engagement",
                    "Conversion",
                    "Internal score",
                    "Status",
                    "Recommendation",
                  ].map((column) => (
                    <th
                      key={column}
                      className="border-b border-hp-rule px-4 py-3 text-left text-[10px] uppercase tracking-[0.14em] text-hp-muted"
                    >
                      {column}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filteredRows.map((row) => (
                  <tr
                    key={row.id}
                    className="border-b border-hp-rule bg-hp-card transition-colors hover:bg-hp-inset"
                  >
                    <td className="px-4 py-3">
                      <button
                        onClick={() => setSelectedId(row.id)}
                        className="block text-left focus:outline-none focus:ring-1 focus:ring-hp-pink"
                        aria-label={`Open ${row.adName}`}
                      >
                        <PreviewThumb row={row} />
                      </button>
                    </td>
                    <td className="max-w-[260px] px-4 py-3">
                      <button
                        onClick={() => setSelectedId(row.id)}
                        className="text-left text-sm leading-5 text-hp-ink underline-offset-4 hover:underline focus:outline-none focus:ring-1 focus:ring-hp-pink"
                      >
                        {row.adName}
                      </button>
                      <div className="mt-1 text-[11px] uppercase tracking-[0.14em] text-hp-muted">
                        {row.brandCode}
                      </div>
                    </td>
                    <TableCell>{row.campaignName}</TableCell>
                    <TableCell>{row.adSetName}</TableCell>
                    <TableMetric>{formatMoney(row.spend, true)}</TableMetric>
                    <TableMetric>{formatNumber(row.impressions)}</TableMetric>
                    <TableMetric>{row.frequency.toFixed(2)}x</TableMetric>
                    <TableMetric>{formatRate(row.hookRate)}</TableMetric>
                    <TableMetric>{formatRate(row.holdRate)}</TableMetric>
                    <TableMetric>{formatPercentNumber(row.ctr)}</TableMetric>
                    <TableMetric>{formatMoney(row.costPerResult)}</TableMetric>
                    <TableCell>{rankingLabel(row.qualityRanking)}</TableCell>
                    <TableCell>{rankingLabel(row.engagementRateRanking)}</TableCell>
                    <TableCell>{rankingLabel(row.conversionRateRanking)}</TableCell>
                    <td className="px-4 py-3">
                      <ScoreMeter score={row.internalScore} />
                    </td>
                    <td className="px-4 py-3">
                      <StatusBadge status={row.status} />
                    </td>
                    <td className="max-w-[280px] px-4 py-3 text-sm leading-5 text-hp-body">
                      {row.recommendation}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="p-8">
            <h2 className="font-title text-2xl text-hp-ink">No creatives match these filters</h2>
            <p className="mt-2 text-sm text-hp-muted">
              Adjust the account, date range, status, or minimum spend filters.
            </p>
          </div>
        )}
      </section>

      <section className="mx-auto mt-6 max-w-7xl border border-hp-rule bg-hp-card p-4 text-sm leading-6 text-hp-body">
        <div className="mb-2 flex items-center gap-2 text-hp-ink">
          <CalendarRange size={16} />
          <span className="text-[11px] uppercase tracking-[0.14em]">Method notes</span>
        </div>
        <p>
          Fatigue detection compares the selected range against{" "}
          {data.sourceTransparency.comparisonRange.start} to{" "}
          {data.sourceTransparency.comparisonRange.end} when stored history is available. Meta
          ranking diagnostics are only used where Meta returns Quality Ranking, Engagement Rate
          Ranking, and Conversion Rate Ranking.
        </p>
      </section>

      {selected ? (
        <CreativeDetailDrawer
          row={selected}
          note={notesByCreative[selected.id] || ""}
          onNoteChange={(note) =>
            setNotesByCreative((notes) => ({ ...notes, [selected.id]: note }))
          }
          onClose={() => setSelectedId(null)}
        />
      ) : null}
    </main>
  );
}

function FilterSelect({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: string[];
}) {
  return (
    <label className="block">
      <span className="mb-2 block text-[10px] uppercase tracking-[0.14em] text-hp-muted">
        {label}
      </span>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="h-10 w-full border border-hp-rule bg-hp-inset px-3 text-sm outline-none focus:border-hp-pink"
      >
        {options.map((option) => (
          <option key={option} value={option}>
            {option === "all" ? "All" : option}
          </option>
        ))}
      </select>
    </label>
  );
}

function SummaryCard({
  label,
  value,
  detail,
}: {
  label: string;
  value: string;
  detail?: string;
}) {
  return (
    <div className="min-h-[112px] border border-hp-rule bg-hp-card p-4">
      <p className="text-[10px] uppercase tracking-[0.14em] text-hp-muted">{label}</p>
      <p className="mt-3 line-clamp-2 font-title text-2xl leading-tight text-hp-ink">{value}</p>
      {detail ? <p className="mt-2 text-sm text-hp-muted">{detail}</p> : null}
    </div>
  );
}

function TableCell({ children }: { children: ReactNode }) {
  return <td className="max-w-[240px] break-words px-4 py-3 text-sm leading-5 text-hp-body">{children}</td>;
}

function TableMetric({ children }: { children: ReactNode }) {
  return <td className="px-4 py-3 text-sm tabular-nums text-hp-ink">{children}</td>;
}

function PreviewThumb({ row }: { row: CreativeAnalysisRow }) {
  const [failed, setFailed] = useState(false);
  const src = row.thumbnailUrl || row.imageUrl || row.videoThumbnailUrl || row.previewUrl;

  if (!src || failed) {
    return (
      <div className="flex h-16 w-16 items-center justify-center border border-hp-rule bg-hp-inset text-hp-muted">
        <GalleryHorizontalEnd size={20} />
      </div>
    );
  }

  return (
    <img
      src={src}
      alt=""
      className="h-16 w-16 border border-hp-rule object-cover"
      onError={() => setFailed(true)}
    />
  );
}

function ScoreMeter({ score }: { score: number }) {
  return (
    <div className="w-24">
      <div className="flex items-center justify-between text-sm tabular-nums text-hp-ink">
        <span>{score}</span>
        <span className="text-hp-muted">/100</span>
      </div>
      <div className="mt-2 h-1.5 bg-hp-inset">
        <div className="h-full bg-hp-ink" style={{ width: `${Math.max(0, Math.min(100, score))}%` }} />
      </div>
    </div>
  );
}

function StatusBadge({ status }: { status: CreativeAnalysisRow["status"] }) {
  const className =
    status === "Scale Candidate"
      ? "border-signal-positive text-signal-positive"
      : status === "Fatigue Watch" || status === "Clickbait Risk"
        ? "border-signal-warning text-signal-warning"
        : status === "Needs Hook Improvement" || status === "Needs Retention Improvement"
          ? "border-hp-muted text-hp-body"
          : "border-hp-rule text-hp-muted";

  return (
    <span className={`inline-flex whitespace-nowrap border px-2 py-1 text-[11px] ${className}`}>
      {status}
    </span>
  );
}

function CreativeDetailDrawer({
  row,
  note,
  onNoteChange,
  onClose,
}: {
  row: CreativeAnalysisRow;
  note: string;
  onNoteChange: (note: string) => void;
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 bg-hp-ink/30">
      <aside className="ml-auto flex h-full w-full max-w-3xl flex-col overflow-y-auto border-l border-hp-rule bg-hp-foundation">
        <div className="sticky top-0 z-10 flex items-start justify-between border-b border-hp-rule bg-hp-card p-5">
          <div>
            <p className="text-[11px] uppercase tracking-[0.14em] text-hp-muted">
              Creative detail
            </p>
            <h2 className="mt-2 font-title text-3xl leading-tight text-hp-ink">{row.adName}</h2>
            <p className="mt-2 text-sm text-hp-muted">
              {row.campaignName} / {row.adSetName}
            </p>
          </div>
          <button
            onClick={onClose}
            className="border border-hp-rule p-2 text-hp-body transition-colors hover:bg-hp-inset"
            aria-label="Close creative detail"
          >
            <X size={18} />
          </button>
        </div>

        <div className="grid gap-6 p-5 lg:grid-cols-[240px_1fr]">
          <div>
            <LargePreview row={row} />
            <div className="mt-4 space-y-2 text-sm text-hp-body">
              <p>
                <span className="text-hp-muted">Ad ID:</span> {row.adId}
              </p>
              <p>
                <span className="text-hp-muted">Creative ID:</span> {row.creativeId || "n/a"}
              </p>
              <p>
                <span className="text-hp-muted">Post/story ID:</span>{" "}
                {row.effectiveObjectStoryId || row.objectStoryId || "n/a"}
              </p>
              {row.previewUrl ? (
                <a
                  href={row.previewUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-2 border border-hp-rule px-3 py-2 text-[11px] uppercase tracking-[0.14em] text-hp-ink transition-colors hover:bg-hp-inset"
                >
                  <ExternalLink size={14} />
                  Preview link
                </a>
              ) : null}
            </div>
          </div>

          <div className="space-y-6">
            <section className="border border-hp-rule bg-hp-card p-4">
              <p className="text-[11px] uppercase tracking-[0.14em] text-hp-muted">
                Diagnosis
              </p>
              <div className="mt-3 flex flex-wrap items-center gap-3">
                <ScoreMeter score={row.internalScore} />
                <StatusBadge status={row.status} />
              </div>
              <p className="mt-4 text-sm leading-6 text-hp-body">{row.diagnosis}</p>
              <p className="mt-2 text-sm leading-6 text-hp-body">{row.nextAction}</p>
            </section>

            <section className="border border-hp-rule bg-hp-card p-4">
              <p className="text-[11px] uppercase tracking-[0.14em] text-hp-muted">
                Score breakdown
              </p>
              <div className="mt-4 space-y-3">
                {[
                  ["Hook strength", row.scoreBreakdown.hookStrength],
                  ["Hold/retention", row.scoreBreakdown.holdRetention],
                  ["Click intent", row.scoreBreakdown.clickIntent],
                  ["Conversion efficiency", row.scoreBreakdown.conversionEfficiency],
                  ["Meta ranking diagnostics", row.scoreBreakdown.metaRankingDiagnostics],
                  ["Fatigue risk", row.scoreBreakdown.fatigueRisk],
                ].map(([label, value]) => (
                  <BreakdownRow key={label as string} label={label as string} value={value as number} />
                ))}
              </div>
            </section>

            <section className="border border-hp-rule bg-hp-card p-4">
              <p className="text-[11px] uppercase tracking-[0.14em] text-hp-muted">Raw metrics</p>
              <div className="mt-4 grid gap-x-5 gap-y-3 sm:grid-cols-2">
                <MetricLine label="Spend" value={formatMoney(row.spend)} />
                <MetricLine label="Impressions" value={formatNumber(row.impressions)} />
                <MetricLine label="Reach" value={formatNumber(row.reach)} />
                <MetricLine label="Frequency" value={`${row.frequency.toFixed(2)}x`} />
                <MetricLine label="CPM" value={formatMoney(row.cpm)} />
                <MetricLine label="CPC" value={formatMoney(row.cpc)} />
                <MetricLine label="Hook rate" value={formatRate(row.hookRate)} detail={row.hookRateSource} />
                <MetricLine label="Hold rate" value={formatRate(row.holdRate)} detail={row.holdRateSource} />
                <MetricLine label="Completion rate" value={formatRate(row.completionRate)} />
                <MetricLine label="CTR" value={formatPercentNumber(row.ctr)} />
                <MetricLine label="Inline link clicks" value={formatNumber(row.inlineLinkClicks)} />
                <MetricLine label={row.resultLabel} value={formatMoney(row.costPerResult)} />
                <MetricLine label="Video plays" value={formatNumber(sumActionValues(row.rawMetrics.videoPlayActions))} />
                <MetricLine label="Video 25%" value={formatNumber(sumActionValues(row.rawMetrics.videoP25WatchedActions))} />
                <MetricLine label="Video 50%" value={formatNumber(sumActionValues(row.rawMetrics.videoP50WatchedActions))} />
                <MetricLine label="Video 75%" value={formatNumber(sumActionValues(row.rawMetrics.videoP75WatchedActions))} />
                <MetricLine label="Video 95%" value={formatNumber(sumActionValues(row.rawMetrics.videoP95WatchedActions))} />
                <MetricLine label="Video 100%" value={formatNumber(sumActionValues(row.rawMetrics.videoP100WatchedActions))} />
                <MetricLine label="ThruPlays" value={formatNumber(sumActionValues(row.rawMetrics.videoThruplayWatchedActions))} />
                <MetricLine label="Quality ranking" value={rankingLabel(row.qualityRanking)} />
                <MetricLine label="Engagement ranking" value={rankingLabel(row.engagementRateRanking)} />
                <MetricLine label="Conversion ranking" value={rankingLabel(row.conversionRateRanking)} />
              </div>
            </section>

            <section className="border border-hp-rule bg-hp-card p-4">
              <p className="text-[11px] uppercase tracking-[0.14em] text-hp-muted">
                Internal notes
              </p>
              <textarea
                value={note}
                onChange={(event) => onNoteChange(event.target.value)}
                rows={5}
                placeholder="Add team notes on lead quality, brand fit, close rate, or next creative test."
                className="mt-3 w-full resize-none border border-hp-rule bg-hp-inset p-3 text-sm leading-6 outline-none focus:border-hp-pink"
              />
            </section>
          </div>
        </div>
      </aside>
    </div>
  );
}

function LargePreview({ row }: { row: CreativeAnalysisRow }) {
  const [failed, setFailed] = useState(false);
  const src = row.imageUrl || row.thumbnailUrl || row.videoThumbnailUrl || row.previewUrl;

  if (!src || failed) {
    return (
      <div className="flex aspect-square w-full items-center justify-center border border-hp-rule bg-hp-inset text-hp-muted">
        <GalleryHorizontalEnd size={28} />
      </div>
    );
  }

  return (
    <img
      src={src}
      alt=""
      className="aspect-square w-full border border-hp-rule object-cover"
      onError={() => setFailed(true)}
    />
  );
}

function BreakdownRow({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <div className="flex items-center justify-between text-sm">
        <span className="text-hp-body">{label}</span>
        <span className="tabular-nums text-hp-ink">{Math.round(value)}</span>
      </div>
      <div className="mt-1 h-1.5 bg-hp-inset">
        <div className="h-full bg-hp-ink" style={{ width: `${Math.max(0, Math.min(100, value))}%` }} />
      </div>
    </div>
  );
}

function MetricLine({
  label,
  value,
  detail,
}: {
  label: string;
  value: string;
  detail?: string;
}) {
  return (
    <div className="border-b border-hp-rule pb-2">
      <p className="text-[10px] uppercase tracking-[0.14em] text-hp-muted">{label}</p>
      <p className="mt-1 text-sm tabular-nums text-hp-ink">{value}</p>
      {detail ? <p className="mt-1 text-xs text-hp-muted">{detail}</p> : null}
    </div>
  );
}

function buildSummary(rows: CreativeAnalysisRow[]) {
  const totalSpend = rows.reduce((sum, row) => sum + row.spend, 0);
  const totalResults = rows.reduce((sum, row) => sum + row.resultCount, 0);
  const bestByCpa = rows
    .filter((row) => row.costPerResult !== null && row.resultCount > 0)
    .sort((a, b) => (a.costPerResult || Infinity) - (b.costPerResult || Infinity))[0];
  const bestByHook = rows
    .filter((row) => row.hookRate !== null)
    .sort((a, b) => (b.hookRate || 0) - (a.hookRate || 0))[0];

  return {
    totalSpend,
    totalResults,
    averageCpa: totalResults > 0 ? totalSpend / totalResults : null,
    bestByCpa,
    bestByHook,
    fatigueCount: rows.filter((row) => row.status === "Fatigue Watch").length,
    scaleCandidates: rows.filter((row) => row.status === "Scale Candidate").length,
  };
}

function formatMoney(value: number | null, compact = false) {
  if (value === null || Number.isNaN(value)) return "n/a";
  return (compact ? MONEY_COMPACT_FORMATTER : MONEY_FORMATTER).format(value);
}

function formatNumber(value: number) {
  return NUMBER_FORMATTER.format(value);
}

function formatRate(value: number | null) {
  if (value === null || Number.isNaN(value)) return "n/a";
  return `${(value * 100).toFixed(2)}%`;
}

function formatPercentNumber(value: number | null) {
  if (value === null || Number.isNaN(value)) return "n/a";
  return `${value.toFixed(2)}%`;
}

function rankingLabel(value: string | null) {
  if (!value) return "Unavailable";
  return value
    .toLowerCase()
    .replace(/_/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function sumActionValues(value: unknown) {
  if (!Array.isArray(value)) return 0;
  return value.reduce((sum, item) => {
    if (typeof item !== "object" || item === null || Array.isArray(item)) return sum;
    const rawValue = (item as { value?: unknown }).value;
    const parsed = typeof rawValue === "number" ? rawValue : Number(rawValue);
    return Number.isFinite(parsed) ? sum + parsed : sum;
  }, 0);
}
