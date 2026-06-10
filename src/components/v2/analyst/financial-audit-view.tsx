import Link from "next/link";

import type { AuditCampaignRow, FinancialAuditPayload } from "@/lib/financial-audit-data";
import {
  AUDIT_TIMEFRAMES,
  AUDIT_TIMEFRAME_LABEL,
  type AuditPeriod,
  type AuditStatus,
  type AuditTimeframe,
} from "@/lib/financial-audit";

/**
 * Financial audit tables — server component. The timeframe toggle is plain
 * links over ?view= so the whole page stays server-rendered.
 */

const MONEY = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const STATUS_DISPLAY: Record<AuditStatus, { word: string; className: string }> = {
  over: { word: "Over", className: "text-signal-danger" },
  on_budget: { word: "On budget", className: "text-signal-positive" },
  under: { word: "Under", className: "text-signal-warning" },
  no_budget: { word: "No budget", className: "text-hp-muted" },
};

const CURRENT_PERIOD_TITLE: Record<AuditTimeframe, string> = {
  daily: "Latest day by campaign",
  weekly: "This week by campaign",
  monthly: "This month by campaign",
};

export function FinancialAuditView({ payload }: { payload: FinancialAuditPayload }) {
  const { timeframe, periods, campaigns, currentPeriod } = payload;

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <TimeframeToggle active={timeframe} />
        <p className="text-[11px] smallcaps text-hp-muted">
          Charges synced through {payload.latestSyncedDate}. Budgets reflect live Meta
          configuration, not historical settings.
        </p>
      </div>

      <section className="border border-hp-rule bg-hp-card px-6 py-5">
        <h2 className="font-[family-name:var(--font-title)] text-xl text-hp-ink">
          Charges against budget, {AUDIT_TIMEFRAME_LABEL[timeframe].toLowerCase()} view
        </h2>
        <p className="mt-1 text-sm text-hp-body">
          Each {periodNoun(timeframe)} compares Meta charges to the configured daily budget
          scaled to the days it covers. The in-progress {periodNoun(timeframe)} is prorated to
          days synced so far.
        </p>
        <PeriodsTable periods={periods} timeframe={timeframe} />
      </section>

      <section className="border border-hp-rule bg-hp-card px-6 py-5">
        <h2 className="font-[family-name:var(--font-title)] text-xl text-hp-ink">
          {CURRENT_PERIOD_TITLE[timeframe]}
        </h2>
        <p className="mt-1 text-sm text-hp-body">
          {currentPeriod
            ? `${currentPeriod.label}, ${currentPeriod.daysCovered} ${currentPeriod.daysCovered === 1 ? "day" : "days"} of charges.`
            : "No current period available."}
        </p>
        <CampaignTable campaigns={campaigns} />
      </section>
    </div>
  );
}

function TimeframeToggle({ active }: { active: AuditTimeframe }) {
  return (
    <nav aria-label="Audit timeframe" className="flex items-center gap-1">
      {AUDIT_TIMEFRAMES.map((timeframe) => {
        const isActive = timeframe === active;
        return (
          <Link
            key={timeframe}
            href={`/analyst/financial-audit?view=${timeframe}`}
            aria-current={isActive ? "page" : undefined}
            className={[
              "inline-flex h-9 items-center border px-3 text-[11px] smallcaps transition-colors",
              isActive
                ? "border-hp-rule bg-hp-ink text-hp-foundation"
                : "border-hp-rule bg-hp-card text-hp-body hover:border-hp-ink hover:bg-hp-inset",
            ].join(" ")}
          >
            {AUDIT_TIMEFRAME_LABEL[timeframe]}
          </Link>
        );
      })}
    </nav>
  );
}

function PeriodsTable({
  periods,
  timeframe,
}: {
  periods: AuditPeriod[];
  timeframe: AuditTimeframe;
}) {
  if (!periods.length) {
    return <p className="mt-4 text-sm text-hp-muted">No periods in range.</p>;
  }
  return (
    <table data-component="financial-audit-periods" className="mt-4 w-full border-collapse text-[13px]">
      <thead>
        <tr className="border-b border-hp-rule text-[10px] smallcaps text-hp-muted">
          <th className="px-2 py-2 text-left font-normal">{AUDIT_TIMEFRAME_LABEL[timeframe]} period</th>
          <th className="px-2 py-2 text-right font-normal">Days</th>
          <th className="px-2 py-2 text-right font-normal">Budget</th>
          <th className="px-2 py-2 text-right font-normal">Charged</th>
          <th className="px-2 py-2 text-right font-normal">Variance</th>
          <th className="px-2 py-2 text-left font-normal">Status</th>
        </tr>
      </thead>
      <tbody>
        {[...periods].reverse().map((period) => {
          const status = STATUS_DISPLAY[period.status];
          return (
            <tr
              key={period.periodKey}
              className="border-b border-hp-rule-soft hover:bg-hp-inset"
            >
              <td className="px-2 py-2 text-hp-ink">
                {period.label}
                {period.isCurrent ? (
                  <span className="ml-2 text-[10px] smallcaps text-hp-muted">In progress</span>
                ) : null}
              </td>
              <td className="px-2 py-2 text-right lining-nums text-hp-body">{period.daysCovered}</td>
              <td className="px-2 py-2 text-right lining-nums text-hp-body">
                {period.budget > 0 ? MONEY.format(period.budget) : "—"}
              </td>
              <td className="px-2 py-2 text-right lining-nums text-hp-ink">
                {MONEY.format(period.spend)}
              </td>
              <td className={`px-2 py-2 text-right lining-nums ${varianceClass(period)}`}>
                {period.budget > 0 ? signedMoney(period.variance) : "—"}
              </td>
              <td className={`px-2 py-2 text-[11px] smallcaps ${status.className}`}>{status.word}</td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

function CampaignTable({ campaigns }: { campaigns: AuditCampaignRow[] }) {
  if (!campaigns.length) {
    return <p className="mt-4 text-sm text-hp-muted">No campaign charges in this period.</p>;
  }
  return (
    <table data-component="financial-audit-campaigns" className="mt-4 w-full border-collapse text-[13px]">
      <thead>
        <tr className="border-b border-hp-rule text-[10px] smallcaps text-hp-muted">
          <th className="px-2 py-2 text-left font-normal">Campaign</th>
          <th className="px-2 py-2 text-right font-normal">Budget</th>
          <th className="px-2 py-2 text-right font-normal">Charged</th>
          <th className="px-2 py-2 text-right font-normal">Variance</th>
          <th className="px-2 py-2 text-left font-normal">Status</th>
        </tr>
      </thead>
      <tbody>
        {campaigns.map((row) => {
          const status = STATUS_DISPLAY[row.status];
          return (
            <tr key={row.campaignId} className="border-b border-hp-rule-soft hover:bg-hp-inset">
              <td className="px-2 py-2 text-hp-ink">{row.campaign}</td>
              <td className="px-2 py-2 text-right lining-nums text-hp-body">
                {row.budget > 0 ? MONEY.format(row.budget) : "—"}
              </td>
              <td className="px-2 py-2 text-right lining-nums text-hp-ink">{MONEY.format(row.spend)}</td>
              <td
                className={`px-2 py-2 text-right lining-nums ${
                  row.budget > 0 && row.variance > 0 ? "text-signal-danger" : "text-hp-body"
                }`}
              >
                {row.budget > 0 ? signedMoney(row.variance) : "—"}
              </td>
              <td className={`px-2 py-2 text-[11px] smallcaps ${status.className}`}>{status.word}</td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

function varianceClass(period: AuditPeriod): string {
  if (period.budget <= 0) return "text-hp-muted";
  if (period.status === "over") return "text-signal-danger";
  if (period.status === "under") return "text-signal-warning";
  return "text-hp-body";
}

function signedMoney(value: number): string {
  if (value > 0) return `+${MONEY.format(value)}`;
  if (value < 0) return `-${MONEY.format(Math.abs(value))}`;
  return MONEY.format(0);
}

function periodNoun(timeframe: AuditTimeframe): string {
  return timeframe === "daily" ? "day" : timeframe === "weekly" ? "week" : "month";
}
