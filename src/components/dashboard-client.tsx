"use client";

/* eslint-disable @next/next/no-img-element */

import {
  AlertTriangle,
  CalendarRange,
  ChevronRight,
  FileDown,
  Search,
} from "lucide-react";
import { useSearchParams } from "next/navigation";
import {
  type FormEvent,
  memo,
  useCallback,
  useDeferredValue,
  useEffect,
  useMemo,
  useState,
} from "react";
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import type { AppPermission } from "@/lib/access-control";
import {
  ANALYST_PERIOD_COUNTS,
  rollingAnalystPeriods,
  type AnalystPeriodCount,
  type AnalystPeriodWindow,
} from "@/lib/analyst-periods";
import type {
  DashboardPayload,
  PerformanceRow,
} from "@/lib/analytics";
import type {
  AnalystPeriodEntityValues,
  AnalystPeriodMetricValues,
} from "@/lib/analyst-period-breakdown";
import {
  buildPerformanceTree,
  type PerformanceTreeAdSetNode,
  type PerformanceTreeCampaignNode,
} from "@/lib/dashboard-performance-tree";
import {
  ALLOWED_PERIOD_METRICS,
  periodMetricLabel,
  type PeriodMetric,
} from "@/lib/period-pivot-data";
import { TERMS } from "@/lib/glossary";
import { getKpiProfile } from "@/lib/umbrella-kpi-profile";
import { buildActiveFilterSummary } from "@/lib/active-filter-summary";
import { UniversalFilterBar } from "./universal-filter-bar";
import { StatusSentence, type StatusHighlight } from "./status-sentence";
import { TechnicalId } from "./technical-id";
import {
  formatDelta as formatPeriodDelta,
  formatMetric as formatPeriodMetric,
} from "./v2/optimize/metric-format";

type SortKey = "spend" | "primaryResults" | "ctr" | "cpc" | "newMessagingContacts" | "frequency";
type DeliveryFilter = "all" | "active" | "paused";

type Props = {
  initialData: DashboardPayload;
  permissions: AppPermission[];
  initialPeriodCount?: AnalystPeriodCount;
};

const SORT_LABELS: Record<SortKey, string> = {
  spend: "Spend",
  primaryResults: TERMS.primaryKpi,
  ctr: "CTR",
  cpc: "CPC",
  newMessagingContacts: "New Msg Contacts",
  frequency: "Frequency",
};

const DEFAULT_PERIOD_METRIC: PeriodMetric = "spend";
const PERIOD_METRIC_OPTIONS = ALLOWED_PERIOD_METRICS;

const MONEY_FORMATTER_WITH_CENTS = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 2,
});
const MONEY_FORMATTER_WHOLE = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
});
const NUMBER_FORMATTER = new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 });

export function DashboardClient({
  initialData,
  initialPeriodCount = 2,
}: Props) {
  const data = initialData;
  const searchParams = useSearchParams();
  // Seed filter state from URL params on initial mount so deep links from the
  // executive snapshot (e.g. /analyst?umbrella=Book%20Appts%20US&campaign=…)
  // land already filtered. Subsequent changes are local state — we don't keep
  // the URL in sync to avoid surprising the user with router pushes.
  const [brand, setBrand] = useState(() => searchParams.get("brand") || "all");
  const [umbrella, setUmbrella] = useState(
    () => searchParams.get("umbrella") || "all",
  );
  const [startDate, setStartDate] = useState(data.sourceTransparency.timeRange.start || "");
  const [endDate, setEndDate] = useState(data.sourceTransparency.timeRange.end || "");
  const [isApplyingRange, setIsApplyingRange] = useState(false);
  const [query, setQuery] = useState(() => searchParams.get("query") || "");
  const [sortKey, setSortKey] = useState<SortKey>("spend");
  const [compareEnabled, setCompareEnabled] = useState(true);
  const [periodCount, setPeriodCount] = useState<AnalystPeriodCount>(initialPeriodCount);
  const [periodMetric, setPeriodMetric] = useState<PeriodMetric>(() =>
    normalizePeriodMetric(searchParams.get("metric")),
  );
  const [delivery, setDelivery] = useState<DeliveryFilter>("all");
  const [drawerCreativeId, setDrawerCreativeId] = useState<string | null>(null);
  const [hidePdfFinancials, setHidePdfFinancials] = useState(false);
  const [expandedCampaignIds, setExpandedCampaignIds] = useState<Set<string>>(() => new Set());
  const [expandedAdSetIds, setExpandedAdSetIds] = useState<Set<string>>(() => new Set());
  const deferredQuery = useDeferredValue(query);
  const normalizedQuery = useMemo(
    () => deferredQuery.trim().toLowerCase(),
    [deferredQuery],
  );

  useEffect(() => {
    if (!drawerCreativeId) return;
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") setDrawerCreativeId(null);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [drawerCreativeId]);

  const brands = useMemo(
    () => ["all", ...Array.from(new Set(data.byBrand.map((row) => row.brandCode)))],
    [data.byBrand],
  );

  const umbrellaOptions = useMemo(
    () => ["all", ...data.campaignUmbrellas],
    [data.campaignUmbrellas],
  );

  // The Metric dropdown + sticky-bar standfirst use this label to render
  // `primary_results` and `cost_per_primary_results` with the actual KPI
  // name. When a specific umbrella is selected, derive the KPI label
  // from its profile (matching the server-side aggregation in
  // src/lib/analytics.ts). When `umbrella === "all"`, return null so
  // `periodMetricLabel` falls back to the generic "Primary KPI" labels.
  const currentPrimaryResultLabel = useMemo<string | null>(
    () =>
      umbrella === "all"
        ? null
        : getKpiProfile(umbrella).primaryResultLabel,
    [umbrella],
  );

  const baseCampaigns = useMemo(
    () =>
      filterAndSortRows(data.campaigns, brand, umbrella, "", sortKey, delivery),
    [brand, data.campaigns, delivery, sortKey, umbrella],
  );

  const baseAdSets = useMemo(
    () =>
      filterAndSortRows(data.adSets, brand, umbrella, "", sortKey, delivery),
    [brand, data.adSets, delivery, sortKey, umbrella],
  );

  const baseCreatives = useMemo(
    () =>
      filterAndSortRows(data.creatives, brand, umbrella, "", sortKey, delivery),
    [brand, data.creatives, delivery, sortKey, umbrella],
  );

  const performanceTree = useMemo(
    () =>
      filterPerformanceTree(
        buildPerformanceTree({
          campaigns: baseCampaigns,
          adSets: baseAdSets,
          creatives: baseCreatives,
        }),
        normalizedQuery,
      ),
    [baseAdSets, baseCampaigns, baseCreatives, normalizedQuery],
  );

  const filteredCreatives = useMemo(
    () => collectTreeCreatives(performanceTree),
    [performanceTree],
  );

  const treeCounts = useMemo(
    () => countPerformanceTree(performanceTree),
    [performanceTree],
  );

  const periodWindows = useMemo(
    () => rollingAnalystPeriods(data.sourceTransparency.timeRange, periodCount),
    [data.sourceTransparency.timeRange, periodCount],
  );

  const creativeById = useMemo(() => {
    const map = new Map<string, PerformanceRow>();
    for (const creative of data.creatives) {
      map.set(creative.id, creative);
    }
    return map;
  }, [data.creatives]);

  const drawerCreative = drawerCreativeId ? creativeById.get(drawerCreativeId) || null : null;

  const openCreativeDrawer = useCallback((creativeId: string) => {
    setDrawerCreativeId(creativeId);
  }, []);
  const closeCreativeDrawer = useCallback(() => setDrawerCreativeId(null), []);

  const overviewSparklines = useMemo(() => {
    const byDate = new Map<
      string,
      { spend: number; impressions: number; clicks: number; primaryResults: number }
    >();
    for (const row of data.dailyTrend) {
      const existing = byDate.get(row.date) || {
        spend: 0,
        impressions: 0,
        clicks: 0,
        primaryResults: 0,
      };
      existing.spend += row.spend;
      existing.impressions += row.impressions;
      existing.clicks += row.clicks;
      existing.primaryResults += row.primaryResults;
      byDate.set(row.date, existing);
    }
    const ordered = Array.from(byDate.entries()).sort(([a], [b]) => a.localeCompare(b));
    return {
      spend: ordered.map(([, v]) => v.spend),
      impressions: ordered.map(([, v]) => v.impressions),
      ctr: ordered.map(([, v]) => (v.impressions > 0 ? (v.clicks / v.impressions) * 100 : 0)),
      cpc: ordered.map(([, v]) => (v.clicks > 0 ? v.spend / v.clicks : 0)),
      primaryResults: ordered.map(([, v]) => v.primaryResults),
    };
  }, [data.dailyTrend]);

  const umbrellaScorecard = useMemo(() => {
    const priorById = new Map(
      data.comparison.byUmbrella.map((row) => [row.id, row]),
    );
    return data.byUmbrella.map((row) => {
      const prior = priorById.get(row.id);
      return { current: row, prior };
    });
  }, [data.byUmbrella, data.comparison.byUmbrella]);

  const summary = useMemo(() => {
    const range = data.sourceTransparency.timeRange;
    const context = `Last ${range.days} days · ${data.byUmbrella.length} ${
      data.byUmbrella.length === 1 ? TERMS.campaignUmbrella : `${TERMS.campaignUmbrella}s`
    } tracked`;

    const highlights: StatusHighlight[] = [];
    const overview = data.overview;
    const prior = data.comparison.overview;
    const costNow = overview.costPerPrimaryResult;
    const costPrior = prior.costPerPrimaryResult;
    if (costNow != null && costPrior != null && costPrior > 0) {
      const change = ((costNow - costPrior) / costPrior) * 100;
      const direction = change > 0 ? "up" : "down";
      const magnitude = Math.abs(change);
      if (magnitude >= 3) {
        highlights.push({
          text: `Cost per result is ${direction} ${magnitude.toFixed(0)}% vs prior period`,
          tone: change > 0 ? "warning" : "positive",
        });
      } else {
        highlights.push({
          text: `Cost per result is flat vs prior period`,
          tone: "neutral",
        });
      }
    }

    const topUmbrella = [...data.byUmbrella]
      .filter((row) => row.spend > 0)
      .sort((a, b) => b.primaryResults - a.primaryResults || b.spend - a.spend)[0];
    if (topUmbrella) {
      highlights.push({
        text: `${topUmbrella.name} leads on ${topUmbrella.primaryResultLabel.toLowerCase()}`,
        tone: "neutral",
      });
    }

    if (highlights.length === 0) {
      highlights.push({ text: "No activity in the selected range" });
    }

    return { context, highlights };
  }, [
    data.byUmbrella,
    data.comparison.overview,
    data.overview,
    data.sourceTransparency.timeRange,
  ]);

  const trendRows = useMemo(() => {
    const aggregate = (
      rows: DashboardPayload["dailyTrend"],
    ): Map<string, Record<string, number>> => {
      const map = new Map<string, Record<string, number>>();
      for (const row of rows) {
        if (brand !== "all" && row.brandCode !== brand) continue;
        if (umbrella !== "all" && row.campaignUmbrella !== umbrella) continue;
        const existing = map.get(row.date) || {};
        const spendKey = `${row.brandCode} spend`;
        const ctrKey = `${row.brandCode} ctr`;
        existing[spendKey] = (existing[spendKey] || 0) + row.spend;
        existing[ctrKey] = row.ctr;
        map.set(row.date, existing);
      }
      return map;
    };

    const currentByDate = aggregate(data.dailyTrend);
    const priorByDate = aggregate(data.comparison.dailyTrend);
    const currentDates = Array.from(currentByDate.keys()).sort();
    const priorDates = Array.from(priorByDate.keys()).sort();

    return currentDates.map((date, index) => {
      const current = currentByDate.get(date) || {};
      const priorDate = priorDates[index];
      const priorEntry = priorDate ? priorByDate.get(priorDate) || {} : {};
      const merged: Record<string, string | number> = { date, ...current };
      for (const [key, value] of Object.entries(priorEntry)) {
        merged[`${key} prior`] = value;
      }
      return merged;
    });
  }, [brand, data.comparison.dailyTrend, data.dailyTrend, umbrella]);

  const applyDateRange = useCallback(function applyDateRange(nextStart = startDate, nextEnd = endDate) {
    if (!nextStart || !nextEnd) return;
    const url = new URL(window.location.href);
    url.searchParams.set("start", nextStart);
    url.searchParams.set("end", nextEnd);
    url.searchParams.delete("days");
    setIsApplyingRange(true);
    window.location.assign(url.toString());
  }, [endDate, startDate]);

  const applyQuickRange = useCallback(function applyQuickRange(days: number) {
    const end = data.sourceTransparency.timeRange.end || toDateInput(new Date());
    const start = shiftDate(end, -(days - 1));
    setStartDate(start);
    setEndDate(end);
    applyDateRange(start, end);
  }, [applyDateRange, data.sourceTransparency.timeRange.end]);

  const changePeriodCount = useCallback(function changePeriodCount(nextPeriodCount: AnalystPeriodCount) {
    setPeriodCount(nextPeriodCount);
    window.location.assign(urlWithParam("periods", String(nextPeriodCount)).toString());
  }, []);

  const changePeriodMetric = useCallback(function changePeriodMetric(nextMetric: PeriodMetric) {
    setPeriodMetric(nextMetric);
    replaceUrlParam("metric", nextMetric);
  }, []);

  const toggleCampaign = useCallback(function toggleCampaign(campaignId: string) {
    setExpandedCampaignIds((current) => toggleSetValue(current, campaignId));
  }, []);

  const toggleAdSet = useCallback(function toggleAdSet(adSetId: string) {
    setExpandedAdSetIds((current) => toggleSetValue(current, adSetId));
  }, []);

  const exportCreativesPdf = useCallback(async function exportCreativesPdf() {
    const activeRange = data.sourceTransparency.timeRange;
    const hideFinancialSort = hidePdfFinancials && isFinancialSortKey(sortKey);
    const exportRows = hideFinancialSort
      ? [...filteredCreatives].sort(
          (a, b) => Number(b.primaryResults || 0) - Number(a.primaryResults || 0),
        )
      : filteredCreatives;
    const html = buildCreativePdfHtml({
      rows: exportRows,
      dateRange: formatDateRange(
        activeRange.start || startDate,
        activeRange.end || endDate,
      ),
      umbrellaName: formatUmbrellaName(umbrella),
      brandName: brand === "all" ? "All Brands" : brand,
      searchQuery: query,
      sortLabel: hideFinancialSort ? SORT_LABELS.primaryResults : SORT_LABELS[sortKey],
      generatedAt: new Date(),
      hideFinancials: hidePdfFinancials,
    });

    await printHtmlDocument(html);
  }, [
    brand,
    data.sourceTransparency.timeRange,
    endDate,
    filteredCreatives,
    hidePdfFinancials,
    query,
    sortKey,
    startDate,
    umbrella,
  ]);

  if (!data.configured) {
    return (
      <main className="min-h-screen bg-hp-foundation px-6 py-8 text-hp-body md:px-10">
        <ShellHeader data={data} />
        <section className="mx-auto mt-10 max-w-4xl border border-hp-rule bg-hp-card p-8">
          <span className="text-[11px] uppercase tracking-[0.14em] text-hp-muted">
            Setup Required
          </span>
          <h1 className="mt-3 font-title text-4xl leading-tight text-hp-ink">
            Configuration incomplete
          </h1>
          <div className="mt-6 grid gap-2 sm:grid-cols-2">
            {data.missingEnv.map((env) => (
              <div key={env} className="border border-hp-rule bg-hp-inset px-4 py-3 text-sm">
                {env}
              </div>
            ))}
          </div>
        </section>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-hp-foundation px-4 py-6 text-hp-body md:px-8">
      <ShellHeader data={data} />

      <section className="mx-auto mt-8 max-w-7xl">
        <DataCoverageNotice data={data} />

        <StatusSentence context={summary.context} highlights={summary.highlights} />

        <div className="mt-6 grid gap-3 md:grid-cols-2 xl:grid-cols-5">
          <MetricTile
            label="Spend"
            value={formatMetric(data.overview.spend, "money")}
            current={data.overview.spend}
            previous={data.comparison.overview.spend}
            sparkline={overviewSparklines.spend}
            showComparison={compareEnabled}
          />
          <MetricTile
            label="Impressions"
            value={formatMetric(data.overview.impressions, "number")}
            current={data.overview.impressions}
            previous={data.comparison.overview.impressions}
            sparkline={overviewSparklines.impressions}
            showComparison={compareEnabled}
          />
          <MetricTile
            label="CTR"
            value={formatMetric(data.overview.ctr, "percent")}
            current={data.overview.ctr}
            previous={data.comparison.overview.ctr}
            sparkline={overviewSparklines.ctr}
            showComparison={compareEnabled}
          />
          <MetricTile
            label="CPC"
            value={formatMetric(data.overview.cpc, "money")}
            current={data.overview.cpc}
            previous={data.comparison.overview.cpc}
            lowerIsBetter
            sparkline={overviewSparklines.cpc}
            showComparison={compareEnabled}
          />
          <MetricTile
            label={data.overview.primaryResultLabel || TERMS.primaryKpiFallback}
            value={formatMetric(data.overview.primaryResults, "number")}
            current={data.overview.primaryResults}
            previous={data.comparison.overview.primaryResults}
            sparkline={overviewSparklines.primaryResults}
            showComparison={compareEnabled}
          />
        </div>
      </section>

      <UniversalFilterBar
        summary={buildActiveFilterSummary({
          brand,
          delivery,
          startDate,
          endDate,
          compareEnabled,
          periodCount,
          periodMetric,
          primaryResultLabel: currentPrimaryResultLabel,
          umbrella,
          query,
        })}
      >
        <section className="mx-auto mt-6 flex max-w-7xl flex-col gap-4 border-y border-hp-rule py-4 xl:flex-row xl:flex-wrap xl:items-center xl:justify-between xl:gap-x-6">
          <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
            <FilterChipGroup
              label="Brand"
              value={brand}
              onChange={setBrand}
              options={brands.map((option) => ({
                value: option,
                label: option === "all" ? "All Brands" : option,
              }))}
            />
            <FilterChipGroup
              label="Delivery"
              value={delivery}
              onChange={(value) => setDelivery(value as DeliveryFilter)}
              options={[
                { value: "all", label: "All" },
                { value: "active", label: "Active" },
                { value: "paused", label: "Paused" },
              ]}
            />
            <label className="flex min-w-0 items-center gap-2 border-b border-hp-rule px-1 py-2 focus-within:border-hp-pink sm:w-64">
              <Search size={16} className="text-hp-muted" />
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search creatives"
                className="w-full bg-transparent text-sm outline-none placeholder:text-hp-muted"
              />
            </label>
          </div>

          <DateRangeControls
            startDate={startDate}
            endDate={endDate}
            onStartDateChange={setStartDate}
            onEndDateChange={setEndDate}
            onApply={applyDateRange}
            onQuickRange={applyQuickRange}
            isApplying={isApplyingRange}
            compareEnabled={compareEnabled}
            onCompareChange={setCompareEnabled}
            periodCount={periodCount}
            onPeriodCountChange={changePeriodCount}
            periodMetric={periodMetric}
            onPeriodMetricChange={changePeriodMetric}
            periodWindows={periodWindows}
            comparisonRange={data.comparison.timeRange}
            primaryResultLabel={currentPrimaryResultLabel}
          />
        </section>

        <section className="mx-auto mt-6 max-w-7xl">
          <UmbrellaTabs
            umbrellas={umbrellaOptions}
            value={umbrella}
            onChange={setUmbrella}
          />
        </section>
      </UniversalFilterBar>

      <section className="mx-auto mt-6 w-full max-w-7xl min-w-0">
        <div className="min-w-0 border border-hp-rule bg-hp-card p-6">
          <SectionHeader eyebrow="Trend Analysis" title="Filtered spend and response" />
          <div className="h-72 min-w-0">
            <ResponsiveContainer
              width="100%"
              height="100%"
              initialDimension={{ width: 1, height: 1 }}
            >
              <LineChart data={trendRows} margin={{ top: 8, right: 18, bottom: 0, left: 0 }}>
                <CartesianGrid stroke="#D4CFC4" vertical={false} />
                <XAxis dataKey="date" tickLine={false} axisLine={false} tick={{ fill: "#8A8178", fontSize: 11 }} />
                <YAxis tickLine={false} axisLine={false} tick={{ fill: "#8A8178", fontSize: 11 }} />
                <Tooltip
                  contentStyle={{
                    background: "#FBF7F1",
                    border: "1px solid #D4CFC4",
                    borderRadius: 2,
                    color: "#2A2725",
                  }}
                />
                <Line type="monotone" dataKey="HP spend" stroke="#2A2725" strokeWidth={2} dot={false} />
                <Line type="monotone" dataKey="VVS spend" stroke="#8B5B19" strokeWidth={2} dot={false} />
                <Line type="monotone" dataKey="HP ctr" stroke="#245D4D" strokeWidth={1.5} dot={false} />
                <Line type="monotone" dataKey="VVS ctr" stroke="#8D2E2E" strokeWidth={1.5} dot={false} />
                {compareEnabled ? (
                  <>
                    <Line
                      type="monotone"
                      dataKey="HP spend prior"
                      stroke="#2A2725"
                      strokeWidth={1}
                      strokeDasharray="4 4"
                      strokeOpacity={0.5}
                      dot={false}
                      isAnimationActive={false}
                    />
                    <Line
                      type="monotone"
                      dataKey="VVS spend prior"
                      stroke="#8B5B19"
                      strokeWidth={1}
                      strokeDasharray="4 4"
                      strokeOpacity={0.5}
                      dot={false}
                      isAnimationActive={false}
                    />
                  </>
                ) : null}
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      </section>

      <div className="ornament-rule mx-auto max-w-7xl" />

      {umbrella === "all" ? (
        <section className="mx-auto mt-6 max-w-7xl border border-hp-rule bg-hp-card p-6 sm:p-8">
          <SectionHeader
            eyebrow={`${TERMS.campaignUmbrella}s`}
            title="Performance scorecard"
          />
          <UmbrellaScorecard
            rows={umbrellaScorecard}
            showPeriodBreakdown={compareEnabled}
            periodMetric={periodMetric}
            periodWindows={periodWindows}
            periodValuesByEntity={data.periodBreakdown.byUmbrella}
            onSelect={setUmbrella}
          />
        </section>
      ) : null}

      <section className="mx-auto mt-8 w-full max-w-7xl min-w-0">
        <div className="min-w-0 border border-hp-rule bg-hp-card p-4 sm:p-6">
          <SectionHeader
            eyebrow="Performance"
            title="Campaign, ad set, and creative performance"
            actions={
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                <label className="flex h-10 items-center gap-2 border border-hp-rule px-3 text-[10px] uppercase tracking-[0.14em] text-hp-muted">
                  <input
                    type="checkbox"
                    checked={hidePdfFinancials}
                    onChange={(event) => setHidePdfFinancials(event.target.checked)}
                    className="h-4 w-4 accent-hp-ink"
                  />
                  Hide financials
                </label>
                <button
                  onClick={() => void exportCreativesPdf()}
                  className="flex h-10 items-center justify-center gap-2 border border-hp-ink px-3 text-[10px] uppercase tracking-[0.14em] text-hp-ink transition-colors hover:bg-hp-ink hover:text-hp-foundation"
                >
                  <FileDown size={15} />
                  Export PDF
                </button>
              </div>
            }
          />

          <div className="mb-6 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div className="text-[11px] uppercase tracking-[0.14em] text-hp-muted">
              {formatMetric(treeCounts.campaigns, "number")} campaigns ·{" "}
              {formatMetric(treeCounts.adSets, "number")} ad sets ·{" "}
              {formatMetric(treeCounts.creatives, "number")} creatives
            </div>
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
              {!compareEnabled ? (
                <select
                  value={sortKey}
                  onChange={(event) => setSortKey(event.target.value as SortKey)}
                  className="h-10 border border-hp-rule bg-transparent px-3 text-sm outline-none focus:border-hp-pink sm:w-40"
                >
                  {Object.entries(SORT_LABELS).map(([key, label]) => (
                    <option key={key} value={key}>
                      {label}
                    </option>
                  ))}
                </select>
              ) : null}
            </div>
          </div>

          <NestedPerformanceTable
            tree={performanceTree}
            expandedCampaignIds={expandedCampaignIds}
            expandedAdSetIds={expandedAdSetIds}
            forceExpanded={Boolean(normalizedQuery)}
            showPeriodBreakdown={compareEnabled}
            periodMetric={periodMetric}
            periodWindows={periodWindows}
            periodBreakdown={data.periodBreakdown}
            onToggleCampaign={toggleCampaign}
            onToggleAdSet={toggleAdSet}
            onSelectCreative={openCreativeDrawer}
          />
        </div>
      </section>

      <CreativeDrawer creative={drawerCreative} onClose={closeCreativeDrawer} />
    </main>
  );
}

const ShellHeader = memo(function ShellHeader({ data }: { data: DashboardPayload }) {
  const range = data.sourceTransparency.timeRange;
  return (
    <header className="mx-auto flex max-w-7xl flex-col gap-5 border-b border-hp-rule pb-6 md:flex-row md:items-end md:justify-between">
      <div>
        <span className="text-[11px] uppercase tracking-[0.14em] text-hp-muted">
          HP/VVS Meta Ads
        </span>
        <h1 className="mt-2 font-title text-4xl leading-tight text-hp-ink md:text-5xl">
          AI Analyst Command Center
        </h1>
      </div>
      <div className="text-sm text-hp-muted md:text-right">
        <div>
          {range.start || "No data"} to {range.end || "No data"}
        </div>
        <div>{data.sourceTransparency.adAccountsAnalyzed.length} ad accounts analyzed</div>
      </div>
    </header>
  );
});

const SectionHeader = memo(function SectionHeader({
  eyebrow,
  title,
  actions,
}: {
  eyebrow: string;
  title: string;
  actions?: React.ReactNode;
}) {
  return (
    <div className="mb-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <span className="block text-[11px] uppercase tracking-[0.14em] text-hp-muted">
            {eyebrow}
          </span>
          <h2 className="mt-2 font-title text-[28px] leading-tight text-hp-ink">{title}</h2>
        </div>
        {actions ? <div className="flex shrink-0 items-center">{actions}</div> : null}
      </div>
      <div className="mt-4 h-px bg-hp-rule" />
    </div>
  );
});

const MetricTile = memo(function MetricTile({
  label,
  value,
  current,
  previous,
  lowerIsBetter,
  sparkline,
  showComparison,
}: {
  label: string;
  value: string;
  current?: number | null;
  previous?: number | null;
  lowerIsBetter?: boolean;
  sparkline?: number[];
  showComparison?: boolean;
}) {
  const sparklineData = useMemo(
    () => (sparkline || []).map((v, i) => ({ i, v })),
    [sparkline],
  );
  return (
    <div className="border border-hp-rule bg-hp-card p-6">
      <div className="text-[11px] uppercase tracking-[0.14em] text-hp-muted">{label}</div>
      <div className="mt-3 font-title text-[28px] leading-tight tabular-nums text-hp-ink">
        {value}
      </div>
      {showComparison ? (
        <div className="mt-2 flex items-center justify-between gap-3">
          <DeltaChip current={current} previous={previous} lowerIsBetter={lowerIsBetter} />
        </div>
      ) : null}
      {sparklineData.length > 1 ? (
        <div className="mt-4 h-8 min-w-0">
          <ResponsiveContainer width="100%" height="100%" initialDimension={{ width: 1, height: 1 }}>
            <LineChart data={sparklineData} margin={{ top: 2, right: 2, bottom: 2, left: 2 }}>
              <Line
                type="monotone"
                dataKey="v"
                stroke="#2A2725"
                strokeWidth={1}
                dot={false}
                isAnimationActive={false}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      ) : null}
    </div>
  );
});

const DeltaChip = memo(function DeltaChip({
  current,
  previous,
  lowerIsBetter,
}: {
  current?: number | null;
  previous?: number | null;
  lowerIsBetter?: boolean;
}) {
  if (current == null || previous == null || previous === 0) {
    return (
      <span className="text-[10px] uppercase tracking-[0.14em] text-hp-muted">
        — vs prev
      </span>
    );
  }
  const change = ((current - previous) / Math.abs(previous)) * 100;
  const rounded = Math.round(change * 10) / 10;
  if (!Number.isFinite(rounded)) {
    return (
      <span className="text-[10px] uppercase tracking-[0.14em] text-hp-muted">
        — vs prev
      </span>
    );
  }
  const isFlat = rounded === 0;
  const isUp = rounded > 0;
  const isGood = isFlat ? false : lowerIsBetter ? !isUp : isUp;
  const arrow = isFlat ? "→" : isUp ? "▲" : "▼";
  const colorStyle = isFlat
    ? undefined
    : { color: isGood ? "#245D4D" : "#8D2E2E" };
  const colorClass = isFlat ? "text-hp-muted" : "";
  return (
    <span
      className={`inline-flex items-baseline gap-1 font-body text-xs tabular-nums ${colorClass}`}
      style={colorStyle}
      title={`Previous: ${previous}`}
    >
      <span aria-hidden className="text-[10px]">{arrow}</span>
      <span>{Math.abs(rounded).toFixed(1)}%</span>
    </span>
  );
});

const DataCoverageNotice = memo(function DataCoverageNotice({ data }: { data: DashboardPayload }) {
  const coverage = data.sourceTransparency.dataCoverage;
  if (coverage.isComplete || coverage.expectedDays === 0) return null;

  return (
    <div className="mb-4 flex gap-3 border border-hp-pink/70 bg-hp-card px-4 py-3 text-sm text-hp-ink">
      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-hp-pink" />
      <div>
        <div>
          Stored Meta coverage is incomplete: {coverage.storedDays} of {coverage.expectedDays}{" "}
          selected days have rows.
        </div>
        <div className="mt-1 text-hp-muted">
          Totals below only include stored days. Missing days: {coverage.missingDays}.
        </div>
      </div>
    </div>
  );
});

const DateRangeControls = memo(function DateRangeControls({
  startDate,
  endDate,
  onStartDateChange,
  onEndDateChange,
  onApply,
  onQuickRange,
  isApplying,
  compareEnabled,
  onCompareChange,
  periodCount,
  onPeriodCountChange,
  periodMetric,
  onPeriodMetricChange,
  periodWindows,
  comparisonRange,
  primaryResultLabel,
}: {
  startDate: string;
  endDate: string;
  onStartDateChange: (value: string) => void;
  onEndDateChange: (value: string) => void;
  onApply: (startDate: string, endDate: string) => void;
  onQuickRange: (days: number) => void;
  isApplying: boolean;
  compareEnabled: boolean;
  onCompareChange: (value: boolean) => void;
  periodCount: AnalystPeriodCount;
  onPeriodCountChange: (value: AnalystPeriodCount) => void;
  periodMetric: PeriodMetric;
  onPeriodMetricChange: (value: PeriodMetric) => void;
  periodWindows: ReturnType<typeof rollingAnalystPeriods>;
  comparisonRange: { start: string; end: string; days: number };
  /** Live primary-KPI name (e.g. "Messages") — drives the dynamic
   *  label for `primary_results` and `cost_per_primary_results`
   *  in the Metric dropdown. Falls back to the static label. */
  primaryResultLabel?: string | null;
}) {
  function submitDateRange(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    onApply(String(formData.get("start") || ""), String(formData.get("end") || ""));
  }

  return (
    <div className="flex w-full flex-col gap-2 xl:w-auto">
      <form onSubmit={submitDateRange} className="flex flex-col gap-2 lg:flex-row lg:items-center">
      <div className="flex min-w-0 flex-wrap items-center gap-2 border border-hp-rule px-3 py-2">
        <CalendarRange size={16} className="text-hp-muted" />
        <input
          aria-label="Start date"
          name="start"
          type="date"
          value={startDate}
          onChange={(event) => onStartDateChange(event.target.value)}
          className="h-8 bg-transparent text-sm outline-none"
        />
        <span className="text-hp-muted">to</span>
        <input
          aria-label="End date"
          name="end"
          type="date"
          value={endDate}
          onChange={(event) => onEndDateChange(event.target.value)}
          className="h-8 bg-transparent text-sm outline-none"
        />
        <button
          type="submit"
          disabled={isApplying}
          className="h-8 border border-hp-ink px-3 text-[10px] uppercase tracking-[0.14em] text-hp-ink transition-colors hover:bg-hp-ink hover:text-hp-foundation"
        >
          {isApplying ? "Updating" : "Apply"}
        </button>
      </div>
      <div className="flex items-center gap-1">
        {[7, 14, 30].map((days) => (
          <button
            type="button"
            key={days}
            onClick={() => onQuickRange(days)}
            className="h-8 border border-hp-rule px-3 text-[10px] uppercase tracking-[0.14em] text-hp-muted transition-colors hover:border-hp-ink hover:text-hp-ink"
          >
            {days}D
          </button>
        ))}
      </div>
      <label
        title={
          compareEnabled && comparisonRange.start
            ? `Comparing to ${comparisonRange.start} → ${comparisonRange.end}`
            : "Toggle prior-period comparison"
        }
        className={`flex h-8 items-center gap-2 border px-3 text-[10px] uppercase tracking-[0.14em] transition-colors ${
          compareEnabled
            ? "border-hp-ink bg-hp-ink text-hp-foundation"
            : "border-hp-rule text-hp-muted hover:border-hp-ink hover:text-hp-ink"
        }`}
      >
        <input
          type="checkbox"
          checked={compareEnabled}
          onChange={(event) => onCompareChange(event.target.checked)}
          className="sr-only"
        />
        vs Prev
      </label>
      {compareEnabled ? (
        <>
          <label className="flex h-8 items-center gap-2 border border-hp-rule px-3 text-[10px] uppercase tracking-[0.14em] text-hp-muted">
            <span>Periods</span>
            <select
              value={periodCount}
              onChange={(event) =>
                onPeriodCountChange(Number(event.target.value) as AnalystPeriodCount)
              }
              className="h-6 bg-transparent text-hp-ink outline-none"
            >
              {ANALYST_PERIOD_COUNTS.map((count) => (
                <option key={count} value={count}>
                  {count}
                </option>
              ))}
            </select>
          </label>
          <label className="flex h-8 items-center gap-2 border border-hp-rule px-3 text-[10px] uppercase tracking-[0.14em] text-hp-muted">
            <span>Metric</span>
            <select
              value={periodMetric}
              onChange={(event) =>
                onPeriodMetricChange(event.target.value as PeriodMetric)
              }
              className="h-6 bg-transparent text-hp-ink outline-none"
            >
              {PERIOD_METRIC_OPTIONS.map((metric) => (
                <option key={metric} value={metric}>
                  {periodMetricLabel(metric, primaryResultLabel)}
                </option>
              ))}
            </select>
          </label>
        </>
      ) : null}
      </form>
      {compareEnabled && periodWindows.length ? (
        <div className="mt-2 flex w-full flex-wrap items-center gap-2 text-[10px] uppercase tracking-[0.12em] text-hp-muted">
          {periodWindows.map((period) => (
            <span
              key={period.key}
              className={`shrink-0 border px-2 py-1 ${
                period.isCurrent
                  ? "border-hp-ink text-hp-ink"
                  : "border-hp-rule text-hp-muted"
              }`}
            >
              {period.label}
            </span>
          ))}
        </div>
      ) : null}
    </div>
  );
});

type UmbrellaScorecardRow = {
  current: PerformanceRow;
  prior?: PerformanceRow;
};

type ScorecardSortKey = "spend" | "primaryResults" | "costPerPrimaryResult" | "ctr";

const UmbrellaScorecard = memo(function UmbrellaScorecard({
  rows,
  showPeriodBreakdown,
  periodMetric,
  periodWindows,
  periodValuesByEntity,
  onSelect,
}: {
  rows: UmbrellaScorecardRow[];
  showPeriodBreakdown: boolean;
  periodMetric: PeriodMetric;
  periodWindows: AnalystPeriodWindow[];
  periodValuesByEntity: AnalystPeriodEntityValues;
  onSelect: (umbrella: string) => void;
}) {
  const [sortKey, setSortKey] = useState<ScorecardSortKey>("spend");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const periodMode = showPeriodBreakdown && periodWindows.length > 0;

  const sorted = useMemo(() => {
    const direction = sortDir === "asc" ? 1 : -1;
    const copy = [...rows];
    copy.sort((a, b) => {
      const av = readScorecardValue(a.current, sortKey);
      const bv = readScorecardValue(b.current, sortKey);
      if (av == null && bv == null) return 0;
      if (av == null) return 1;
      if (bv == null) return -1;
      return (av - bv) * direction;
    });
    return copy;
  }, [rows, sortKey, sortDir]);

  if (!rows.length) {
    return <div className="text-sm text-hp-muted">No umbrella data in this period.</div>;
  }

  if (periodMode) {
    const columnCount = 1 + periodWindows.length + (periodWindows.length > 1 ? 1 : 0);
    const tableMinWidth = 320 + periodWindows.length * 124 + (periodWindows.length > 1 ? 110 : 0);

    return (
      <div className="w-full overflow-x-auto">
        <table
          className="w-full table-fixed border-collapse text-sm"
          style={{ minWidth: tableMinWidth }}
        >
          <colgroup>
            <col className="w-[260px]" />
            {periodWindows.map((period) => (
              <col key={period.key} className="w-[124px]" />
            ))}
            {periodWindows.length > 1 ? <col className="w-[110px]" /> : null}
          </colgroup>
          <thead>
            <tr className="bg-hp-inset text-left">
              <th className="border-b border-hp-rule px-4 py-3 text-[10px] font-normal uppercase tracking-[0.14em] text-hp-muted">
                Umbrella
              </th>
              {periodWindows.map((period) => (
                <PeriodHeader key={period.key} period={period} />
              ))}
              {periodWindows.length > 1 ? (
                <th className="border-b border-hp-rule px-4 py-3 text-right text-[10px] font-normal uppercase tracking-[0.14em] text-hp-muted">
                  <span className="block">Δ</span>
                  <span className="mt-0.5 block text-[9px] tracking-[0.12em]">oldest→current</span>
                </th>
              ) : null}
            </tr>
          </thead>
          <tbody>
            {sorted.map(({ current }) => {
              const periodValues = periodValuesByEntity[current.id];
              return (
                <tr
                  key={current.id}
                  className="cursor-pointer border-b border-hp-rule bg-hp-card align-top transition-colors duration-150 hover:bg-hp-inset"
                  onClick={() => onSelect(current.campaignUmbrella || current.name)}
                >
                  <td className="px-4 py-4 text-hp-ink">
                    <div className="font-body text-base">{current.name}</div>
                    <div className="mt-1 text-[11px] uppercase tracking-[0.14em] text-hp-muted">
                      {formatMetric(current.impressions, "number")} impressions
                    </div>
                  </td>
                  {periodWindows.map((period) => (
                    <PeriodMetricCell
                      key={period.key}
                      values={periodValues?.[period.key]}
                      metric={periodMetric}
                      primaryResultLabel={current.primaryResultLabel}
                    />
                  ))}
                  {periodWindows.length > 1 ? (
                    <PeriodDeltaCell
                      periodValues={periodValues}
                      periods={periodWindows}
                      metric={periodMetric}
                    />
                  ) : null}
                </tr>
              );
            })}
          </tbody>
        </table>
        <div className="sr-only">{columnCount} scorecard columns displayed</div>
      </div>
    );
  }

  function toggle(key: ScorecardSortKey) {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir(key === "costPerPrimaryResult" ? "asc" : "desc");
    }
  }

  return (
    <div className="w-full overflow-x-auto">
      <table className="w-full min-w-[760px] table-fixed border-collapse text-sm">
        <colgroup>
          <col className="w-[26%]" />
          <col className="w-[18%]" />
          <col className="w-[20%]" />
          <col className="w-[18%]" />
          <col className="w-[18%]" />
        </colgroup>
        <thead>
          <tr className="bg-hp-inset text-left">
            <th className="border-b border-hp-rule px-4 py-3 text-[10px] font-normal uppercase tracking-[0.14em] text-hp-muted">
              Umbrella
            </th>
            <ScorecardHeader label="Spend" active={sortKey === "spend"} dir={sortDir} onClick={() => toggle("spend")} />
            <ScorecardHeader label="Primary KPI" active={sortKey === "primaryResults"} dir={sortDir} onClick={() => toggle("primaryResults")} />
            <ScorecardHeader label="Cost / Result" active={sortKey === "costPerPrimaryResult"} dir={sortDir} onClick={() => toggle("costPerPrimaryResult")} />
            <ScorecardHeader label="CTR" active={sortKey === "ctr"} dir={sortDir} onClick={() => toggle("ctr")} />
          </tr>
        </thead>
        <tbody>
          {sorted.map(({ current, prior }) => (
            <tr
              key={current.id}
              className="cursor-pointer border-b border-hp-rule bg-hp-card align-top transition-colors duration-150 hover:bg-hp-inset"
              onClick={() => onSelect(current.campaignUmbrella || current.name)}
            >
              <td className="px-4 py-4 text-hp-ink">
                <div className="font-body text-base">{current.name}</div>
                <div className="mt-1 text-[11px] uppercase tracking-[0.14em] text-hp-muted">
                  {formatMetric(current.impressions, "number")} impressions
                </div>
              </td>
              <ScorecardCell
                value={formatMetric(current.spend, "money")}
                current={current.spend}
                previous={prior?.spend}
                showComparison={showPeriodBreakdown}
              />
              <ScorecardCell
                value={`${formatMetric(current.primaryResults, "number")} ${current.primaryResultLabel}`}
                current={current.primaryResults}
                previous={prior?.primaryResults}
                showComparison={showPeriodBreakdown}
              />
              <ScorecardCell
                value={formatMetric(current.costPerPrimaryResult, "money")}
                current={current.costPerPrimaryResult}
                previous={prior?.costPerPrimaryResult}
                lowerIsBetter
                showComparison={showPeriodBreakdown}
              />
              <ScorecardCell
                value={formatMetric(current.ctr, "percent")}
                current={current.ctr}
                previous={prior?.ctr}
                showComparison={showPeriodBreakdown}
              />
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
});

function readScorecardValue(row: PerformanceRow, key: ScorecardSortKey): number | null {
  if (key === "costPerPrimaryResult") return row.costPerPrimaryResult;
  if (key === "spend") return row.spend;
  if (key === "primaryResults") return row.primaryResults;
  return row.ctr;
}

const ScorecardHeader = memo(function ScorecardHeader({
  label,
  active,
  dir,
  onClick,
}: {
  label: string;
  active: boolean;
  dir: "asc" | "desc";
  onClick: () => void;
}) {
  return (
    <th className="border-b border-hp-rule px-4 py-3 text-[10px] font-normal uppercase tracking-[0.14em] text-hp-muted">
      <button
        type="button"
        onClick={onClick}
        className={`inline-flex items-center gap-1.5 transition-colors duration-150 hover:text-hp-ink ${
          active ? "text-hp-ink" : ""
        }`}
      >
        <span>{label}</span>
        <span aria-hidden className={active ? "text-hp-ink" : "text-hp-muted/60"}>
          {active ? (dir === "asc" ? "↑" : "↓") : "↕"}
        </span>
      </button>
    </th>
  );
});

const ScorecardCell = memo(function ScorecardCell({
  value,
  current,
  previous,
  lowerIsBetter,
  showComparison,
}: {
  value: string;
  current?: number | null;
  previous?: number | null;
  lowerIsBetter?: boolean;
  showComparison: boolean;
}) {
  return (
    <td className="px-4 py-4 font-body tabular-nums text-hp-ink">
      <div className="text-base">{value}</div>
      {showComparison ? (
        <div className="mt-1.5">
          <DeltaChip current={current} previous={previous} lowerIsBetter={lowerIsBetter} />
        </div>
      ) : null}
    </td>
  );
});

const PeriodHeader = memo(function PeriodHeader({
  period,
  compact = false,
}: {
  period: AnalystPeriodWindow;
  compact?: boolean;
}) {
  return (
    <th
      className={`whitespace-nowrap border-b border-hp-rule text-right text-[10px] font-normal uppercase tracking-[0.14em] text-hp-muted ${
        compact ? "px-3 py-3" : "px-4 py-3"
      }`}
      title={`${period.start} → ${period.end}`}
    >
      <span className="block">{period.label}</span>
      {period.isCurrent ? (
        <span className="mt-0.5 block text-[9px] tracking-[0.12em] text-hp-ink">
          Current
        </span>
      ) : null}
    </th>
  );
});

const PeriodMetricCell = memo(function PeriodMetricCell({
  values,
  metric,
  primaryResultLabel,
  compact = false,
}: {
  values?: AnalystPeriodMetricValues;
  metric: PeriodMetric;
  /** Live primary-KPI name (e.g. "Messaging Contacts", "Website
   *  Bookings") used as a sub-label under the value. Falls back to
   *  the static "Primary KPI" / "$/Primary KPI" / "Spend" / etc.
   *  when missing. */
  primaryResultLabel?: string | null;
  compact?: boolean;
}) {
  const value = values?.[metric];
  return (
    <td
      className={`align-top text-right tabular-nums text-hp-ink ${
        compact ? "px-3 py-4" : "px-4 py-4"
      }`}
    >
      <div>{formatPeriodMetric(value, metric)}</div>
      <div className="mt-1 text-[10px] font-normal uppercase tracking-[0.14em] text-hp-muted">
        {periodMetricLabel(metric, primaryResultLabel)}
      </div>
    </td>
  );
});

const PeriodDeltaCell = memo(function PeriodDeltaCell({
  periodValues,
  periods,
  metric,
  compact = false,
}: {
  periodValues?: Record<string, AnalystPeriodMetricValues>;
  periods: AnalystPeriodWindow[];
  metric: PeriodMetric;
  compact?: boolean;
}) {
  const currentPeriod = periods[0];
  const oldestPeriod = periods[periods.length - 1];
  const delta = currentPeriod && oldestPeriod
    ? formatPeriodDelta(
        periodValues?.[currentPeriod.key]?.[metric],
        periodValues?.[oldestPeriod.key]?.[metric],
      )
    : null;

  if (!delta) {
    return (
      <td className={`${compact ? "px-3" : "px-4"} py-4 text-right text-hp-muted`}>
        —
      </td>
    );
  }

  const lowerIsBetter = isLowerBetterPeriodMetric(metric);
  const isGood = delta.positive ? !lowerIsBetter : lowerIsBetter;
  const colorStyle = { color: isGood ? "#245D4D" : "#8D2E2E" };

  return (
    <td
      className={`${compact ? "px-3" : "px-4"} py-4 text-right text-xs font-medium tabular-nums`}
      style={colorStyle}
      title={`${oldestPeriod.label} → ${currentPeriod.label}`}
    >
      {delta.text}
    </td>
  );
});

const FilterChipGroup = memo(function FilterChipGroup({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="pr-1 text-[10px] uppercase tracking-[0.14em] text-hp-muted">{label}</span>
      {options.map((option) => {
        const isActive = value === option.value;
        return (
          <button
            key={option.value}
            type="button"
            onClick={() => onChange(option.value)}
            className={`h-9 border px-3 text-[11px] uppercase tracking-[0.14em] transition-colors duration-150 ${
              isActive
                ? "border-hp-ink bg-hp-ink text-hp-foundation"
                : "border-hp-rule text-hp-body hover:border-hp-ink"
            }`}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
});

const UmbrellaTabs = memo(function UmbrellaTabs({
  umbrellas,
  value,
  onChange,
}: {
  umbrellas: string[];
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <div className="border-y border-hp-rule">
      <div className="flex items-center gap-1 overflow-x-auto py-3">
        <span className="shrink-0 pr-3 text-[10px] uppercase tracking-[0.14em] text-hp-muted">
          Umbrella
        </span>
        {umbrellas.map((option) => {
          const isActive = value === option;
          const label = option === "all" ? "All" : option;
          return (
            <button
              key={option}
              type="button"
              onClick={() => onChange(option)}
              className={`h-9 shrink-0 whitespace-nowrap border px-3 text-xs transition-colors ${
                isActive
                  ? "border-hp-ink bg-hp-ink text-hp-foundation"
                  : "border-hp-rule text-hp-body hover:border-hp-ink"
              }`}
            >
              {label}
            </button>
          );
        })}
      </div>
    </div>
  );
});

const NestedPerformanceTable = memo(function NestedPerformanceTable({
  tree,
  expandedCampaignIds,
  expandedAdSetIds,
  forceExpanded,
  showPeriodBreakdown,
  periodMetric,
  periodWindows,
  periodBreakdown,
  onToggleCampaign,
  onToggleAdSet,
  onSelectCreative,
}: {
  tree: PerformanceTreeCampaignNode[];
  expandedCampaignIds: Set<string>;
  expandedAdSetIds: Set<string>;
  forceExpanded: boolean;
  showPeriodBreakdown: boolean;
  periodMetric: PeriodMetric;
  periodWindows: AnalystPeriodWindow[];
  periodBreakdown: DashboardPayload["periodBreakdown"];
  onToggleCampaign: (id: string) => void;
  onToggleAdSet: (id: string) => void;
  onSelectCreative: (id: string) => void;
}) {
  const periodMode = showPeriodBreakdown && periodWindows.length > 0;
  const tableMinWidth = periodMode
    ? 600 + periodWindows.length * 124 + (periodWindows.length > 1 ? 140 : 0)
    : 1040;
  const columnCount = periodMode
    ? 3 + periodWindows.length + (periodWindows.length > 1 ? 1 : 0)
    : 8;

  return (
    <div className="w-full overflow-x-auto">
      <table
        className="w-full table-fixed border-collapse text-sm"
        style={{ minWidth: tableMinWidth }}
      >
        {periodMode ? (
          <colgroup>
            <col className="w-[360px]" />
            <col className="w-[100px]" />
            <col className="w-[140px]" />
            {periodWindows.map((period) => (
              <col key={period.key} className="w-[124px]" />
            ))}
            {periodWindows.length > 1 ? <col className="w-[140px]" /> : null}
          </colgroup>
        ) : (
          <colgroup>
            <col className="w-[34%]" />
            <col className="w-[9%]" />
            <col className="w-[11%]" />
            <col className="w-[9%]" />
            <col className="w-[13%]" />
            <col className="w-[10%]" />
            <col className="w-[7%]" />
            <col className="w-[7%]" />
          </colgroup>
        )}
        <thead>
          <tr className="bg-hp-inset text-left text-[11px] uppercase tracking-[0.14em] text-hp-muted">
            <th className="whitespace-nowrap border-b border-hp-rule px-3 py-3">Name</th>
            <th className="whitespace-nowrap border-b border-hp-rule px-3 py-3">Delivery</th>
            <th className="whitespace-nowrap border-b border-hp-rule px-3 py-3">{TERMS.umbrellaShort}</th>
            {periodMode ? (
              <>
                {periodWindows.map((period) => (
                  <PeriodHeader key={period.key} period={period} compact />
                ))}
                {periodWindows.length > 1 ? (
                  <th className="border-b border-hp-rule px-3 py-3 text-right text-[10px] font-normal uppercase tracking-[0.14em] text-hp-muted">
                    <span className="block">Δ</span>
                    <span className="mt-0.5 block text-[9px] tracking-[0.12em]">oldest→current</span>
                  </th>
                ) : null}
              </>
            ) : (
              <>
                <th className="whitespace-nowrap border-b border-hp-rule px-3 py-3 text-right">Spend</th>
                <th className="whitespace-nowrap border-b border-hp-rule px-3 py-3 text-right">{TERMS.primaryKpi}</th>
                <th className="whitespace-nowrap border-b border-hp-rule px-3 py-3 text-right">Cost / Result</th>
                <th className="whitespace-nowrap border-b border-hp-rule px-3 py-3 text-right">CTR</th>
                <th className="whitespace-nowrap border-b border-hp-rule px-3 py-3 text-right">CPC</th>
              </>
            )}
          </tr>
        </thead>
        <tbody>
          {tree.map((campaign) => {
            const campaignExpanded = forceExpanded || expandedCampaignIds.has(campaign.id);
            return (
              <NestedCampaignRows
                key={campaign.id}
                node={campaign}
                expanded={campaignExpanded}
                expandedAdSetIds={expandedAdSetIds}
                forceExpanded={forceExpanded}
                periodMode={periodMode}
                periodMetric={periodMetric}
                periodWindows={periodWindows}
                periodBreakdown={periodBreakdown}
                onToggleCampaign={onToggleCampaign}
                onToggleAdSet={onToggleAdSet}
                onSelectCreative={onSelectCreative}
              />
            );
          })}
          {!tree.length ? (
            <tr>
              <td colSpan={columnCount} className="px-3 py-8 text-center text-sm text-hp-muted">
                No rows match the selected filters.
              </td>
            </tr>
          ) : null}
        </tbody>
      </table>
    </div>
  );
});

const NestedCampaignRows = memo(function NestedCampaignRows({
  node,
  expanded,
  expandedAdSetIds,
  forceExpanded,
  periodMode,
  periodMetric,
  periodWindows,
  periodBreakdown,
  onToggleCampaign,
  onToggleAdSet,
  onSelectCreative,
}: {
  node: PerformanceTreeCampaignNode;
  expanded: boolean;
  expandedAdSetIds: Set<string>;
  forceExpanded: boolean;
  periodMode: boolean;
  periodMetric: PeriodMetric;
  periodWindows: AnalystPeriodWindow[];
  periodBreakdown: DashboardPayload["periodBreakdown"];
  onToggleCampaign: (id: string) => void;
  onToggleAdSet: (id: string) => void;
  onSelectCreative: (id: string) => void;
}) {
  return (
    <>
      <MetricTreeRow
        row={node.campaign}
        level="campaign"
        childCount={node.adSets.length}
        expanded={expanded}
        periodMode={periodMode}
        periodMetric={periodMetric}
        periodWindows={periodWindows}
        periodValues={periodBreakdown.campaigns[node.campaign.id]}
        onToggle={() => onToggleCampaign(node.id)}
      />
      {expanded
        ? node.adSets.map((adSet) => {
            const adSetExpanded = forceExpanded || expandedAdSetIds.has(adSet.id);
            return (
              <NestedAdSetRows
                key={adSet.id}
                node={adSet}
                expanded={adSetExpanded}
                periodMode={periodMode}
                periodMetric={periodMetric}
                periodWindows={periodWindows}
                periodBreakdown={periodBreakdown}
                onToggleAdSet={onToggleAdSet}
                onSelectCreative={onSelectCreative}
              />
            );
          })
        : null}
    </>
  );
});

const NestedAdSetRows = memo(function NestedAdSetRows({
  node,
  expanded,
  periodMode,
  periodMetric,
  periodWindows,
  periodBreakdown,
  onToggleAdSet,
  onSelectCreative,
}: {
  node: PerformanceTreeAdSetNode;
  expanded: boolean;
  periodMode: boolean;
  periodMetric: PeriodMetric;
  periodWindows: AnalystPeriodWindow[];
  periodBreakdown: DashboardPayload["periodBreakdown"];
  onToggleAdSet: (id: string) => void;
  onSelectCreative: (id: string) => void;
}) {
  return (
    <>
      <MetricTreeRow
        row={node.adSet}
        level="adSet"
        childCount={node.creatives.length}
        expanded={expanded}
        periodMode={periodMode}
        periodMetric={periodMetric}
        periodWindows={periodWindows}
        periodValues={periodBreakdown.adSets[node.adSet.id]}
        onToggle={() => onToggleAdSet(node.id)}
      />
      {expanded
        ? node.creatives.map((creative) => (
            <MetricTreeRow
              key={creative.id}
              row={creative}
              level="creative"
              periodMode={periodMode}
              periodMetric={periodMetric}
              periodWindows={periodWindows}
              periodValues={periodBreakdown.creatives[creative.id]}
              onSelectCreative={onSelectCreative}
            />
          ))
        : null}
    </>
  );
});

const MetricTreeRow = memo(function MetricTreeRow({
  row,
  level,
  childCount = 0,
  expanded = false,
  periodMode,
  periodMetric,
  periodWindows,
  periodValues,
  onToggle,
  onSelectCreative,
}: {
  row: PerformanceRow;
  level: "campaign" | "adSet" | "creative";
  childCount?: number;
  expanded?: boolean;
  periodMode: boolean;
  periodMetric: PeriodMetric;
  periodWindows: AnalystPeriodWindow[];
  periodValues?: Record<string, AnalystPeriodMetricValues>;
  onToggle?: () => void;
  onSelectCreative?: (id: string) => void;
}) {
  const hasChildren = level !== "creative" && childCount > 0;
  const isCreative = level === "creative";
  const rowClass =
    level === "campaign"
      ? "bg-hp-card font-body text-hp-ink"
      : level === "adSet"
        ? "bg-hp-card text-hp-body"
        : "cursor-pointer bg-hp-card text-hp-body transition-colors duration-150 hover:bg-hp-inset";
  const namePadding =
    level === "campaign" ? "pl-3" : level === "adSet" ? "pl-8" : "pl-14";

  return (
    <tr
      className={`border-b border-hp-rule align-top last:border-b-0 ${rowClass}`}
      onClick={isCreative && onSelectCreative ? () => onSelectCreative(row.id) : undefined}
    >
      <td className={`py-4 pr-3 ${namePadding}`}>
        <div className="flex min-w-0 items-start gap-3">
          {hasChildren ? (
            <button
              type="button"
              aria-label={`${expanded ? "Collapse" : "Expand"} ${row.name}`}
              aria-expanded={expanded}
              onClick={(event) => {
                event.stopPropagation();
                onToggle?.();
              }}
              className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center border border-hp-rule text-hp-muted transition-colors hover:border-hp-ink hover:text-hp-ink"
            >
              <ChevronRight
                size={13}
                className={`transition-transform duration-150 ${expanded ? "rotate-90" : ""}`}
              />
            </button>
          ) : (
            <span className="mt-0.5 h-5 w-5 shrink-0" />
          )}
          {isCreative ? (
            <CreativePreview creative={row} compact />
          ) : null}
          <div className="min-w-0">
            <div className="leading-6 text-hp-ink [overflow-wrap:anywhere]">{row.name}</div>
            <div className="mt-1 text-[10px] uppercase tracking-[0.14em] text-hp-muted">
              {level === "campaign"
                ? `${formatMetric(childCount, "number")} ad sets`
                : level === "adSet"
                  ? `${formatMetric(childCount, "number")} creatives`
                  : row.adName || "Creative"}
            </div>
          </div>
        </div>
      </td>
      <td className="px-3 py-4 text-xs uppercase tracking-[0.12em]">
        <span className={deliveryStatusClass(row.effectiveStatus)}>
          {deliveryStatusLabel(row.effectiveStatus)}
        </span>
      </td>
      <td className="px-3 py-4 text-xs leading-5 text-hp-muted [overflow-wrap:anywhere]">
        {row.campaignUmbrella}
      </td>
      {periodMode ? (
        <>
          {periodWindows.map((period) => (
            <PeriodMetricCell
              key={period.key}
              values={periodValues?.[period.key]}
              metric={periodMetric}
              primaryResultLabel={row.primaryResultLabel}
              compact
            />
          ))}
          {periodWindows.length > 1 ? (
            <PeriodDeltaCell
              periodValues={periodValues}
              periods={periodWindows}
              metric={periodMetric}
              compact
            />
          ) : null}
        </>
      ) : (
        <>
          <td className="px-3 py-4 text-right font-[family-name:var(--font-title)] text-[17px] leading-tight tabular-nums text-hp-ink">
            {formatMetric(row.spend, "money")}
          </td>
          <td className="px-3 py-4 text-right">
            <ResultCell row={row} align="right" />
          </td>
          <td className="px-3 py-4 text-right font-[family-name:var(--font-title)] text-[17px] leading-tight tabular-nums text-hp-ink">
            {formatMetric(row.costPerPrimaryResult, "money")}
          </td>
          <td className="px-3 py-4 text-right font-[family-name:var(--font-title)] text-[17px] leading-tight tabular-nums text-hp-ink">
            {formatMetric(row.ctr, "percent")}
          </td>
          <td className="px-3 py-4 text-right font-[family-name:var(--font-title)] text-[17px] leading-tight tabular-nums text-hp-ink">
            {formatMetric(row.cpc, "money")}
          </td>
        </>
      )}
    </tr>
  );
});

const CreativeDrawer = memo(function CreativeDrawer({
  creative,
  onClose,
}: {
  creative: PerformanceRow | null;
  onClose: () => void;
}) {
  if (!creative) return null;
  const adsManagerUrl = creative.adId
    ? `https://business.facebook.com/adsmanager/manage/ads/edit?selected_ad_ids=${encodeURIComponent(creative.adId)}`
    : null;

  return (
    <div className="fixed inset-0 z-50 flex">
      <button
        type="button"
        aria-label="Close drawer"
        onClick={onClose}
        className="flex-1 bg-hp-ink/40 transition-opacity duration-150"
      />
      <aside
        role="dialog"
        aria-modal="true"
        className="flex h-full w-full max-w-[480px] flex-col border-l border-hp-rule bg-hp-card shadow-[-8px_0_24px_rgba(42,39,37,0.08)]"
      >
        <header className="flex items-start justify-between gap-3 border-b border-hp-rule px-6 py-5">
          <div className="min-w-0">
            <div className="text-[10px] uppercase tracking-[0.14em] text-hp-muted">
              Creative
            </div>
            <h3 className="mt-1 font-title text-2xl leading-tight text-hp-ink [overflow-wrap:anywhere]">
              {creative.name}
            </h3>
            <div className="mt-2 flex flex-wrap items-center gap-2 text-[10px] uppercase tracking-[0.14em] text-hp-muted">
              <span>{creative.brandCode}</span>
              {creative.campaignUmbrella ? (
                <>
                  <span aria-hidden>·</span>
                  <span>{creative.campaignUmbrella}</span>
                </>
              ) : null}
              <RiskBadge level={creative.riskLevel} />
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="shrink-0 border border-hp-rule px-3 py-1.5 text-[10px] uppercase tracking-[0.14em] text-hp-muted transition-colors duration-150 hover:border-hp-ink hover:text-hp-ink"
          >
            Close
          </button>
        </header>

        <div className="flex-1 overflow-y-auto">
          <div className="border-b border-hp-rule p-6">
            <div className="grid grid-cols-[140px_1fr] gap-5">
              <CreativePreview creative={creative} />
              <div className="grid grid-cols-2 gap-3">
                <MiniMetric label="Spend" value={formatMetric(creative.spend, "money")} />
                <MiniMetric label={creative.primaryResultLabel} value={formatMetric(creative.primaryResults, "number")} />
                <MiniMetric label="CTR" value={formatMetric(creative.ctr, "percent")} />
                <MiniMetric label="CPC" value={formatMetric(creative.cpc, "money")} />
                <MiniMetric label="Cost / Result" value={formatMetric(creative.costPerPrimaryResult, "money")} />
                <MiniMetric label="Frequency" value={`${creative.frequency.toFixed(2)}x`} />
              </div>
            </div>
          </div>

          <section className="border-b border-hp-rule p-6">
            <div className="text-[10px] uppercase tracking-[0.14em] text-hp-muted">
              Placement
            </div>
            <dl className="mt-3 space-y-3 text-sm">
              <DrawerField label="Campaign" value={creative.campaignName} id={creative.campaignId} />
              <DrawerField label="Ad Set" value={creative.adSetName} id={creative.adSetId} />
              <DrawerField label="Ad" value={creative.adName} id={creative.adId} />
              <DrawerField label="Creative" value={creative.name} id={creative.id} />
            </dl>
          </section>

          {creative.body ? (
            <section className="border-b border-hp-rule p-6">
              <div className="text-[10px] uppercase tracking-[0.14em] text-hp-muted">
                Body Copy
              </div>
              <p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-hp-body [overflow-wrap:anywhere]">
                {creative.body}
              </p>
            </section>
          ) : null}

          {creative.riskReason ? (
            <section className="border-b border-hp-rule p-6">
              <div className="text-[10px] uppercase tracking-[0.14em] text-hp-muted">
                Diagnostic
              </div>
              <p className="mt-3 text-sm leading-6 text-hp-body">{creative.riskReason}</p>
            </section>
          ) : null}
        </div>

        <footer className="border-t border-hp-rule px-6 py-5">
          {adsManagerUrl ? (
            <a
              href={adsManagerUrl}
              target="_blank"
              rel="noreferrer noopener"
              className="block w-full bg-hp-ink px-4 py-3 text-center text-[11px] uppercase tracking-[0.14em] text-hp-foundation transition-colors duration-150 hover:bg-hp-pink"
            >
              Open in Meta Ads Manager
            </a>
          ) : (
            <div className="text-center text-xs text-hp-muted">
              No ad ID on record — open Ads Manager directly.
            </div>
          )}
        </footer>
      </aside>
    </div>
  );
});

const DrawerField = memo(function DrawerField({
  label,
  value,
  id,
}: {
  label: string;
  value?: string | null;
  id?: string | null;
}) {
  return (
    <div className="grid grid-cols-[100px_1fr] gap-3">
      <dt className="text-[10px] uppercase tracking-[0.14em] text-hp-muted">{label}</dt>
      <dd className="min-w-0 text-hp-ink [overflow-wrap:anywhere]">
        <div className="text-sm">{value || "—"}</div>
        {id ? (
          <div className="mt-0.5">
            <TechnicalId value={id} label={label} />
          </div>
        ) : null}
      </dd>
    </div>
  );
});

const CreativePreview = memo(function CreativePreview({
  creative,
  compact = false,
  gallery = false,
}: {
  creative: PerformanceRow;
  compact?: boolean;
  gallery?: boolean;
}) {
  const imageSrc = creative.thumbnailUrl || creative.imageUrl;
  const dimensions = compact ? "h-14 w-14" : gallery ? "aspect-[4/3] w-full" : "h-28 w-28";

  if (creative.previewHtml && creative.previewSource === "ad_preview") {
    return (
      <iframe
        title={`${creative.name} preview`}
        srcDoc={creative.previewHtml}
        sandbox=""
        className={`${dimensions} border border-hp-rule bg-white`}
      />
    );
  }

  if (imageSrc) {
    return (
      <img
        src={imageSrc}
        alt={creative.name}
        className={`${dimensions} border border-hp-rule object-cover`}
        loading="lazy"
        referrerPolicy="no-referrer"
      />
    );
  }

  return (
    <div className={`${dimensions} flex items-center justify-center border border-hp-rule bg-hp-inset`}>
      <span className="text-[10px] uppercase tracking-[0.14em] text-hp-muted">No Preview</span>
    </div>
  );
});

const RiskBadge = memo(function RiskBadge({ level }: { level?: PerformanceRow["riskLevel"] }) {
  const color =
    level === "high"
      ? "text-signal-danger"
      : level === "medium"
        ? "text-signal-warning"
        : "text-signal-positive";

  return (
    <span className={`text-[10px] uppercase tracking-[0.14em] ${color}`}>
      {level || "low"}
    </span>
  );
});

const ResultCell = memo(function ResultCell({ row, align = "left" }: { row: PerformanceRow; align?: "left" | "right" }) {
  return (
    <div className={align === "right" ? "text-right" : "text-left"}>
      <div className="font-[family-name:var(--font-title)] text-[17px] leading-tight tabular-nums text-hp-ink">
        {formatMetric(row.primaryResults, "number")}
      </div>
      <div className="text-[10px] leading-4 text-hp-muted break-words">
        {row.primaryResultLabel}
      </div>
      {row.secondaryResultLabel && row.secondaryResults !== null ? (
        <div className="mt-1 text-xs tabular-nums text-hp-muted break-words">
          {formatMetric(row.secondaryResults, "number")} {row.secondaryResultLabel}
        </div>
      ) : null}
    </div>
  );
});

const MiniMetric = memo(function MiniMetric({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-[0.14em] text-hp-muted">{label}</div>
      <div className="mt-1 tabular-nums text-hp-ink">{value}</div>
    </div>
  );
});

type CreativePdfHtmlOptions = {
  rows: PerformanceRow[];
  dateRange: string;
  umbrellaName: string;
  brandName: string;
  searchQuery: string;
  sortLabel: string;
  generatedAt: Date;
  hideFinancials: boolean;
};

async function printHtmlDocument(html: string) {
  const frame = document.createElement("iframe");
  frame.setAttribute("aria-hidden", "true");
  frame.style.position = "fixed";
  frame.style.left = "-10000px";
  frame.style.top = "0";
  frame.style.width = "1120px";
  frame.style.height = "800px";
  frame.style.border = "0";
  frame.style.opacity = "0";

  document.body.appendChild(frame);

  const printWindow = frame.contentWindow;
  const printDocument = printWindow?.document;
  if (!printWindow || !printDocument) {
    frame.remove();
    window.alert("The PDF export could not be prepared in this browser.");
    return;
  }

  printDocument.open();
  printDocument.write(html);
  printDocument.close();

  await waitForPrintImages(printDocument, 2500);
  await new Promise((resolve) => window.setTimeout(resolve, 150));

  const cleanup = () => frame.remove();
  printWindow.addEventListener("afterprint", cleanup, { once: true });
  window.setTimeout(cleanup, 30000);
  printWindow.focus();
  printWindow.print();
}

function waitForPrintImages(printDocument: Document, timeoutMs: number) {
  const pendingImages = Array.from(printDocument.images).filter((image) => !image.complete);
  if (!pendingImages.length) return Promise.resolve();

  return new Promise<void>((resolve) => {
    let isSettled = false;
    let remaining = pendingImages.length;

    const settle = () => {
      if (isSettled) return;
      isSettled = true;
      window.clearTimeout(timeout);
      resolve();
    };

    const completeOne = () => {
      remaining -= 1;
      if (remaining <= 0) settle();
    };

    const timeout = window.setTimeout(settle, timeoutMs);

    for (const image of pendingImages) {
      image.addEventListener("load", completeOne, { once: true });
      image.addEventListener("error", completeOne, { once: true });
    }
  });
}

function buildCreativePdfHtml({
  rows,
  dateRange,
  umbrellaName,
  brandName,
  searchQuery,
  sortLabel,
  generatedAt,
  hideFinancials,
}: CreativePdfHtmlOptions) {
  const generatedLabel = new Intl.DateTimeFormat("en-US", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(generatedAt);
  const searchLabel = searchQuery.trim() ? searchQuery.trim() : "None";
  const reportContext = [
    `Brand: ${brandName}`,
    `Sorted by: ${sortLabel}`,
    `Search: ${searchLabel}`,
    hideFinancials ? "Financials hidden" : null,
    `${formatMetric(rows.length, "number")} rows`,
  ]
    .filter(Boolean)
    .join(" | ");
  const reportTitle = [
    "Creative Export",
    umbrellaName,
    dateRange,
  ];

  return `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <title>${escapeHtml(`Creative Export - ${umbrellaName} - ${dateRange}`)}</title>
    <style>
      @page {
        size: letter landscape;
        margin: 0.3in;
      }

      * {
        box-sizing: border-box;
      }

      html,
      body {
        margin: 0;
        background: #ffffff;
        color: #2a2725;
        font-family: Georgia, "Times New Roman", serif;
        font-size: 9px;
        line-height: 1.35;
      }

      body {
        -webkit-print-color-adjust: exact;
        print-color-adjust: exact;
      }

      th {
        color: #8a8178;
        font-size: 7.4px;
        letter-spacing: 0.06em;
        text-transform: uppercase;
      }

      .muted {
        color: #4a4540;
      }

      .table-name {
        color: #2a2725;
        font-weight: 700;
        overflow-wrap: anywhere;
      }

      .preview,
      .preview img,
      .preview iframe {
        width: 100%;
        height: 100%;
      }

      .preview img {
        display: block;
        object-fit: cover;
      }

      .preview iframe {
        display: block;
        border: 0;
        background: #ffffff;
      }

      .preview-empty {
        display: flex;
        width: 100%;
        height: 100%;
        align-items: center;
        justify-content: center;
        color: #8a8178;
        font-size: 7px;
        letter-spacing: 0.08em;
        text-align: center;
        text-transform: uppercase;
      }

      table {
        width: 100%;
        border-collapse: collapse;
        table-layout: fixed;
        page-break-inside: auto;
      }

      thead {
        display: table-header-group;
      }

      tr {
        break-inside: avoid;
        page-break-inside: avoid;
      }

      th,
      td {
        border-bottom: 1px solid #d4cfc4;
        padding: 0.035in 0.045in;
        text-align: left;
        vertical-align: top;
        overflow-wrap: anywhere;
        word-break: break-word;
      }

      th {
        background: #efe8dd;
        color: #4a4540;
        font-weight: 700;
      }

      td {
        font-size: 8.2px;
      }

      .table-copy {
        margin-top: 0.02in;
        color: #8a8178;
        font-size: 7.2px;
        max-height: 3.45em;
        overflow: hidden;
      }

      .table-preview {
        width: 0.38in;
        height: 0.38in;
        border: 1px solid #d4cfc4;
        background: #efe8dd;
      }

      .report-row th {
        background: #ffffff;
        border-bottom: 0;
        color: #2a2725;
        font-size: 10px;
        letter-spacing: 0;
        padding: 0 0 0.035in;
        text-transform: none;
      }

      .report-frame {
        display: grid;
        grid-template-columns: minmax(1.55in, 1fr) minmax(0, 3.9in) minmax(1.55in, 1fr);
        gap: 0.12in;
        align-items: end;
      }

      .report-generated {
        text-align: left;
      }

      .report-title {
        color: #2a2725;
        font-size: 10.5px;
        font-weight: 700;
        line-height: 1.2;
        text-align: center;
        overflow-wrap: anywhere;
      }

      .report-context {
        color: #8a8178;
        font-size: 6.8px;
        line-height: 1.25;
        text-align: right;
        overflow-wrap: anywhere;
      }

      .column-row th {
        white-space: nowrap;
      }

      .num {
        text-align: right;
        white-space: nowrap;
        font-variant-numeric: tabular-nums;
      }

      .risk-low {
        color: #245d4d;
      }

      .risk-medium {
        color: #8b5b19;
      }

      .risk-high {
        color: #8d2e2e;
      }

      .empty-state {
        border: 1px solid #d4cfc4;
        padding: 0.18in;
        color: #8a8178;
        text-align: center;
      }
    </style>
  </head>
  <body>
    ${rows.length ? creativeTableMarkup(rows, {
      generatedLabel,
      reportContext,
      reportTitle: reportTitle.map((part) => escapeHtml(part)).join(" - "),
      hideFinancials,
    }) : `<div class="empty-state">No creatives match the selected filters.</div>`}
  </body>
</html>`;
}

type CreativeTablePrintOptions = {
  generatedLabel: string;
  hideFinancials: boolean;
  reportContext: string;
  reportTitle: string;
};

function creativeTableMarkup(rows: PerformanceRow[], options: CreativeTablePrintOptions) {
  const columnCount = options.hideFinancials ? 8 : 11;

  return `<table>
    ${creativeTableColgroupMarkup(options.hideFinancials)}
    <thead>
      <tr class="report-row">
        <th colspan="${columnCount}">
          <div class="report-frame">
            <div class="report-generated">${escapeHtml(options.generatedLabel)}</div>
            <div class="report-title">${options.reportTitle}</div>
            <div class="report-context">${escapeHtml(options.reportContext)}</div>
          </div>
        </th>
      </tr>
      <tr class="column-row">
        <th>Creative</th>
        <th>Preview</th>
        <th>Brand</th>
        <th>${TERMS.umbrellaShort}</th>
        ${options.hideFinancials ? "" : `<th class="num">Spend</th>`}
        <th class="num">CTR</th>
        ${options.hideFinancials ? "" : `<th class="num">CPC</th>`}
        <th class="num">Freq.</th>
        <th class="num">${TERMS.primaryKpi}</th>
        ${options.hideFinancials ? "" : `<th class="num">Cost / Result</th>`}
        <th>Risk</th>
      </tr>
    </thead>
    <tbody>
      ${rows.map((row) => creativeTableRowMarkup(row, options.hideFinancials)).join("")}
    </tbody>
  </table>`;
}

function creativeTableColgroupMarkup(hideFinancials: boolean) {
  if (hideFinancials) {
    return `<colgroup>
      <col style="width: 34%" />
      <col style="width: 7%" />
      <col style="width: 6%" />
      <col style="width: 17%" />
      <col style="width: 8%" />
      <col style="width: 7%" />
      <col style="width: 15%" />
      <col style="width: 6%" />
    </colgroup>`;
  }

  return `<colgroup>
    <col style="width: 22%" />
    <col style="width: 7%" />
    <col style="width: 5%" />
    <col style="width: 12%" />
    <col style="width: 7%" />
    <col style="width: 6%" />
    <col style="width: 7%" />
    <col style="width: 6%" />
    <col style="width: 11%" />
    <col style="width: 11%" />
    <col style="width: 6%" />
  </colgroup>`;
}

function creativeTableRowMarkup(row: PerformanceRow, hideFinancials: boolean) {
  return `<tr>
    <td>
      <div class="table-name">${escapeHtml(truncateText(row.name, 120))}</div>
      ${row.body ? `<div class="table-copy">${escapeHtml(truncateText(row.body, 170))}</div>` : ""}
    </td>
    <td><div class="table-preview preview">${creativePreviewMarkup(row)}</div></td>
    <td>${escapeHtml(row.brandCode)}</td>
    <td>${escapeHtml(row.campaignUmbrella || "Unassigned")}</td>
    ${hideFinancials ? "" : `<td class="num">${escapeHtml(formatMetric(row.spend, "money"))}</td>`}
    <td class="num">${escapeHtml(formatMetric(row.ctr, "percent"))}</td>
    ${hideFinancials ? "" : `<td class="num">${escapeHtml(formatMetric(row.cpc, "money"))}</td>`}
    <td class="num">${Number.isFinite(row.frequency) ? `${row.frequency.toFixed(2)}x` : "n/a"}</td>
    <td class="num">
      ${escapeHtml(formatMetric(row.primaryResults, "number"))}
      <div class="muted">${escapeHtml(truncateText(row.primaryResultLabel, 28))}</div>
    </td>
    ${hideFinancials ? "" : `<td class="num">${escapeHtml(formatMetric(row.costPerPrimaryResult, "money"))}</td>`}
    <td class="${riskClassName(row.riskLevel)}">${escapeHtml(row.riskLevel || "low")}</td>
  </tr>`;
}

function creativePreviewMarkup(row: PerformanceRow) {
  if (row.previewHtml && row.previewSource === "ad_preview") {
    return `<iframe title="${escapeHtml(`${row.name} preview`)}" srcdoc="${escapeHtml(row.previewHtml)}" sandbox=""></iframe>`;
  }

  const imageSrc = printablePreviewUrl(row);
  if (imageSrc) {
    return `<img src="${escapeHtml(imageSrc)}" alt="${escapeHtml(row.name)}" referrerpolicy="no-referrer" />`;
  }

  return `<div class="preview-empty">No Preview</div>`;
}

function printablePreviewUrl(row: PerformanceRow) {
  const src = row.thumbnailUrl || row.imageUrl;
  if (!src) return null;
  const trimmed = src.trim();
  return /^(https?:\/\/|data:image\/|blob:|\/)/i.test(trimmed) ? trimmed : null;
}

function riskClassName(level?: PerformanceRow["riskLevel"]) {
  return `risk-${level || "low"}`;
}

function formatDateRange(start: string | null, end: string | null) {
  if (start && end) return `${formatDateLabel(start)} to ${formatDateLabel(end)}`;
  if (start) return `From ${formatDateLabel(start)}`;
  if (end) return `Through ${formatDateLabel(end)}`;
  return "No date range";
}

function formatDateLabel(value: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return value;

  const [, year, month, day] = match;
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  }).format(Date.UTC(Number(year), Number(month) - 1, Number(day)));
}

function formatUmbrellaName(value: string) {
  return value === "all" ? `All ${TERMS.campaignUmbrella}s` : value;
}

/**
 * Delivery-status label for the performance table. Meta's `effective_status`
 * arrives uppercase (ACTIVE / PAUSED / ARCHIVED / DELETED / CAMPAIGN_PAUSED
 * / ADSET_PAUSED / IN_PROCESS / WITH_ISSUES / etc.); we render it title-case.
 * Null / missing → em-dash.
 */
function deliveryStatusLabel(status: string | null | undefined): string {
  const raw = (status || "").trim();
  if (!raw) return "—";
  return raw
    .toLowerCase()
    .split("_")
    .map((word) => (word ? word.charAt(0).toUpperCase() + word.slice(1) : word))
    .join(" ");
}

/**
 * Color treatment for the delivery cell — Active reads positive,
 * everything else falls back to muted so the eye lands on actively-
 * delivering rows.
 */
function deliveryStatusClass(status: string | null | undefined): string {
  return (status || "").toUpperCase() === "ACTIVE"
    ? "text-signal-positive"
    : "text-hp-muted";
}

function truncateText(value: string | null | undefined, maxLength: number) {
  const text = String(value || "").replace(/\s+/g, " ").trim();
  if (text.length <= maxLength) return text;
  return `${text.slice(0, Math.max(0, maxLength - 3)).trimEnd()}...`;
}

function escapeHtml(value: string | number | null | undefined) {
  return String(value ?? "").replace(/[&<>"']/g, (character) => {
    switch (character) {
      case "&":
        return "&amp;";
      case "<":
        return "&lt;";
      case ">":
        return "&gt;";
      case '"':
        return "&quot;";
      case "'":
        return "&#39;";
      default:
        return character;
    }
  });
}

function filterPerformanceTree(
  tree: PerformanceTreeCampaignNode[],
  normalizedQuery: string,
): PerformanceTreeCampaignNode[] {
  if (!normalizedQuery) return tree;

  return tree
    .map((campaignNode) => {
      const campaignMatches = rowMatchesSearch(campaignNode.campaign, normalizedQuery);
      const adSets = campaignNode.adSets
        .map((adSetNode) => {
          const adSetMatches = rowMatchesSearch(adSetNode.adSet, normalizedQuery);
          const creatives = campaignMatches || adSetMatches
            ? adSetNode.creatives
            : adSetNode.creatives.filter((creative) =>
                rowMatchesSearch(creative, normalizedQuery),
              );
          if (!campaignMatches && !adSetMatches && creatives.length === 0) return null;
          return {
            ...adSetNode,
            creatives,
          };
        })
        .filter((adSetNode): adSetNode is PerformanceTreeAdSetNode => adSetNode !== null);

      if (!campaignMatches && adSets.length === 0) return null;
      return {
        ...campaignNode,
        adSets: campaignMatches ? campaignNode.adSets : adSets,
      };
    })
    .filter((campaignNode): campaignNode is PerformanceTreeCampaignNode => campaignNode !== null);
}

function collectTreeCreatives(tree: PerformanceTreeCampaignNode[]) {
  const creatives: PerformanceRow[] = [];
  for (const campaignNode of tree) {
    for (const adSetNode of campaignNode.adSets) {
      creatives.push(...adSetNode.creatives);
    }
  }
  return creatives;
}

function countPerformanceTree(tree: PerformanceTreeCampaignNode[]) {
  let adSets = 0;
  let creatives = 0;
  for (const campaignNode of tree) {
    adSets += campaignNode.adSets.length;
    for (const adSetNode of campaignNode.adSets) {
      creatives += adSetNode.creatives.length;
    }
  }
  return { campaigns: tree.length, adSets, creatives };
}

function toggleSetValue(current: Set<string>, value: string) {
  const next = new Set(current);
  if (next.has(value)) {
    next.delete(value);
  } else {
    next.add(value);
  }
  return next;
}

function filterAndSortRows(
  rows: PerformanceRow[],
  brand: string,
  umbrella: string,
  normalizedQuery: string,
  sortKey: SortKey,
  delivery: DeliveryFilter = "all",
) {
  return rows
    .filter((row) => rowMatchesFilters(row, brand, umbrella, normalizedQuery, delivery))
    .sort((a, b) => Number(b[sortKey] || 0) - Number(a[sortKey] || 0));
}

function rowMatchesSearch(row: PerformanceRow, normalizedQuery: string) {
  if (!normalizedQuery) return true;
  return (
    searchValueMatches(row.name, normalizedQuery) ||
    searchValueMatches(row.title, normalizedQuery) ||
    searchValueMatches(row.body, normalizedQuery) ||
    searchValueMatches(row.brandCode, normalizedQuery) ||
    searchValueMatches(row.campaignUmbrella, normalizedQuery) ||
    searchValueMatches(row.objective, normalizedQuery) ||
    searchValueMatches(row.status, normalizedQuery) ||
    searchValueMatches(row.effectiveStatus, normalizedQuery) ||
    searchValueMatches(row.campaignName, normalizedQuery) ||
    searchValueMatches(row.adSetName, normalizedQuery) ||
    searchValueMatches(row.adName, normalizedQuery)
  );
}

function rowMatchesFilters(
  row: PerformanceRow,
  brand: string,
  umbrella: string,
  normalizedQuery: string,
  delivery: DeliveryFilter,
) {
  if (brand !== "all" && row.brandCode !== brand) return false;
  if (umbrella !== "all" && row.campaignUmbrella !== umbrella) return false;
  if (!rowMatchesDelivery(row, delivery)) return false;

  if (!normalizedQuery) return true;

  return rowMatchesSearch(row, normalizedQuery);
}

function rowMatchesDelivery(row: PerformanceRow, delivery: DeliveryFilter) {
  if (delivery === "all") return true;
  const isActive = (row.effectiveStatus || "").toUpperCase() === "ACTIVE";
  return delivery === "active" ? isActive : !isActive;
}

function searchValueMatches(value: string | null | undefined, normalizedQuery: string) {
  if (!value) return false;
  return value.toLowerCase().includes(normalizedQuery);
}

function isFinancialSortKey(sortKey: SortKey) {
  return sortKey === "spend" || sortKey === "cpc";
}

function normalizePeriodMetric(value: string | null): PeriodMetric {
  return PERIOD_METRIC_OPTIONS.includes(value as PeriodMetric)
    ? (value as PeriodMetric)
    : DEFAULT_PERIOD_METRIC;
}

function replaceUrlParam(key: string, value: string) {
  window.history.replaceState({}, "", urlWithParam(key, value).toString());
}

function urlWithParam(key: string, value: string) {
  const url = new URL(window.location.href);
  url.searchParams.set(key, value);
  return url;
}

function isLowerBetterPeriodMetric(metric: PeriodMetric) {
  return metric === "cost_per_primary_results" || metric === "cpc";
}

function shiftDate(date: string, days: number) {
  const value = new Date(`${date}T00:00:00Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return toDateInput(value);
}

function toDateInput(date: Date) {
  return date.toISOString().slice(0, 10);
}

function formatMetric(value: number | null, kind: "money" | "number" | "percent") {
  if (value === null || Number.isNaN(value)) return "n/a";
  if (kind === "money") {
    return (value >= 100 ? MONEY_FORMATTER_WHOLE : MONEY_FORMATTER_WITH_CENTS).format(value);
  }
  if (kind === "percent") return `${value.toFixed(2)}%`;
  return NUMBER_FORMATTER.format(value);
}
