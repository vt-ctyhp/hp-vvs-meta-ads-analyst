export type AnalysisRouteSearchParams = Record<string, string | string[] | undefined>;

export type AnalysisRouteDateRange = {
  days: number;
  startDate: string | null;
  endDate: string | null;
};

const DEFAULT_ANALYSIS_DAYS = 30;

export function resolveAnalysisRouteDateRange(
  params: AnalysisRouteSearchParams,
): AnalysisRouteDateRange {
  return {
    days: numberParam(params.days) || DEFAULT_ANALYSIS_DAYS,
    startDate: dateParam(params.startDate) || dateParam(params.start),
    endDate: dateParam(params.endDate) || dateParam(params.end),
  };
}

function firstParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function numberParam(value: string | string[] | undefined) {
  const parsed = Number(firstParam(value));
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : null;
}

function dateParam(value: string | string[] | undefined) {
  const raw = firstParam(value);
  return raw && /^\d{4}-\d{2}-\d{2}$/.test(raw) ? raw : null;
}

export type AnalysisRouteFilters = {
  brand: string | null;
  group: string | null;
  status: string | null;
};

/**
 * Reads brand/group/status URL params for /analysis. Mirrors the
 * existing date-range resolver — returns nullable strings, ignoring
 * empty/whitespace values and accepting Next.js array-valued params
 * (takes the first entry).
 *
 * The page route hydrates the OptimizeAiPanel's initial state from the
 * returned values; the client then writes back via router.replace so
 * the URL stays in sync as the user changes filters.
 */
export function resolveAnalysisRouteFilters(
  params: AnalysisRouteSearchParams,
): AnalysisRouteFilters {
  return {
    brand: stringParam(params.brand),
    group: stringParam(params.group),
    status: stringParam(params.status),
  };
}

function stringParam(value: string | string[] | undefined): string | null {
  const raw = firstParam(value);
  if (!raw) return null;
  const trimmed = raw.trim();
  return trimmed.length > 0 ? trimmed : null;
}
