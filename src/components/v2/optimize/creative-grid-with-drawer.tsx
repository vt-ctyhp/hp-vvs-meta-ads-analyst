"use client";

import { useEffect, useState } from "react";

import type { PerformanceRow } from "@/lib/analytics";

import { CreativeGrid } from "./creative-grid";

/**
 * Client wrapper that owns the row-selection state for CreativeGrid +
 * renders a slide-in detail panel. Pulled out of the server-rendered
 * /optimize page because hooks are not allowed there.
 *
 * Drawer is intentionally lightweight (no live video-metrics fetch yet;
 * that lives in the legacy /creative-analysis surface and is the Phase
 * 5 polish target). It shows what we already have in the dashboard
 * payload — spend, KPI, CTR/CPC, frequency, group, status, brand, plus
 * deep-links to Ads Manager and the existing creative-analysis room.
 */

type Props = {
  rows: PerformanceRow[];
};

const money = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
});
const moneyCents = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 2,
});
const num = new Intl.NumberFormat("en-US");

export function CreativeGridWithDrawer({ rows }: Props) {
  const [selected, setSelected] = useState<PerformanceRow | null>(null);

  // Close on Escape — small but important for keyboard nav.
  useEffect(() => {
    if (!selected) return;
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") setSelected(null);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [selected]);

  return (
    <>
      <CreativeGrid rows={rows} onSelect={setSelected} />
      {selected ? (
        <DetailDrawer
          row={selected}
          onClose={() => setSelected(null)}
        />
      ) : null}
    </>
  );
}

function DetailDrawer({
  row,
  onClose,
}: {
  row: PerformanceRow;
  onClose: () => void;
}) {
  const adsManagerUrl = row.adId
    ? `https://business.facebook.com/adsmanager/manage/ads/edit?selected_ad_ids=${encodeURIComponent(row.adId)}`
    : null;
  const previewSrc = row.thumbnailUrl ?? row.imageUrl ?? null;

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
            <p className="text-[10px] uppercase tracking-wider text-stone-500">
              {row.brandCode} ·{" "}
              {row.campaignUmbrella ?? row.campaignName ?? "—"}
            </p>
            <h2 className="line-clamp-2 pt-0.5 text-sm font-medium text-stone-900">
              {row.name}
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

        {previewSrc ? (
          <img
            src={previewSrc}
            alt={row.name}
            className="aspect-square w-full bg-stone-100 object-cover"
          />
        ) : (
          <div className="aspect-square w-full bg-stone-100" />
        )}

        <section className="space-y-3 px-4 py-4">
          <div className="grid grid-cols-2 gap-3">
            <Stat label="Spend" value={money.format(row.spend)} />
            <Stat
              label={row.primaryResultLabel || "Primary"}
              value={num.format(row.primaryResults)}
            />
            <Stat
              label="Cost / result"
              value={
                row.costPerPrimaryResult != null
                  ? moneyCents.format(row.costPerPrimaryResult)
                  : "—"
              }
            />
            <Stat
              label="CTR"
              value={`${(row.ctr * 100).toFixed(2)}%`}
            />
            <Stat label="CPC" value={moneyCents.format(row.cpc)} />
            <Stat label="Freq" value={row.frequency.toFixed(2)} />
            <Stat label="Impressions" value={num.format(row.impressions)} />
            <Stat label="Clicks" value={num.format(row.clicks)} />
            <Stat label="Conversions" value={num.format(row.conversions)} />
            <Stat label="Reach" value={num.format(row.reach)} />
          </div>

          {row.riskLevel ? (
            <RiskBlock
              level={row.riskLevel}
              reason={row.riskReason ?? null}
            />
          ) : null}

          <dl className="space-y-1.5 border-t border-stone-100 pt-3 text-xs text-stone-700">
            <Meta label="Status" value={row.effectiveStatus ?? row.status ?? "—"} />
            <Meta label="Objective" value={row.objective ?? "—"} />
            <Meta label="Ad set" value={row.adSetName ?? "—"} />
            <Meta label="Campaign" value={row.campaignName ?? "—"} />
            <Meta label="Ad ID" value={row.adId ?? "—"} mono />
            <Meta label="Creative ID" value={row.id} mono />
          </dl>

          <footer className="space-y-2 border-t border-stone-100 pt-3">
            {adsManagerUrl ? (
              <a
                href={adsManagerUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex h-9 w-full items-center justify-center rounded-full border border-stone-300 bg-white text-xs font-medium text-stone-800 transition-colors hover:bg-stone-50"
              >
                Open in Ads Manager ↗
              </a>
            ) : null}
            <a
              href={`/analyst/creative-analysis?focus=${encodeURIComponent(row.id)}`}
              className="inline-flex h-9 w-full items-center justify-center rounded-full bg-stone-900 text-xs font-medium text-stone-50 transition-colors hover:bg-stone-800"
            >
              Open full Creative Analysis →
            </a>
          </footer>
        </section>
      </aside>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md bg-stone-50 px-2.5 py-2">
      <p className="text-[10px] uppercase tracking-wider text-stone-500">
        {label}
      </p>
      <p className="pt-0.5 text-sm font-medium text-stone-900">{value}</p>
    </div>
  );
}

function Meta({
  label,
  value,
  mono = false,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div className="flex items-baseline gap-2">
      <dt className="w-20 shrink-0 text-[10px] uppercase tracking-wider text-stone-500">
        {label}
      </dt>
      <dd
        className={[
          "min-w-0 break-words text-stone-800",
          mono ? "font-mono text-[11px]" : "",
        ].join(" ")}
      >
        {value}
      </dd>
    </div>
  );
}

function RiskBlock({
  level,
  reason,
}: {
  level: "low" | "medium" | "high";
  reason: string | null;
}) {
  const palette =
    level === "high"
      ? "border-rose-200 bg-rose-50 text-rose-900"
      : level === "medium"
        ? "border-amber-200 bg-amber-50 text-amber-900"
        : "border-emerald-200 bg-emerald-50 text-emerald-900";

  const label =
    level === "high" ? "High risk" : level === "medium" ? "Watch" : "Low risk";

  return (
    <div
      className={`rounded-md border px-3 py-2 text-xs leading-relaxed ${palette}`}
    >
      <p className="font-medium">{label}</p>
      {reason ? <p className="pt-0.5 opacity-90">{reason}</p> : null}
    </div>
  );
}
