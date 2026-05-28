import type { PersonalHeaderMetrics } from "../../../lib/inbox-metrics.ts";

export function shouldRenderMetricsHeader(
  metricsHeaderEnabled: boolean | undefined,
  headerMetrics: PersonalHeaderMetrics | null | undefined,
): boolean {
  return Boolean(metricsHeaderEnabled && headerMetrics);
}
