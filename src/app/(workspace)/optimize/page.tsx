import { CreativeGrid } from "@/components/v2/optimize/creative-grid";
import { OptimizeFilterBar } from "@/components/v2/optimize/filter-bar";
import { RunSyncButton } from "@/components/v2/optimize/sync-button";
import { TimeSeriesChart } from "@/components/v2/optimize/time-series-chart";
import { SignalStrip } from "@/components/v2/signal-strip";
import { StatusSentence } from "@/components/v2/status-sentence";
import { fetchDashboardData } from "@/lib/analytics";
import { CAMPAIGN_UMBRELLAS } from "@/lib/campaign-umbrellas";
import { hasPermission } from "@/lib/access-control";
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
  const dashboard = await fetchDashboardData({
    days,
    startDate: params.start ?? null,
    endDate: params.end ?? null,
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

  // Apply UI-side filters on top of what the server already aggregated.
  const minSpend = Number(params.minSpend) || 0;
  const statusFilter = (params.status ?? "all").toLowerCase();
  const brandFilter = params.brand ?? "all";
  const groupFilter = params.group ?? "all";

  const filteredCreatives = dashboard.creatives.filter((row) => {
    if (brandFilter !== "all" && row.brandCode !== brandFilter) return false;
    if (groupFilter !== "all" && row.campaignUmbrella !== groupFilter) return false;
    if (minSpend > 0 && row.spend < minSpend) return false;
    if (statusFilter !== "all") {
      const eff = (row.effectiveStatus ?? row.status ?? "").toLowerCase();
      if (statusFilter === "live" && !eff.includes("active")) return false;
      if (statusFilter === "paused" && !eff.includes("paused")) return false;
      if (
        statusFilter === "off" &&
        !["delete", "archived", "disapproved"].some((k) => eff.includes(k))
      ) {
        return false;
      }
    }
    return true;
  });

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

      <OptimizeFilterBar brands={brandOptions} groups={groupOptions} />

      <TimeSeriesChart data={dashboard.dailyTrend} />

      <CreativeGrid rows={filteredCreatives} />
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
