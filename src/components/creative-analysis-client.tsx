"use client";

/* eslint-disable @next/next/no-img-element */

import {
  AlertTriangle,
  CalendarRange,
  ExternalLink,
  GalleryHorizontalEnd,
  Search,
  X,
} from "lucide-react";
import type { ReactNode } from "react";
import { useEffect, useMemo, useRef, useState } from "react";

import {
  CREATIVE_STATUS_OPTIONS,
  type CreativeAnalysisPayload,
  type CreativeAnalysisRow,
} from "@/lib/creative-analysis";

type Props = {
  initialData: CreativeAnalysisPayload;
};

type LiveVideoMetrics = {
  adId: string;
  adName: string | null;
  actions: unknown;
  videoPlayActions: unknown;
  videoP25WatchedActions: unknown;
  videoP50WatchedActions: unknown;
  videoP75WatchedActions: unknown;
  videoP95WatchedActions: unknown;
  videoP100WatchedActions: unknown;
  videoThruplayWatchedActions: unknown;
};

type LiveVideoMetricsState =
  | { status: "loading" }
  | { status: "ready"; metrics: LiveVideoMetrics }
  | { status: "error"; error: string };

type SelectedActionMetric = {
  value: unknown;
  detail?: string;
};

type DeliveryFilter = "active" | "inactive" | "all";

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
  const [delivery, setDelivery] = useState<DeliveryFilter>("all");
  const [umbrella, setUmbrella] = useState("all");
  const [campaign, setCampaign] = useState("all");
  const [adSet, setAdSet] = useState("all");
  const [status, setStatus] = useState("all");
  const [minSpend, setMinSpend] = useState("");
  const [query, setQuery] = useState("");
  const [startDate, setStartDate] = useState(data.sourceTransparency.timeRange.start || "");
  const [endDate, setEndDate] = useState(data.sourceTransparency.timeRange.end || "");
  const [isApplyingRange, setIsApplyingRange] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [showAllRows, setShowAllRows] = useState(false);
  const [notesByCreative, setNotesByCreative] = useState<Record<string, string>>({});
  const [liveVideoByCreative, setLiveVideoByCreative] = useState<
    Record<string, LiveVideoMetricsState>
  >({});
  const requestedVideoMetrics = useRef(new Set<string>());

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
    () => [
      "all",
      ...Array.from(
        new Set(
          filteredByBrand
            .filter((row) => umbrella === "all" || (row.campaignUmbrella || "Unassigned") === umbrella)
            .map((row) => row.campaignName),
        ),
      ).sort(),
    ],
    [filteredByBrand, umbrella],
  );
  const umbrellaOptions = useMemo(
    () => [
      "all",
      ...Array.from(new Set(filteredByBrand.map((row) => row.campaignUmbrella || "Unassigned"))).sort(),
    ],
    [filteredByBrand],
  );
  const adSetOptions = useMemo(
    () => [
      "all",
      ...Array.from(
        new Set(
          filteredByBrand
            .filter((row) => umbrella === "all" || (row.campaignUmbrella || "Unassigned") === umbrella)
            .filter((row) => campaign === "all" || row.campaignName === campaign)
            .map((row) => row.adSetName),
        ),
      ).sort(),
    ],
    [campaign, filteredByBrand, umbrella],
  );

  const filteredRows = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    const minimumSpend = Number(minSpend);
    return data.rows
      .filter((row) => brand === "all" || row.brandCode === brand)
      .filter((row) => delivery === "all" || adDeliveryState(row) === delivery)
      .filter((row) => umbrella === "all" || (row.campaignUmbrella || "Unassigned") === umbrella)
      .filter((row) => campaign === "all" || row.campaignName === campaign)
      .filter((row) => adSet === "all" || row.adSetName === adSet)
      .filter((row) => status === "all" || row.status === status)
      .filter((row) => !Number.isFinite(minimumSpend) || row.spend >= minimumSpend)
      .filter((row) => {
        if (!normalizedQuery) return true;
        return [
          row.adName,
          row.campaignName,
          row.adSetName,
          row.creativeName || "",
          row.adConfiguredStatus || "",
          row.adEffectiveStatus || "",
        ]
          .join(" ")
          .toLowerCase()
          .includes(normalizedQuery);
      })
      .sort(compareCreativeRank);
  }, [adSet, brand, campaign, data.rows, delivery, minSpend, query, status, umbrella]);

  const summary = useMemo(() => buildSummary(filteredRows), [filteredRows]);
  const visibleRows = showAllRows ? filteredRows : filteredRows.slice(0, 12);
  const selected = useMemo(
    () => data.rows.find((row) => row.id === selectedId) || null,
    [data.rows, selectedId],
  );
  const selectedVideoState = selected ? liveVideoByCreative[selected.id] : undefined;

  useEffect(() => {
    const start = data.sourceTransparency.timeRange.start;
    const end = data.sourceTransparency.timeRange.end;
    if (!selected || !start || !end) return;

    const cacheKey = `${selected.id}:${start}:${end}`;
    if (requestedVideoMetrics.current.has(cacheKey)) return;

    requestedVideoMetrics.current.add(cacheKey);
    const controller = new AbortController();
    setLiveVideoByCreative((current) => ({
      ...current,
      [selected.id]: { status: "loading" },
    }));

    const params = new URLSearchParams({
      metaAccountId: selected.metaAccountId,
      adId: selected.adId,
      start,
      end,
    });

    fetch(`/api/creative-analysis/ad-video-metrics?${params.toString()}`, {
      signal: controller.signal,
    })
      .then(async (response) => {
        const payload = (await response.json().catch(() => null)) as {
          metrics?: LiveVideoMetrics;
          error?: string;
        } | null;

        if (!response.ok) {
          throw new Error(payload?.error || "Unable to load live Meta video metrics.");
        }

        if (!payload?.metrics) {
          throw new Error("Meta returned no video metrics for this creative.");
        }

        return payload.metrics;
      })
      .then((metrics) => {
        setLiveVideoByCreative((current) => ({
          ...current,
          [selected.id]: { status: "ready", metrics },
        }));
      })
      .catch((error) => {
        if (isAbortError(error)) {
          requestedVideoMetrics.current.delete(cacheKey);
          return;
        }

        setLiveVideoByCreative((current) => ({
          ...current,
          [selected.id]: {
            status: "error",
            error: error instanceof Error ? error.message : "Unable to load live Meta video metrics.",
          },
        }));
      });

    return () => controller.abort();
  }, [
    data.sourceTransparency.timeRange.end,
    data.sourceTransparency.timeRange.start,
    selected,
  ]);

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

  if (selected) {
    return (
      <CreativeDetailPage
        row={selected}
        liveVideoState={selectedVideoState}
        note={notesByCreative[selected.id] || ""}
        onNoteChange={(note) =>
          setNotesByCreative((notes) => ({ ...notes, [selected.id]: note }))
        }
        onClose={() => setSelectedId(null)}
      />
    );
  }

  return (
    <main className="min-h-screen bg-hp-foundation px-4 py-7 text-hp-body md:px-8">
      <header className="mx-auto grid max-w-7xl gap-8 border-b border-hp-rule pb-10 lg:grid-cols-[1fr_360px] lg:items-center">
        <div>
          <span className="text-[11px] uppercase tracking-[0.14em] text-hp-muted">
            HP/VVS Meta Ads · {dateRangeLabel(data.sourceTransparency.timeRange)}
          </span>
          <h1 className="mt-2 font-title text-4xl leading-tight text-hp-ink md:text-5xl">
            Creative Analysis
          </h1>
          <p className="mt-3 max-w-2xl text-sm italic leading-6 text-hp-body">
            Internal diagnostic scoring across active and paused creatives. Combines visible Meta
            metrics with Hung Phat weightings, not Meta&apos;s official ranking.
          </p>
        </div>
        <div className="border border-hp-rule bg-hp-card p-5 text-sm text-hp-body">
          <p className="text-[10px] uppercase tracking-[0.18em] text-hp-muted">
            Reading these scores
          </p>
          <p className="mt-2 leading-5">
            HP/VVS sells high-ticket luxury jewelry. Lower CTRs can be normal when appointment
            quality, close rate, AOV, and brand fit are strong.
          </p>
        </div>
      </header>

      <section className="mx-auto mt-8 max-w-7xl border border-hp-rule bg-hp-card px-5 py-5">
        <div className="grid gap-6 border-b border-hp-rule pb-5 lg:grid-cols-[1fr_1fr_1.3fr]">
          <div>
            <FilterEyebrow>Showing</FilterEyebrow>
            <SegmentedControl
              value={delivery}
              onChange={(value) => setDelivery(value as DeliveryFilter)}
              options={[
                { value: "active", label: "Active only" },
                { value: "inactive", label: "Paused" },
                { value: "all", label: "All" },
              ]}
            />
          </div>
          <div>
            <FilterEyebrow>Creative status</FilterEyebrow>
            <select
              value={status}
              onChange={(event) => setStatus(event.target.value)}
              className="h-10 w-full border border-hp-rule bg-transparent px-3 text-sm outline-none focus:border-hp-pink"
            >
              {["all", ...CREATIVE_STATUS_OPTIONS].map((option) => (
                <option key={option} value={option}>
                  {option === "all" ? "All statuses" : option}
                </option>
              ))}
            </select>
          </div>
          <div>
            <FilterEyebrow>Time</FilterEyebrow>
            <div className="flex flex-wrap items-center gap-2">
              {[7, 14, 30, 90].map((days) => (
                <button
                  key={days}
                  onClick={() => applyQuickRange(days)}
                  disabled={isApplyingRange}
                  className={`h-10 border px-4 text-sm transition-colors ${
                    data.sourceTransparency.timeRange.days === days
                      ? "border-hp-ink bg-hp-ink text-hp-foundation"
                      : "border-hp-rule text-hp-body hover:border-hp-ink"
                  }`}
                >
                  {days}d
                </button>
              ))}
              <button
                onClick={applyCustomRange}
                disabled={isApplyingRange || !startDate || !endDate}
                className="h-10 border border-hp-rule px-4 text-sm text-hp-body transition-colors hover:border-hp-ink hover:bg-hp-inset"
              >
                Custom
              </button>
              <span className="ml-auto text-sm italic text-hp-muted">
                {dateRangeLabel(data.sourceTransparency.timeRange)}
              </span>
            </div>
          </div>
        </div>
        <div className="mt-4 grid gap-4 lg:grid-cols-[1fr_1fr_1fr_1fr_0.75fr_1fr]">
          <FilterSelect label="Brand / account" value={brand} onChange={setBrand} options={brandOptions} />
          <FilterSelect label="Campaign umbrella" value={umbrella} onChange={setUmbrella} options={umbrellaOptions} />
          <FilterSelect label="Campaign" value={campaign} onChange={setCampaign} options={campaignOptions} />
          <FilterSelect label="Ad set" value={adSet} onChange={setAdSet} options={adSetOptions} />
          <label className="block">
            <FilterEyebrow>Min spend</FilterEyebrow>
            <input
              value={minSpend}
              onChange={(event) => setMinSpend(event.target.value)}
              inputMode="decimal"
              placeholder="0"
              className="h-10 w-full border-0 border-b border-hp-rule bg-transparent px-0.5 text-sm outline-none focus:border-b-2 focus:border-hp-pink"
            />
          </label>
          <label className="block">
            <FilterEyebrow>Search</FilterEyebrow>
            <div className="flex h-10 items-center gap-2 border-0 border-b border-hp-rule">
              <Search size={14} className="text-hp-muted" />
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Ad or campaign"
                className="min-w-0 flex-1 bg-transparent text-sm outline-none"
              />
            </div>
          </label>
        </div>
        <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:w-[560px] lg:grid-cols-2">
          <label>
            <FilterEyebrow>Custom start</FilterEyebrow>
            <input
              type="date"
              value={startDate}
              onChange={(event) => setStartDate(event.target.value)}
              className="h-10 w-full border-0 border-b border-hp-rule bg-transparent px-0.5 text-sm outline-none focus:border-b-2 focus:border-hp-pink"
            />
          </label>
          <label>
            <FilterEyebrow>Custom end</FilterEyebrow>
            <input
              type="date"
              value={endDate}
              onChange={(event) => setEndDate(event.target.value)}
              className="h-10 w-full border-0 border-b border-hp-rule bg-transparent px-0.5 text-sm outline-none focus:border-b-2 focus:border-hp-pink"
            />
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

      <section className="mx-auto mt-6 grid max-w-7xl gap-4 lg:grid-cols-[1.6fr_1fr_1fr]">
        <div className="border border-hp-rule bg-hp-card p-6">
          <p className="text-[10px] uppercase tracking-[0.18em] text-hp-muted">
            At a glance · {formatNumber(filteredRows.length)} creatives
          </p>
          <h2 className="mt-2 font-title text-2xl text-hp-ink">Period summary</h2>
          <div className="mt-4 grid gap-4 border-t border-hp-rule pt-4 sm:grid-cols-5">
            <SummaryStat label="Total spend" value={formatMoney(summary.totalSpend, true)} />
            <SummaryStat
              label="KPI results"
              value={formatNumber(summary.totalResults)}
              detail={summary.kpiDetail}
            />
            <SummaryStat label="Average CPA" value={formatMoney(summary.averageCpa)} detail="filtered blend" />
            <SummaryStat
              label="Scale candidates"
              value={formatNumber(summary.scaleCandidates)}
              detail={`of ${formatNumber(filteredRows.length)}`}
            />
            <SummaryStat label="Fatigue watch" value={formatNumber(summary.fatigueCount)} />
          </div>
        </div>
        <FeatureCard
          eyebrow="Best CPA"
          value={formatMoney(summary.bestByCpa?.costPerResult ?? null)}
          title={summary.bestByCpa?.adName || "n/a"}
          detail={summary.bestByCpa ? kpiResultDetail(summary.bestByCpa) : undefined}
          badge={summary.bestByCpa?.status}
        />
        <FeatureCard
          eyebrow="Best hook"
          value={formatRate(summary.bestByHook?.hookRate ?? null)}
          title={summary.bestByHook?.adName || "n/a"}
          detail={summary.bestByHook ? `${formatMoney(summary.bestByHook.spend)} spend` : undefined}
          badge={summary.bestByHook?.status}
        />
      </section>

      <section className="mx-auto mt-8 max-w-7xl">
        <div className="flex flex-col gap-2 border-b border-hp-rule pb-4 md:flex-row md:items-end md:justify-between">
          <div>
            <p className="text-[10px] uppercase tracking-[0.18em] text-hp-muted">
              Creative scorecard
            </p>
            <h2 className="mt-1 font-title text-3xl leading-tight text-hp-ink">
              Ranked by internal diagnostic score
            </h2>
          </div>
          <p className="text-sm italic text-hp-muted">
            {formatNumber(filteredRows.length)} creatives · {dateRangeLabel(data.sourceTransparency.timeRange)}
          </p>
        </div>

        {filteredRows.length ? (
          <div className="mt-6 overflow-x-auto scrollbar-thin">
            <table className="w-full min-w-[1180px] border-collapse">
              <thead>
                <tr className="bg-hp-inset">
                  {[
                    "Rank",
                    "Creative",
                    "Internal score",
                    "KPI results",
                    "Spend",
                    "CPA",
                    "Hook rate",
                    "Hold rate",
                    "Status",
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
                {visibleRows.map((row, index) => (
                  <tr
                    key={row.id}
                    className="border-b border-hp-rule transition-colors hover:bg-hp-card"
                  >
                    <td className="px-4 py-4 text-lg italic tabular-nums text-hp-muted">
                      #{index + 1}
                    </td>
                    <td className="px-4 py-4">
                      <div className="flex items-center gap-4">
                        <button
                          onClick={() => setSelectedId(row.id)}
                          className="shrink-0 text-left focus:outline-none focus:ring-1 focus:ring-hp-pink"
                          aria-label={`Open ${row.adName}`}
                        >
                          <PreviewThumb row={row} />
                        </button>
                        <div className="min-w-0">
                          <button
                            onClick={() => setSelectedId(row.id)}
                            className="block max-w-[280px] truncate text-left text-lg leading-6 text-hp-ink underline-offset-4 hover:underline focus:outline-none focus:ring-1 focus:ring-hp-pink md:max-w-[320px]"
                          >
                            {row.adName}
                          </button>
                          <p className="mt-1 max-w-[280px] truncate text-sm italic text-hp-muted md:max-w-[320px]">
                            {row.brandCode} · {adDeliveryLabel(row)} · {row.campaignUmbrella || row.adSetName}
                          </p>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <ScoreMeter score={row.internalScore} />
                    </td>
                    <td className="px-4 py-3">
                      <KpiResultCell row={row} />
                    </td>
                    <TableMetric>{formatMoney(row.spend, true)}</TableMetric>
                    <TableMetric>{formatMoney(row.costPerResult)}</TableMetric>
                    <TableMetric>{formatRate(row.hookRate)}</TableMetric>
                    <TableMetric>{formatRate(row.holdRate)}</TableMetric>
                    <td className="px-4 py-3">
                      <StatusBadge status={row.status} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {filteredRows.length > visibleRows.length ? (
              <div className="flex justify-end border-t border-hp-rule py-4 text-sm italic text-hp-muted">
                <button
                  onClick={() => setShowAllRows(true)}
                  className="underline-offset-4 transition-colors hover:text-hp-ink hover:underline"
                >
                  Showing {formatNumber(visibleRows.length)} of {formatNumber(filteredRows.length)} · view all →
                </button>
              </div>
            ) : filteredRows.length > 12 ? (
              <div className="flex justify-end border-t border-hp-rule py-4 text-sm italic text-hp-muted">
                <button
                  onClick={() => setShowAllRows(false)}
                  className="underline-offset-4 transition-colors hover:text-hp-ink hover:underline"
                >
                  Showing all {formatNumber(filteredRows.length)} · collapse
                </button>
              </div>
            ) : null}
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

    </main>
  );
}

function compareCreativeRank(a: CreativeAnalysisRow, b: CreativeAnalysisRow) {
  return (
    b.internalScore - a.internalScore ||
    statusRank(a.status) - statusRank(b.status) ||
    compareNullableCost(a.costPerResult, b.costPerResult) ||
    (b.resultCount || 0) - (a.resultCount || 0) ||
    (b.hookRate || 0) - (a.hookRate || 0) ||
    b.spend - a.spend ||
    a.adName.localeCompare(b.adName)
  );
}

function statusRank(status: CreativeAnalysisRow["status"]) {
  switch (status) {
    case "Scale Candidate":
      return 0;
    case "Brand Fit Review":
      return 1;
    case "Needs Retention Improvement":
      return 2;
    case "Needs Hook Improvement":
      return 3;
    case "Clickbait Risk":
      return 4;
    case "Fatigue Watch":
      return 5;
  }
}

function compareNullableCost(a: number | null, b: number | null) {
  if (a === null && b === null) return 0;
  if (a === null) return 1;
  if (b === null) return -1;
  return a - b;
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
      <FilterEyebrow>{label}</FilterEyebrow>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="h-10 w-full border-0 border-b border-hp-rule bg-transparent px-0.5 text-sm outline-none focus:border-b-2 focus:border-hp-pink"
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

function FilterEyebrow({ children }: { children: ReactNode }) {
  return (
    <span className="mb-2 block text-[10px] uppercase tracking-[0.18em] text-hp-muted">
      {children}
    </span>
  );
}

function SegmentedControl({
  value,
  onChange,
  options,
}: {
  value: string;
  onChange: (value: string) => void;
  options: Array<{ value: string; label: string }>;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {options.map((option) => (
        <button
          key={option.value}
          onClick={() => onChange(option.value)}
          className={`h-10 border px-4 text-sm transition-colors ${
            value === option.value
              ? "border-hp-ink bg-hp-ink text-hp-foundation"
              : "border-hp-rule text-hp-body hover:border-hp-ink"
          }`}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

function SummaryStat({
  label,
  value,
  detail,
}: {
  label: string;
  value: string;
  detail?: string;
}) {
  return (
    <div>
      <p className="text-[10px] uppercase tracking-[0.14em] text-hp-muted">{label}</p>
      <p className="mt-1 font-title text-2xl leading-tight text-hp-ink">{value}</p>
      {detail ? <p className="mt-0.5 text-xs italic leading-4 text-hp-muted">{detail}</p> : null}
    </div>
  );
}

function FeatureCard({
  eyebrow,
  value,
  title,
  detail,
  badge,
}: {
  eyebrow: string;
  value: string;
  title: string;
  detail?: string;
  badge?: CreativeAnalysisRow["status"];
}) {
  return (
    <div className="border border-hp-rule bg-hp-card p-6">
      <p className="text-[10px] uppercase tracking-[0.18em] text-hp-muted">{eyebrow}</p>
      <p className="mt-1 font-title text-3xl leading-none text-hp-ink">{value}</p>
      <p className="mt-3 line-clamp-1 text-sm text-hp-ink">{title}</p>
      {detail ? <p className="mt-1 line-clamp-1 text-xs italic text-hp-muted">{detail}</p> : null}
      {badge ? (
        <div className="mt-3">
          <StatusBadge status={badge} compact />
        </div>
      ) : null}
    </div>
  );
}

function TableMetric({ children }: { children: ReactNode }) {
  return <td className="px-4 py-3 text-sm tabular-nums text-hp-ink">{children}</td>;
}

function KpiResultCell({ row }: { row: CreativeAnalysisRow }) {
  return (
    <div>
      <p className="text-right text-sm tabular-nums text-hp-ink">{formatNumber(row.resultCount)}</p>
      <p className="mt-0.5 max-w-[170px] truncate text-right text-xs italic text-hp-muted">
        {row.resultKpiLabel}
      </p>
      {row.resultActionType ? (
        <p
          className="mt-0.5 max-w-[170px] truncate text-right text-[10px] text-hp-muted"
          title={row.resultActionType}
        >
          {friendlyActionType(row.resultActionType)}
        </p>
      ) : null}
    </div>
  );
}

function PreviewThumb({ row }: { row: CreativeAnalysisRow }) {
  const [failed, setFailed] = useState(false);
  const src = row.thumbnailUrl || row.imageUrl || row.videoThumbnailUrl || row.previewUrl;

  if (!src || failed) {
    return (
      <div className="flex h-14 w-14 items-center justify-center border border-hp-rule bg-hp-inset text-hp-muted">
        <GalleryHorizontalEnd size={20} />
      </div>
    );
  }

  return (
    <img
      src={src}
      alt=""
      className="h-14 w-14 border border-hp-rule object-cover"
      onError={() => setFailed(true)}
    />
  );
}

function ScoreMeter({ score }: { score: number }) {
  return (
    <div className="w-52">
      <div className="flex items-baseline gap-1 text-hp-ink">
        <span className="font-title text-3xl leading-none tabular-nums">{score}</span>
        <span className="text-hp-muted">/100</span>
      </div>
      <div className="mt-2 h-1.5 bg-hp-inset">
        <div
          className={`h-full ${scoreBandClass(score)}`}
          style={{ width: `${Math.max(0, Math.min(100, score))}%` }}
        />
      </div>
    </div>
  );
}

function StatusBadge({
  status,
  compact = false,
}: {
  status: CreativeAnalysisRow["status"];
  compact?: boolean;
}) {
  const className =
    status === "Scale Candidate"
      ? "border-signal-positive bg-signal-positive text-hp-foundation"
      : status === "Fatigue Watch" || status === "Clickbait Risk"
        ? "border-signal-warning bg-signal-warning text-hp-foundation"
        : status === "Needs Hook Improvement" || status === "Needs Retention Improvement"
          ? "border-hp-muted bg-hp-muted text-hp-foundation"
          : "border-signal-warning bg-signal-warning text-hp-foundation";

  return (
    <span
      className={`inline-flex whitespace-nowrap border px-3 py-1 text-[11px] ${
        compact ? "text-[10px]" : ""
      } ${className}`}
    >
      {status}
    </span>
  );
}

function DeliveryBadge({ row }: { row: CreativeAnalysisRow }) {
  const state = adDeliveryState(row);
  const className =
    state === "active"
      ? "bg-signal-positive text-hp-foundation"
      : state === "inactive"
        ? "bg-hp-inset text-hp-ink"
        : "bg-hp-inset text-hp-muted";

  return <span className={`px-5 py-3 text-lg font-semibold ${className}`}>{adDeliveryLabel(row)}</span>;
}

function IdentifierLine({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid gap-2 sm:grid-cols-[150px_1fr] sm:items-baseline">
      <p className="text-lg text-hp-muted">{label}</p>
      <p className="min-w-0 break-words text-right text-xl text-hp-ink">{value}</p>
    </div>
  );
}

function RawMetricGroup({
  title,
  metrics,
}: {
  title: string;
  metrics: Array<[string, string, string?]>;
}) {
  return (
    <div>
      <p className="text-[11px] uppercase tracking-[0.18em] text-hp-muted">{title}</p>
      <div className="mt-5 space-y-6">
        {metrics.map(([label, value, detail]) => (
          <div key={label}>
            <p className="text-lg text-hp-muted">{label}</p>
            <p className="mt-0.5 font-title text-3xl leading-none text-hp-ink tabular-nums">{value}</p>
            {detail ? <p className="mt-1 text-xs italic leading-4 text-hp-muted">{detail}</p> : null}
          </div>
        ))}
      </div>
    </div>
  );
}

function CreativeDetailPage({
  row,
  liveVideoState,
  note,
  onNoteChange,
  onClose,
}: {
  row: CreativeAnalysisRow;
  liveVideoState: LiveVideoMetricsState | undefined;
  note: string;
  onNoteChange: (note: string) => void;
  onClose: () => void;
}) {
  const liveVideoMetrics = liveVideoState?.status === "ready" ? liveVideoState.metrics : null;
  const videoMetrics = {
    plays: selectVideoActionMetric(
      liveVideoState,
      liveVideoMetrics?.videoPlayActions,
      row.rawMetrics.videoPlayActions,
    ),
    p25: selectVideoActionMetric(
      liveVideoState,
      liveVideoMetrics?.videoP25WatchedActions,
      row.rawMetrics.videoP25WatchedActions,
    ),
    p50: selectVideoActionMetric(
      liveVideoState,
      liveVideoMetrics?.videoP50WatchedActions,
      row.rawMetrics.videoP50WatchedActions,
    ),
    p75: selectVideoActionMetric(
      liveVideoState,
      liveVideoMetrics?.videoP75WatchedActions,
      row.rawMetrics.videoP75WatchedActions,
    ),
    p95: selectVideoActionMetric(
      liveVideoState,
      liveVideoMetrics?.videoP95WatchedActions,
      row.rawMetrics.videoP95WatchedActions,
    ),
    p100: selectVideoActionMetric(
      liveVideoState,
      liveVideoMetrics?.videoP100WatchedActions,
      row.rawMetrics.videoP100WatchedActions,
    ),
    thruplay: selectVideoActionMetric(
      liveVideoState,
      liveVideoMetrics?.videoThruplayWatchedActions,
      row.rawMetrics.videoThruplayWatchedActions,
    ),
  };

  return (
    <main className="min-h-screen bg-hp-foundation px-4 py-7 text-hp-body md:px-8">
      <section className="mx-auto max-w-7xl">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div className="text-xl italic text-hp-muted">
            <button onClick={onClose} className="underline-offset-4 hover:text-hp-ink hover:underline">
              Creative Analysis
            </button>{" "}
            <span className="mx-3">›</span>
            <span className="font-semibold text-hp-ink">{row.adName}</span>
          </div>
          <button
            onClick={onClose}
            className="inline-flex items-center gap-3 self-start text-xl italic text-hp-muted underline-offset-4 transition-colors hover:text-hp-ink hover:underline md:self-auto"
          >
            ← Back to scorecard
            <X size={18} />
          </button>
        </div>

        <div className="mt-10 grid gap-6 lg:grid-cols-[1fr_auto] lg:items-end">
          <div>
            <p className="text-[11px] uppercase tracking-[0.18em] text-hp-muted">
              Creative detail · {formatDateTime(row.adStatusSyncedAt)}
            </p>
            <h1 className="mt-4 max-w-5xl font-title text-5xl leading-none text-hp-ink md:text-7xl">
              {row.adName}
            </h1>
            <p className="mt-5 max-w-5xl text-xl italic leading-8 text-hp-body">
              {row.adSetName} — {row.campaignName}
            </p>
            <div className="mt-5 flex flex-wrap items-center gap-3">
              <DeliveryBadge row={row} />
              <StatusBadge status={row.status} />
              <span className="text-lg italic text-hp-muted">
                Last sync · {formatDateTime(row.adStatusSyncedAt)}
              </span>
            </div>
          </div>
          {row.previewUrl ? (
            <a
              href={row.previewUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-flex h-12 items-center gap-2 border border-hp-ink px-6 text-lg font-semibold text-hp-ink transition-colors hover:bg-hp-ink hover:text-hp-foundation"
            >
              Preview ad
              <ExternalLink size={16} />
            </a>
          ) : null}
        </div>

        <div className="mt-10 grid gap-8 lg:grid-cols-[400px_1fr] xl:grid-cols-[480px_1fr]">
          <div className="space-y-8">
            <LargePreview row={row} />
            <section className="border border-hp-rule bg-hp-card p-6">
              <p className="text-[11px] uppercase tracking-[0.18em] text-hp-muted">Identifiers</p>
              <div className="mt-5 space-y-4 border-t border-hp-rule pt-5">
                <IdentifierLine label="Ad ID" value={row.adId} />
                <IdentifierLine label="Creative ID" value={row.creativeId || "n/a"} />
                <IdentifierLine
                  label="Post / story ID"
                  value={row.effectiveObjectStoryId || row.objectStoryId || "n/a"}
                />
                <IdentifierLine label="Configured status" value={metaStatusLabel(row.adConfiguredStatus)} />
                <IdentifierLine label="Effective status" value={metaStatusLabel(row.adEffectiveStatus)} />
                <IdentifierLine label="Campaign umbrella" value={row.campaignUmbrella || "n/a"} />
              </div>
            </section>
          </div>

          <div className="space-y-8">
            <section className="border border-hp-rule bg-hp-card p-8">
              <div className="grid gap-6 md:grid-cols-[1fr_170px]">
                <div>
                  <p className="text-[11px] uppercase tracking-[0.18em] text-hp-muted">Diagnosis</p>
                  <p className="mt-5 font-title text-3xl leading-tight text-hp-ink">
                    {row.diagnosis}
                  </p>
                </div>
                <div className="text-center">
                  <p className="font-title text-7xl leading-none text-hp-ink tabular-nums">
                    {row.internalScore}
                  </p>
                  <p className="text-xl text-hp-muted">/ 100</p>
                  <p className="mt-3 text-lg font-semibold text-signal-warning">{row.status}</p>
                </div>
              </div>
              <div className="mt-8 border-t border-hp-rule pt-6">
                <p className="text-[11px] uppercase tracking-[0.18em] text-hp-muted">
                  Recommendation
                </p>
                <p className="mt-3 text-2xl leading-8 text-hp-body">{row.nextAction}</p>
              </div>
            </section>

            <section className="border border-hp-rule bg-hp-card p-8">
              <p className="text-[11px] uppercase tracking-[0.18em] text-hp-muted">
                Score breakdown
              </p>
              <h2 className="mt-4 border-b border-hp-rule pb-6 font-title text-4xl leading-tight text-hp-ink">
                What&apos;s driving the {row.internalScore}
              </h2>
              <div className="mt-6 space-y-6">
                {[
                  ["Hook strength", row.scoreBreakdown.hookStrength],
                  ["Hold / retention", row.scoreBreakdown.holdRetention],
                  ["Click intent", row.scoreBreakdown.clickIntent],
                  ["Conversion efficiency", row.scoreBreakdown.conversionEfficiency],
                  ["Meta ranking diagnostics", row.scoreBreakdown.metaRankingDiagnostics],
                  ["Fatigue risk", row.scoreBreakdown.fatigueRisk],
                ].map(([label, value]) => (
                  <BreakdownRow key={label as string} label={label as string} value={value as number} />
                ))}
              </div>
            </section>

            <section className="border border-hp-rule bg-hp-card p-8">
              <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                <p className="text-[11px] uppercase tracking-[0.18em] text-hp-muted">
                  Raw metrics · source: Meta Ads
                </p>
                {liveVideoState?.status === "loading" ? (
                  <p className="text-xs text-hp-muted">Checking live Meta video diagnostics...</p>
                ) : null}
              </div>
              <h2 className="mt-4 border-b border-hp-rule pb-6 font-title text-4xl leading-tight text-hp-ink">
                Grouped by purpose
              </h2>
              <div className="mt-8 grid gap-8 lg:grid-cols-3">
                <RawMetricGroup
                  title="Reach & cost"
                  metrics={[
                    ["Spend", formatMoney(row.spend)],
                    ["Impressions", formatNumber(row.impressions)],
                    ["Reach", formatNumber(row.reach)],
                    ["Frequency", `${row.frequency.toFixed(2)}x`],
                    ["CPM", formatMoney(row.cpm)],
                    ["CPC", formatMoney(row.cpc)],
                  ]}
                />
                <RawMetricGroup
                  title="Engagement"
                  metrics={[
                    ["Hook rate", formatRate(row.hookRate), row.hookRateSource],
                    ["Hold rate", formatRate(row.holdRate), row.holdRateSource],
                    ["Completion rate", formatRate(row.completionRate)],
                    ["CTR", formatPercentNumber(row.ctr)],
                    ["Inline link clicks", formatNumber(row.inlineLinkClicks)],
                  ]}
                />
                <RawMetricGroup
                  title="Conversion & video"
                  metrics={[
                    ["KPI results", formatNumber(row.resultCount), kpiResultDetail(row)],
                    [row.resultLabel, formatMoney(row.costPerResult)],
                    ["Video plays", formatActionMetric(videoMetrics.plays.value), videoMetrics.plays.detail],
                    [
                      "Video 25 / 50",
                      `${formatActionMetric(videoMetrics.p25.value)} / ${formatActionMetric(videoMetrics.p50.value)}`,
                    ],
                    [
                      "Video 75 / 95",
                      `${formatActionMetric(videoMetrics.p75.value)} / ${formatActionMetric(videoMetrics.p95.value)}`,
                    ],
                    [
                      "Video 100 / ThruPlays",
                      `${formatActionMetric(videoMetrics.p100.value)} / ${formatActionMetric(videoMetrics.thruplay.value)}`,
                    ],
                    ["Quality ranking", rankingLabel(row.qualityRanking)],
                    ["Engagement ranking", rankingLabel(row.engagementRateRanking)],
                    ["Conversion ranking", rankingLabel(row.conversionRateRanking)],
                  ]}
                />
              </div>
            </section>

            <section className="border border-hp-rule bg-hp-card p-6">
              <p className="text-[11px] uppercase tracking-[0.18em] text-hp-muted">
                Internal notes
              </p>
              <textarea
                value={note}
                onChange={(event) => onNoteChange(event.target.value)}
                rows={5}
                placeholder="Add team notes on lead quality, brand fit, close rate, or next creative test."
                className="mt-4 w-full resize-none border-0 border-b border-hp-rule bg-transparent p-0 pb-3 text-lg leading-7 outline-none focus:border-b-2 focus:border-hp-pink"
              />
            </section>
          </div>
        </div>
      </section>
    </main>
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
    <div className="grid gap-3 md:grid-cols-[260px_1fr_48px] md:items-center">
      <div>
        <p className="text-2xl leading-tight text-hp-ink">{label}</p>
      </div>
      <div className="h-2 bg-hp-inset">
        <div
          className={`h-full ${scoreBandClass(value)}`}
          style={{ width: `${Math.max(0, Math.min(100, value))}%` }}
        />
      </div>
      <p className="text-right text-xl tabular-nums text-hp-ink">{Math.round(value)}</p>
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
    kpiDetail: kpiSummaryDetail(rows),
    averageCpa: totalResults > 0 ? totalSpend / totalResults : null,
    bestByCpa,
    bestByHook,
    fatigueCount: rows.filter((row) => row.status === "Fatigue Watch").length,
    scaleCandidates: rows.filter((row) => row.status === "Scale Candidate").length,
  };
}

function kpiSummaryDetail(rows: CreativeAnalysisRow[]) {
  const labels = Array.from(new Set(rows.map((row) => row.resultKpiLabel).filter(Boolean)));
  if (!labels.length) return "No KPI label returned";
  if (labels.length <= 2) return labels.join(" + ");
  return `${labels.slice(0, 2).join(" + ")} + ${labels.length - 2} more`;
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

function dateRangeLabel(range: { start: string | null; end: string | null; days?: number }) {
  if (range.start && range.end) return `${formatDate(range.start)} – ${formatDate(range.end)}`;
  if (range.days) return `Last ${range.days} days`;
  return "Selected range";
}

function formatDate(value: string) {
  const date = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  }).format(date);
}

function adDeliveryState(row: CreativeAnalysisRow) {
  const effective = row.adEffectiveStatus?.toUpperCase();
  const configured = row.adConfiguredStatus?.toUpperCase();

  if (effective) return effective === "ACTIVE" ? "active" : "inactive";
  if (configured) return configured === "ACTIVE" ? "active" : "inactive";
  return "unknown";
}

function adDeliveryLabel(row: CreativeAnalysisRow) {
  const state = adDeliveryState(row);
  if (state === "active") return "Active";
  if (state === "inactive") return metaStatusLabel(row.adEffectiveStatus || row.adConfiguredStatus);
  return "Unknown";
}

function scoreBandClass(score: number) {
  if (score >= 70) return "bg-signal-positive";
  if (score >= 50) return "bg-signal-warning";
  return "bg-signal-danger";
}

function kpiResultDetail(row: CreativeAnalysisRow) {
  return row.resultActionType
    ? `${row.resultKpiLabel} · ${row.resultActionType}`
    : row.resultKpiLabel;
}

function metaStatusLabel(value: string | null) {
  if (!value) return "Unavailable";
  return value
    .toLowerCase()
    .replace(/_/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function friendlyActionType(value: string) {
  return value
    .replace(/^onsite_conversion\./, "")
    .replace(/^offsite_conversion\.fb_pixel_/, "")
    .replace(/_/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function formatDateTime(value: string | null) {
  if (!value) return "Unavailable";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Unavailable";
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}

function formatActionMetric(value: unknown) {
  if (!hasActionMetric(value)) return "n/a";
  return formatNumber(sumActionValues(value));
}

function selectVideoActionMetric(
  state: LiveVideoMetricsState | undefined,
  liveValue: unknown,
  storedValue: unknown,
): SelectedActionMetric {
  if (hasActionMetric(liveValue)) {
    return { value: liveValue, detail: "Live Meta video diagnostic" };
  }

  if (hasActionMetric(storedValue)) {
    const storedDetail = storedVideoMetricDetail(storedValue);
    if (state?.status === "loading") {
      return {
        value: storedValue,
        detail: `${storedDetail} Checking live Meta video diagnostics.`,
      };
    }
    if (state?.status === "error") {
      return {
        value: storedValue,
        detail: `${storedDetail} Live Meta detail check failed.`,
      };
    }
    return { value: storedValue, detail: storedDetail };
  }

  if (state?.status === "loading") {
    return { value: [], detail: "Checking live Meta video diagnostics." };
  }

  if (state?.status === "error") {
    return { value: [], detail: state.error };
  }

  return { value: [], detail: "Not returned by Meta for this range." };
}

function hasActionMetric(value: unknown) {
  return Array.isArray(value) && value.length > 0;
}

function storedVideoMetricDetail(value: unknown) {
  const types = actionTypes(value);
  if (types.includes("video_view")) return "Stored fallback from Meta video_view.";
  return "Stored Supabase metric.";
}

function actionTypes(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => {
      if (typeof item !== "object" || item === null || Array.isArray(item)) return null;
      const rawType = (item as { action_type?: unknown }).action_type;
      return typeof rawType === "string" ? rawType : null;
    })
    .filter((type): type is string => Boolean(type));
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

function isAbortError(error: unknown) {
  return error instanceof Error && error.name === "AbortError";
}
