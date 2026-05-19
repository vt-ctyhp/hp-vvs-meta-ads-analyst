import Link from "next/link";

import type { DashboardPayload } from "@/lib/analytics";
import {
  buildAttentionItems,
  type AttentionBucket,
  type AttentionItem,
} from "@/lib/attention-rules";

/**
 * Executive Snapshot — Section 3: What Needs Attention.
 *
 * Server component. Renders up to 5 rule-derived items grouped by
 * bucket. No LLM call — items come from attention-rules.ts, which is a
 * pure deterministic function over the dashboard payload.
 *
 * Each item is a Link to the right detail surface (umbrella → /analyst
 * pre-filtered; creative → /analyst with search seeded; pending → /review
 * once v1.5 lands).
 */

const BUCKET_META: Record<
  AttentionBucket,
  { label: string; description: string; color: string }
> = {
  scale: {
    label: "Scale",
    description: "Doing more of this works",
    color: "#245D4D",
  },
  watch: {
    label: "Watch",
    description: "Spending more, getting less",
    color: "#8B5B19",
  },
  investigate: {
    label: "Investigate",
    description: "Cost spiking — find out why",
    color: "#8D2E2E",
  },
  fix: {
    label: "Fix",
    description: "Rotate or refresh",
    color: "#8D2E2E",
  },
  pending: {
    label: "Pending",
    description: "Coming in v1.5",
    color: "#8A8178",
  },
};

export function NeedsAttentionSection({ data }: { data: DashboardPayload }) {
  const items = buildAttentionItems(data);
  const actionable = items.filter((item) => item.bucket !== "pending");
  const pending = items.find((item) => item.bucket === "pending");

  return (
    <section className="mt-8 border border-hp-rule bg-hp-card p-4 md:p-6">
      <header className="mb-4 flex flex-col gap-1">
        <p className="text-[10px] uppercase tracking-[0.14em] text-hp-muted">
          Section 3
        </p>
        <h2 className="font-title text-2xl leading-tight text-hp-ink">
          What needs attention
        </h2>
        <p className="text-xs leading-5 text-hp-muted">
          Rule-derived from this week vs last. No LLM-generated narrative — same
          inputs always produce the same items.
        </p>
      </header>

      {actionable.length === 0 ? (
        <div className="border border-dashed border-hp-rule bg-hp-foundation p-5">
          <p className="font-body text-sm text-hp-ink">
            Nothing urgent in the selected window.
          </p>
          <p className="mt-1 text-xs text-hp-muted">
            Items appear here when an umbrella&rsquo;s cost per result jumps,
            spend rises without results, or a creative shows fatigue.
          </p>
        </div>
      ) : (
        <ul className="space-y-2">
          {actionable.map((item) => (
            <AttentionRow key={item.id} item={item} />
          ))}
        </ul>
      )}

      {pending ? (
        <div className="mt-4 border-t border-dashed border-hp-rule pt-4">
          <PendingRow item={pending} />
        </div>
      ) : null}
    </section>
  );
}

function AttentionRow({ item }: { item: AttentionItem }) {
  const meta = BUCKET_META[item.bucket];
  return (
    <li>
      <Link
        href={item.linkHref}
        className="group flex items-start gap-4 border border-hp-rule bg-hp-card p-4 transition-colors duration-150 hover:border-hp-ink hover:bg-hp-inset"
        style={{ borderLeftWidth: 3, borderLeftColor: meta.color }}
      >
        <div className="min-w-[80px]">
          <div
            className="text-[10px] uppercase tracking-[0.14em]"
            style={{ color: meta.color }}
          >
            {meta.label}
          </div>
          <div className="mt-1 text-[10px] uppercase tracking-[0.14em] text-hp-muted">
            {meta.description}
          </div>
        </div>
        <div className="min-w-0 flex-1">
          <div className="font-body text-sm text-hp-ink">
            <span className="font-medium">{item.entityName}</span>
            <span className="ml-1.5 text-hp-muted">— {item.headline}</span>
          </div>
          <div className="mt-1 text-[11px] leading-5 text-hp-muted tabular-nums">
            {item.supporting}
          </div>
        </div>
        <span
          aria-hidden
          className="self-center text-hp-muted transition-colors duration-150 group-hover:text-hp-ink"
        >
          →
        </span>
      </Link>
    </li>
  );
}

function PendingRow({ item }: { item: AttentionItem }) {
  return (
    <Link
      href={item.linkHref}
      className="flex items-start gap-4 px-4 py-3 transition-colors duration-150 hover:text-hp-ink"
    >
      <div className="text-[10px] uppercase tracking-[0.14em] text-hp-muted">
        Pending
      </div>
      <div className="min-w-0 flex-1">
        <div className="font-body text-sm text-hp-muted">{item.headline}</div>
        <p className="mt-1 text-[11px] leading-5 text-hp-muted">{item.supporting}</p>
      </div>
    </Link>
  );
}
