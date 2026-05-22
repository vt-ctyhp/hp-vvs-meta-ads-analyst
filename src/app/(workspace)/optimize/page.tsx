import { OptimizeAiPanel } from "@/components/v2/optimize/ai-panel";
import { CreativesPanel } from "@/components/v2/optimize/creatives-panel";
import { OptimizeControls } from "@/components/v2/optimize/optimize-controls";
import {
  normalizeOptimizeTab,
  OptimizeTabs,
} from "@/components/v2/optimize/optimize-tabs";
import { RunSyncButton } from "@/components/v2/optimize/sync-button";
import { TimeSeriesChart } from "@/components/v2/optimize/time-series-chart";
import { TreeTable } from "@/components/v2/optimize/tree-table";
import { TriagePanel } from "@/components/v2/optimize/triage-panel";
import { StatusSentence } from "@/components/v2/status-sentence";
import { fetchSavedAnalysisDashboards } from "@/lib/ad-hoc-analytics";
import { hasPermission } from "@/lib/access-control";
import { emptyDashboardPayload, fetchDashboardData } from "@/lib/analytics";
import { CAMPAIGN_UMBRELLAS } from "@/lib/campaign-umbrellas";
import {
  emptyCreativeAnalysisPayload,
  fetchCreativeAnalysisData,
} from "@/lib/creative-analysis";
import { firstParam, numberParam, pathWithQuery } from "@/lib/dashboard-page";
import {
  emptyOptimizeSummaryPayload,
  fetchOptimizeSummaryData,
  resolveOptimizeDateRange,
} from "@/lib/optimize-page-data";
import {
  normalizeOptimizeDeliveryStatus,
  normalizeOptimizeStatusSelection,
} from "@/lib/optimize-filters";
import {
  OPTIMIZE_DEFAULT_DAYS,
  OPTIMIZE_DEFAULT_PERIODS,
} from "@/lib/app-routes";
import {
  fetchPeriodPivot,
  isPeriodMetric,
  normalizePeriodCount,
  type PeriodMetric,
  type PeriodPivotPayload,
} from "@/lib/period-pivot-data";
import { isFrequency, lastNPeriods, type Frequency } from "@/lib/period-windows";
import { requirePagePermission } from "@/lib/server-route-auth";

export const dynamic = "force-dynamic";

type SearchParams = Record<string, string | string[] | undefined>;

export default async function OptimizePage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const params = await searchParams;
  const profile = await requirePagePermission(
    "view_dashboard",
    pathWithQuery("/optimize", params),
  );
  const canRunSync = hasPermission(profile.roles, "run_meta_sync");
  const canViewAi = hasPermission(profile.roles, "view_ai_analysis");
  const canViewCreatives = hasPermission(profile.roles, "view_creative_analysis");

  const activeTab = normalizeOptimizeTab(params.tab);
  const startDate = firstParam(params.start) ?? null;
  const endDate = firstParam(params.end) ?? null;
  const focus = firstParam(params.focus) ?? null;
  const days = numberParam(params.days) || OPTIMIZE_DEFAULT_DAYS;

  // Filter-bar inputs. Status defaults to "live" so the operator lands on
  // currently-active inventory; explicit URL params override.
  const statusFilter =
    normalizeOptimizeStatusSelection(firstParam(params.status)) ?? "live";
  const deliveryStatusFilter = normalizeOptimizeDeliveryStatus(statusFilter);
  const brandFilter = firstParam(params.brand) ?? "all";
  const groupFilter = firstParam(params.group) ?? "all";
  const pageDateRange = resolveOptimizeDateRange({ days, startDate, endDate });

  // Range filter — preset OR custom start/end. The pivot table anchors
  // its rightmost period to the end of the range (today for presets).
  const pivotAnchor = new Date(`${pageDateRange.end}T12:00:00Z`);

  // Period-pivot controls — defaults: 1 week of Primary KPI.
  const periodCount = normalizePeriodCount(
    firstParam(params.periods) ?? String(OPTIMIZE_DEFAULT_PERIODS),
  );
  const frequencyParam = firstParam(params.freq);
  const frequency: Frequency = isFrequency(frequencyParam) ? frequencyParam : "week";
  const metricParam = firstParam(params.metric);
  const metric: PeriodMetric = isPeriodMetric(metricParam)
    ? metricParam
    : "primary_results";
  const pivotPeriods = lastNPeriods(pivotAnchor, periodCount, frequency);
  const pivotDateRange = intersectDateRanges(pageDateRange, {
    start: pivotPeriods[0].start,
    end: pivotPeriods[pivotPeriods.length - 1].end,
  });

  const summaryPromise = fetchOptimizeSummaryData({
    days,
    startDate,
    endDate,
    brand: brandFilter !== "all" ? brandFilter : null,
    group: groupFilter !== "all" ? groupFilter : null,
    status: deliveryStatusFilter,
  })
    .then((summary) => ({
      summary,
      fetchError: null as string | null,
    }))
    .catch((e) => {
      console.error("[optimize] fetchOptimizeSummaryData threw:", e);
      return {
        summary: emptyOptimizeSummaryPayload([]),
        fetchError: e instanceof Error ? e.message : String(e),
      };
    });

  const pivotPromise: Promise<PeriodPivotPayload | null> =
    activeTab === "breakdown"
      ? fetchPeriodPivot({
          now: pivotAnchor,
          periodCount,
          frequency,
          metric,
          brand: brandFilter !== "all" ? brandFilter : null,
          group: groupFilter !== "all" ? groupFilter : null,
          status: deliveryStatusFilter,
          startDate: pivotDateRange.start,
          endDate: pivotDateRange.end,
        }).catch(async (e) => {
          console.error("[optimize] fetchPeriodPivot threw:", e);
          return {
            configured: false,
            missingEnv: [],
            periods: pivotPeriods,
            metric,
            query: null,
            campaigns: [],
            adSets: [],
            creatives: [],
            creativeAssets: {},
            snapshotByEntity: {},
          };
        })
      : Promise.resolve(null);

  const creativePromise =
    activeTab === "creatives" && canViewCreatives
      ? fetchCreativeAnalysisData({
          days,
          startDate,
          endDate,
          includeLive: true,
        }).catch((e) => {
          console.error("[optimize] fetchCreativeAnalysisData threw:", e);
          return {
            ...emptyCreativeAnalysisPayload([]),
            warnings: [e instanceof Error ? e.message : String(e)],
          };
        })
      : Promise.resolve(null);

  const savedDashboardsPromise =
    activeTab === "ai" && canViewAi
      ? fetchSavedAnalysisDashboards().catch((e) => {
          console.error("[optimize] fetchSavedAnalysisDashboards threw:", e);
          return [];
        })
      : Promise.resolve([]);

  const triagePromise =
    activeTab === "triage"
      ? fetchDashboardData({
          days,
          startDate,
          endDate,
          brand: brandFilter !== "all" ? brandFilter : null,
          group: groupFilter !== "all" ? groupFilter : null,
          status: deliveryStatusFilter,
        }).catch((e) => {
          console.error("[optimize] fetchDashboardData threw:", e);
          return emptyDashboardPayload([]);
        })
      : Promise.resolve(null);

  const [{ summary, fetchError }, pivot, creativeData, savedDashboards, triageData] =
    await Promise.all([
      summaryPromise,
      pivotPromise,
      creativePromise,
      savedDashboardsPromise,
      triagePromise,
    ]);

  // Build filter option lists from the data so the bar always offers brands
  // that actually have rows in the selected date range.
  const brandOptions = summary.brandOptions;
  const groupOptions = CAMPAIGN_UMBRELLAS.map((u) => ({
    value: u,
    label: u,
  }));

  // The Optimize summary fetch applies brand/group/date filters server-side.
  const filteredDailyTrend = summary.dailyTrend;

  // Status-sentence inputs.
  const winnersCount = summary.winnersCount;
  const criticalCount = summary.criticalCount;
  const spend7d = recentSpend(summary.dailyTrend, 7);
  const spend7dPrior = recentSpend(summary.dailyTrend, 7, 7);
  const spendDelta = spend7dPrior > 0 ? (spend7d - spend7dPrior) / spend7dPrior : null;

  const sentence = buildSentence({
    criticalCount,
    winnersCount,
    spend7d,
    spendDelta,
  });

  const moneyShort = new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
    notation: "compact",
  });

  const isEmpty = summary.creativeCount === 0 && spend7d === 0;

  return (
    <div className="space-y-6">
      <StatusSentence
        sentence={sentence}
        metrics={[
          {
            label: "Spend 7d",
            value: moneyShort.format(spend7d),
            delta: spendDelta == null
              ? null
              : { value: spendDelta * 100, positive: spendDelta >= 0 },
          },
          {
            label: "Creatives",
            value: String(summary.creativeCount),
          },
          {
            label: "Winners",
            value: String(winnersCount),
          },
          {
            label: "Needs review",
            value: String(criticalCount),
          },
        ]}
      />

      {fetchError ? (
        <section className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          Optimize summary could not load: {fetchError}
        </section>
      ) : null}

      {isEmpty && canRunSync ? (
        <section className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-stone-300 bg-white/60 p-8 text-center">
          <p className="text-sm text-stone-700">
            This environment has no Meta data yet. Run a sync to pull the
            current account into <span className="font-medium">staging</span> rows.
          </p>
          <RunSyncButton />
          <p className="text-[11px] text-stone-500">
            Reads from Meta with your existing token. Writes are fenced to{" "}
            <code className="rounded bg-stone-100 px-1">environment=staging</code>
            ; production rows are untouched.
          </p>
        </section>
      ) : null}

      <OptimizeTabs active={activeTab} params={params} />
      <OptimizeControls
        activeTab={activeTab}
        brands={brandOptions}
        groups={groupOptions}
        periods={periodCount}
        frequency={frequency}
        metric={metric}
      />

      {activeTab === "breakdown" && pivot ? (
        <section className="space-y-4">
          <TimeSeriesChart data={filteredDailyTrend} />
          <TreeTable payload={pivot} />
        </section>
      ) : null}

      {activeTab === "creatives" ? (
        canViewCreatives && creativeData ? (
          <CreativesPanel
            key={focus ?? "creatives"}
            data={creativeData}
            brand={brandFilter}
            group={groupFilter}
            delivery={statusFilter}
            focus={focus}
          />
        ) : (
          <PermissionPanel label="Creative diagnostics" />
        )
      ) : null}

      {activeTab === "ai" ? (
        <OptimizeAiPanel
          initialSaved={savedDashboards}
          canUseAdHocAnalysis={canViewAi}
          dateRange={{ days, startDate, endDate }}
          filters={{
            brand: brandFilter !== "all" ? brandFilter : null,
            group: groupFilter !== "all" ? groupFilter : null,
            status: deliveryStatusFilter,
          }}
        />
      ) : null}

      {activeTab === "triage" ? (
        triageData ? (
          <TriagePanel data={triageData} params={params} />
        ) : null
      ) : null}
    </div>
  );
}

// ── helpers ─────────────────────────────────────────────────────────────────

function recentSpend(
  trend: { date: string; spend: number }[],
  windowDays: number,
  offsetDays = 0,
): number {
  if (!trend.length) return 0;
  const sorted = [...trend].sort((a, b) => a.date.localeCompare(b.date));
  const end = sorted.length - offsetDays;
  const start = Math.max(0, end - windowDays);
  return sorted.slice(start, end).reduce((sum, r) => sum + (Number(r.spend) || 0), 0);
}

function intersectDateRanges(
  selected: { start: string; end: string; days: number },
  visiblePeriods: { start: string; end: string },
) {
  const start = selected.start > visiblePeriods.start ? selected.start : visiblePeriods.start;
  const end = selected.end < visiblePeriods.end ? selected.end : visiblePeriods.end;
  return { start, end };
}

function buildSentence(args: {
  criticalCount: number;
  winnersCount: number;
  spend7d: number;
  spendDelta: number | null;
}): string {
  const { criticalCount, winnersCount, spend7d, spendDelta } = args;

  if (criticalCount === 0 && winnersCount === 0 && spend7d === 0) {
    return "No delivery in this range. Run a sync or widen the date filter.";
  }

  const pieces: string[] = [];
  if (criticalCount > 0) {
    pieces.push(
      `${criticalCount} creative${criticalCount === 1 ? "" : "s"} need${
        criticalCount === 1 ? "s" : ""
      } attention.`,
    );
  }
  if (winnersCount > 0) {
    pieces.push(
      `${winnersCount} winner${winnersCount === 1 ? "" : "s"} ready to scale.`,
    );
  }
  if (spend7d > 0) {
    const dollars = new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      maximumFractionDigits: 0,
    }).format(spend7d);
    const deltaPart =
      spendDelta == null
        ? ""
        : ` (${spendDelta >= 0 ? "+" : ""}${Math.round(spendDelta * 100)}% vs prior week)`;
    pieces.push(`${dollars} spent last 7 days${deltaPart}.`);
  }

  return pieces.join(" ");
}

function PermissionPanel({ label }: { label: string }) {
  return (
    <section className="rounded-xl border border-stone-200 bg-white p-6 text-sm text-stone-600">
      You do not have access to {label}.
    </section>
  );
}
