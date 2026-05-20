import { SignalStrip } from "@/components/v2/signal-strip";
import { requirePagePermission } from "@/lib/server-route-auth";

export const dynamic = "force-dynamic";

export default async function ConvertPage() {
  await requirePagePermission("view_dashboard", "/convert");

  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <p className="font-[family-name:var(--font-title)] text-3xl">Convert</p>
        <p className="text-sm text-stone-600">
          Turn customer interest into bookings. Funnel, attribution, and the inbox in one place.
        </p>
      </header>

      <SignalStrip room="convert" />

      <section
        aria-label="Convert room placeholder"
        className="rounded-xl border border-dashed border-stone-300 bg-white/60 p-8 text-center"
      >
        <p className="text-sm text-stone-600">
          Convert room body coming in PRD Phase 6: funnel viz, customer ledger,
          inbox queue, and AI reply composer will live here.
        </p>
      </section>
    </div>
  );
}
