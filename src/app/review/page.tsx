import Link from "next/link";

import { requirePagePermission } from "@/lib/server-route-auth";

export const dynamic = "force-dynamic";

export default async function ReviewPlaceholderPage() {
  await requirePagePermission("view_review", "/review");

  return (
    <main className="min-h-screen bg-hp-foundation px-4 py-8 text-hp-body md:px-8">
      <section className="mx-auto max-w-3xl">
        <p className="text-[11px] uppercase tracking-[0.14em] text-hp-muted">Sales Review</p>
        <h1 className="mt-2 font-title text-4xl leading-tight text-hp-ink md:text-5xl">
          Review queue
        </h1>
        <p className="mt-4 text-base leading-7 text-hp-body">
          This is where sales tags appointment outcomes and rates last week&rsquo;s top creatives
          for Facebook US Product. It powers the &ldquo;Trailing&rdquo; column on the executive
          snapshot and the outcome-validated recommendations in the action queue.
        </p>

        <div className="mt-8 border border-hp-rule bg-hp-card p-6 md:p-8">
          <div className="flex items-center gap-2 text-[11px] uppercase tracking-[0.14em] text-hp-muted">
            <span className="inline-block h-2 w-2 rounded-full bg-[#8B5B19]" aria-hidden />
            Coming in v1.5
          </div>
          <h2 className="mt-3 font-title text-2xl leading-snug text-hp-ink">
            What lands here next
          </h2>
          <ul className="mt-4 space-y-3 text-sm leading-6 text-hp-body">
            <li>
              <span className="font-medium text-hp-ink">Per-appointment outcomes.</span> Tag each
              completed Book Appts US appointment as Showed Up / No-show / Browsed / Sold / Lost,
              with deal value and notes.
            </li>
            <li>
              <span className="font-medium text-hp-ink">Weekly creative ratings.</span> Each
              Monday, rate last week&rsquo;s top 5 active Facebook US Product creatives 1&ndash;10
              with optional notes.
            </li>
            <li>
              <span className="font-medium text-hp-ink">Auto-attribution.</span> Booking-page
              <span className="font-mono text-xs"> fbclid </span> capture so outcomes roll up to
              specific creatives, not just umbrellas.
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
