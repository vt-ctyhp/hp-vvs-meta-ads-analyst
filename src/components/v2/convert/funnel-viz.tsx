"use client";

import { CircleHelp } from "lucide-react";

export type FunnelStep = {
  count: number;
  dataMapping: string;
  filterHref?: string;
  isActive?: boolean;
  key: string;
  label: string;
  rateFromPrevious: number | null;
  rateFromStart: number | null;
  unit: "booking" | "unique_session";
};

type Props = {
  steps: FunnelStep[];
};

export function FunnelViz({ steps }: Props) {
  if (steps.length === 0) {
    return (
      <div className="border border-hp-rule bg-hp-card px-4 py-10 text-center text-sm text-hp-muted">
        No funnel data in this range. Verify booking tracking is firing on the
        Shopify site.
      </div>
    );
  }

  const maxCount = Math.max(...steps.map((step) => step.count), 1);

  return (
    <section
      aria-label="Website funnel"
      className="overflow-hidden border border-hp-rule bg-hp-card"
    >
      <header className="flex items-baseline justify-between border-b border-hp-rule bg-hp-inset px-5 py-3 text-[11px] uppercase tracking-[0.14em] text-hp-muted">
        <span>Funnel - unique sessions to bookings</span>
        <span>{steps.length} stages</span>
      </header>

      <div className="space-y-3 px-5 py-5">
        {steps.map((step, index) => {
          const width = `${Math.max(2, (step.count / maxCount) * 100)}%`;
          const fillOpacity = Math.max(0.34, 1 - index * (0.56 / Math.max(1, steps.length - 1)));
          const content = (
            <>
              <div className="grid gap-1 md:grid-cols-[11rem_1fr_6rem] md:items-center md:gap-4">
                <div className="flex min-w-0 items-center gap-1.5 text-xs text-hp-ink">
                  <span className="truncate">{step.label}</span>
                  <MappingHelp text={step.dataMapping} />
                </div>
                <div className="min-w-0">
                  <div className="relative h-9 overflow-visible">
                    <div
                      className="h-9 bg-hp-pink"
                      style={{ opacity: fillOpacity, width }}
                    />
                  </div>
                  <div className="mt-1 text-[10px] tabular-nums text-hp-muted">
                    {rateLabel(step, index)}
                  </div>
                </div>
                <div className="text-left md:text-right">
                  <div className="font-[family-name:var(--font-title)] text-lg tabular-nums text-hp-ink">
                    {step.count.toLocaleString()}
                  </div>
                  <div className="text-[10px] uppercase tracking-[0.14em] text-hp-muted">
                    {step.unit === "booking" ? "bookings" : "sessions"}
                  </div>
                </div>
              </div>
            </>
          );

          if (!step.filterHref) {
            return (
              <div key={step.key} className="border-b border-hp-rule-soft pb-3 last:border-b-0">
                {content}
              </div>
            );
          }

          return (
            <a
              key={step.key}
              aria-current={step.isActive ? "true" : undefined}
              className={`block border-b border-hp-rule-soft pb-3 outline-none transition-colors last:border-b-0 hover:bg-hp-inset focus:bg-hp-inset focus:ring-2 focus:ring-inset focus:ring-hp-pink ${
                step.isActive ? "bg-hp-inset" : ""
              }`}
              href={step.filterHref}
            >
              {content}
            </a>
          );
        })}
      </div>
    </section>
  );
}

function MappingHelp({ text }: { text: string }) {
  return (
    <span className="group relative inline-flex shrink-0 items-center" title={text}>
      <CircleHelp className="text-hp-muted" size={13} aria-hidden />
      <span className="pointer-events-none absolute left-1/2 top-5 z-20 hidden w-80 -translate-x-1/2 border border-hp-rule bg-hp-card p-3 text-[11px] normal-case leading-5 tracking-normal text-hp-body shadow-lg group-hover:block">
        {text}
      </span>
    </span>
  );
}

function rateLabel(step: FunnelStep, index: number) {
  if (step.rateFromPrevious == null) return index === 0 ? "entry" : "-";
  const fromStart =
    step.rateFromStart == null ? "" : ` - ${(step.rateFromStart * 100).toFixed(1)}% from start`;
  return `${(step.rateFromPrevious * 100).toFixed(1)}% from prev${fromStart}`;
}
