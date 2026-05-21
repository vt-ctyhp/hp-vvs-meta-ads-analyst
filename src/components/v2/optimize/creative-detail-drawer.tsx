"use client";

import Link from "next/link";
import { useEffect } from "react";

import type { CreativeAsset, PeriodMetric } from "@/lib/period-pivot-data";
import type { PeriodWindow } from "@/lib/period-windows";

import { PERIOD_METRIC_LABELS } from "@/lib/period-pivot-data";

import { formatMetric } from "./metric-format";

/**
 * Creative detail drawer for the tree-table.
 *
 * Mirrors the existing CreativeGridWithDrawer drawer pattern (slide-in
 * right panel, backdrop close, Escape close) but renders the data shape
 * we actually have at the tree-table layer: creative_id (the cryptic
 * Meta id), the period-by-period metric values, and a CTA back to Ads
 * Manager.
 *
 * Per the rebuild PRD's "creative_id belongs on the detail page" rule,
 * this is where the raw id surfaces — the tree-table row shows only the
 * human-friendly name + thumbnail.
 */

type Props = {
  open: boolean;
  onClose: () => void;
  creativeId: string | null;
  asset: CreativeAsset | undefined;
  adSetId: string | null;
  campaignId: string | null;
  displayName: string | null;
  periodValues: Record<string, number> | null;
  periods: PeriodWindow[];
  metric: PeriodMetric;
};

export function CreativeDetailDrawer({
  open,
  onClose,
  creativeId,
  asset,
  adSetId,
  campaignId,
  displayName,
  periodValues,
  periods,
  metric,
}: Props) {
  // Close on Escape — keyboard nav.
  useEffect(() => {
    if (!open) return;
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open || !creativeId) return null;

  const previewSrc =
    asset?.thumbnailUrl ?? asset?.imageUrl ?? asset?.videoThumbnailUrl ?? null;
  const previewLink = asset?.previewUrl ?? null;
  const headline = asset?.name ?? asset?.title ?? displayName ?? "Untitled creative";

  return (
    <div className="fixed inset-0 z-50 flex">
      {/* Click-outside backdrop */}
      <button
        type="button"
        onClick={onClose}
        aria-label="Close detail"
        className="flex-1 bg-stone-900/30 backdrop-blur-sm transition-opacity"
      />

      {/* Slide-in panel */}
      <aside
        className="flex h-full w-full max-w-md flex-col overflow-y-auto border-l border-stone-200 bg-white shadow-2xl"
        aria-label="Creative detail"
      >
        <header className="sticky top-0 z-10 flex items-start gap-3 border-b border-stone-200 bg-white px-4 py-3">
          <div className="min-w-0 flex-1">
            <p className="text-[10px] uppercase tracking-wider text-stone-500">Creative detail</p>
            <h2 className="line-clamp-2 pt-0.5 text-sm font-medium text-stone-900">
              {headline}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-7 w-7 items-center justify-center rounded-full border border-stone-300 bg-white text-xs text-stone-700 hover:bg-stone-50"
            aria-label="Close"
          >
            ×
          </button>
        </header>

        <div className="space-y-4 p-4">
          {previewSrc ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={previewSrc}
              alt=""
              className="aspect-square w-full rounded-lg border border-stone-200 object-cover"
            />
          ) : (
            <div className="flex aspect-square w-full items-center justify-center rounded-lg border border-dashed border-stone-300 text-xs text-stone-400">
              No preview available
            </div>
          )}

          <section>
            <h3 className="pb-2 text-[10px] uppercase tracking-wider text-stone-500">
              {PERIOD_METRIC_LABELS[metric]} by period
            </h3>
            <div className="overflow-hidden rounded-md border border-stone-200">
              <table className="w-full text-sm">
                <tbody>
                  {periods.map((p) => (
                    <tr key={p.key} className="border-b border-stone-100 last:border-b-0">
                      <td className="px-3 py-2 text-stone-600">
                        {p.label}
                        {p.isCurrent ? (
                          <span className="ml-1 text-[9px] uppercase tracking-wider text-amber-700">
                            so far
                          </span>
                        ) : null}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums text-stone-900">
                        {periodValues?.[p.key] === undefined
                          ? "—"
                          : formatMetric(periodValues[p.key], metric)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section>
            <h3 className="pb-2 text-[10px] uppercase tracking-wider text-stone-500">
              Meta identifiers
            </h3>
            <dl className="space-y-1.5 text-xs">
              <DlRow label="Creative ID" value={creativeId} mono />
              <DlRow label="Ad Set ID" value={adSetId} mono />
              <DlRow label="Campaign ID" value={campaignId} mono />
              {asset?.title ? <DlRow label="Title" value={asset.title} /> : null}
            </dl>
          </section>

          <section className="flex flex-col gap-2">
            {previewLink ? (
              <a
                href={previewLink}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex h-9 items-center justify-center rounded-md border border-stone-300 bg-white px-3 text-xs font-medium text-stone-800 hover:bg-stone-50"
              >
                Open Meta preview ↗
              </a>
            ) : null}
            <Link
              href={`/creative-analysis?creative=${encodeURIComponent(creativeId)}`}
              className="inline-flex h-9 items-center justify-center rounded-md bg-stone-900 px-3 text-xs font-medium text-stone-50 hover:bg-stone-800"
            >
              Open in Creative Analysis →
            </Link>
          </section>
        </div>
      </aside>
    </div>
  );
}

function DlRow({
  label,
  value,
  mono,
}: {
  label: string;
  value: string | null;
  mono?: boolean;
}) {
  if (!value) return null;
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="text-stone-500">{label}</dt>
      <dd
        className={[
          "truncate text-stone-900",
          mono ? "font-mono text-[11px]" : "",
        ].join(" ")}
        title={value}
      >
        {value}
      </dd>
    </div>
  );
}
