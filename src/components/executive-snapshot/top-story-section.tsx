import type { ActionBucket, ActionItem, DashboardPayload } from "@/lib/analytics";
import { buildExecutiveHeadline, type HeadlineTone } from "@/lib/executive-headline";
import { TERMS } from "@/lib/glossary";
import type { WowMode } from "@/lib/wow-window";

import { HeroNumber } from "../hero-number";
import { WeekWindowToggle } from "../week-window-toggle";

const TONE_COLOR: Record<HeadlineTone, string> = {
  positive: "#245D4D",
  warning: "#8D2E2E",
  neutral: "inherit",
};

export function TopStorySection({
  data,
  wow,
}: {
  data: DashboardPayload;
  wow: WowMode | null;
}) {
  const range = data.sourceTransparency.timeRange;
  const overview = data.overview;
  const prior = data.comparison.overview;

  const topUmbrella = pickTopUmbrellaByResultsDelta(data);
  const headline = buildExecutiveHeadline({
    spend: { current: overview.spend, previous: prior.spend },
    primaryResults: {
      current: overview.primaryResults,
      previous: prior.primaryResults,
    },
    topUmbrella,
  });

  const sparklines = sparklineSeries(data);
  const spendDeltaPct = percentChange(overview.spend, prior.spend);
  const resultsDeltaPct = percentChange(overview.primaryResults, prior.primaryResults);

  const queueCounts = countActionQueue(data.actionQueue);

  return (
    <section className="mb-2">
      <header className="flex flex-col gap-3 border-b border-hp-rule pb-4 md:flex-row md:items-end md:justify-between md:gap-6">
        <div>
          <p className="text-[10px] uppercase tracking-[0.14em] text-hp-muted">
            Executive Overview
          </p>
          <h1 className="mt-2 font-title text-2xl leading-tight text-hp-ink md:text-3xl">
            Week of {formatDateRange(range.start, range.end)}
          </h1>
        </div>
        <WeekWindowToggle defaultMode={wow ?? "cal"} />
      </header>

      <p
        className="mt-6 max-w-4xl font-title text-2xl leading-snug md:text-[28px]"
        style={{ color: TONE_COLOR[headline.tone] }}
      >
        {headline.sentence}
      </p>

      <div className="mt-6 grid gap-3 md:grid-cols-3">
        <HeroNumber
          label="Total Spend"
          value={formatMoney(overview.spend)}
          delta={
            <DeltaPill change={spendDeltaPct} lowerIsBetter footnote="vs last week" />
          }
          sparkline={sparklines.spend}
        />
        <HeroNumber
          label={TERMS.primaryKpi}
          value={formatNumber(overview.primaryResults)}
          delta={<DeltaPill change={resultsDeltaPct} footnote="vs last week" />}
          footnote="Mixed units across umbrellas — see per-umbrella below."
          sparkline={sparklines.primaryResults}
        />
        <HeroNumber
          label="Needs Attention"
          value={queueCounts.total === 0 ? "0" : String(queueCounts.total)}
          delta={
            queueCounts.total > 0 ? (
              <span className="text-[10px] uppercase tracking-[0.14em] text-hp-muted">
                {queueCounts.scale > 0 ? `${queueCounts.scale} to scale` : null}
                {queueCounts.scale > 0 && queueCounts.fix > 0 ? " · " : null}
                {queueCounts.fix > 0 ? `${queueCounts.fix} to fix` : null}
              </span>
            ) : (
              <span className="text-[10px] uppercase tracking-[0.14em] text-hp-muted">
                Nothing urgent
              </span>
            )
          }
          footnote="Rule-derived from current period; full list lands Day 8."
        />
      </div>
    </section>
  );
}

// ── derivations ───────────────────────────────────────────────────────────

function pickTopUmbrellaByResultsDelta(
  data: DashboardPayload,
): { name: string; primaryResultsDelta: number } | undefined {
  const priorById = new Map(data.comparison.byUmbrella.map((row) => [row.id, row]));
  let best: { name: string; primaryResultsDelta: number } | undefined;
  let bestMagnitude = 0;
  for (const row of data.byUmbrella) {
    const priorRow = priorById.get(row.id);
    const delta = row.primaryResults - (priorRow?.primaryResults ?? 0);
    if (Math.abs(delta) > bestMagnitude) {
      bestMagnitude = Math.abs(delta);
      best = { name: row.name, primaryResultsDelta: delta };
    }
  }
  return best;
}

function sparklineSeries(data: DashboardPayload): {
  spend: number[];
  primaryResults: number[];
} {
  const byDate = new Map<string, { spend: number; primaryResults: number }>();
  for (const row of data.dailyTrend) {
    const existing = byDate.get(row.date) || { spend: 0, primaryResults: 0 };
    existing.spend += row.spend;
    existing.primaryResults += row.primaryResults;
    byDate.set(row.date, existing);
  }
  const ordered = Array.from(byDate.entries()).sort(([a], [b]) => a.localeCompare(b));
  return {
    spend: ordered.map(([, v]) => v.spend),
    primaryResults: ordered.map(([, v]) => v.primaryResults),
  };
}

function countActionQueue(items: ActionItem[]) {
  const counts: Record<ActionBucket, number> = { scale: 0, fix: 0, watch: 0 };
  for (const item of items) counts[item.bucket] += 1;
  return { ...counts, total: counts.scale + counts.fix + counts.watch };
}

// ── tiny presentational helpers ───────────────────────────────────────────

function DeltaPill({
  change,
  lowerIsBetter,
  footnote,
}: {
  change: number | null;
  lowerIsBetter?: boolean;
  footnote: string;
}) {
  if (change == null) {
    return (
      <span className="text-[10px] uppercase tracking-[0.14em] text-hp-muted">
        — {footnote}
      </span>
    );
  }
  const isFlat = Math.abs(change) < 3;
  if (isFlat) {
    return (
      <span className="text-[11px] uppercase tracking-[0.14em] text-hp-muted">
        Flat {footnote}
      </span>
    );
  }
  const isUp = change > 0;
  const isGood = lowerIsBetter ? !isUp : isUp;
  const color = isGood ? "#245D4D" : "#8D2E2E";
  const arrow = isUp ? "▲" : "▼";
  return (
    <span
      className="inline-flex items-baseline gap-1 text-[11px] font-body tabular-nums"
      style={{ color }}
    >
      <span aria-hidden className="text-[10px]">{arrow}</span>
      <span>{Math.round(Math.abs(change))}%</span>
      <span className="ml-1 text-[10px] uppercase tracking-[0.14em] text-hp-muted">
        {footnote}
      </span>
    </span>
  );
}

function percentChange(current: number, previous: number): number | null {
  if (!Number.isFinite(previous) || previous === 0) return null;
  return ((current - previous) / Math.abs(previous)) * 100;
}

const MONEY = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
});
const COUNT = new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 });

function formatMoney(value: number) {
  return MONEY.format(value);
}
function formatNumber(value: number) {
  return COUNT.format(value);
}
function formatDateRange(start: string | null, end: string | null) {
  if (!start || !end) return "—";
  return `${formatMonthDay(start)} – ${formatMonthDay(end)}`;
}
function formatMonthDay(iso: string) {
  const date = new Date(`${iso}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return iso;
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  }).format(date);
}
