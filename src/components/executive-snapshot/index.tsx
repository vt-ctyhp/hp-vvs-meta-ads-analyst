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
      </section>
    </main>
  );
}

