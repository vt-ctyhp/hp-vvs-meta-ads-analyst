"use client";

/**
 * Shared sparkline primitive.
 *
 * Tiny line chart with no axes, no tooltips, no animation. Used as a
 * background trend hint on metric tiles. Renders nothing if the data has
 * fewer than 2 points (a one-day window has no meaningful trend).
 *
 * Reuses recharts which is already in the bundle for the main trend chart.
 */

import { useMemo } from "react";
import { Line, LineChart, ResponsiveContainer } from "recharts";

export type SparklineTone = "ink" | "muted" | "positive" | "warning";

const TONE_STROKE: Record<SparklineTone, string> = {
  ink: "#2A2725",
  muted: "#8A8178",
  positive: "#245D4D",
  warning: "#8D2E2E",
};

export function Sparkline({
  data,
  tone = "ink",
  className,
}: {
  data: readonly number[];
  tone?: SparklineTone;
  className?: string;
}) {
  const chartData = useMemo(() => data.map((value, index) => ({ i: index, v: value })), [data]);

  if (chartData.length < 2) return null;

  return (
    <div className={`h-8 min-w-0 ${className ?? ""}`.trim()}>
      <ResponsiveContainer width="100%" height="100%" initialDimension={{ width: 1, height: 1 }}>
        <LineChart data={chartData} margin={{ top: 2, right: 2, bottom: 2, left: 2 }}>
          <Line
            type="monotone"
            dataKey="v"
            stroke={TONE_STROKE[tone]}
            strokeWidth={1.2}
            dot={false}
            isAnimationActive={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
