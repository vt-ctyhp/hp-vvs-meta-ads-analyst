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
  const stripe = accent ?? "var(--accent)";
  const lines = sentence.split(/(?<=\.)\s+/).filter(Boolean);

  return (
    <header
      aria-label="Room headline"
      className="flex flex-col gap-4 border border-l-[3px] border-hp-rule bg-hp-card px-6 py-5 md:flex-row md:items-center md:justify-between"
      style={{ borderLeftColor: stripe }}
    >
      <div className="space-y-1">
        {lines.map((line, index) => (
          <p
            key={`${line}-${index}`}
            className="font-[family-name:var(--font-title)] text-2xl leading-snug text-hp-ink"
          >
            {line}
          </p>
        ))}
      </div>
      {metrics.length > 0 ? (
        <dl className="flex flex-wrap items-center gap-4">
          {metrics.map((m) => (
            <div key={m.label} className="min-w-[88px]">
              <dt className="text-[10px] uppercase tracking-[0.14em] text-hp-muted">
                {m.label}
              </dt>
              <dd className="flex items-baseline gap-1 font-[family-name:var(--font-title)] text-xl tabular-nums text-hp-ink">
                <span>{m.value}</span>
                {m.delta != null ? (
                  <span
                    className={
                      "text-xs " +
                      (m.delta.positive
                        ? "text-signal-positive"
                        : "text-signal-danger")
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
