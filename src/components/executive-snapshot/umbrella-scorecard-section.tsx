"use client";

/**
 * Executive Snapshot — Section 2: Umbrella Scorecard.
 *
 * One row per Campaign Umbrella. Columns:
 *   Umbrella · Spend (Δ) · Primary KPI (Δ) · Cost / Result (Δ) · % of spend
 *
 * Click a row → inline expansion to top 5 campaigns within that umbrella, with
 * the same column shape and Δ values pulled from the prior-period campaign
 * aggregates we now ship in DashboardPayload.comparison.campaigns.
 *
 * Each expanded campaign row ends with a "See all in analyst →" link that
 * deep-links to /analyst?umbrella=…&campaign=… so the analyst dashboard
 * lands with the same slice pre-selected (DashboardClient reads those URL
 * params on initial mount).
 *
 * One level of drilldown only — going deeper than campaign in the executive
 * view becomes a tree no executive will navigate.
 */

import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { useMemo, useState } from "react";

import type { DashboardPayload, PerformanceRow } from "@/lib/analytics";
import { TERMS } from "@/lib/glossary";

const MONEY = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
});
const MONEY_CENTS = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 2,
});
const COUNT = new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 });
const PERCENT = new Intl.NumberFormat("en-US", {
  style: "percent",
  maximumFractionDigits: 1,
});

export function UmbrellaScorecardSection({ data }: { data: DashboardPayload }) {
  const totalSpend = data.byUmbrella.reduce((sum, row) => sum + row.spend, 0);
  const priorByUmbrella = useMemo(
    () => new Map(data.comparison.byUmbrella.map((row) => [row.id, row])),
    [data.comparison.byUmbrella],
  );
  const priorByCampaign = useMemo(
    () => new Map(data.comparison.campaigns.map((row) => [row.id, row])),
    [data.comparison.campaigns],
  );
  const campaignsByUmbrella = useMemo(() => {
    const map = new Map<string, PerformanceRow[]>();
    for (const campaign of data.campaigns) {
      const key = campaign.campaignUmbrella || "Needs review";
      const existing = map.get(key);
      if (existing) existing.push(campaign);
      else map.set(key, [campaign]);
    }
    return map;
  }, [data.campaigns]);

  const rows = useMemo(
    () =>
      [...data.byUmbrella].sort((a, b) => b.spend - a.spend),
    [data.byUmbrella],
  );

  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  function toggle(id: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  if (rows.length === 0) {
    return (
      <section className="mt-8 border border-hp-rule bg-hp-card p-6 md:p-8">
        <p className="text-[10px] uppercase tracking-[0.14em] text-hp-muted">
          {`${TERMS.campaignUmbrella}s`}
        </p>
        <h2 className="mt-2 font-title text-2xl leading-tight text-hp-ink">
          Scorecard
        </h2>
        <p className="mt-3 text-sm text-hp-muted">
          No umbrella activity in the selected window.
        </p>
      </section>
    );
  }

  return (
    <section className="mt-8 border border-hp-rule bg-hp-card p-4 md:p-6">
      <header className="mb-4 flex flex-col gap-1">
        <p className="text-[10px] uppercase tracking-[0.14em] text-hp-muted">
          {`${TERMS.campaignUmbrella}s`}
        </p>
        <h2 className="font-title text-2xl leading-tight text-hp-ink">Scorecard</h2>
      </header>

      <div className="w-full overflow-x-auto">
        <table className="w-full min-w-[820px] table-fixed border-collapse text-sm">
          <colgroup>
            <col className="w-[32%]" />
            <col className="w-[16%]" />
            <col className="w-[16%]" />
            <col className="w-[18%]" />
            <col className="w-[18%]" />
          </colgroup>
          <thead>
            <tr className="bg-hp-inset text-left">
              <TH>Umbrella</TH>
              <TH align="right">Spend</TH>
              <TH align="right">{TERMS.primaryKpi}</TH>
              <TH align="right" tooltip="Cost per primary KPI, not cost per sale. Sales validation lands v1.5.">
                Cost / Result
              </TH>
              <TH align="right">Share of Spend</TH>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const isOpen = expanded.has(row.id);
              const prior = priorByUmbrella.get(row.id);
              const share = totalSpend > 0 ? row.spend / totalSpend : 0;
              const campaigns = campaignsByUmbrella.get(row.id) || [];
              return (
                <FragmentRow
                  key={row.id}
                  row={row}
                  prior={prior}
                  share={share}
                  isOpen={isOpen}
                  onToggle={() => toggle(row.id)}
                  campaigns={campaigns}
                  priorByCampaign={priorByCampaign}
                />
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function FragmentRow({
  row,
  prior,
  share,
  isOpen,
  onToggle,
  campaigns,
  priorByCampaign,
}: {
  row: PerformanceRow;
  prior?: PerformanceRow;
  share: number;
  isOpen: boolean;
  onToggle: () => void;
  campaigns: PerformanceRow[];
  priorByCampaign: Map<string, PerformanceRow>;
}) {
  const topFive = useMemo(
    () => [...campaigns].sort((a, b) => b.spend - a.spend).slice(0, 5),
    [campaigns],
  );

  return (
    <>
      <tr
        className={`cursor-pointer border-b border-hp-rule align-top transition-colors duration-150 hover:bg-hp-inset ${
          isOpen ? "bg-hp-inset" : ""
        }`}
        onClick={onToggle}
      >
        <td className="px-4 py-3 text-hp-ink">
          <div className="flex items-center gap-2">
            <ChevronRight
              size={14}
              className={`text-hp-muted transition-transform duration-150 ${
                isOpen ? "rotate-90 text-hp-ink" : ""
              }`}
              aria-hidden
            />
            <span className="font-body">{row.name}</span>
          </div>
          <div className="ml-6 mt-1 text-[10px] uppercase tracking-[0.14em] text-hp-muted">
            {COUNT.format(row.impressions)} impressions
          </div>
        </td>
        <Cell value={MONEY.format(row.spend)} prior={prior?.spend} current={row.spend} />
        <Cell
          value={COUNT.format(row.primaryResults)}
          prior={prior?.primaryResults}
          current={row.primaryResults}
        />
        <Cell
          value={row.costPerPrimaryResult == null ? "—" : MONEY_CENTS.format(row.costPerPrimaryResult)}
          prior={prior?.costPerPrimaryResult ?? undefined}
          current={row.costPerPrimaryResult ?? undefined}
          lowerIsBetter
        />
        <td className="px-4 py-3 text-right text-hp-ink tabular-nums">
          {PERCENT.format(share)}
        </td>
      </tr>
      {isOpen ? (
        <tr className="border-b border-hp-rule">
          <td colSpan={5} className="bg-hp-foundation px-4 py-4">
            {topFive.length === 0 ? (
              <p className="text-sm text-hp-muted">
                No campaigns recorded for this umbrella in the selected window.
              </p>
            ) : (
              <CampaignExpansion
                campaigns={topFive}
                priorByCampaign={priorByCampaign}
                umbrellaName={row.name}
              />
            )}
          </td>
        </tr>
      ) : null}
    </>
  );
}

function CampaignExpansion({
  campaigns,
  priorByCampaign,
  umbrellaName,
}: {
  campaigns: PerformanceRow[];
  priorByCampaign: Map<string, PerformanceRow>;
  umbrellaName: string;
}) {
  return (
    <div>
      <p className="mb-3 text-[10px] uppercase tracking-[0.14em] text-hp-muted">
        Top {campaigns.length} campaign{campaigns.length === 1 ? "" : "s"} by spend
      </p>
      <table className="w-full table-fixed border-collapse text-sm">
        <colgroup>
          <col className="w-[36%]" />
          <col className="w-[16%]" />
          <col className="w-[16%]" />
          <col className="w-[16%]" />
          <col className="w-[16%]" />
        </colgroup>
        <tbody>
          {campaigns.map((campaign) => {
            const prior = priorByCampaign.get(campaign.id);
            const sharePending = "—";
            return (
              <tr key={campaign.id} className="border-t border-hp-rule first:border-t-0">
                <td className="px-3 py-2 text-hp-ink">
                  <div className="font-body">{campaign.name}</div>
                </td>
                <Cell
                  value={MONEY.format(campaign.spend)}
                  prior={prior?.spend}
                  current={campaign.spend}
                />
                <Cell
                  value={COUNT.format(campaign.primaryResults)}
                  prior={prior?.primaryResults}
                  current={campaign.primaryResults}
                />
                <Cell
                  value={
                    campaign.costPerPrimaryResult == null
                      ? "—"
                      : MONEY_CENTS.format(campaign.costPerPrimaryResult)
                  }
                  prior={prior?.costPerPrimaryResult ?? undefined}
                  current={campaign.costPerPrimaryResult ?? undefined}
                  lowerIsBetter
                />
                <td className="px-3 py-2 text-right text-hp-muted tabular-nums">
                  {sharePending}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <div className="mt-3 flex justify-end">
        <Link
          href={`/analyst?umbrella=${encodeURIComponent(umbrellaName)}`}
          className="text-[11px] uppercase tracking-[0.14em] text-hp-ink underline-offset-4 transition-colors duration-150 hover:underline"
        >
          See all in analyst →
        </Link>
      </div>
    </div>
  );
}

function TH({
  children,
  align = "left",
  tooltip,
}: {
  children: React.ReactNode;
  align?: "left" | "right";
  tooltip?: string;
}) {
  return (
    <th
      title={tooltip}
      className={`border-b border-hp-rule px-4 py-3 text-[10px] font-normal uppercase tracking-[0.14em] text-hp-muted ${
        align === "right" ? "text-right" : "text-left"
      }`}
    >
      {children}
    </th>
  );
}

function Cell({
  value,
  prior,
  current,
  lowerIsBetter,
}: {
  value: string;
  prior?: number | null;
  current?: number | null;
  lowerIsBetter?: boolean;
}) {
  return (
    <td className="px-4 py-3 text-right tabular-nums text-hp-ink">
      <div>{value}</div>
      <div className="mt-0.5 text-[11px]">
        <DeltaText current={current} prior={prior} lowerIsBetter={lowerIsBetter} />
      </div>
    </td>
  );
}

function DeltaText({
  current,
  prior,
  lowerIsBetter,
}: {
  current?: number | null;
  prior?: number | null;
  lowerIsBetter?: boolean;
}) {
  if (current == null || prior == null || prior === 0) {
    return <span className="text-hp-muted">— no prior</span>;
  }
  const change = ((current - prior) / Math.abs(prior)) * 100;
  if (!Number.isFinite(change)) {
    return <span className="text-hp-muted">— no prior</span>;
  }
  if (Math.abs(change) < 3) {
    return <span className="text-hp-muted">Flat</span>;
  }
  const isUp = change > 0;
  const isGood = lowerIsBetter ? !isUp : isUp;
  const color = isGood ? "#245D4D" : "#8D2E2E";
  return (
    <span style={{ color }} className="font-body">
      {isUp ? "▲" : "▼"} {Math.round(Math.abs(change))}%
    </span>
  );
}
