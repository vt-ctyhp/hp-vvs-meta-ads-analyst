import { OptimizeFilterBar } from "@/components/v2/optimize/filter-bar";
import { PeriodControls } from "@/components/v2/optimize/period-controls";
import { RunSyncButton } from "@/components/v2/optimize/sync-button";
import { TimeSeriesChart } from "@/components/v2/optimize/time-series-chart";
import { TreeTable } from "@/components/v2/optimize/tree-table";
import { SignalStrip } from "@/components/v2/signal-strip";
import { StatusSentence } from "@/components/v2/status-sentence";
import { CAMPAIGN_UMBRELLAS } from "@/lib/campaign-umbrellas";
import { hasPermission } from "@/lib/access-control";
import {
  emptyOptimizeSummaryPayload,
  fetchOptimizeSummaryData,
  resolveOptimizeDateRange,
} from "@/lib/optimize-page-data";
import {
  fetchPeriodPivot,
  isPeriodMetric,
  normalizePeriodCount,
  type PeriodMetric,
  type PeriodPivotPayload,
} from "@/lib/period-pivot-data";
import { isFrequency, lastNPeriods, type Frequency } from "@/lib/period-windows";
import { requirePagePermission } from "@/lib/server-route-auth";
import { normalizeOptimizeStatusSelection } from "@/lib/optimize-filters";

export const dynamic = "force-dynamic";

type SearchParams = {
  brand?: string;
  group?: string;
  days?: string;
  start?: string;
  end?: string;
  status?: string;
  minSpend?: string;
  /** Period-pivot table state — defaults to 4 / week / primary_results. */
  periods?: string;
  freq?: string;
  metric?: string;
};

export default async function OptimizePage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const profile = await requirePagePermission("view_dashboard", "/optimize");
  const canRunSync = hasPermission(profile.roles, "run_meta_sync");

  const params = await searchParams;
  const days = Number.isFinite(Number(params.days)) ? Number(params.days) : 30;

  // Filter-bar inputs. Status defaults to "live" so the operator lands on
  // currently-active inventory; explicit URL params override.
  const statusFilter = normalizeOptimizeStatusSelection(params.status) ?? "live";
  const deliveryStatusFilter = statusFilter === "all" ? null : statusFilter;
  const brandFilter = params.brand ?? "all";
  const groupFilter = params.group ?? "all";
  const pageDateRange = resolveOptimizeDateRange({
    days,
    startDate: params.start ?? null,
    endDate: params.end ?? null,
  });

  // Range filter — preset OR custom start/end. The pivot table anchors
  // its rightmost period to the end of the range (today for presets).
  const pivotAnchor = new Date(`${pageDateRange.end}T12:00:00Z`);

  // Period-pivot controls — defaults: 4 weeks of Primary KPI.
  const periodCount = normalizePeriodCount(params.periods);
  const frequency: Frequency = isFrequency(params.freq) ? params.freq : "week";
  const metric: PeriodMetric = isPeriodMetric(params.metric)
    ? params.metric
    : "primary_results";
  const pivotPeriods = lastNPeriods(pivotAnchor, periodCount, frequency);
  const dataDateRange = intersectDateRanges(pageDateRange, {
    start: pivotPeriods[0].start,
    end: pivotPeriods[pivotPeriods.length - 1].end,
  });

  const summaryPromise = fetchOptimizeSummaryData({
    days: dataDateRange.days,
    startDate: dataDateRange.start,
    endDate: dataDateRange.end,
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

  const pivotPromise: Promise<PeriodPivotPayload> = fetchPeriodPivot({
    now: pivotAnchor,
    periodCount,
    frequency,
    metric,
    brand: brandFilter !== "all" ? brandFilter : null,
    group: groupFilter !== "all" ? groupFilter : null,
    status: deliveryStatusFilter,
    startDate: dataDateRange.start,
    endDate: dataDateRange.end,
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
  });

  const [{ summary }, pivot] = await Promise.all([
    summaryPromise,
    pivotPromise,
  ]);

  // Build filter option lists from the data so the bar always offers brands
  // that actually have rows in the selected date range.
  const brandOptions = summary.brandOptions;
  const groupOptions = CAMPAIGN_UMBRELLAS.map((u) => ({
    value: u,
    label: u,
  }));

  // The Optimize summary fetch applies brand/group/date/status filters server-side,
  // so the chart and headline stats no longer need the full dashboard payload.
  const filteredDailyTrend = summary.dailyTrend;

  // Status-sentence inputs.
  const winnersCount = summary.winnersCount;
  const criticalCount = summary.criticalCount;
  const spendInRange = summary.spendTotal;

  const sentence = buildSentence({
    criticalCount,
    winnersCount,
    spendInRange,
  });

  const moneyShort = new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
    notation: "compact",
  });

  const isEmpty = summary.creativeCount === 0 && spendInRange === 0;

  return (
    <div className="space-y-6">
      <StatusSentence
        sentence={sentence}
        metrics={[
          {
            label: "Spend",
            value: moneyShort.format(spendInRange),
            delta: null,
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

      <SignalStrip room="optimize" />

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

      <TimeSeriesChart data={filteredDailyTrend} metric={metric} />

      {/* Consolidated filter + period-control bar. Two rows in one
          container so the operator reads "filters + grouping" as one
          coordinated control surface. */}
      <section
        aria-label="Optimize filters and period grouping"
        className="overflow-hidden rounded-xl border border-stone-200 bg-white"
      >
        <OptimizeFilterBar brands={brandOptions} groups={groupOptions} />
        <div className="border-t border-stone-200" />
        <PeriodControls periods={periodCount} frequency={frequency} metric={metric} />
      </section>

      <TreeTable payload={pivot} />
    </div>
  );
}

// ── helpers ─────────────────────────────────────────────────────────────────

function intersectDateRanges(
  selected: { start: string; end: string; days: number },
  visiblePeriods: { start: string; end: string },
) {
  const start = selected.start > visiblePeriods.start ? selected.start : visiblePeriods.start;
  const end = selected.end < visiblePeriods.end ? selected.end : visiblePeriods.end;
  return {
    start,
    end,
    days: daysBetween(start, end),
  };
}

function daysBetween(start: string, end: string) {
  const startTime = new Date(`${start}T00:00:00Z`).getTime();
  const endTime = new Date(`${end}T00:00:00Z`).getTime();
  return Math.max(1, Math.round((endTime - startTime) / 86_400_000) + 1);
}

function buildSentence(args: {
  criticalCount: number;
  winnersCount: number;
  spendInRange: number;
}): string {
  const { criticalCount, winnersCount, spendInRange } = args;

  if (criticalCount === 0 && winnersCount === 0 && spendInRange === 0) {
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
  if (spendInRange > 0) {
    const dollars = new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      maximumFractionDigits: 0,
    }).format(spendInRange);
    pieces.push(`${dollars} spent in this range.`);
  }

  return pieces.join(" ");
}
