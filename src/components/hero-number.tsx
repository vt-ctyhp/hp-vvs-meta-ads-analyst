import type { ReactNode } from "react";

import { MaturityBadge, type MaturityLevel } from "./maturity-badge";
import { Sparkline, type SparklineTone } from "./sparkline";

/**
 * Executive snapshot hero tile.
 *
 * One number with eyebrow label, optional WoW chip, optional footnote, and
 * optional sparkline. Pure presentational; the page builds the inputs.
 *
 * Designed as an editorial column rather than a card: no heavy frame, a thin
 * gilt rule above the eyebrow, and a soft hairline beneath the sparkline.
 * The value runs at 56px in the editorial serif with old-style figures, so a
 * row of three hero tiles reads as three pull-quotes rather than dashboard
 * tiles. The hp-card surface persists but sits flush with the paper to keep
 * the broadsheet atmosphere going.
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
    <div className="relative bg-hp-card/60 px-5 pb-5 pt-6 backdrop-blur-[1px]">
      {/* gilt hairline above the eyebrow — the only ornamental flourish */}
      <span
        aria-hidden
        className="absolute inset-x-5 top-0 h-px bg-hp-gilt/55"
      />
      <div className="flex items-center justify-between gap-2">
        <div className="smallcaps text-[10px] text-hp-muted">{label}</div>
        {maturity ? <MaturityBadge level={maturity} /> : null}
      </div>
      <div className="mt-2 flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <span className="font-title oldstyle-nums text-[52px] leading-[1.02] text-hp-ink md:text-[56px]">
          {value}
        </span>
        {delta ? <span className="shrink-0">{delta}</span> : null}
      </div>
      {footnote ? (
        <p className="mt-2 max-w-[28ch] text-xs italic leading-5 text-hp-muted">
          {footnote}
        </p>
      ) : null}
      {sparkline ? (
        <div className="mt-4 border-t border-hp-rule-soft pt-3">
          <Sparkline data={sparkline} tone={sparklineTone} />
        </div>
      ) : null}
    </div>
  );
}
