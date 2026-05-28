import type { PersonalHeaderMetrics } from "../../../lib/inbox-metrics.ts";

const MIN_TREND_DELTA_MIN = 10;

// Positive improvement ("down N") when today is faster than yesterday.
export function formatTrendDelta(
  todaySec: number | null,
  yesterdaySec: number | null,
): string {
  if (todaySec === null || yesterdaySec === null) return "";
  const deltaMin = Math.round((yesterdaySec - todaySec) / 60);
  if (Math.abs(deltaMin) < MIN_TREND_DELTA_MIN) return "";
  return deltaMin > 0 ? `down ${deltaMin}` : `up ${Math.abs(deltaMin)}`;
}

export function ledeBeforeHours(m: PersonalHeaderMetrics): string {
  return `Business hours start at 10. ${m.pipeline.needsReply} from yesterday still need a reply.`;
}

export function ledeAfterHours(m: PersonalHeaderMetrics): string {
  const onTime = m.today.onTimeRate === null ? "—" : `${Math.round(m.today.onTimeRate * 100)}%`;
  return `Day's done. ${m.today.repliesSent} replies sent, ${onTime} on-time. See you tomorrow.`;
}

export function ledeAllCaughtUp(m: PersonalHeaderMetrics): string {
  return `All caught up. ${m.today.repliesSent} replies sent today.`;
}

export function ledeSlowStart(m: PersonalHeaderMetrics): string {
  return `Day's open. ${m.pipeline.needsReply} of your ${m.pipeline.assigned} need a reply.`;
}

export function ledeNormal(m: PersonalHeaderMetrics): string {
  const trend = formatTrendDelta(m.today.avgResponseSec, m.yesterday.avgResponseSec);
  const avg = m.today.avgResponseSec === null ? "—" : `${Math.round(m.today.avgResponseSec / 60)}m`;
  const trendClause = trend ? `, ${trend}` : "";
  return (
    `${m.pipeline.needsReply} of your ${m.pipeline.assigned} need a reply. ` +
    `${m.pipeline.atRisk} are urgent. Avg ${avg} today${trendClause}. Keep going.`
  );
}

export function selectLede(m: PersonalHeaderMetrics): string {
  if (m.windowState === "before_hours") return ledeBeforeHours(m);
  if (m.windowState === "after_hours") return ledeAfterHours(m);
  if (m.pipeline.needsReply === 0) return ledeAllCaughtUp(m);
  if (m.today.repliesSent === 0) return ledeSlowStart(m);
  return ledeNormal(m);
}

export function InboxMetricsHeaderLede({ metrics }: { metrics: PersonalHeaderMetrics }) {
  return (
    <div
      data-component="inbox-metrics-header-lede"
      className="border-b border-hp-rule px-1 pb-4 pt-4"
    >
      <h1 className="font-title text-[26px] leading-tight text-hp-ink oldstyle-nums">
        {selectLede(metrics)}
      </h1>
    </div>
  );
}
