/**
 * Financial audit — pure period/budget math for the Meta ad-charge audit page.
 *
 * Budgets come from the live Meta configuration surfaced by
 * aggregate_meta_daily_insights: `daily_budget` on a grouped row is the
 * deduped sum of currently-live campaign/ad-set daily budgets. A period's
 * budget is therefore `daily_budget × days the period covers inside the
 * audited range`, which keeps the comparison fair for the in-progress
 * day/week/month. Historical budget changes are not available from Meta,
 * so past periods are audited against today's configuration.
 */

export type AuditTimeframe = "daily" | "weekly" | "monthly";

export type AuditStatus = "over" | "on_budget" | "under" | "no_budget";

export type AuditRange = {
  start: string;
  end: string;
};

export type AuditPeriod = {
  /** Stable key: "2026-06-09" (daily), Monday date (weekly), "2026-06" (monthly). */
  periodKey: string;
  label: string;
  /** Days of this period that fall inside the audited range. */
  daysCovered: number;
  spend: number;
  /** Live configured daily budget total attributed to this period's rows. */
  dailyBudget: number;
  /** dailyBudget × daysCovered; 0 when no live budget is configured. */
  budget: number;
  variance: number;
  variancePct: number | null;
  status: AuditStatus;
  isCurrent: boolean;
};

export type AuditTotals = {
  spend: number;
  /** Spend inside periods that have a configured budget. */
  budgetedSpend: number;
  budget: number;
  variance: number;
  periodCount: number;
  overCount: number;
  noBudgetCount: number;
};

export type AuditSourceRow = {
  periodKey: string;
  spend: number;
  dailyBudget: number;
};

export const AUDIT_TIMEFRAMES: AuditTimeframe[] = ["daily", "weekly", "monthly"];

export const AUDIT_TIMEFRAME_LABEL: Record<AuditTimeframe, string> = {
  daily: "Daily",
  weekly: "Weekly",
  monthly: "Monthly",
};

const PERIOD_NOUN: Record<AuditTimeframe, { singular: string; plural: string }> = {
  daily: { singular: "day", plural: "days" },
  weekly: { singular: "week", plural: "weeks" },
  monthly: { singular: "month", plural: "months" },
};

/** Meta routinely closes a day slightly over the configured cap; tolerate 2%. */
const OVER_TOLERANCE = 1.02;
/** Below 85% of budget the period materially underdelivered. */
const UNDER_THRESHOLD = 0.85;

const DAILY_PERIODS = 30;
const WEEKLY_PERIODS = 12;
const MONTHLY_PERIODS = 12;

export function parseAuditTimeframe(value: unknown): AuditTimeframe {
  return value === "weekly" || value === "monthly" ? value : "daily";
}

/** Range ends on the latest synced insight date so partial periods stay honest. */
export function auditRangeForTimeframe(timeframe: AuditTimeframe, latestDate: string): AuditRange {
  if (timeframe === "daily") {
    return { start: addDays(latestDate, -(DAILY_PERIODS - 1)), end: latestDate };
  }
  if (timeframe === "weekly") {
    return { start: addDays(mondayOf(latestDate), -7 * (WEEKLY_PERIODS - 1)), end: latestDate };
  }
  const startMonth = addMonths(monthKeyOf(latestDate), -(MONTHLY_PERIODS - 1));
  return { start: `${startMonth}-01`, end: latestDate };
}

export function periodKeysForRange(timeframe: AuditTimeframe, range: AuditRange): string[] {
  const keys: string[] = [];
  if (timeframe === "daily") {
    for (let day = range.start; day <= range.end; day = addDays(day, 1)) keys.push(day);
    return keys;
  }
  if (timeframe === "weekly") {
    for (let week = mondayOf(range.start); week <= range.end; week = addDays(week, 7)) {
      keys.push(week);
    }
    return keys;
  }
  const endMonth = monthKeyOf(range.end);
  for (let month = monthKeyOf(range.start); month <= endMonth; month = addMonths(month, 1)) {
    keys.push(month);
  }
  return keys;
}

/** Inclusive day count of the period clipped to the audited range. */
export function daysCoveredByPeriod(
  timeframe: AuditTimeframe,
  periodKey: string,
  range: AuditRange,
): number {
  const bounds = periodBounds(timeframe, periodKey);
  const start = bounds.start > range.start ? bounds.start : range.start;
  const end = bounds.end < range.end ? bounds.end : range.end;
  if (start > end) return 0;
  return daysBetweenInclusive(start, end);
}

export function classifyAuditStatus(spend: number, budget: number): AuditStatus {
  if (budget <= 0) return "no_budget";
  if (spend > budget * OVER_TOLERANCE) return "over";
  if (spend < budget * UNDER_THRESHOLD) return "under";
  return "on_budget";
}

export function buildAuditPeriods(
  timeframe: AuditTimeframe,
  range: AuditRange,
  rows: AuditSourceRow[],
): AuditPeriod[] {
  const byKey = new Map<string, AuditSourceRow>();
  for (const row of rows) {
    if (row.periodKey) byKey.set(row.periodKey, row);
  }

  const keys = periodKeysForRange(timeframe, range);
  const currentKey = keys[keys.length - 1] ?? null;

  return keys.map((periodKey) => {
    const source = byKey.get(periodKey);
    const spend = roundMoney(source?.spend ?? 0);
    const dailyBudget = roundMoney(source?.dailyBudget ?? 0);
    const daysCovered = daysCoveredByPeriod(timeframe, periodKey, range);
    const budget = roundMoney(dailyBudget * daysCovered);
    const variance = roundMoney(spend - budget);
    return {
      periodKey,
      label: periodLabel(timeframe, periodKey, range),
      daysCovered,
      spend,
      dailyBudget,
      budget,
      variance,
      variancePct: budget > 0 ? roundMoney((variance / budget) * 100) : null,
      status: classifyAuditStatus(spend, budget),
      isCurrent: periodKey === currentKey,
    };
  });
}

export function buildAuditTotals(periods: AuditPeriod[]): AuditTotals {
  let spend = 0;
  let budgetedSpend = 0;
  let budget = 0;
  let overCount = 0;
  let noBudgetCount = 0;
  for (const period of periods) {
    spend += period.spend;
    if (period.status === "no_budget") {
      if (period.spend > 0) noBudgetCount += 1;
      continue;
    }
    budgetedSpend += period.spend;
    budget += period.budget;
    if (period.status === "over") overCount += 1;
  }
  return {
    spend: roundMoney(spend),
    budgetedSpend: roundMoney(budgetedSpend),
    budget: roundMoney(budget),
    variance: roundMoney(budgetedSpend - budget),
    periodCount: periods.length,
    overCount,
    noBudgetCount,
  };
}

export function buildAuditSentence(timeframe: AuditTimeframe, totals: AuditTotals): string {
  const noun = PERIOD_NOUN[timeframe];
  const periods = `${totals.periodCount} ${totals.periodCount === 1 ? noun.singular : noun.plural}`;
  if (totals.spend === 0 && totals.budget === 0) {
    return `No Meta charges or live budgets in the last ${periods}.`;
  }
  if (totals.budget === 0) {
    return `Meta charged ${money(totals.spend)} over the last ${periods} with no live budgets to audit against.`;
  }
  const direction =
    totals.variance > 0
      ? `${money(totals.variance)} over budget`
      : totals.variance < 0
        ? `${money(Math.abs(totals.variance))} under budget`
        : "exactly on budget";
  return `Meta charged ${money(totals.budgetedSpend)} against ${money(totals.budget)} budgeted over the last ${periods}: ${direction}.`;
}

export function periodLabel(
  timeframe: AuditTimeframe,
  periodKey: string,
  range: AuditRange,
): string {
  const withYear = monthKeyOf(periodKey).slice(0, 4) !== range.end.slice(0, 4);
  if (timeframe === "monthly") {
    return formatUtc(`${periodKey}-01`, { month: "long", year: "numeric" });
  }
  if (timeframe === "weekly") {
    return `Week of ${formatUtc(periodKey, withYear ? { month: "short", day: "numeric", year: "numeric" } : { month: "short", day: "numeric" })}`;
  }
  return formatUtc(
    periodKey,
    withYear
      ? { weekday: "short", month: "short", day: "numeric", year: "numeric" }
      : { weekday: "short", month: "short", day: "numeric" },
  );
}

export function periodBounds(timeframe: AuditTimeframe, periodKey: string): AuditRange {
  if (timeframe === "daily") return { start: periodKey, end: periodKey };
  if (timeframe === "weekly") return { start: periodKey, end: addDays(periodKey, 6) };
  return { start: `${periodKey}-01`, end: lastDayOfMonth(periodKey) };
}

export function addDays(value: string, days: number): string {
  const date = parseUtc(value);
  date.setUTCDate(date.getUTCDate() + days);
  return toDateString(date);
}

/** Monday-start weeks, matching aggregate_meta_daily_insights' week dimension. */
export function mondayOf(value: string): string {
  const date = parseUtc(value);
  const offset = (date.getUTCDay() + 6) % 7;
  return addDays(value, -offset);
}

export function monthKeyOf(value: string): string {
  return value.slice(0, 7);
}

export function addMonths(monthKey: string, months: number): string {
  const [year, month] = monthKey.split("-").map(Number);
  const index = year * 12 + (month - 1) + months;
  const nextYear = Math.floor(index / 12);
  const nextMonth = (index % 12) + 1;
  return `${nextYear}-${String(nextMonth).padStart(2, "0")}`;
}

export function lastDayOfMonth(monthKey: string): string {
  const [year, month] = monthKey.split("-").map(Number);
  const date = new Date(Date.UTC(year, month, 0));
  return toDateString(date);
}

export function daysBetweenInclusive(start: string, end: string): number {
  const diff = parseUtc(end).getTime() - parseUtc(start).getTime();
  return Math.round(diff / 86_400_000) + 1;
}

export function isDateString(value: unknown): value is string {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function parseUtc(value: string): Date {
  return new Date(`${value}T00:00:00.000Z`);
}

function toDateString(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function formatUtc(value: string, options: Intl.DateTimeFormatOptions): string {
  return new Intl.DateTimeFormat("en-US", { ...options, timeZone: "UTC" }).format(parseUtc(value));
}

function money(value: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value);
}

function roundMoney(value: number): number {
  return Math.round(value * 100) / 100;
}
