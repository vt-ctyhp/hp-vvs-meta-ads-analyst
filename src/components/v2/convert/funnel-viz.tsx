"use client";

import { ParentSize } from "@visx/responsive";
import { scaleLinear } from "@visx/scale";

import { tokens } from "@/lib/design-tokens";

/**
 * Funnel visualization for the Convert room.
 *
 * Renders the website funnel as a stack of stages with horizontal bars
 * scaled to the top stage. Each stage shows its count, conversion rate
 * from the previous step, and from the start. The widest bar is the
 * entry stage (e.g. Visitors); narrower bars below show drop-off.
 *
 * Built with Visx ParentSize + scaleLinear so the chart adapts to its
 * container width on mobile, tablet, and desktop.
 */

export type FunnelStep = {
  key: string;
  label: string;
  count: number;
  rateFromPrevious: number | null;
  rateFromStart: number | null;
};

export type FunnelBookingSignal = {
  label: string;
  source: string;
  count: number;
};

type Props = {
  steps: FunnelStep[];
  bookingSignals?: FunnelBookingSignal[];
};

export function FunnelViz({ steps, bookingSignals = [] }: Props) {
  if (steps.length === 0) {
    return (
      <div className="border border-hp-rule bg-hp-card px-4 py-10 text-center text-sm text-hp-muted">
        No funnel data in this range. Verify the booking pixel is firing on the
        Shopify site.
      </div>
    );
  }

  const maxCount = Math.max(...steps.map((s) => s.count), 1);
  const accent = tokens.color.light.accent;

  return (
    <section
      aria-label="Website funnel"
      className="overflow-hidden border border-hp-rule bg-hp-card"
    >
      <header className="flex items-baseline justify-between border-b border-hp-rule bg-hp-inset px-5 py-3 text-[11px] uppercase tracking-[0.14em] text-hp-muted">
        <span>Funnel - unique sessions</span>
        <span>{steps.length} stages</span>
      </header>

      {bookingSignals.length ? (
        <div className="border-b border-hp-rule px-5 py-4">
          <div className="mb-3 flex items-baseline justify-between gap-3 text-[11px] uppercase tracking-[0.14em] text-hp-muted">
            <span>Booking source check</span>
            <span>{bookingSignals.length} signals</span>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-hp-inset text-left text-[11px] uppercase tracking-[0.14em] text-hp-muted">
                <tr>
                  <th className="px-4 py-3 font-normal">Signal</th>
                  <th className="px-4 py-3 font-normal">Source</th>
                  <th className="px-4 py-3 text-right font-normal">Count</th>
                </tr>
              </thead>
              <tbody>
                {bookingSignals.map((signal) => (
                  <tr key={signal.source} className="border-t border-hp-rule">
                    <td className="px-4 py-3 font-medium text-hp-ink">{signal.label}</td>
                    <td className="px-4 py-3 text-hp-muted">{signal.source}</td>
                    <td className="px-4 py-3 text-right tabular-nums text-hp-ink">
                      {signal.count.toLocaleString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}

      <ParentSize parentSizeStyles={{ height: steps.length * 56 + 16 }}>
        {({ width }) => {
          const labelWidth = 180;
          const barWidth = Math.max(120, width - labelWidth - 96);
          const xScale = scaleLinear<number>({
            domain: [0, maxCount],
            range: [0, barWidth],
          });
          return (
            <svg
              width={width}
              height={steps.length * 56 + 16}
              role="img"
              aria-label="Funnel stages bar chart"
            >
              {steps.map((step, idx) => {
                const y = idx * 56 + 8;
                const barX = labelWidth;
                const w = Math.max(2, xScale(step.count) ?? 0);
                const fillIntensity = Math.max(
                  0.35,
                  1 - idx * (0.6 / Math.max(1, steps.length - 1)),
                );
                return (
                  <g key={step.key} transform={`translate(0, ${y})`}>
                    <text
                      x={labelWidth - 12}
                      y={26}
                      textAnchor="end"
                      className="text-xs"
                      style={{ fill: "var(--ink-primary)" }}
                    >
                      {step.label}
                    </text>
                    <rect
                      x={barX}
                      y={8}
                      width={w}
                      height={36}
                      rx={6}
                      fill={accent}
                      fillOpacity={fillIntensity}
                    />
                    <text
                      x={barX + w + 8}
                      y={20}
                      className="text-xs font-semibold tabular-nums"
                      style={{ fill: "var(--ink-primary)" }}
                    >
                      {step.count.toLocaleString()}
                    </text>
                    <text
                      x={barX + w + 8}
                      y={36}
                      className="text-[10px] tabular-nums"
                      style={{ fill: "var(--ink-muted)" }}
                    >
                      {step.rateFromPrevious == null
                        ? idx === 0
                          ? "entry"
                          : "-"
                        : `${(step.rateFromPrevious * 100).toFixed(1)}% from prev - ${
                            step.rateFromStart != null
                              ? `${(step.rateFromStart * 100).toFixed(1)}% from start`
                              : ""
                          }`}
                    </text>
                  </g>
                );
              })}
            </svg>
          );
        }}
      </ParentSize>
    </section>
  );
}
