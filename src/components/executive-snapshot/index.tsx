import Link from "next/link";

import type { DashboardPayload } from "@/lib/analytics";
import type { WowMode } from "@/lib/wow-window";

import { NeedsAttentionSection } from "./needs-attention-section";
import { TopStorySection } from "./top-story-section";
import { UmbrellaScorecardSection } from "./umbrella-scorecard-section";

/**
 * Executive Snapshot — the new / landing.
 *
 * Composed of three sections:
 *   1. Top Story (this file is the shell; rendered now)
 *   2. Umbrella Scorecard (v1 Days 6-7)
 *   3. What Needs Attention (v1 Day 8)
 *
 * Server-rendered top-to-bottom; the only client islands inside are the
 * WeekWindowToggle (URL state) and the recharts sparklines on hero numbers.
 *
 * Deliberately small. Most of the surface area is intent + data; the layout
 * shell is a few hundred lines, not the 2000-line tower the analyst dashboard
 * grew into. The analyst dashboard remains untouched at /analyst as the
 * power-user safety net.
 */

export function ExecutiveSnapshot({
  data,
  wow,
}: {
  data: DashboardPayload;
  wow: WowMode | null;
}) {
  return (
    <main className="min-h-screen bg-hp-foundation px-4 py-8 text-hp-body md:px-8">
      <section className="mx-auto max-w-6xl">
        <TopStorySection data={data} wow={wow} />

        <UmbrellaScorecardSection data={data} />

        <NeedsAttentionSection data={data} />

        <MaturityFooter />
      </section>
    </main>
  );
}

function MaturityFooter() {
  return (
    <footer className="mt-8 border-t border-hp-rule pt-6 text-xs leading-6 text-hp-muted">
      <p>
        <span className="text-hp-body">All metrics on this page are leading
        indicators</span> — they respond to ad changes within hours but are not
        yet validated against business outcomes. Trailing data (validated
        closed sales, qualified-lead rates) lands when the sales review
        system arrives in v1.5.{" "}
        <Link
          href="/review"
          className="text-hp-ink underline-offset-4 transition-colors duration-150 hover:underline"
        >
          See the v1.5 plan →
        </Link>
      </p>
    </footer>
  );
}

