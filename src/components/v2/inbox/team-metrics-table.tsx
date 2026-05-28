import type { Period, TeamRow } from "../../../lib/inbox-metrics.ts";

export function TeamMetricsTable({ rows }: { rows: TeamRow[]; period: Period }) {
  return <div data-component="team-metrics-table">{rows.length} rows</div>;
}
