import type { ActionBucket, ActionItem, DashboardPayload } from "@/lib/analytics";
import { buildExecutiveHeadline, type HeadlineTone } from "@/lib/executive-headline";
import { TERMS } from "@/lib/glossary";
import type { WowMode } from "@/lib/wow-window";

import { HeroNumber } from "../hero-number";
import { WeekWindowToggle } from "../week-window-toggle";

const TONE_COLOR: Record<HeadlineTone, string> = {
  positive: "#245D4D",
  warning: "#8D2E2E",
  neutral: "var(--ink-primary)",
};

/**
 * Section I — the front-page story.
 *
 * Visual structure (top to bottom):
 *   1. Editorial header strip   — Roman chapter mark + section title + WoW toggle
 *   2. Italic running date        ("for the week of …")
 *   3. The pull-quote sentence    (display serif, weight by tone)
 *   4. Three hero columns         (Total Spend · Primary KPI · Needs Attention)
 *
 * The pull-quote is the focal point. Everything above it labels the moment;
 * everything below it explains the moment in numbers.
 */
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
    <section className="pt-8 md:pt-10">
      {/* Chapter mark · section title · WoW toggle */}
      <header className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div className="flex items-baseline gap-3">
          <span
            aria-hidden
            className="font-title oldstyle-nums text-[28px] leading-none text-hp-gilt md:text-[32px]"
          >
            I.
          </span>
          <div>
            <p className="smallcaps text-[10px] text-hp-muted">
              The Week in Performance
            </p>
            <p className="mt-1 font-title text-[15px] italic leading-snug text-hp-body">
              for the week of {formatDateRange(range.start, range.end)}
            </p>
          </div>
        </div>
        <WeekWindowToggle defaultMode={wow ?? "cal"} />
      </header>

      {/* The pull-quote. Hanging dash + display serif. */}
      <figure className="mt-7 md:mt-9">
        <blockquote
          className="font-title text-[32px] leading-[1.18] md:text-[40px] md:leading-[1.15]"
          style={{ color: TONE_COLOR[headline.tone] }}
        >
          <span aria-hidden className="mr-2 text-hp-gilt">—</span>
          {headline.sentence}
        </blockquote>
        <figcaption className="mt-3 smallcaps text-[10px] text-hp-muted">
          The lede, derived from this week vs. the prior comparable window
        </figcaption>
      </figure>

      {/* Three measured columns. Hairline gilt rules between, no card frames. */}
      <div className="mt-8 grid gap-px bg-hp-rule-soft md:grid-cols-3">
        <HeroNumber
          label="Total Spend"
          value={formatMoney(overview.spend)}
          delta={
            <DeltaPill change={spendDeltaPct} lowerIsBetter footnote="vs last week" />
          }
          sparkline={sparklines.spend}
          maturity="leading"
        />
        <HeroNumber
          label={TERMS.primaryKpi}
          value={formatNumber(overview.primaryResults)}
          delta={<DeltaPill change={resultsDeltaPct} footnote="vs last week" />}
          footnote="Mixed units across umbrellas — see per-umbrella below."
          sparkline={sparklines.primaryResults}
          maturity="leading"
        />
        <HeroNumber
          label="Needs Attention"
          value={queueCounts.total === 0 ? "0" : String(queueCounts.total)}
          delta={
            queueCounts.total > 0 ? (
              <span className="smallcaps text-[10px] text-hp-muted">
                {queueCounts.scale > 0 ? `${queueCounts.scale} to scale` : null}
                {queueCounts.scale > 0 && queueCounts.fix > 0 ? " · " : null}
                {queueCounts.fix > 0 ? `${queueCounts.fix} to fix` : null}
              </span>
            ) : (
              <span className="smallcaps text-[10px] text-hp-muted">
                Nothing urgent
              </span>
            )
          }
          footnote="Rule-derived signals; full list below."
          maturity="leading"
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
      <span className="smallcaps text-[10px] text-hp-muted">
        — {footnote}
      </span>
    );
  }
  const isFlat = Math.abs(change) < 3;
  if (isFlat) {
    return (
      <span className="smallcaps text-[10px] text-hp-muted">
        Flat {footnote}
      </span>
    );
  }
  const isUp = change > 0;
  const isGood = lowerIsBetter ? !isUp : isUp;
  const color = isGood ? "var(--positive)" : "var(--danger)";
  const arrow = isUp ? "▲" : "▼";
  return (
    <span
      className="inline-flex items-baseline gap-1 text-[12px] font-body tabular-nums italic"
      style={{ color }}
    >
      <span aria-hidden className="text-[9px] not-italic">{arrow}</span>
      <span className="oldstyle-nums">{Math.round(Math.abs(change))}%</span>
      <span className="ml-1 smallcaps text-[10px] not-italic text-hp-muted">
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
