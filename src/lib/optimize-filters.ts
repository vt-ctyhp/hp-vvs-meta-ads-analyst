export type OptimizeDeliveryStatus = "live" | "paused" | "off";
export type OptimizeStatusSelection = OptimizeDeliveryStatus | "all";

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
