/**
 * Status sentence — the two-second-read headline on every room (PRD §8).
 *
 * Server component. Renders a single line plus an optional metric strip. The
 * page passes already-computed numbers; this component owns the *language*
 * (glossary verbs, punctuation, sentence shape) and the visual rhythm.
 *
 * Per platform-foundations: the first thing on the screen, plain prose, no
 * jargon. Keep it under ~20 words.
 */

import { tokens } from "@/lib/design-tokens";

type Props = {
  /** The single sentence the user reads first. e.g. "3 creatives need attention." */
  sentence: string;
  /** Optional supporting metric chips, right-aligned on desktop. */
  metrics?: Array<{
    label: string;
    value: string;
    delta?: { value: number; positive?: boolean } | null;
  }>;
  /** Subtle accent color stripe. Defaults to brand accent. */
  accent?: string;
};

export function StatusSentence({ sentence, metrics = [], accent }: Props) {
  const stripe = accent ?? tokens.color.light.accent;

  return (
    <header
      aria-label="Room headline"
      className="relative flex flex-col gap-3 rounded-xl border border-stone-200 bg-white px-6 py-4 md:flex-row md:items-center md:justify-between"
    >
      <span
        aria-hidden
        className="absolute left-0 top-2 bottom-2 w-[3px] rounded-r-md"
        style={{ background: stripe }}
      />
      <p className="pl-3 font-[family-name:var(--font-title)] text-lg leading-snug text-stone-900 md:text-xl">
        {sentence}
      </p>
      {metrics.length > 0 ? (
        <dl className="flex flex-wrap items-center gap-4 pl-3 md:pl-0">
          {metrics.map((m) => (
            <div key={m.label} className="min-w-[88px]">
              <dt className="text-[10px] uppercase tracking-wider text-stone-500">
                {m.label}
              </dt>
              <dd className="flex items-baseline gap-1 text-base font-semibold tabular-nums text-stone-900">
                <span>{m.value}</span>
                {m.delta != null ? (
                  <span
                    className={
                      "text-xs " +
                      (m.delta.positive
                        ? "text-emerald-700"
                        : "text-rose-700")
                    }
                  >
                    {m.delta.positive ? "▲" : "▼"}
                    {Math.abs(m.delta.value).toFixed(0)}%
                  </span>
                ) : null}
              </dd>
            </div>
          ))}
        </dl>
      ) : null}
    </header>
  );
}
