"use client";

// PROTOTYPE — floating bottom indicator for the /convert/inbox rebuild.
// Hidden in production builds. Delete with the rest of inbox-prototype/
// once the prototype is folded into the real SocialInboxClient.

export type VariantKey = "A";

export function PrototypeSwitcher({ current }: { current: VariantKey }) {
  if (process.env.NODE_ENV === "production") return null;
  return (
    <div
      role="region"
      aria-label="Prototype indicator"
      className="fixed bottom-5 left-1/2 z-[100] -translate-x-1/2"
      style={{ boxShadow: "0 12px 32px rgba(42, 39, 37, 0.18)" }}
    >
      <div className="flex items-stretch border border-hp-ink bg-hp-ink text-hp-foundation">
        <div className="flex items-center gap-2 px-4 py-2 text-[10px] uppercase tracking-[0.18em]">
          <span className="text-hp-foundation/60">Prototype</span>
          <span className="font-[family-name:var(--font-title)] text-sm tracking-normal normal-case">
            {current} — Replier (rebuilt)
          </span>
        </div>
      </div>
      <p className="mt-1 text-center text-[9px] uppercase tracking-[0.18em] text-hp-muted">
        Seed data · throwaway prototype
      </p>
    </div>
  );
}
