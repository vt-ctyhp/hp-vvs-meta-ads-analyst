/**
 * Two-second status sentence that anchors every dashboard.
 *
 * Workflow rule: the first thing on the screen should answer "what does
 * this person need to do right now?" in one glance. This component is the
 * shared shape for that sentence — pages compute it from their own data
 * and pass it in.
 */

import type { ReactNode } from "react";

export type StatusToneKey = "positive" | "warning" | "neutral";

export type StatusHighlight = {
  /** Plain-language phrase, e.g. "Cost per result is up 12% vs prior period". */
  text: string;
  tone?: StatusToneKey;
};

const TONE_COLOR: Record<StatusToneKey, string> = {
  positive: "#245D4D",
  warning: "#8D2E2E",
  neutral: "inherit",
};

export function StatusSentence({
  context,
  highlights,
  action,
}: {
  /** Quiet eyebrow sentence: the scope (date range, dataset size). */
  context?: string;
  /** Up to ~3 short clauses; the page's headline story. */
  highlights: StatusHighlight[];
  /** Optional CTA shown to the right (e.g. "Open sync"). */
  action?: ReactNode;
}) {
  return (
    <div className="mt-4 flex flex-col gap-2 border-b border-hp-rule pb-5 md:flex-row md:items-end md:justify-between md:gap-6">
      <div className="min-w-0">
        {context ? (
          <p className="text-[11px] uppercase tracking-[0.14em] text-hp-muted">{context}</p>
        ) : null}
        <p className="mt-1 font-title text-2xl leading-snug text-hp-ink md:text-[26px]">
          {highlights.map((highlight, index) => {
            const color = highlight.tone ? TONE_COLOR[highlight.tone] : undefined;
            return (
              <span key={`${highlight.text}-${index}`}>
                <span style={color ? { color } : undefined}>{highlight.text}</span>
                {index < highlights.length - 1 ? <span className="text-hp-muted"> · </span> : null}
              </span>
            );
          })}
        </p>
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  );
}
