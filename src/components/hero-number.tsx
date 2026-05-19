import type { ReactNode } from "react";

import { MaturityBadge, type MaturityLevel } from "./maturity-badge";
import { Sparkline, type SparklineTone } from "./sparkline";

/**
 * Executive snapshot hero tile.
 *
 * One number with eyebrow label, optional WoW chip, optional footnote, and
 * optional sparkline. Pure presentational; the page builds the inputs.
 *
 * Bigger and quieter than the analyst MetricTile — it's meant to be the first
 * thing the executive reads, not one of many. Uses the editorial serif for the
 * value at 36px so it carries the visual weight of the section.
 */

export type HeroNumberProps = {
  label: string;
  /** Pre-formatted display string for the value, e.g. "$4,210" or "52 bookings". */
  value: string;
  /** Optional WoW delta chip rendered to the right of the value. */
  delta?: ReactNode;
  /** Optional short note shown below the value, e.g. mixed-units footnote. */
  footnote?: string;
  /** Sparkline trend data (one number per day). Renders if >= 2 points. */
  sparkline?: readonly number[];
  sparklineTone?: SparklineTone;
  /** Optional maturity label rendered next to the eyebrow. */
  maturity?: MaturityLevel;
};

export function HeroNumber({
  label,
  value,
  delta,
  footnote,
  sparkline,
  sparklineTone,
  maturity,
}: HeroNumberProps) {
  return (
    <div className="border border-hp-rule bg-hp-card p-6">
      <div className="flex items-center justify-between gap-2">
        <div className="text-[10px] uppercase tracking-[0.14em] text-hp-muted">{label}</div>
        {maturity ? <MaturityBadge level={maturity} /> : null}
      </div>
      <div className="mt-3 flex flex-wrap items-baseline gap-3">
        <span className="font-title text-[36px] leading-none tabular-nums text-hp-ink">
          {value}
        </span>
        {delta ? <span className="shrink-0">{delta}</span> : null}
      </div>
      {footnote ? (
        <p className="mt-2 text-xs leading-5 text-hp-muted">{footnote}</p>
      ) : null}
      {sparkline ? (
        <div className="mt-4">
          <Sparkline data={sparkline} tone={sparklineTone} />
        </div>
      ) : null}
    </div>
  );
}
