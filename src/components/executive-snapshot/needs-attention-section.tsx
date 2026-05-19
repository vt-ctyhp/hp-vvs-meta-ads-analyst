import Link from "next/link";

import type { DashboardPayload } from "@/lib/analytics";
import {
  buildAttentionItems,
  type AttentionBucket,
  type AttentionItem,
} from "@/lib/attention-rules";

/**
 * Section III — what needs attention.
 *
 * Server component. Up to five rule-derived items grouped by bucket. No LLM
 * call — items come from attention-rules.ts, a pure deterministic function
 * over the dashboard payload, so the same inputs always produce the same
 * items in the same order.
 *
 * Visual treatment is editorial: each item is a "story tile" with a
 * colored small-caps flag (the bucket), an italic kicker, an em-dashed
 * headline in the body face, and a supporting line of measured detail.
 * The whole row is the link target.
 */

const BUCKET_META: Record<
  AttentionBucket,
  { label: string; description: string; color: string }
> = {
  scale: {
    label: "Scale",
    description: "Doing more of this works",
    color: "var(--positive)",
  },
  watch: {
    label: "Watch",
    description: "Spending more, getting less",
    color: "var(--warning)",
  },
  investigate: {
    label: "Investigate",
    description: "Cost spiking — find out why",
    color: "var(--danger)",
  },
  fix: {
    label: "Fix",
    description: "Rotate or refresh",
    color: "var(--danger)",
  },
  pending: {
    label: "Pending",
    description: "Coming in v1.5",
    color: "var(--ink-muted)",
  },
};

export function NeedsAttentionSection({ data }: { data: DashboardPayload }) {
  const items = buildAttentionItems(data);
  const actionable = items.filter((item) => item.bucket !== "pending");
  const pending = items.find((item) => item.bucket === "pending");

  return (
    <section>
      <header className="flex flex-col gap-3 border-b border-hp-ink/85 pb-3 md:flex-row md:items-end md:justify-between">
        <div className="flex items-baseline gap-3">
          <span
            aria-hidden
            className="font-title oldstyle-nums text-[28px] leading-none text-hp-gilt md:text-[32px]"
          >
            III.
          </span>
          <div>
            <p className="smallcaps text-[10px] text-hp-muted">Editor&rsquo;s Marks</p>
            <h2 className="mt-1 font-title text-[26px] leading-tight text-hp-ink md:text-[30px]">
              What needs attention
            </h2>
          </div>
        </div>
        <p className="max-w-[36ch] text-xs italic leading-5 text-hp-muted md:text-right">
          Rule-derived from this week vs. last. No model-generated prose —
          identical inputs produce identical marks.
        </p>
      </header>

      {actionable.length === 0 ? (
        <div className="mt-5 border border-dashed border-hp-rule px-5 py-6 text-center">
          <p className="font-title text-[20px] italic leading-snug text-hp-ink">
            Nothing urgent in this window.
          </p>
          <p className="mt-2 text-xs leading-5 text-hp-muted">
            A mark appears here when an umbrella&rsquo;s cost per result jumps,
            spend rises without results, or a creative shows fatigue.
          </p>
        </div>
      ) : (
        <ol className="mt-5 divide-y divide-hp-rule-soft">
          {actionable.map((item, index) => (
            <AttentionRow key={item.id} item={item} ordinal={index + 1} />
          ))}
        </ol>
      )}

      {pending ? (
        <div className="mt-5 border-t border-dashed border-hp-rule-soft pt-4">
          <PendingRow item={pending} />
        </div>
      ) : null}
    </section>
  );
}

function AttentionRow({
  item,
  ordinal,
}: {
  item: AttentionItem;
  ordinal: number;
}) {
  const meta = BUCKET_META[item.bucket];
  return (
    <li className="group">
      <Link
        href={item.linkHref}
        className="grid grid-cols-[28px_minmax(0,1fr)_18px] items-start gap-x-4 gap-y-1 py-4 transition-colors duration-150 hover:bg-hp-inset/60 md:grid-cols-[44px_120px_minmax(0,1fr)_18px]"
      >
        {/* Ordinal numeral — quiet roman-feel column */}
        <span
          aria-hidden
          className="font-title oldstyle-nums text-[20px] leading-none text-hp-muted/80 group-hover:text-hp-gilt md:pl-2 md:text-[22px]"
        >
          {ordinal.toString().padStart(2, "0")}
        </span>

        {/* Bucket flag */}
        <div className="col-span-2 md:col-span-1">
          <div className="smallcaps text-[10px]" style={{ color: meta.color }}>
            {meta.label}
          </div>
          <div className="mt-0.5 text-[10px] italic leading-4 text-hp-muted">
            {meta.description}
          </div>
        </div>

        {/* Headline + supporting */}
        <div className="col-span-3 min-w-0 md:col-span-1">
          <div className="font-body text-[15px] leading-snug text-hp-ink">
            <span className="font-medium">{item.entityName}</span>
            <span className="mx-1.5 text-hp-gilt" aria-hidden>—</span>
            <span className="text-hp-body">{item.headline}</span>
          </div>
          <div className="mt-1 text-[11px] italic leading-5 text-hp-muted tabular-nums">
            {item.supporting}
          </div>
        </div>

        <span
          aria-hidden
          className="hidden self-center text-hp-muted transition-all duration-150 group-hover:translate-x-0.5 group-hover:text-hp-ink md:inline"
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
      className="flex items-start gap-4 px-1 py-3 transition-colors duration-150 hover:text-hp-ink"
    >
      <div className="smallcaps text-[10px] text-hp-muted">Pending</div>
      <div className="min-w-0 flex-1">
        <div className="font-body text-sm italic text-hp-muted">
          {item.headline}
        </div>
        <p className="mt-1 text-[11px] leading-5 text-hp-muted">
          {item.supporting}
        </p>
      </div>
    </Link>
  );
}
