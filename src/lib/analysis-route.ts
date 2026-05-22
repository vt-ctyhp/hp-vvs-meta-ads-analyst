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
