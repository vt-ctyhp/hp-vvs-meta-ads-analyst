import type { MetaInsightFilter } from "./meta-insight-aggregates.ts";

export type OptimizeDeliveryStatus = "live" | "paused" | "off";
export type OptimizeStatusSelection = OptimizeDeliveryStatus | "all";
export type SharedOptimizeFilterInput = {
  brand?: string | null;
  group?: string | null;
  status?: string | null;
};

export type SharedOptimizeFilterContext = {
  brand: string | null;
  group: string | null;
  status: OptimizeDeliveryStatus | null;
  filters: MetaInsightFilter[];
};

const DELIVERY_STATUSES = new Set<OptimizeDeliveryStatus>([
  "live",
  "paused",
  "off",
]);

export function normalizeOptimizeStatusSelection(
  value: string | null | undefined,
): OptimizeStatusSelection | null {
  if (!value) return null;
  const normalized = value.toLowerCase();
  if (normalized === "all") return "all";
  return DELIVERY_STATUSES.has(normalized as OptimizeDeliveryStatus)
    ? (normalized as OptimizeDeliveryStatus)
    : null;
}

export function normalizeOptimizeDeliveryStatus(
  value: string | null | undefined,
): OptimizeDeliveryStatus | null {
  const selection = normalizeOptimizeStatusSelection(value);
  return selection === "all" ? null : selection;
}

export function buildSharedInsightFilterContext(
  input: SharedOptimizeFilterInput,
): SharedOptimizeFilterContext {
  const brand = normalizeSharedFilterValue(input.brand);
  const group = normalizeSharedFilterValue(input.group);
  const status = normalizeOptimizeDeliveryStatus(input.status);
  const filters: MetaInsightFilter[] = [];

  if (brand) {
    filters.push({ field: "brand", operator: "equals", value: brand });
  }
  if (group) {
    filters.push({
      field: "campaign_umbrella",
      operator: "equals",
      value: group,
    });
  }
  if (status) {
    filters.push({ field: "delivery_status", operator: "equals", value: status });
  }

  return { brand, group, status, filters };
}

export function buildSharedInsightFilters(
  input: SharedOptimizeFilterInput,
): MetaInsightFilter[] {
  return buildSharedInsightFilterContext(input).filters;
}

function normalizeSharedFilterValue(value: string | null | undefined) {
  return value && value !== "all" ? value : null;
}
