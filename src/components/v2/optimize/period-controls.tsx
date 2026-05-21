"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useTransition } from "react";

import { PERIOD_METRIC_LABELS, type PeriodMetric } from "@/lib/period-pivot-data";
import type { Frequency } from "@/lib/period-windows";

/**
 * Header controls for the /optimize period-pivot table.
 *
 * Three segmented controls plus a metric dropdown. All four are URL-state
 * (?periods=4&freq=week&metric=primary_results), so deep links bookmark
 * the operator's preferred view and a refresh keeps the layout.
 *
 * Per the rebuild PRD §13 spec:
 *   - Periods: 1 | 4 | 8 | 12
 *   - Frequency: Day | Week | Month | Quarter
 *   - Metric: 6 options, all umbrella-neutral
 *
 * Periods = 1 hides Frequency + Metric in favor of Range + Compare (the
 * snapshot/multi-metric mode). That mode is deferred — v1 ships trend
 * mode only — but we still show the "1" radio so the operator sees the
 * eventual shape of the picker.
 */

const PERIODS: Array<{ value: number; label: string }> = [
  { value: 1, label: "1" },
  { value: 4, label: "4" },
  { value: 8, label: "8" },
  { value: 12, label: "12" },
];

const FREQUENCIES: Array<{ value: Frequency; label: string }> = [
  { value: "day", label: "Day" },
  { value: "week", label: "Week" },
  { value: "month", label: "Month" },
  { value: "quarter", label: "Quarter" },
];

const METRIC_OPTIONS: PeriodMetric[] = [
  "spend",
  "primary_results",
  "cost_per_primary_results",
  "ctr",
  "impressions",
  "cpc",
];

type Props = {
  periods: number;
  frequency: Frequency;
  metric: PeriodMetric;
};

export function PeriodControls({ periods, frequency, metric }: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [pending, startTransition] = useTransition();

  const pushParam = useCallback(
    (key: string, value: string) => {
      const next = new URLSearchParams(searchParams.toString());
      next.set(key, value);
      // Sensible defaults stay in the URL so the back button works.
      startTransition(() => {
        router.replace(`${pathname}?${next.toString()}`, { scroll: false });
        // App Router can serve a cached RSC payload after a soft nav;
        // refresh() forces the page to re-render with the new searchParams.
        router.refresh();
      });
    },
    [pathname, router, searchParams],
  );

  const snapshotMode = periods === 1;

  return (
    <section
      aria-label="Period controls"
      className="flex flex-wrap items-center gap-x-6 gap-y-3 px-3 py-2"
    >
      <Segment label="Periods">
        {PERIODS.map((opt) => (
          <SegmentButton
            key={opt.value}
            active={opt.value === periods}
            onClick={() => pushParam("periods", String(opt.value))}
            disabled={pending}
          >
            {opt.label}
          </SegmentButton>
        ))}
      </Segment>

      {!snapshotMode ? (
        <Segment label="Frequency">
          {FREQUENCIES.map((opt) => (
            <SegmentButton
              key={opt.value}
              active={opt.value === frequency}
              onClick={() => pushParam("freq", opt.value)}
              disabled={pending}
            >
              {opt.label}
            </SegmentButton>
          ))}
        </Segment>
      ) : null}

      {!snapshotMode ? (
        <div className="flex items-center gap-2">
          <span className="text-[11px] uppercase tracking-wider text-stone-500">
            Metric
          </span>
          <select
            value={metric}
            onChange={(e) => pushParam("metric", e.target.value)}
            disabled={pending}
            className="h-8 rounded-md border border-stone-300 bg-white px-2 text-sm text-stone-900 focus:outline-none focus:ring-2 focus:ring-stone-400"
          >
            {METRIC_OPTIONS.map((m) => (
              <option key={m} value={m}>
                {PERIOD_METRIC_LABELS[m]}
              </option>
            ))}
          </select>
        </div>
      ) : (
        <div className="text-[11px] italic text-stone-500">
          Snapshot mode lands in v2 — for now the table renders 1 period of
          the selected metric.
        </div>
      )}
    </section>
  );
}

function Segment({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-[11px] uppercase tracking-wider text-stone-500">{label}</span>
      <div className="inline-flex overflow-hidden rounded-md border border-stone-300 bg-white">
        {children}
      </div>
    </div>
  );
}

function SegmentButton({
  active,
  onClick,
  disabled,
  children,
}: {
  active: boolean;
  onClick: () => void;
  disabled?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={[
        "px-3 py-1 text-xs font-medium transition-colors",
        active
          ? "bg-stone-900 text-stone-50"
          : "bg-white text-stone-700 hover:bg-stone-100",
        disabled ? "cursor-not-allowed opacity-60" : "",
      ].join(" ")}
    >
      {children}
    </button>
  );
}
