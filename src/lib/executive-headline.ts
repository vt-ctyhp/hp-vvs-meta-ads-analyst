/**
 * Pure rule-derived headline sentence for the Executive Snapshot top story.
 *
 * Deliberately NOT an LLM call. We need a sentence that is:
 *   - deterministic (same inputs → same output, every render)
 *   - boring (you can read it in 1.5s and trust it)
 *   - honest about flat data (no inventing drama)
 *
 * The tone hint maps to the same emerald / oxblood palette used by DeltaChip
 * elsewhere, so the executive landing reads in one visual language.
 */

export type HeadlineTone = "positive" | "warning" | "neutral";

export type HeadlineInput = {
  spend: { current: number; previous: number };
  primaryResults: { current: number; previous: number };
  /**
   * The umbrella that moved the needle most (by absolute Δ primary results).
   * Optional — when omitted or empty, the headline simply doesn't mention an
   * umbrella attribution clause.
   */
  topUmbrella?: { name: string; primaryResultsDelta: number };
  /**
   * When true, the inputs come from a period that has no prior data to
   * compare against. The function then returns a no-comparison sentence
   * instead of inventing a story from incomplete data.
   */
  noPriorPeriod?: boolean;
};

export type Headline = {
  sentence: string;
  tone: HeadlineTone;
};

const SIGNIFICANT_DELTA_PCT = 3; // anything smaller reads as flat

export function buildExecutiveHeadline(input: HeadlineInput): Headline {
  const spendCurrent = clampNumber(input.spend.current);
  const resultsCurrent = clampNumber(input.primaryResults.current);

  // Empty period — be honest, don't invent narrative.
  if (input.noPriorPeriod || (spendCurrent === 0 && resultsCurrent === 0)) {
    return {
      sentence: spendCurrent === 0 && resultsCurrent === 0
        ? "No activity in the selected window."
        : "Showing current period — no prior data to compare against.",
      tone: "neutral",
    };
  }

  const spendChange = percentChange(spendCurrent, input.spend.previous);
  const resultsChange = percentChange(resultsCurrent, input.primaryResults.previous);

  const parts: string[] = [];

  if (spendChange === null) {
    parts.push("Spend started this period.");
  } else if (Math.abs(spendChange) < SIGNIFICANT_DELTA_PCT) {
    parts.push("Spend is flat vs last week.");
  } else {
    const direction = spendChange > 0 ? "up" : "down";
    parts.push(`Spend ${direction} ${Math.round(Math.abs(spendChange))}% vs last week.`);
  }

  if (resultsChange === null) {
    parts.push("Primary KPI is still building a baseline.");
  } else if (Math.abs(resultsChange) < SIGNIFICANT_DELTA_PCT) {
    parts.push("Primary KPI count is flat.");
  } else {
    const direction = resultsChange > 0 ? "up" : "down";
    parts.push(`Primary KPI count ${direction} ${Math.round(Math.abs(resultsChange))}%.`);
  }

  const attribution = umbrellaClause(input.topUmbrella, resultsChange);
  if (attribution) parts.push(attribution);

  return {
    sentence: parts.join(" "),
    tone: toneFor(spendChange, resultsChange),
  };
}

function umbrellaClause(
  umbrella: HeadlineInput["topUmbrella"],
  resultsChange: number | null,
): string | null {
  if (!umbrella || !umbrella.name) return null;
  if (umbrella.primaryResultsDelta === 0) return null;
  const direction = umbrella.primaryResultsDelta > 0 ? "win" : "slide";
  // Only attribute the slide when overall results are also dropping; otherwise
  // attributing a slide to a single umbrella is misleading (it might be the
  // smallest contributor, not the cause).
  if (direction === "slide" && (resultsChange ?? 0) >= 0) return null;
  return `${umbrella.name} drove most of the ${direction}.`;
}

function toneFor(
  spendChange: number | null,
  resultsChange: number | null,
): HeadlineTone {
  // Both null = neutral (handled above by no-prior-period); shouldn't reach.
  if (spendChange === null && resultsChange === null) return "neutral";

  const spendUp = (spendChange ?? 0) > SIGNIFICANT_DELTA_PCT;
  const spendDown = (spendChange ?? 0) < -SIGNIFICANT_DELTA_PCT;
  const resultsUp = (resultsChange ?? 0) > SIGNIFICANT_DELTA_PCT;
  const resultsDown = (resultsChange ?? 0) < -SIGNIFICANT_DELTA_PCT;

  // Spending more, getting less — the trap we're trying to surface.
  if (spendUp && resultsDown) return "warning";
  // Spending less while results dropped — shrinking, watch closely.
  if (spendDown && resultsDown) return "warning";
  // Same or less spend producing more results — clean efficiency win.
  if (!spendUp && resultsUp) return "positive";
  // Everything roughly flat or growing in proportion — neutral.
  return "neutral";
}

function percentChange(current: number, previous: number): number | null {
  if (!Number.isFinite(previous) || previous === 0) return null;
  return ((current - previous) / Math.abs(previous)) * 100;
}

function clampNumber(value: number): number {
  return Number.isFinite(value) && value > 0 ? value : 0;
}
