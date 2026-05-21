"use client";

import { AxisBottom, AxisLeft } from "@visx/axis";
import { curveMonotoneX } from "@visx/curve";
import { GridRows } from "@visx/grid";
import { Group } from "@visx/group";
import { ParentSize } from "@visx/responsive";
import { scaleLinear, scaleTime } from "@visx/scale";
import { AreaClosed, LinePath } from "@visx/shape";
import { useMemo } from "react";

import type { DailyTrendRow } from "@/lib/analytics";
import type { PeriodMetric } from "@/lib/period-pivot-data";

/**
 * Time-series chart for the Optimize room.
 *
 * Two stacked-ish series: selected metric (line) + spend (filled area).
 * Brush + comparison toggle land in a follow-up; for now this is a clean
 * daily view that respects the page filters via the data prop.
 *
 * Visx is composable so we wire only what we need: ParentSize → scales →
 * GridRows → AreaClosed (spend) + LinePath (selected metric) + Axes.
 */

type Props = {
  /** Daily trend, already filtered to the current brand/group/date range. */
  data: DailyTrendRow[];
  /** Metric selected in the filter box; plotted as the accent line. */
  metric?: PeriodMetric;
  /** Optional accent color for the primary-result line. */
  accent?: string;
};

const margin = { top: 16, right: 24, bottom: 28, left: 56 };
const CHART_METRIC_LABELS: Record<PeriodMetric, string> = {
  spend: "Spend",
  primary_results: "Primary KPI",
  cost_per_primary_results: "$/Primary KPI",
  ctr: "CTR",
  impressions: "Impressions",
  cpc: "CPC",
};

export function TimeSeriesChart({
  data,
  metric = "primary_results",
  accent = "#E14B7B",
}: Props) {
  // Aggregate the daily trend rows by date so multiple brands/umbrellas
  // collapse into a single visible series.
  const series = useMemo(() => {
    const byDate = new Map<
      string,
      {
        date: Date;
        spend: number;
        primaryResults: number;
        impressions: number;
        clicks: number;
      }
    >();
    for (const row of data) {
      const existing = byDate.get(row.date);
      const point = existing ?? {
        date: new Date(`${row.date}T00:00:00Z`),
        spend: 0,
        primaryResults: 0,
        impressions: 0,
        clicks: 0,
      };
      point.spend += Number(row.spend) || 0;
      point.primaryResults += Number(row.primaryResults) || 0;
      point.impressions += Number(row.impressions) || 0;
      point.clicks += Number(row.clicks) || 0;
      byDate.set(row.date, point);
    }
    return Array.from(byDate.values())
      .sort((a, b) => a.date.getTime() - b.date.getTime())
      .map((point) => ({
        ...point,
        metricValue: resolveChartMetric(point, metric),
      }));
  }, [data, metric]);

  if (series.length === 0) {
    return (
      <div className="grid h-64 place-items-center rounded-xl border border-stone-200 bg-white text-sm text-stone-500">
        No data in this range.
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-stone-200 bg-white p-3">
      <ParentSize parentSizeStyles={{ height: 280 }}>
        {({ width, height }) => {
          const innerWidth = Math.max(0, width - margin.left - margin.right);
          const innerHeight = Math.max(0, height - margin.top - margin.bottom);
          const xScale = scaleTime({
            domain: [
              series[0].date,
              series[series.length - 1].date,
            ] as [Date, Date],
            range: [0, innerWidth],
          });
          const ySpendScale = scaleLinear<number>({
            domain: [0, Math.max(...series.map((d) => d.spend), 1) * 1.1],
            range: [innerHeight, 0],
            nice: true,
          });
          const yResultsScale = scaleLinear<number>({
            domain: [
              0,
              Math.max(...series.map((d) => d.metricValue), 1) * 1.1,
            ],
            range: [innerHeight, 0],
            nice: true,
          });

          return (
            <svg
              width={width}
              height={height}
              role="img"
              aria-label={`Daily spend and ${CHART_METRIC_LABELS[metric]}`}
            >
              <Group left={margin.left} top={margin.top}>
                <GridRows
                  scale={ySpendScale}
                  width={innerWidth}
                  stroke="#E6DFD2"
                  strokeDasharray="2,2"
                  numTicks={4}
                />
                <AreaClosed<typeof series[number]>
                  data={series}
                  x={(d) => xScale(d.date) ?? 0}
                  y={(d) => ySpendScale(d.spend) ?? 0}
                  yScale={ySpendScale}
                  curve={curveMonotoneX}
                  fill="#1F4B8A"
                  fillOpacity={0.12}
                  stroke="#1F4B8A"
                  strokeWidth={1.5}
                />
                <LinePath<typeof series[number]>
                  data={series}
                  x={(d) => xScale(d.date) ?? 0}
                  y={(d) => yResultsScale(d.metricValue) ?? 0}
                  curve={curveMonotoneX}
                  stroke={accent}
                  strokeWidth={2}
                  strokeOpacity={0.95}
                />
                <AxisLeft
                  scale={ySpendScale}
                  numTicks={4}
                  hideAxisLine
                  hideTicks
                  tickLabelProps={() => ({
                    fontSize: 10,
                    fill: "#5A5346",
                    dx: -4,
                    dy: 3,
                    textAnchor: "end",
                  })}
                  tickFormat={(v) =>
                    Number(v) >= 1000
                      ? `$${Math.round(Number(v) / 1000)}k`
                      : `$${Math.round(Number(v))}`
                  }
                />
                <AxisBottom
                  top={innerHeight}
                  scale={xScale}
                  numTicks={Math.min(6, series.length)}
                  hideAxisLine
                  hideTicks
                  tickLabelProps={() => ({
                    fontSize: 10,
                    fill: "#5A5346",
                    dy: 4,
                    textAnchor: "middle",
                  })}
                  tickFormat={(d) => {
                    const date = d as Date;
                    return `${date.getUTCMonth() + 1}/${date.getUTCDate()}`;
                  }}
                />
              </Group>
            </svg>
          );
        }}
      </ParentSize>
      <div className="mt-1 flex items-center gap-4 px-2 text-[11px] text-stone-600">
        <Legend dot="#1F4B8A" filled label="Spend" />
        <Legend
          dot={accent}
          label={metric === "spend" ? "Spend line" : CHART_METRIC_LABELS[metric]}
        />
      </div>
    </div>
  );
}

function resolveChartMetric(
  point: {
    spend: number;
    primaryResults: number;
    impressions: number;
    clicks: number;
  },
  metric: PeriodMetric,
) {
  switch (metric) {
    case "spend":
      return point.spend;
    case "primary_results":
      return point.primaryResults;
    case "cost_per_primary_results":
      return point.primaryResults > 0 ? point.spend / point.primaryResults : 0;
    case "ctr":
      return point.impressions > 0 ? (point.clicks / point.impressions) * 100 : 0;
    case "impressions":
      return point.impressions;
    case "cpc":
      return point.clicks > 0 ? point.spend / point.clicks : 0;
    default: {
      const exhaustive: never = metric;
      throw new Error(`Unknown chart metric: ${String(exhaustive)}`);
    }
  }
}

function Legend({
  dot,
  label,
  filled,
}: {
  dot: string;
  label: string;
  filled?: boolean;
}) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span
        className="inline-block h-2 w-2 rounded-full"
        style={{ background: filled ? `${dot}33` : "transparent", border: `1.5px solid ${dot}` }}
      />
      {label}
    </span>
  );
}
