import { Loader2 } from "lucide-react";

export default function BackfillLoading() {
  return (
    <main className="min-h-screen bg-hp-foundation px-4 py-8 text-hp-body md:px-8">
      <section className="mx-auto max-w-4xl border border-hp-rule bg-hp-card p-6">
        <div className="flex items-start gap-3">
          <Loader2 size={20} className="mt-1 animate-spin text-hp-muted" />
          <div>
            <p className="text-[11px] uppercase tracking-[0.14em] text-hp-muted">
              Historical Backfill
            </p>
            <h1 className="mt-2 font-title text-3xl text-hp-ink">
              Loading Backfill
            </h1>
            <p className="mt-3 text-sm leading-6 text-hp-body">
              Loading coverage, jobs, and data-health checks from Supabase history.
            </p>
          </div>
        </div>
      </section>
    </main>
  );
}
