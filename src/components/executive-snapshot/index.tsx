import type { DashboardPayload } from "@/lib/analytics";
import type { WowMode } from "@/lib/wow-window";

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

        <UpcomingSectionStub
          eyebrow="Section 3"
          title="What Needs Attention"
          due="v1 Day 8"
          description="Up to five rule-derived items — Scale, Watch, Investigate — each linking to its specific creative or umbrella detail. No LLM-generated narrative."
        />
      </section>
    </main>
  );
}

function UpcomingSectionStub({
  eyebrow,
  title,
  due,
  description,
}: {
  eyebrow: string;
  title: string;
  due: string;
  description: string;
}) {
  return (
    <section className="mt-8 border border-dashed border-hp-rule bg-transparent p-6 md:p-8">
      <div className="flex items-baseline justify-between gap-3">
        <p className="text-[10px] uppercase tracking-[0.14em] text-hp-muted">{eyebrow}</p>
        <p className="text-[10px] uppercase tracking-[0.14em] text-hp-muted">
          Coming {due}
        </p>
      </div>
      <h2 className="mt-2 font-title text-2xl leading-tight text-hp-muted">{title}</h2>
      <p className="mt-3 max-w-3xl text-sm leading-6 text-hp-muted">{description}</p>
    </section>
  );
}
