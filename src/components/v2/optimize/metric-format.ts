import type { PeriodMetric } from "@/lib/period-pivot-data";

/**
 * Per-metric cell formatter. Picks the right currency/percent/integer
 * shape so the table is readable without explanatory headers.
 *
 *   spend, cost_per_primary_results   → "$1,234"   /  "$28.50"
 *   primary_results, impressions      → "12,345"
 *   ctr                               → "1.8%"
 *   cpc                               → "$0.85"
 */
export function formatMetric(value: number | undefined, metric: PeriodMetric): string {
  if (value === undefined || !Number.isFinite(value)) return "—";
  switch (metric) {
    case "spend":
      return CURRENCY_0.format(value);
    case "cost_per_primary_results":
      return value >= 100 ? CURRENCY_0.format(value) : CURRENCY_2.format(value);
    case "cpc":
      return CURRENCY_2.format(value);
    case "primary_results":
    case "impressions":
      return INTEGER.format(value);
    case "ctr":
      // CTR is emitted as a percent already (1.8 means 1.8%) by the RPC.
      return `${value.toFixed(2)}%`;
    default: {
      const exhaustive: never = metric;
      throw new Error(`Unknown metric: ${String(exhaustive)}`);
    }
  }
}

/**
 * Format a percentage delta as "▲22%" or "▼14%". Returns null for an
 * infinite or undefined ratio (e.g. baseline was zero).
 */
export function formatDelta(
  current: number | undefined,
  baseline: number | undefined,
): { text: string; positive: boolean } | null {
  if (current === undefined || baseline === undefined) return null;
  if (!Number.isFinite(current) || !Number.isFinite(baseline)) return null;
  if (baseline === 0) return null;
  const ratio = (current - baseline) / Math.abs(baseline);
  if (!Number.isFinite(ratio)) return null;
  const pct = ratio * 100;
  const rounded = Math.abs(pct) >= 100 ? Math.round(pct) : Math.round(pct * 10) / 10;
  const arrow = rounded >= 0 ? "▲" : "▼";
  const sign = rounded >= 0 ? "" : "";
  return {
    text: `${arrow} ${sign}${Math.abs(rounded)}%`,
    positive: rounded >= 0,
  };
}

const CURRENCY_0 = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
});

const CURRENCY_2 = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const INTEGER = new Intl.NumberFormat("en-US");
