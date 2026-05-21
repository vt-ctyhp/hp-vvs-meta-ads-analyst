import Link from "next/link";

import { requirePagePermission } from "@/lib/server-route-auth";

export const dynamic = "force-dynamic";

export default async function OutcomesPlaceholderPage() {
  await requirePagePermission("view_outcomes", "/outcomes");

  return (
    <main className="min-h-screen bg-hp-foundation px-4 py-8 text-hp-body md:px-8">
      <section className="mx-auto max-w-3xl">
        <p className="text-[11px] uppercase tracking-[0.14em] text-hp-muted">Outcome Analysis</p>
        <h1 className="mt-2 font-title text-4xl leading-tight text-hp-ink md:text-5xl">
          Outcomes
        </h1>
        <p className="mt-4 text-base leading-7 text-hp-body">
          Validated, mature outcome data per umbrella and creative &mdash; sourced from sales
          reviews and Shopify customer matching. This is the surface that answers
          &ldquo;which creatives actually drove sales,&rdquo; not just messages or bookings.
        </p>

        <div className="mt-8 border border-hp-rule bg-hp-card p-6 md:p-8">
          <div className="flex items-center gap-2 text-[11px] uppercase tracking-[0.14em] text-hp-muted">
            <span className="inline-block h-2 w-2 rounded-full bg-hp-rule" aria-hidden />
            Coming in v2
          </div>
          <h2 className="mt-3 font-title text-2xl leading-snug text-hp-ink">
            What lands here next
          </h2>
          <ul className="mt-4 space-y-3 text-sm leading-6 text-hp-body">
            <li>
              <span className="font-medium text-hp-ink">Cost per closed sale</span> by umbrella
              and creative, with the maturity window made explicit.
            </li>
            <li>
              <span className="font-medium text-hp-ink">Cohort outcomes.</span> &ldquo;Of week-N
              messages from this umbrella, what fraction had converted by week N+4?&rdquo;
            </li>
            <li>
              <span className="font-medium text-hp-ink">LTV per umbrella</span> once Shopify
              customer matching lands in v3.
            </li>
          </ul>
        </div>

        <div className="mt-6 text-sm text-hp-muted">
          Want to see the broader plan?{" "}
          <Link
            href="/"
            className="text-hp-ink underline-offset-4 transition-colors hover:underline"
          >
            Open the executive snapshot
          </Link>
          .
        </div>
      </section>
    </main>
  );
}
