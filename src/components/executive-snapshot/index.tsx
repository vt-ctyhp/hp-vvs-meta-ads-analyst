import Link from "next/link";

import type { DashboardPayload } from "@/lib/analytics";
import type { WowMode } from "@/lib/wow-window";

import { NeedsAttentionSection } from "./needs-attention-section";
import { TopStorySection } from "./top-story-section";
import { UmbrellaScorecardSection } from "./umbrella-scorecard-section";

/**
 * Executive Snapshot — the / landing.
 *
 * Composed as a single editorial broadsheet: a small masthead, a top-of-the-page
 * pull-quote (Section I), the umbrella scorecard (Section II), and the
 * attention list (Section III). Ornament rules separate them in place of card
 * boxes; whitespace and hairlines do the framing instead of borders.
 *
 * Reveal is staggered top-to-bottom via the .fade-up utilities in globals.css.
 */

export function ExecutiveSnapshot({
  data,
  wow,
}: {
  data: DashboardPayload;
  wow: WowMode | null;
}) {
  const range = data.sourceTransparency.timeRange;
  const issue = issueNumberFromDate(range.start);

  return (
    <main className="min-h-screen text-hp-body">
      <Masthead issue={issue} />

      <section className="mx-auto max-w-6xl px-4 pb-16 md:px-8">
        <div className="fade-up fade-up-d1">
          <TopStorySection data={data} wow={wow} />
        </div>

        <div className="ornament-rule fade-up fade-up-d2" aria-hidden />

        <div className="fade-up fade-up-d2">
          <UmbrellaScorecardSection data={data} />
        </div>

        <div className="ornament-rule fade-up fade-up-d3" aria-hidden />

        <div className="fade-up fade-up-d3">
          <NeedsAttentionSection data={data} />
        </div>

        <MaturityFooter />
      </section>
    </main>
  );
}

/**
 * Masthead — a thin band that anchors the page in a publication metaphor.
 *
 * Three columns balanced on a single baseline: the volume mark on the left,
 * the publication title centered, and the issue number on the right. The
 * hairline beneath separates it from the editorial body without a heavy
 * shadow or surface change.
 */
function Masthead({ issue }: { issue: number }) {
  return (
    <header className="border-b border-hp-rule-soft px-4 pb-3 pt-6 md:px-8">
      <div className="mx-auto flex max-w-6xl items-baseline justify-between gap-4">
        <div className="smallcaps text-[10px] text-hp-muted">
          Vol. <span className="oldstyle-nums">I</span>
        </div>
        <div className="smallcaps text-[10px] text-hp-gilt">
          The Performance Broadsheet
        </div>
        <div className="smallcaps text-[10px] text-hp-muted">
          Issue №<span className="oldstyle-nums">{issue}</span>
        </div>
      </div>
    </header>
  );
}

function MaturityFooter() {
  return (
    <footer className="fade-up fade-up-d4 mt-12 border-t border-hp-rule-soft pt-6 text-xs leading-6 text-hp-muted">
      <p className="max-w-3xl">
        <span className="smallcaps text-[10px] text-hp-gilt">A note on data</span>
        <span className="block mt-1 italic">
          Every metric on this page is a leading indicator — it responds to ad
          changes within hours but has not yet been validated against business
          outcomes. Trailing data (closed sales, qualified-lead rates) lands
          when the sales review system arrives in v1.5.{" "}
          <Link
            href="/review"
            className="not-italic text-hp-ink underline-offset-4 transition-colors duration-150 hover:underline"
          >
            See the v1.5 plan →
          </Link>
        </span>
      </p>
    </footer>
  );
}

/**
 * Approximate ISO-8601 week number, derived from the window start date. Used
 * only for the masthead's "Issue №" decoration — not for any business logic.
 */
function issueNumberFromDate(iso: string | null): number {
  if (!iso) return 1;
  const date = new Date(`${iso}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return 1;
  const target = new Date(date);
  target.setUTCDate(target.getUTCDate() + 4 - (target.getUTCDay() || 7));
  const yearStart = new Date(Date.UTC(target.getUTCFullYear(), 0, 1));
  return Math.ceil(((target.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
}
