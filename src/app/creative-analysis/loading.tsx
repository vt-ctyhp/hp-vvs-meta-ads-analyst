import { Loader2 } from "lucide-react";

export default function CreativeAnalysisLoading() {
  return (
    <main className="min-h-screen bg-hp-foundation px-4 py-8 text-hp-body md:px-8">
      <section className="mx-auto max-w-4xl border border-hp-rule bg-hp-card p-6">
        <div className="flex items-start gap-3">
          <Loader2 size={20} className="mt-1 animate-spin text-hp-muted" />
          <div>
            <p className="text-[11px] uppercase tracking-[0.14em] text-hp-muted">
              Creative Analysis
            </p>
            <h1 className="mt-2 font-title text-3xl text-hp-ink">
              Loading Creative Analysis
            </h1>
            <p className="mt-3 text-sm leading-6 text-hp-body">
              Pulling the latest available creative diagnostics. If live Meta data is slow, the
              page will fall back to stored Supabase history.
            </p>
          </div>
        </div>
      </section>
    </main>
  );
}
