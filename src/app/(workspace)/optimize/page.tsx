import { OptimizeFilterBar } from "@/components/v2/optimize/filter-bar";
import { PeriodControls } from "@/components/v2/optimize/period-controls";
import { RunSyncButton } from "@/components/v2/optimize/sync-button";
import { TimeSeriesChart } from "@/components/v2/optimize/time-series-chart";
import { TreeTable } from "@/components/v2/optimize/tree-table";
import { SignalStrip } from "@/components/v2/signal-strip";
import { StatusSentence } from "@/components/v2/status-sentence";
import { fetchDashboardData } from "@/lib/analytics";
import { CAMPAIGN_UMBRELLAS } from "@/lib/campaign-umbrellas";
import { hasPermission } from "@/lib/access-control";
import {
  fetchPeriodPivot,
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

const ALLOWED_PERIODS = new Set([1, 4, 8, 12]);
const ALLOWED_METRICS: PeriodMetric[] = [
  "spend",
  "primary_results",
  "cost_per_primary_results",
  "ctr",
  "impressions",
  "cpc",
];

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
  const requestedPeriods = Number(params.periods);
  const periodCount = ALLOWED_PERIODS.has(requestedPeriods) ? requestedPeriods : 4;
  const frequency: Frequency = isFrequency(params.freq) ? params.freq : "week";
  const metric: PeriodMetric =
    ALLOWED_METRICS.includes(params.metric as PeriodMetric)
      ? (params.metric as PeriodMetric)
      : "primary_results";

  let dashboard: Awaited<ReturnType<typeof fetchDashboardData>>;
  let fetchError: string | null = null;
  try {
    dashboard = await fetchDashboardData({
      days,
      startDate: params.start ?? null,
      endDate: params.end ?? null,
    });
  } catch (e) {
    fetchError = e instanceof Error ? e.message : String(e);
    console.error("[optimize] fetchDashboardData threw:", e);
    const { emptyDashboardPayload } = await import("@/lib/analytics");
    dashboard = emptyDashboardPayload([]);
  }

  // Period-pivot fetch runs alongside the legacy dashboard fetch. Failure
  // here renders an empty payload — the rest of /optimize still works.
  let pivot: PeriodPivotPayload;
  try {
    pivot = await fetchPeriodPivot({
      now: pivotAnchor,
      periodCount,
      frequency,
      metric,
      brand: brandFilter !== "all" ? brandFilter : null,
      group: groupFilter !== "all" ? groupFilter : null,
    });
  } catch (e) {
    console.error("[optimize] fetchPeriodPivot threw:", e);
    const { lastNPeriods } = await import("@/lib/period-windows");
    pivot = {
      configured: false,
      missingEnv: [],
      periods: lastNPeriods(pivotAnchor, periodCount, frequency),
      metric,
      campaigns: [],
      adSets: [],
      creatives: [],
      creativeAssets: {},
    };
  }
  // Diagnostic logging visible in Vercel function logs.
  const { getMissingRequiredEnv } = await import("@/lib/env");
  console.log("[optimize] dashboard payload sizes", {
    configured: dashboard.configured,
    payloadMissingEnv: dashboard.missingEnv,
    currentMissingEnv: getMissingRequiredEnv(),
    creatives: dashboard.creatives.length,
    campaigns: dashboard.campaigns.length,
    adSets: dashboard.adSets.length,
    byBrand: dashboard.byBrand.length,
    byUmbrella: dashboard.byUmbrella.length,
    dailyTrend: dashboard.dailyTrend.length,
    generatedAt: dashboard.generatedAt,
    fetchError,
  });

  // Build filter option lists from the data so the bar always offers the
  // brands/groups that actually have rows in scope.
  const brandOptions = dashboard.byBrand.map((b) => ({
    value: b.brandCode,
    label: b.name || b.brandCode,
  }));
  const groupOptions = CAMPAIGN_UMBRELLAS.map((u) => ({
    value: u,
    label: u,
  }));

  // Filter the daily trend client-side by brand + group so the historical
  // chart reflects the same filters the rest of the page uses. The
  // dailyTrend bundle is grouped by (date, brand, campaign_umbrella) so
  // both filters are safe to apply. (Range is already applied server-side
  // via the date params passed to fetchDashboardData.)
  const filteredDailyTrend = dashboard.dailyTrend.filter((row) => {
    if (brandFilter !== "all" && row.brandCode !== brandFilter) return false;
    if (groupFilter !== "all" && row.campaignUmbrella !== groupFilter) return false;
    return true;
  });
  // statusFilter intentionally left unused for chart + pivot — the RPC
  // doesn't carry an ad-status field, and "current status" doesn't
  // meaningfully apply to historical daily aggregates anyway. Status
  // becomes meaningful again when ad-level enrichment lands in v2.
  void statusFilter;

  // Status-sentence inputs.
  const winnersCount = dashboard.actionQueue.filter((a) => a.bucket === "scale").length;
  const criticalCount =
    dashboard.actionQueue.filter((a) => a.bucket === "fix" || a.bucket === "watch").length;
  const spend7d = recentSpend(dashboard.dailyTrend, 7);
  const spend7dPrior = recentSpend(dashboard.dailyTrend, 7, 7);
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

  const isEmpty = dashboard.creatives.length === 0 && spend7d === 0;

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
            value: String(dashboard.creatives.length),
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
