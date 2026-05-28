import { Group } from "@visx/group";
import { scaleLinear, scaleTime } from "@visx/scale";
import { LinePath } from "@visx/shape";

import type { DailyHistoryRow } from "../../../lib/inbox-metrics.ts";

const WIDTH = 640;
const HEIGHT = 220;
const MARGIN = { top: 16, right: 16, bottom: 28, left: 40 };

export function TeamTrendChart({ points }: { points: DailyHistoryRow[] }) {
  const usable = points.filter((p) => p.avgResponseSec !== null) as {
    date: string;
    avgResponseSec: number;
  }[];
  if (usable.length === 0) {
    return (
      <div
        data-component="team-trend-chart-empty"
        className="border border-hp-rule px-4 py-8 text-center text-[11px] smallcaps text-hp-muted"
      >
        No history yet
      </div>
    );
  }

  const innerW = WIDTH - MARGIN.left - MARGIN.right;
  const innerH = HEIGHT - MARGIN.top - MARGIN.bottom;
  const xs = usable.map((p) => new Date(`${p.date}T00:00:00Z`));
  const ys = usable.map((p) => p.avgResponseSec / 60); // minutes

  const xScale = scaleTime({
    domain: [xs[0], xs[xs.length - 1]],
    range: [0, innerW],
  });
  const yScale = scaleLinear({
    domain: [0, Math.max(...ys) * 1.1],
    range: [innerH, 0],
    nice: true,
  });

  return (
    <svg
      data-component="team-trend-chart"
      width={WIDTH}
      height={HEIGHT}
      role="img"
      aria-label="Average response time trend"
    >
      <Group left={MARGIN.left} top={MARGIN.top}>
        <LinePath
          data={usable}
          x={(d) => xScale(new Date(`${d.date}T00:00:00Z`)) ?? 0}
          y={(d) => yScale(d.avgResponseSec / 60) ?? 0}
          stroke="currentColor"
          strokeWidth={1.5}
          className="text-hp-ink"
          fill="none"
        />
      </Group>
    </svg>
  );
}
