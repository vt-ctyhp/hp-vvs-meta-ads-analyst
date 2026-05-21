import Link from "next/link";

import type { ActionBucket, ActionItem, DashboardPayload } from "@/lib/analytics";

type Props = {
  data: DashboardPayload;
  brand?: string | null;
  group?: string | null;
};

const BUCKETS: Array<{
  key: ActionBucket;
  label: string;
  description: string;
  className: string;
}> = [
  {
    key: "scale",
    label: "Scale",
    description: "Current Analyst signal: CTR above benchmark with at least one primary result.",
    className: "border-l-emerald-600",
  },
  {
    key: "fix",
    label: "Fix",
    description: "Current Analyst signal: fatigue risk from frequency and CTR.",
    className: "border-l-rose-700",
  },
  {
    key: "watch",
    label: "Watch",
    description: "Current Analyst signal: meaningful spend with weak CTR efficiency.",
    className: "border-l-stone-400",
  },
];

export function TriagePanel({ data, brand = "all", group = "all" }: Props) {
  const items = data.actionQueue.filter((item) => {
    if (brand !== "all" && item.brandCode !== brand) return false;
    if (group !== "all" && item.campaignUmbrella !== group) return false;
    return true;
  });
  const grouped = groupActionItems(items);

  return (
    <section className="space-y-4">
      <div className="rounded-xl border border-stone-200 bg-white px-4 py-3">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-baseline sm:justify-between">
          <div>
            <h2 className="text-sm font-semibold text-stone-950">Triage queue</h2>
            <p className="pt-1 text-xs leading-5 text-stone-600">
              This keeps the current Analyst Scale / Fix / Watch logic intact.
              We will revisit recommendation quality later.
            </p>
          </div>
          <span className="text-xs tabular-nums text-stone-500">
            {items.length} signals
          </span>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        {BUCKETS.map((bucket) => (
          <ActionBucketColumn
            key={bucket.key}
            bucket={bucket}
            items={grouped[bucket.key]}
          />
        ))}
      </div>
    </section>
  );
}

function ActionBucketColumn({
  bucket,
  items,
}: {
  bucket: (typeof BUCKETS)[number];
  items: ActionItem[];
}) {
  return (
    <section className="overflow-hidden rounded-xl border border-stone-200 bg-white">
      <header className="border-b border-stone-200 px-4 py-3">
        <div className="flex items-baseline justify-between gap-3">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-stone-900">
            {bucket.label}
          </h3>
          <span className="text-xs tabular-nums text-stone-500">{items.length}</span>
        </div>
        <p className="pt-1 text-xs leading-5 text-stone-500">{bucket.description}</p>
      </header>
      {items.length === 0 ? (
        <p className="px-4 py-6 text-sm text-stone-500">No items in this range.</p>
      ) : (
        <ul className="divide-y divide-stone-100">
          {items.map((item) => (
            <li key={item.id}>
              <Link
                href={`/optimize?tab=creatives&focus=${encodeURIComponent(item.entityId)}`}
                className={[
                  "block border-l-4 px-4 py-3 transition-colors hover:bg-stone-50",
                  bucket.className,
                ].join(" ")}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="line-clamp-2 text-sm font-medium text-stone-950">
                      {item.entityName}
                    </p>
                    {item.campaignUmbrella ? (
                      <p className="pt-0.5 text-[11px] uppercase tracking-wider text-stone-500">
                        {item.campaignUmbrella}
                      </p>
                    ) : null}
                  </div>
                  <span className="shrink-0 text-xs text-stone-400">Open</span>
                </div>
                <p className="pt-2 text-xs leading-5 text-stone-700">{item.headline}</p>
                <p className="pt-0.5 text-[11px] leading-5 text-stone-500">
                  {item.supporting}
                </p>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function groupActionItems(items: ActionItem[]) {
  const grouped: Record<ActionBucket, ActionItem[]> = {
    scale: [],
    fix: [],
    watch: [],
  };

  for (const item of items) {
    if (grouped[item.bucket].length < 6) grouped[item.bucket].push(item);
  }

  return grouped;
}
