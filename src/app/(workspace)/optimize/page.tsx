import { SignalStrip } from "@/components/v2/signal-strip";
import { requirePagePermission } from "@/lib/server-route-auth";

export const dynamic = "force-dynamic";

export default async function OptimizePage() {
  await requirePagePermission("view_dashboard", "/optimize");

  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <p className="font-[family-name:var(--font-title)] text-3xl">Optimize</p>
        <p className="text-sm text-stone-600">
          Spot what&apos;s working, kill what&apos;s not, ask AI to explain anything.
        </p>
      </header>

      <SignalStrip room="optimize" />

      <section
        aria-label="Optimize room placeholder"
        className="rounded-xl border border-dashed border-stone-300 bg-white/60 p-8 text-center"
      >
        <p className="text-sm text-stone-600">
          Optimize room body coming in PRD Phase 5: time-series chart, creative grid,
          and the persistent AI chat rail will live here.
        </p>
      </section>
    </div>
  );
}
