"use client";

/**
 * Section II — the umbrella scorecard.
 *
 * One row per Campaign Umbrella, sorted by spend. Columns:
 *   Umbrella · Spend (Δ) · Primary KPI (Δ) · Cost / Result (Δ) · Share of Spend
 *
 * Click a row → inline expansion to the top 5 campaigns within that umbrella,
 * with the same column shape and Δ values pulled from the prior-period
 * campaign aggregates we ship in DashboardPayload.comparison.campaigns. The
 * expansion ends with a "See all in analyst →" link that deep-links to
 * /analyst pre-filtered to the umbrella.
 *
 * Visually: no card frame. The section is a printed page: gilt chapter mark
 * (II.), editorial title, a heavy top hairline, hairline row dividers, and a
 * subtle gilt left-bar on hover that previews the open/close affordance.
 *
 * Only one level of drill-down — going deeper than campaign in the executive
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
    () => [...data.byUmbrella].sort((a, b) => b.spend - a.spend),
    [data.byUmbrella],
  );

  const maxShare = useMemo(
    () =>
      rows.reduce(
        (max, row) => Math.max(max, totalSpend > 0 ? row.spend / totalSpend : 0),
        0,
      ),
    [rows, totalSpend],
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

  return (
    <section>
      <SectionHeader
        roman="II."
        eyebrow={`${TERMS.campaignUmbrella}s`}
        title="The Scorecard"
        helper={
          rows.length === 0
            ? "No umbrella activity in the selected window."
            : "Tap a row to read the top campaigns inside that umbrella."
        }
      />

      {rows.length === 0 ? null : (
        <div className="mt-5 w-full overflow-x-auto">
          <table className="w-full min-w-[720px] table-fixed border-collapse text-sm">
            <colgroup>
              <col className="w-[34%]" />
              <col className="w-[16%]" />
              <col className="w-[16%]" />
              <col className="w-[18%]" />
              <col className="w-[16%]" />
            </colgroup>
            <thead>
              <tr>
                <TH>Umbrella</TH>
                <TH align="right">Spend</TH>
                <TH align="right">{TERMS.primaryKpi}</TH>
                <TH
                  align="right"
                  tooltip="Cost per primary KPI, not cost per sale. Sales validation lands v1.5."
                >
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
                    relativeShare={maxShare > 0 ? share / maxShare : 0}
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
      )}
    </section>
  );
}

function FragmentRow({
  row,
  prior,
  share,
  relativeShare,
  isOpen,
  onToggle,
  campaigns,
  priorByCampaign,
}: {
  row: PerformanceRow;
  prior?: PerformanceRow;
  share: number;
  relativeShare: number;
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
        className={`group cursor-pointer border-b border-hp-rule-soft align-top transition-colors duration-150 hover:bg-hp-inset/60 ${
          isOpen ? "bg-hp-inset/60" : ""
        }`}
        onClick={onToggle}
      >
        <td className="relative px-4 py-4 text-hp-ink">
          {/* gilt left bar on hover/open */}
          <span
            aria-hidden
            className={`pointer-events-none absolute inset-y-0 left-0 w-[2px] origin-top scale-y-0 bg-hp-gilt transition-transform duration-200 group-hover:scale-y-100 ${
              isOpen ? "scale-y-100" : ""
            }`}
          />
          <div className="flex items-center gap-2">
            <ChevronRight
              size={13}
              className={`text-hp-muted transition-transform duration-200 ${
                isOpen ? "rotate-90 text-hp-ink" : ""
              }`}
              aria-hidden
            />
            <span className="font-body text-[15px] leading-snug">{row.name}</span>
          </div>
          <div className="ml-[22px] mt-1 smallcaps text-[10px] text-hp-muted">
            <span className="lining-nums">{COUNT.format(row.impressions)}</span>{" "}
            impressions
          </div>
        </td>
        <Cell value={MONEY.format(row.spend)} prior={prior?.spend} current={row.spend} />
        <Cell
          value={COUNT.format(row.primaryResults)}
          prior={prior?.primaryResults}
          current={row.primaryResults}
        />
        <Cell
          value={
            row.costPerPrimaryResult == null
              ? "—"
              : MONEY_CENTS.format(row.costPerPrimaryResult)
          }
          prior={prior?.costPerPrimaryResult ?? undefined}
          current={row.costPerPrimaryResult ?? undefined}
          lowerIsBetter
        />
        <td className="px-4 py-4 text-right text-hp-ink tabular-nums">
          <ShareBar share={share} relativeShare={relativeShare} />
        </td>
      </tr>
      {isOpen ? (
        <tr className="border-b border-hp-rule-soft">
          <td colSpan={5} className="bg-hp-inset/40 px-4 py-5">
            {topFive.length === 0 ? (
              <p className="text-sm italic text-hp-muted">
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
      <p className="mb-3 smallcaps text-[10px] text-hp-gilt">
        Top {campaigns.length} campaign{campaigns.length === 1 ? "" : "s"} by spend
      </p>
      <table className="w-full table-fixed border-collapse text-sm">
        <colgroup>
          <col className="w-[40%]" />
          <col className="w-[16%]" />
          <col className="w-[16%]" />
          <col className="w-[18%]" />
          <col className="w-[10%]" />
        </colgroup>
        <tbody>
          {campaigns.map((campaign) => {
            const prior = priorByCampaign.get(campaign.id);
            return (
              <tr
                key={campaign.id}
                className="border-t border-hp-rule-soft first:border-t-0"
              >
                <td className="px-3 py-3 text-hp-ink">
                  <div className="font-body text-[14px] leading-snug">
                    {campaign.name}
                  </div>
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
                <td className="px-3 py-3 text-right text-hp-muted tabular-nums">
                  —
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <div className="mt-4 flex justify-end">
        <Link
          href={`/analyst?umbrella=${encodeURIComponent(umbrellaName)}`}
          className="inline-flex items-baseline gap-1 smallcaps text-[10px] text-hp-ink underline-offset-4 transition-colors duration-150 hover:text-hp-gilt hover:underline"
        >
          See all in analyst <span aria-hidden>→</span>
        </Link>
      </div>
    </div>
  );
}

function SectionHeader({
  roman,
  eyebrow,
  title,
  helper,
}: {
  roman: string;
  eyebrow: string;
  title: string;
  helper?: string;
}) {
  return (
    <header className="flex flex-col gap-3 border-b border-hp-ink/85 pb-3 md:flex-row md:items-end md:justify-between">
      <div className="flex items-baseline gap-3">
        <span
          aria-hidden
          className="font-title oldstyle-nums text-[28px] leading-none text-hp-gilt md:text-[32px]"
        >
          {roman}
        </span>
        <div>
          <p className="smallcaps text-[10px] text-hp-muted">{eyebrow}</p>
          <h2 className="mt-1 font-title text-[26px] leading-tight text-hp-ink md:text-[30px]">
            {title}
          </h2>
        </div>
      </div>
      {helper ? (
        <p className="max-w-[34ch] text-xs italic leading-5 text-hp-muted md:text-right">
          {helper}
        </p>
      ) : null}
    </header>
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
      className={`smallcaps border-b border-hp-rule px-4 py-3 text-[10px] font-normal text-hp-muted ${
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
    <td className="px-4 py-4 text-right tabular-nums text-hp-ink">
      <div className="text-[15px] leading-tight">{value}</div>
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
    return <span className="italic text-hp-muted">no prior</span>;
  }
  const change = ((current - prior) / Math.abs(prior)) * 100;
  if (!Number.isFinite(change)) {
    return <span className="italic text-hp-muted">no prior</span>;
  }
  if (Math.abs(change) < 3) {
    return <span className="italic text-hp-muted">flat</span>;
  }
  const isUp = change > 0;
  const isGood = lowerIsBetter ? !isUp : isUp;
  const color = isGood ? "var(--positive)" : "var(--danger)";
  return (
    <span style={{ color }} className="font-body italic">
      <span className="not-italic">{isUp ? "▲" : "▼"}</span>{" "}
      {Math.round(Math.abs(change))}%
    </span>
  );
}

function ShareBar({
  share,
  relativeShare,
}: {
  share: number;
  relativeShare: number;
}) {
  return (
    <div className="ml-auto flex w-full max-w-[120px] flex-col items-end gap-1">
      <span className="text-[14px] leading-none">{PERCENT.format(share)}</span>
      <span
        aria-hidden
        className="relative h-px w-full overflow-hidden bg-hp-rule-soft"
      >
        <span
          className="absolute inset-y-0 left-0 bg-hp-ink/55"
          style={{ width: `${Math.max(2, Math.min(100, relativeShare * 100))}%` }}
        />
      </span>
    </div>
  );
}
