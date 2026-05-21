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
} from "@/lib/optimize-page-data";
import {
  fetchPeriodPivot,
  isPeriodMetric,
  normalizePeriodCount,
  type PeriodMetric,
  type PeriodPivotPayload,
} from "@/lib/period-pivot-data";
import { isFrequency, type Frequency } from "@/lib/period-windows";
import { requirePagePermission } from "@/lib/server-route-auth";

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
  const statusFilter = (params.status ?? "live").toLowerCase();
  const brandFilter = params.brand ?? "all";
  const groupFilter = params.group ?? "all";

  // Range filter — preset OR custom start/end. The pivot table anchors
  // its rightmost period to the end of the range (today for presets).
  const customEnd = params.end?.trim() || null;
  const pivotAnchor =
    customEnd && /^\d{4}-\d{2}-\d{2}$/.test(customEnd)
      ? new Date(`${customEnd}T12:00:00Z`)
      : new Date();

  // Period-pivot controls — defaults: 4 weeks of Primary KPI.
  const periodCount = normalizePeriodCount(params.periods);
  const frequency: Frequency = isFrequency(params.freq) ? params.freq : "week";
  const metric: PeriodMetric = isPeriodMetric(params.metric)
    ? params.metric
    : "primary_results";

  const summaryPromise = fetchOptimizeSummaryData({
    days,
    startDate: params.start ?? null,
    endDate: params.end ?? null,
    brand: brandFilter !== "all" ? brandFilter : null,
    group: groupFilter !== "all" ? groupFilter : null,
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
  }).catch(async (e) => {
    console.error("[optimize] fetchPeriodPivot threw:", e);
    const { lastNPeriods } = await import("@/lib/period-windows");
    return {
      configured: false,
      missingEnv: [],
      periods: lastNPeriods(pivotAnchor, periodCount, frequency),
      metric,
      query: null,
      campaigns: [],
      adSets: [],
      creatives: [],
      creativeAssets: {},
    };
  });

  const [{ summary, fetchError }, pivot] = await Promise.all([
    summaryPromise,
    pivotPromise,
  ]);
  // Diagnostic logging visible in Vercel function logs.
  const { getMissingRequiredEnv } = await import("@/lib/env");
  console.log("[optimize] lean payload sizes", {
    configured: summary.configured,
    payloadMissingEnv: summary.missingEnv,
    currentMissingEnv: getMissingRequiredEnv(),
    creatives: summary.creativeCount,
    brandOptions: summary.brandOptions.length,
    dailyTrend: summary.dailyTrend.length,
    generatedAt: summary.generatedAt,
    fetchError,
  });

  // Build filter option lists from the data so the bar always offers brands
  // that actually have rows in the selected date range.
  const brandOptions = summary.brandOptions;
  const groupOptions = CAMPAIGN_UMBRELLAS.map((u) => ({
    value: u,
    label: u,
  }));

  // The Optimize summary fetch applies brand/group/date filters server-side,
  // so the chart and headline stats no longer need the full dashboard payload.
  const filteredDailyTrend = summary.dailyTrend;
  // statusFilter intentionally left unused for chart + pivot — the RPC
  // doesn't carry an ad-status field, and "current status" doesn't
  // meaningfully apply to historical daily aggregates anyway. Status
  // becomes meaningful again when ad-level enrichment lands in v2.
  void statusFilter;

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

      <TimeSeriesChart data={filteredDailyTrend} />

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
