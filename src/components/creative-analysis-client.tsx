"use client";

/* eslint-disable @next/next/no-img-element */

import {
  AlertTriangle,
  CalendarRange,
  ExternalLink,
  GalleryHorizontalEnd,
  Search,
} from "lucide-react";
import type { ReactNode } from "react";
import { useEffect, useMemo, useRef, useState } from "react";

import {
  CREATIVE_STATUS_OPTIONS,
  type CreativeAnalysisPayload,
  type CreativeAnalysisRow,
} from "@/lib/creative-analysis";
import { formatMetaStatus, formatRanking, TERMS, translateError } from "@/lib/glossary";
import { buildCreativeAnalysisFilterSummary } from "@/lib/active-filter-summary";
import {
  FilterBar,
  FilterField,
  type ActiveFilter,
} from "./filter-bar";
import { StatusSentence, type StatusHighlight } from "./status-sentence";
import { TechnicalId } from "./technical-id";
import { UniversalFilterBar } from "./universal-filter-bar";

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
    return data.rows
      .filter((row) => brand === "all" || row.brandCode === brand)
      .filter((row) => delivery === "all" || adDeliveryState(row) === delivery)
      .filter((row) => umbrella === "all" || (row.campaignUmbrella || "Unassigned") === umbrella)
      .filter((row) => campaign === "all" || row.campaignName === campaign)
      .filter((row) => adSet === "all" || row.adSetName === adSet)
      .filter((row) => status === "all" || row.status === status)
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
  }, [adSet, brand, campaign, data.rows, delivery, query, status, umbrella]);

  const summary = useMemo(() => buildSummary(filteredRows), [filteredRows]);

  const activeFilters = useMemo<ActiveFilter[]>(() => {
    const list: ActiveFilter[] = [];
    if (brand !== "all") list.push({ label: `Brand: ${brand}`, onClear: () => setBrand("all") });
    if (umbrella !== "all")
      list.push({ label: `Umbrella: ${umbrella}`, onClear: () => setUmbrella("all") });
    if (campaign !== "all")
      list.push({ label: `Campaign: ${campaign}`, onClear: () => setCampaign("all") });
    if (adSet !== "all")
      list.push({ label: `Ad set: ${adSet}`, onClear: () => setAdSet("all") });
    if (status !== "all")
      list.push({ label: `Status: ${status}`, onClear: () => setStatus("all") });
    return list;
  }, [brand, umbrella, campaign, adSet, status]);

  function clearAllSecondary() {
    setBrand("all");
    setUmbrella("all");
    setCampaign("all");
    setAdSet("all");
    setStatus("all");
  }

  const statusHighlights = useMemo<StatusHighlight[]>(() => {
    if (!filteredRows.length) {
      return [{ text: "No creatives match the current filters" }];
    }
    const highlights: StatusHighlight[] = [];
    if (summary.scaleCandidates > 0) {
      highlights.push({
        text: `${summary.scaleCandidates} ready to scale`,
        tone: "positive",
      });
    }
    if (summary.fatigueCount > 0) {
      highlights.push({
        text: `${summary.fatigueCount} showing fatigue`,
        tone: "warning",
      });
    }
    const noResultSpenders = filteredRows.filter(
      (row) => row.spend > 50 && row.resultCount === 0,
    ).length;
    if (noResultSpenders > 0) {
      highlights.push({
        text: `${noResultSpenders} spending without converting`,
        tone: "warning",
      });
    }
    if (!highlights.length) {
      highlights.push({
        text: `${filteredRows.length} creatives in view, no urgent signals`,
      });
    }
    return highlights;
  }, [filteredRows, summary.fatigueCount, summary.scaleCandidates]);
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
            error: translateError(error, "Unable to load live Meta video metrics."),
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
          <StatusSentence
            context={`${filteredRows.length} of ${data.rows.length} creatives in view`}
            highlights={statusHighlights}
          />
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

      <UniversalFilterBar
        summary={buildCreativeAnalysisFilterSummary({
          brand,
          delivery: delivery === "inactive" ? "paused" : delivery,
          startDate: data.sourceTransparency.timeRange.start || "",
          endDate: data.sourceTransparency.timeRange.end || "",
          umbrella,
          campaign,
          adSet,
          status,
          query,
        })}
      >
      <section className="mx-auto mt-8 max-w-7xl">
        <FilterBar
          primary={
            <>
              <SegmentedControl
                value={delivery}
                onChange={(value) => setDelivery(value as DeliveryFilter)}
                options={[
                  { value: "active", label: "Active" },
                  { value: "inactive", label: "Paused" },
                  { value: "all", label: "All" },
                ]}
              />
              <span aria-hidden className="h-6 w-px bg-hp-rule" />
              <div className="flex flex-wrap items-center gap-1">
                {[7, 14, 30, 90].map((days) => (
                  <button
                    key={days}
                    onClick={() => applyQuickRange(days)}
                    disabled={isApplyingRange}
                    className={`h-9 border px-3 text-[11px] uppercase tracking-[0.14em] transition-colors duration-150 ${
                      data.sourceTransparency.timeRange.days === days
                        ? "border-hp-ink bg-hp-ink text-hp-foundation"
                        : "border-hp-rule text-hp-body hover:border-hp-ink"
                    }`}
                  >
                    {days}d
                  </button>
                ))}
                <span className="pl-2 text-[10px] uppercase tracking-[0.14em] text-hp-muted">
                  {dateRangeLabel(data.sourceTransparency.timeRange)}
                </span>
              </div>
            </>
          }
          searchSlot={
            <label className="flex h-10 min-w-[200px] items-center gap-2 border-b border-hp-rule px-1 focus-within:border-hp-pink">
              <Search size={14} className="text-hp-muted" />
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search creatives"
                className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-hp-muted"
              />
            </label>
          }
          secondary={
            <div>
              <FilterField
                label="Brand"
                value={brand}
                onChange={setBrand}
                options={brandOptions.map((option) => ({
                  value: option,
                  label: option === "all" ? "All brands" : option,
                }))}
              />
              <FilterField
                label="Campaign Umbrella"
                value={umbrella}
                onChange={setUmbrella}
                options={umbrellaOptions.map((option) => ({
                  value: option,
                  label: option === "all" ? "All umbrellas" : option,
                }))}
              />
              <FilterField
                label="Campaign"
                value={campaign}
                onChange={setCampaign}
                options={campaignOptions.map((option) => ({
                  value: option,
                  label: option === "all" ? "All campaigns" : option,
                }))}
              />
              <FilterField
                label="Ad set"
                value={adSet}
                onChange={setAdSet}
                options={adSetOptions.map((option) => ({
                  value: option,
                  label: option === "all" ? "All ad sets" : option,
                }))}
              />
              <FilterField
                label="Creative status"
                value={status}
                onChange={setStatus}
                options={["all", ...CREATIVE_STATUS_OPTIONS].map((option) => ({
                  value: option,
                  label: option === "all" ? "All statuses" : option,
                }))}
              />
              <div className="mt-3 border-t border-hp-rule pt-3">
                <span className="block text-[10px] uppercase tracking-[0.14em] text-hp-muted">
                  Custom date range
                </span>
                <div className="mt-2 grid grid-cols-2 gap-2">
                  <input
                    type="date"
                    value={startDate}
                    onChange={(event) => setStartDate(event.target.value)}
                    className="h-10 w-full border-0 border-b border-hp-rule bg-transparent px-1 text-sm outline-none focus:border-b-2 focus:border-hp-pink"
                  />
                  <input
                    type="date"
                    value={endDate}
                    onChange={(event) => setEndDate(event.target.value)}
                    className="h-10 w-full border-0 border-b border-hp-rule bg-transparent px-1 text-sm outline-none focus:border-b-2 focus:border-hp-pink"
                  />
                </div>
                <button
                  type="button"
                  onClick={applyCustomRange}
                  disabled={isApplyingRange || !startDate || !endDate}
                  className="mt-2 inline-flex h-9 items-center justify-center border border-hp-rule px-3 text-[11px] uppercase tracking-[0.14em] text-hp-body transition-colors duration-150 hover:border-hp-ink disabled:opacity-50"
                >
                  Apply range
                </button>
              </div>
            </div>
          }
          active={activeFilters}
          onClearAll={clearAllSecondary}
        />
        {isApplyingRange ? (
          <p className="mt-4 bg-hp-inset px-3 py-2 text-[11px] uppercase tracking-[0.14em] text-hp-muted">
            Preparing creative data
          </p>
        ) : null}
      </section>
      </UniversalFilterBar>

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
              label={TERMS.primaryKpi}
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
          <div className="mt-6 overflow-hidden">
            <table className="w-full table-fixed border-collapse text-[13px]">
              <colgroup>
                <col className="w-[5%]" />
                <col className="w-[28%]" />
                <col className="w-[13%]" />
                <col className="w-[11%]" />
                <col className="w-[8%]" />
                <col className="w-[8%]" />
                <col className="w-[8%]" />
                <col className="w-[8%]" />
                <col className="w-[11%]" />
              </colgroup>
              <thead>
                <tr className="bg-hp-inset">
                  {[
                    "Rank",
                    "Creative",
                    "Internal score",
                    TERMS.primaryKpi,
                    "Spend",
                    "CPA",
                    "Hook rate",
                    "Hold rate",
                    "Status",
                  ].map((column) => (
                    <th
                      key={column}
                      className="border-b border-hp-rule px-2 py-3 text-left text-[9px] uppercase tracking-[0.12em] text-hp-muted xl:px-3 xl:text-[10px]"
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
                    <td className="px-2 py-4 text-base italic tabular-nums text-hp-muted xl:px-3 xl:text-lg">
                      #{index + 1}
                    </td>
                    <td className="px-2 py-4 xl:px-3">
                      <div className="flex min-w-0 items-center gap-3">
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
                            className="block max-w-full break-words text-left text-base leading-5 text-hp-ink underline-offset-4 hover:underline focus:outline-none focus:ring-1 focus:ring-hp-pink xl:text-lg xl:leading-6"
                          >
                            {row.adName}
                          </button>
                          <p className="mt-1 max-w-full break-words text-xs italic leading-4 text-hp-muted xl:text-sm">
                            {row.brandCode} · {adDeliveryLabel(row)} · {row.campaignUmbrella || row.adSetName}
                          </p>
                        </div>
                      </div>
                    </td>
                    <td className="px-2 py-3 xl:px-3">
                      <ScoreMeter score={row.internalScore} />
                    </td>
                    <td className="px-2 py-3 xl:px-3">
                      <KpiResultCell row={row} />
                    </td>
                    <TableMetric>{formatMoney(row.spend, true)}</TableMetric>
                    <TableMetric>{formatMoney(row.costPerResult)}</TableMetric>
                    <TableMetric>{formatRate(row.hookRate)}</TableMetric>
                    <TableMetric>{formatRate(row.holdRate)}</TableMetric>
                    <td className="px-2 py-3 xl:px-3">
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
  return (
    <td className="px-2 py-3 text-right text-[13px] tabular-nums text-hp-ink xl:px-3 xl:text-sm">
      {children}
    </td>
  );
}

function KpiResultCell({ row }: { row: CreativeAnalysisRow }) {
  return (
    <div>
      <p className="text-right text-sm tabular-nums text-hp-ink">{formatNumber(row.resultCount)}</p>
      <p className="mt-0.5 max-w-full truncate text-right text-xs italic text-hp-muted">
        {row.resultKpiLabel}
      </p>
      {row.resultActionType ? (
        <p
          className="mt-0.5 max-w-full truncate text-right text-[10px] text-hp-muted"
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
  const src = row.thumbnailUrl || row.imageUrl;

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
    <div className="w-full min-w-0">
      <div className="flex items-baseline gap-1 text-hp-ink">
        <span className="font-title text-2xl leading-none tabular-nums xl:text-3xl">{score}</span>
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
      className={`inline-flex max-w-full justify-center border px-2 py-1 text-center text-[10px] leading-tight ${
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
  const adsManagerUrl = row.adId
    ? `https://business.facebook.com/adsmanager/manage/ads/edit?selected_ad_ids=${encodeURIComponent(row.adId)}`
    : null;
  const previous = row.previousSnapshot;
  const fatigueOn = row.fatigueSignal.available && row.fatigueSignal.level !== "low";

  return (
    <main className="min-h-screen bg-hp-foundation px-4 py-8 text-hp-body md:px-8">
      <section className="mx-auto max-w-6xl">
        {/* Header — back link + title + deep link */}
        <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
          <button
            type="button"
            onClick={onClose}
            className="inline-flex items-center gap-2 text-[11px] uppercase tracking-[0.14em] text-hp-muted transition-colors duration-150 hover:text-hp-ink"
          >
            ← Back to scorecard
          </button>
          <div className="flex flex-wrap items-center gap-2">
            {row.previewUrl ? (
              <a
                href={row.previewUrl}
                target="_blank"
                rel="noreferrer"
                className="inline-flex h-10 items-center gap-2 border border-hp-rule px-4 text-[11px] uppercase tracking-[0.14em] text-hp-body transition-colors duration-150 hover:border-hp-ink hover:text-hp-ink"
              >
                Preview ad <ExternalLink size={14} />
              </a>
            ) : null}
            {adsManagerUrl ? (
              <a
                href={adsManagerUrl}
                target="_blank"
                rel="noreferrer"
                className="inline-flex h-10 items-center gap-2 bg-hp-ink px-4 text-[11px] uppercase tracking-[0.14em] text-hp-foundation transition-colors duration-150 hover:bg-hp-pink"
              >
                Open in Meta Ads Manager <ExternalLink size={14} />
              </a>
            ) : null}
          </div>
        </div>

        <div className="mt-6">
          <p className="text-[11px] uppercase tracking-[0.14em] text-hp-muted">Creative</p>
          <h1 className="mt-2 max-w-5xl font-title text-4xl leading-tight text-hp-ink md:text-5xl">
            {row.adName}
          </h1>
          <p className="mt-3 max-w-5xl text-base leading-7 text-hp-muted">
            <span className="text-hp-body">{row.adSetName}</span>
            <span className="px-2 text-hp-rule">·</span>
            <span className="text-hp-body">{row.campaignName}</span>
            {row.campaignUmbrella ? (
              <span className="ml-3 inline-block border border-hp-rule px-2 py-0.5 text-[10px] uppercase tracking-[0.14em] text-hp-muted">
                {row.campaignUmbrella}
              </span>
            ) : null}
          </p>
          <div className="mt-4 flex flex-wrap items-center gap-2">
            <DeliveryBadge row={row} />
            <span className="text-[11px] uppercase tracking-[0.14em] text-hp-muted">
              Synced {formatDateTime(row.adStatusSyncedAt)}
            </span>
          </div>
        </div>

        {/* Verdict — what's happening + what to do */}
        <section className="mt-8 border border-hp-rule bg-hp-card p-6 md:p-8">
          <div className="flex items-start gap-4">
            <StatusBadge status={row.status} />
            <span className="ml-auto text-[11px] uppercase tracking-[0.14em] text-hp-muted">
              Verdict
            </span>
          </div>
          <p className="mt-5 font-title text-2xl leading-snug text-hp-ink md:text-3xl">
            {row.diagnosis}
          </p>
          <div className="mt-6 border-t border-hp-rule pt-5">
            <p className="text-[11px] uppercase tracking-[0.14em] text-hp-muted">Suggested next step</p>
            <p className="mt-2 text-base leading-7 text-hp-body md:text-lg">{row.nextAction}</p>
          </div>
        </section>

        {/* Key numbers — the five metrics decisions live or die by */}
        <section className="mt-6 border border-hp-rule bg-hp-card p-6 md:p-8">
          <div className="flex items-baseline justify-between">
            <p className="text-[11px] uppercase tracking-[0.14em] text-hp-muted">Key Numbers</p>
            {previous ? (
              <p className="text-[10px] uppercase tracking-[0.14em] text-hp-muted">
                Δ vs prior period
              </p>
            ) : null}
          </div>
          <div className="mt-5 grid gap-5 md:grid-cols-3 lg:grid-cols-5">
            <KeyMetric
              label="Spend"
              value={formatMoney(row.spend)}
              helper="Total dollars Meta charged for this ad in the selected period."
              current={row.spend}
              previous={previous?.spend}
              showDelta={Boolean(previous)}
            />
            <KeyMetric
              label={row.resultKpiLabel || "Results"}
              value={formatNumber(row.resultCount)}
              helper={`How many ${(row.resultKpiLabel || "results").toLowerCase()} this ad drove. The thing we actually care about.`}
              current={row.resultCount}
              previous={previous?.resultCount}
              showDelta={Boolean(previous)}
            />
            <KeyMetric
              label="Cost per Result"
              value={formatMoney(row.costPerResult)}
              helper="How much we paid for each result. Lower is better."
              current={row.costPerResult}
              previous={previous?.costPerResult}
              lowerIsBetter
              showDelta={Boolean(previous)}
            />
            <KeyMetric
              label="Click-through Rate"
              value={formatPercentNumber(row.ctr)}
              helper="Of the people who saw the ad, the share who clicked. Higher = the hook is landing."
              current={row.ctr}
              previous={previous?.ctr}
              showDelta={Boolean(previous)}
            />
            <KeyMetric
              label="Frequency"
              value={`${row.frequency.toFixed(2)}x`}
              helper="Average times the same person saw this ad. Above 3–4x often signals ad fatigue."
              current={row.frequency}
              previous={previous?.frequency}
              lowerIsBetter
              showDelta={Boolean(previous)}
            />
          </div>
        </section>

        {/* Fatigue — only when there's something to look at */}
        {fatigueOn ? (
          <section className="mt-6 border border-hp-rule bg-hp-card p-6 md:p-8">
            <div className="flex items-baseline justify-between">
              <p className="text-[11px] uppercase tracking-[0.14em] text-hp-muted">Fatigue Check</p>
              <span
                className="text-[11px] uppercase tracking-[0.14em]"
                style={{ color: row.fatigueSignal.level === "high" ? "#8D2E2E" : "#8B5B19" }}
              >
                {row.fatigueSignal.level === "high" ? "High risk" : "Watch closely"}
              </span>
            </div>
            <p className="mt-3 text-sm text-hp-muted">
              Fatigue means the audience has seen this ad enough that performance is slipping. Common
              fixes: rotate to a fresh variant, widen the audience, or lower the budget.
            </p>
            <ul className="mt-4 space-y-2">
              {row.fatigueSignal.reasons.map((reason) => (
                <li key={reason} className="flex gap-2 text-sm text-hp-body">
                  <span aria-hidden className="text-hp-muted">•</span>
                  <span>{reason}</span>
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        {/* Preview + Score breakdown */}
        <section className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,360px)_minmax(0,1fr)]">
          <div className="space-y-6">
            <div className="border border-hp-rule bg-hp-card p-4">
              <LargePreview row={row} />
              {row.creativeBody ? (
                <div className="mt-4 border-t border-hp-rule pt-4">
                  <p className="text-[11px] uppercase tracking-[0.14em] text-hp-muted">Body Copy</p>
                  <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-hp-body [overflow-wrap:anywhere]">
                    {row.creativeBody}
                  </p>
                </div>
              ) : null}
            </div>
          </div>

          <div className="border border-hp-rule bg-hp-card p-6 md:p-8">
            <div className="flex items-baseline justify-between">
              <p className="text-[11px] uppercase tracking-[0.14em] text-hp-muted">Why This Score</p>
              <span className="font-body text-sm text-hp-muted tabular-nums">
                <span className="text-hp-ink">{row.internalScore}</span>
                <span className="text-hp-muted">/100</span>
              </span>
            </div>
            <p className="mt-2 text-sm text-hp-muted">
              An internal heuristic — not Meta&rsquo;s number. Each row below is one piece of how
              the ad is performing relative to the rest of the account.
            </p>
            <div className="mt-6 space-y-5">
              <ScoreLine
                label="Hook strength"
                helper="How well the opening grabs attention (first few seconds for video, the visual for static)."
                value={row.scoreBreakdown.hookStrength}
              />
              <ScoreLine
                label="Hold / retention"
                helper="Once a viewer starts, how many stay through the message."
                value={row.scoreBreakdown.holdRetention}
              />
              <ScoreLine
                label="Click intent"
                helper="How often viewers click after engaging — a proxy for clarity of the call to action."
                value={row.scoreBreakdown.clickIntent}
              />
              <ScoreLine
                label="Conversion efficiency"
                helper="Cost per result vs the rest of the account. The single most important factor."
                value={row.scoreBreakdown.conversionEfficiency}
              />
              <ScoreLine
                label="Meta’s ranking signal"
                helper="Meta’s own quality / engagement / conversion ranking, where available."
                value={row.scoreBreakdown.metaRankingDiagnostics}
              />
              <ScoreLine
                label="Fatigue resistance"
                helper="Lower frequency, stable CTR — i.e., the ad isn’t wearing out."
                value={row.scoreBreakdown.fatigueRisk}
              />
            </div>
          </div>
        </section>

        {/* Notes */}
        <section className="mt-6 border border-hp-rule bg-hp-card p-6">
          <p className="text-[11px] uppercase tracking-[0.14em] text-hp-muted">Team Notes</p>
          <textarea
            value={note}
            onChange={(event) => onNoteChange(event.target.value)}
            rows={4}
            placeholder="Add notes on lead quality, brand fit, close rate, or the next creative test."
            className="mt-3 w-full resize-none border-0 border-b border-hp-rule bg-transparent p-0 pb-2 text-sm leading-6 outline-none focus:border-b-2 focus:border-hp-pink"
          />
        </section>

        {/* Advanced details — collapsed by default */}
        <AdvancedDetails row={row} liveVideoState={liveVideoState} />
      </section>
    </main>
  );
}

function KeyMetric({
  label,
  value,
  helper,
  current,
  previous,
  lowerIsBetter,
  showDelta,
}: {
  label: string;
  value: string;
  helper: string;
  current?: number | null;
  previous?: number | null;
  lowerIsBetter?: boolean;
  showDelta: boolean;
}) {
  return (
    <div>
      <p className="text-[11px] uppercase tracking-[0.14em] text-hp-muted">{label}</p>
      <div className="mt-2 flex items-baseline gap-3">
        <p className="font-title text-3xl leading-tight tabular-nums text-hp-ink">{value}</p>
        {showDelta ? (
          <SimpleDelta current={current} previous={previous} lowerIsBetter={lowerIsBetter} />
        ) : null}
      </div>
      <p className="mt-2 text-xs leading-5 text-hp-muted">{helper}</p>
    </div>
  );
}

function SimpleDelta({
  current,
  previous,
  lowerIsBetter,
}: {
  current?: number | null;
  previous?: number | null;
  lowerIsBetter?: boolean;
}) {
  if (current == null || previous == null || previous === 0) {
    return <span className="text-[10px] uppercase tracking-[0.14em] text-hp-muted">— no prior</span>;
  }
  const change = ((current - previous) / Math.abs(previous)) * 100;
  const rounded = Math.round(change * 10) / 10;
  if (!Number.isFinite(rounded)) {
    return <span className="text-[10px] uppercase tracking-[0.14em] text-hp-muted">— no prior</span>;
  }
  const isFlat = rounded === 0;
  const isUp = rounded > 0;
  const isGood = isFlat ? false : lowerIsBetter ? !isUp : isUp;
  const color = isFlat ? undefined : { color: isGood ? "#245D4D" : "#8D2E2E" };
  const arrow = isFlat ? "→" : isUp ? "▲" : "▼";
  return (
    <span
      className="inline-flex items-baseline gap-1 font-body text-xs tabular-nums"
      style={color}
    >
      <span aria-hidden className="text-[10px]">{arrow}</span>
      <span>{Math.abs(rounded).toFixed(1)}%</span>
    </span>
  );
}

function ScoreLine({
  label,
  helper,
  value,
}: {
  label: string;
  helper: string;
  value: number;
}) {
  const safe = Math.max(0, Math.min(100, value));
  return (
    <div className="grid gap-2 md:grid-cols-[1fr_180px_48px] md:items-center md:gap-4">
      <div>
        <p className="text-sm text-hp-ink">{label}</p>
        <p className="mt-1 text-xs leading-5 text-hp-muted">{helper}</p>
      </div>
      <div className="h-1.5 bg-hp-inset">
        <div
          className={`h-full ${scoreBandClass(value)}`}
          style={{ width: `${safe}%` }}
        />
      </div>
      <p className="text-right text-sm tabular-nums text-hp-ink">{Math.round(value)}</p>
    </div>
  );
}

function AdvancedDetails({
  row,
  liveVideoState,
}: {
  row: CreativeAnalysisRow;
  liveVideoState: LiveVideoMetricsState | undefined;
}) {
  const [open, setOpen] = useState(false);
  const liveVideoMetrics = liveVideoState?.status === "ready" ? liveVideoState.metrics : null;
  const videoMetrics = {
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
    <section className="mt-6 border border-hp-rule bg-hp-card">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className="flex w-full items-center justify-between gap-3 px-6 py-4 text-left transition-colors duration-150 hover:bg-hp-inset"
      >
        <span className="text-[11px] uppercase tracking-[0.14em] text-hp-muted">
          Advanced Details
        </span>
        <span className="text-[10px] uppercase tracking-[0.14em] text-hp-muted">
          {open ? "Hide" : "Show"} · IDs, video depth, Meta rankings
        </span>
      </button>
      {open ? (
        <div className="grid gap-8 border-t border-hp-rule p-6 md:grid-cols-3">
          <div>
            <p className="text-[11px] uppercase tracking-[0.14em] text-hp-muted">Identifiers</p>
            <p className="mt-2 text-xs text-hp-muted">
              Use these to find the exact ad in Meta Ads Manager, or to copy/paste into a report.
            </p>
            <div className="mt-4 space-y-3 text-sm">
              <DetailTechnicalRow label="Ad ID" value={row.adId} />
              <DetailTechnicalRow label="Creative ID" value={row.creativeId} />
              <DetailTechnicalRow
                label="Post / story ID"
                value={row.effectiveObjectStoryId || row.objectStoryId}
              />
              <DetailTechnicalRow label="Account" value={row.metaAccountId} />
              <DetailTextRow label="Configured status" value={metaStatusLabel(row.adConfiguredStatus)} />
              <DetailTextRow label="Effective status" value={metaStatusLabel(row.adEffectiveStatus)} />
            </div>
          </div>
          <div>
            <p className="text-[11px] uppercase tracking-[0.14em] text-hp-muted">Meta’s Rankings</p>
            <p className="mt-2 text-xs text-hp-muted">
              Meta’s own quality / engagement / conversion rankings vs other ads in your account.
              “Above average” is good; “below average” means Meta thinks the ad is underperforming
              versus your peers.
            </p>
            <dl className="mt-4 space-y-3 text-sm">
              <DetailKvRow label="Quality" value={rankingLabel(row.qualityRanking)} />
              <DetailKvRow label="Engagement" value={rankingLabel(row.engagementRateRanking)} />
              <DetailKvRow label="Conversion" value={rankingLabel(row.conversionRateRanking)} />
              <DetailKvRow label="Reach" value={formatNumber(row.reach)} />
              <DetailKvRow label="Impressions" value={formatNumber(row.impressions)} />
              <DetailKvRow label="CPM" value={formatMoney(row.cpm)} />
              <DetailKvRow label="CPC" value={formatMoney(row.cpc)} />
              <DetailKvRow label="Inline link clicks" value={formatNumber(row.inlineLinkClicks)} />
            </dl>
          </div>
          <div>
            <p className="text-[11px] uppercase tracking-[0.14em] text-hp-muted">Video Depth</p>
            <p className="mt-2 text-xs text-hp-muted">
              Of people who started the video, how many watched the bulk of it. The 75%+ and ThruPlay
              numbers are the most useful — they tell you the message actually landed.
              {liveVideoState?.status === "loading" ? " (Fetching live data…)" : null}
            </p>
            <dl className="mt-4 space-y-3 text-sm">
              <DetailKvRow label="Watched 75%" value={formatActionMetric(videoMetrics.p75.value)} />
              <DetailKvRow label="Watched 95%" value={formatActionMetric(videoMetrics.p95.value)} />
              <DetailKvRow label="Watched 100%" value={formatActionMetric(videoMetrics.p100.value)} />
              <DetailKvRow label="ThruPlays" value={formatActionMetric(videoMetrics.thruplay.value)} />
              <DetailKvRow
                label="Hook rate"
                value={formatRate(row.hookRate)}
                helper={row.hookRateSource}
              />
              <DetailKvRow
                label="Hold rate"
                value={formatRate(row.holdRate)}
                helper={row.holdRateSource}
              />
              <DetailKvRow label="Completion rate" value={formatRate(row.completionRate)} />
            </dl>
          </div>
        </div>
      ) : null}
    </section>
  );
}

function DetailTechnicalRow({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div className="grid grid-cols-[110px_1fr] items-baseline gap-3">
      <dt className="text-[10px] uppercase tracking-[0.14em] text-hp-muted">{label}</dt>
      <dd className="min-w-0">
        <TechnicalId value={value} label={label} />
      </dd>
    </div>
  );
}

function DetailTextRow({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div className="grid grid-cols-[110px_1fr] items-baseline gap-3">
      <dt className="text-[10px] uppercase tracking-[0.14em] text-hp-muted">{label}</dt>
      <dd className="min-w-0 text-xs leading-5 text-hp-ink">{value || "—"}</dd>
    </div>
  );
}

function DetailKvRow({
  label,
  value,
  helper,
}: {
  label: string;
  value: string;
  helper?: string;
}) {
  return (
    <div className="grid grid-cols-[110px_1fr] items-baseline gap-3">
      <dt className="text-[10px] uppercase tracking-[0.14em] text-hp-muted">{label}</dt>
      <dd className="min-w-0 text-sm tabular-nums text-hp-ink">
        <div>{value}</div>
        {helper ? <div className="mt-0.5 text-[11px] italic text-hp-muted">{helper}</div> : null}
      </dd>
    </div>
  );
}

function LargePreview({ row }: { row: CreativeAnalysisRow }) {
  const [failed, setFailed] = useState(false);
  const src = row.imageUrl || row.thumbnailUrl;

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
  return formatRanking(value);
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
  const formatted = formatMetaStatus(value);
  return formatted === "—" ? "Unavailable" : formatted;
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
