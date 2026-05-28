import type { DailyHistoryRow } from "../../../lib/inbox-metrics.ts";

export function TeamTrendChart({ points }: { points: DailyHistoryRow[] }) {
  return <div data-component="team-trend-chart">{points.length} points</div>;
}
