import { SignalStrip } from "@/components/v2/signal-strip";
import { requirePagePermission } from "@/lib/server-route-auth";

export const dynamic = "force-dynamic";

export default async function OperatePage() {
  await requirePagePermission("manage_backfill", "/operate");

  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <p className="font-[family-name:var(--font-title)] text-3xl">Operate</p>
        <p className="text-sm text-stone-600">
          Keep the pipes flowing. Sync runs, backfill, coverage, and team roster.
        </p>
      </header>

      <SignalStrip room="operate" />

      <section
        aria-label="Operate room placeholder"
        className="rounded-xl border border-dashed border-stone-300 bg-white/60 p-8 text-center"
      >
        <p className="text-sm text-stone-600">
          Operate room body coming in PRD Phase 7: pipelines, coverage heatmap,
          health, and read-only roster will live here.
        </p>
      </section>
    </div>
  );
}
