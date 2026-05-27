import { format, parseISO, subDays } from "date-fns";

import type { AnalysisWorkbenchContextDateRange } from "./analysis-workbench-contract.ts";
import type {
  WorkbenchDateGrain,
  WorkbenchDimension,
} from "./analysis-workbench-semantic-catalog.ts";

export const WORKBENCH_PLANNER_DATE_GRAINS = ["day", "week", "month", "quarter"] as const;
export const WORKBENCH_PLANNER_ROLLING_UNITS = ["day", "week", "month", "quarter"] as const;

export type WorkbenchPlannerDateGrain = (typeof WORKBENCH_PLANNER_DATE_GRAINS)[number];
export type WorkbenchPlannerRollingUnit = (typeof WORKBENCH_PLANNER_ROLLING_UNITS)[number];

export type WorkbenchPlannerDateIntent = {
  kind:
    | "calendar_year"
    | "calendar_month"
    | "calendar_quarter"
    | "year_to_date"
    | "month_to_date"
    | "week_to_date"
    | "quarter_to_date"
    | "rolling"
    | "explicit_range"
    | "inherit_or_default";
  year?: number | null;
  month?: number | null;
  quarter?: 1 | 2 | 3 | 4 | null;
  unit?: WorkbenchPlannerRollingUnit | null;
  count?: number | null;
  start?: string | null;
  end?: string | null;
  grain?: WorkbenchPlannerDateGrain | null;
};

export type ResolvedWorkbenchDateIntent = {
  dateRange: AnalysisWorkbenchContextDateRange;
  dateGrain: WorkbenchDateGrain | null;
  assumptions: Array<{ code: string; message: string }>;
};

const MONTHS: Record<string, number> = {
  jan: 1,
  january: 1,
  feb: 2,
  february: 2,
  mar: 3,
  march: 3,
  apr: 4,
  april: 4,
  may: 5,
  jun: 6,
  june: 6,
  jul: 7,
  july: 7,
  aug: 8,
  august: 8,
  sep: 9,
  sept: 9,
  september: 9,
  oct: 10,
  october: 10,
  nov: 11,
  november: 11,
  dec: 12,
  december: 12,
};

const ORDINAL_QUARTERS: Record<string, 1 | 2 | 3 | 4> = {
  first: 1,
  second: 2,
  third: 3,
  fourth: 4,
};

const NUMBER_WORDS: Record<string, number> = {
  one: 1,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
  seven: 7,
  eight: 8,
  nine: 9,
  ten: 10,
  eleven: 11,
  twelve: 12,
  thirteen: 13,
  fourteen: 14,
  fifteen: 15,
  sixteen: 16,
  seventeen: 17,
  eighteen: 18,
  nineteen: 19,
  twenty: 20,
  thirty: 30,
  ninety: 90,
};

export function inferAnalysisWorkbenchDateIntentFromPrompt(
  prompt: string,
): WorkbenchPlannerDateIntent | null {
  const lower = prompt.toLowerCase().replace(/\s+/g, " ").trim();
  const grain = inferWorkbenchDateGrainFromPrompt(lower);
  const explicitRange = explicitRangeIntent(lower, grain);
  if (explicitRange) return explicitRange;

  const quarter = quarterIntent(lower, grain);
  if (quarter) return quarter;

  const month = monthIntent(lower, grain);
  if (month) return month;

  const year = calendarYearIntent(lower, grain);
  if (year) return year;

  if (/\by(?:ear)?\s*to\s*date\b|\bytd\b|\bthis\s+year\b|\bcurrent\s+year\b/.test(lower)) {
    return { kind: "year_to_date", grain };
  }
  if (/\bmonth\s*to\s*date\b|\bmtd\b|\bthis\s+month\b|\bcurrent\s+month\b|\bmonth\s+so\s+far\b/.test(lower)) {
    return { kind: "month_to_date", grain };
  }
  if (/\bweek\s*to\s*date\b|\bwtd\b|\bthis\s+week\b|\bcurrent\s+week\b|\bweek\s+so\s+far\b/.test(lower)) {
    return { kind: "week_to_date", grain };
  }
  if (/\bquarter\s*to\s*date\b|\bqtd\b|\bthis\s+quarter\b|\bcurrent\s+quarter\b|\bquarter\s+so\s+far\b/.test(lower)) {
    return { kind: "quarter_to_date", grain };
  }

  const rolling = rollingIntent(lower, grain);
  if (rolling) return rolling;

  return grain ? { kind: "inherit_or_default", grain } : null;
}

export function inferWorkbenchDateGrainFromPrompt(
  prompt: string,
): WorkbenchPlannerDateGrain | null {
  const lower = prompt.toLowerCase();
  if (/\bby\s+(?:day|date)\b|\band\s+(?:day|date)\b|\bdaily\b|\bper\s+day\b|\bevery\s+day\b|\beach\s+day\b|\bday[-\s]?by[-\s]?day\b/.test(lower)) {
    return "day";
  }
  if (/\bby\s+week\b|\band\s+week\b|\bweekly\b|\bper\s+week\b|\beach\s+week\b|\bweek[-\s]?by[-\s]?week\b/.test(lower)) {
    return "week";
  }
  if (/\bby\s+month\b|\band\s+month\b|\bmonthly\b(?!\s+budget)|\bper\s+month\b|\beach\s+month\b|\bmonth[-\s]?by[-\s]?month\b/.test(lower)) {
    return "month";
  }
  if (/\bby\s+quarter\b|\band\s+quarter\b|\bquarterly\b|\bper\s+quarter\b|\beach\s+quarter\b|\bquarter[-\s]?by[-\s]?quarter\b/.test(lower)) {
    return "quarter";
  }
  return null;
}

export function resolveAnalysisWorkbenchDateIntent(input: {
  dateIntent: WorkbenchPlannerDateIntent | null | undefined;
  latestSyncedInsightDate?: string | null;
  inheritedDateRange?: AnalysisWorkbenchContextDateRange | null;
}): ResolvedWorkbenchDateIntent {
  const end = isDateString(input.latestSyncedInsightDate)
    ? input.latestSyncedInsightDate
    : format(new Date(), "yyyy-MM-dd");
  const intent = input.dateIntent || { kind: "inherit_or_default" as const };
  const dateGrain = normalizeDateGrain(intent.grain);

  if (intent.kind === "inherit_or_default") {
    if (input.inheritedDateRange) {
      return {
        dateRange: input.inheritedDateRange,
        dateGrain,
        assumptions: [],
      };
    }
    return {
      dateRange: rollingDateRange(end, "day", 30),
      dateGrain,
      assumptions: [relativeDateAssumption()],
    };
  }

  if (intent.kind === "explicit_range" && isDateString(intent.start)) {
    const explicitEnd = isDateString(intent.end) ? intent.end : end;
    return {
      dateRange: labeledRange(intent.start, explicitEnd, `${intent.start} to ${explicitEnd}`),
      dateGrain,
      assumptions: isDateString(intent.end) ? [] : [relativeDateAssumption()],
    };
  }

  if (intent.kind === "calendar_year" && validYear(intent.year)) {
    const start = `${intent.year}-01-01`;
    const rangeEnd = `${intent.year}-12-31`;
    return {
      dateRange: labeledRange(start, rangeEnd, String(intent.year)),
      dateGrain,
      assumptions: [],
    };
  }

  if (intent.kind === "calendar_month" && validYear(intent.year) && validMonth(intent.month)) {
    const start = isoDate(inputDate(intent.year, intent.month - 1, 1));
    const rangeEnd = isoDate(inputDate(intent.year, intent.month, 0));
    return {
      dateRange: labeledRange(start, rangeEnd, `${monthLabel(intent.month)} ${intent.year}`),
      dateGrain,
      assumptions: [],
    };
  }

  if (intent.kind === "calendar_quarter" && validYear(intent.year) && validQuarter(intent.quarter)) {
    const startMonth = (intent.quarter - 1) * 3;
    const start = isoDate(inputDate(intent.year, startMonth, 1));
    const rangeEnd = isoDate(inputDate(intent.year, startMonth + 3, 0));
    return {
      dateRange: labeledRange(start, rangeEnd, `Q${intent.quarter} ${intent.year}`),
      dateGrain,
      assumptions: [],
    };
  }

  if (intent.kind === "year_to_date") {
    const endDate = parseISO(end);
    const year = validYear(intent.year) ? intent.year : endDate.getFullYear();
    const start = `${year}-01-01`;
    return {
      dateRange: labeledRange(start, end, "Year to date"),
      dateGrain,
      assumptions: [relativeDateAssumption()],
    };
  }

  if (intent.kind === "month_to_date") {
    const start = `${end.slice(0, 8)}01`;
    return {
      dateRange: labeledRange(start, end, "This month"),
      dateGrain,
      assumptions: [relativeDateAssumption()],
    };
  }

  if (intent.kind === "week_to_date") {
    const endDate = parseISO(end);
    const daysSinceMonday = (endDate.getDay() + 6) % 7;
    const start = format(subDays(endDate, daysSinceMonday), "yyyy-MM-dd");
    return {
      dateRange: labeledRange(start, end, "This week"),
      dateGrain,
      assumptions: [relativeDateAssumption()],
    };
  }

  if (intent.kind === "quarter_to_date") {
    const endDate = parseISO(end);
    const quarterStartMonth = Math.floor(endDate.getMonth() / 3) * 3;
    const start = isoDate(inputDate(endDate.getFullYear(), quarterStartMonth, 1));
    return {
      dateRange: labeledRange(start, end, "This quarter"),
      dateGrain,
      assumptions: [relativeDateAssumption()],
    };
  }

  if (intent.kind === "rolling" && intent.unit && validCount(intent.count)) {
    return {
      dateRange: rollingDateRange(end, intent.unit, intent.count),
      dateGrain,
      assumptions: [relativeDateAssumption()],
    };
  }

  return {
    dateRange: input.inheritedDateRange || rollingDateRange(end, "day", 30),
    dateGrain,
    assumptions: input.inheritedDateRange ? [] : [relativeDateAssumption()],
  };
}

export function dateGrainToDimension(
  grain: WorkbenchPlannerDateGrain | WorkbenchDateGrain | null | undefined,
): WorkbenchDimension | null {
  if (grain === "day") return "date";
  if (grain === "week") return "week";
  if (grain === "month") return "month";
  if (grain === "quarter") return "quarter";
  return null;
}

export function dateGrainForDimensions(dimensions: WorkbenchDimension[]): WorkbenchDateGrain | null {
  if (dimensions.includes("date")) return "day";
  if (dimensions.includes("week")) return "week";
  if (dimensions.includes("month")) return "month";
  if (dimensions.includes("quarter")) return "quarter";
  return null;
}

export function dateBucketLimit(
  dateRange: AnalysisWorkbenchContextDateRange,
  grain: WorkbenchDateGrain | null,
) {
  if (grain === "day") return dateRange.days;
  if (grain === "week") return Math.ceil(dateRange.days / 7) + 1;
  if (grain === "month") return monthsInclusive(dateRange.start, dateRange.end);
  if (grain === "quarter") return Math.ceil(monthsInclusive(dateRange.start, dateRange.end) / 3);
  return dateRange.days;
}

function explicitRangeIntent(
  lower: string,
  grain: WorkbenchPlannerDateGrain | null,
): WorkbenchPlannerDateIntent | null {
  const isoRange = lower.match(
    /\b(?:from\s+)?(\d{4}-\d{2}-\d{2})\s+(?:to|through|thru|until|-)\s+(\d{4}-\d{2}-\d{2})\b/,
  );
  if (isoRange) return { kind: "explicit_range", start: isoRange[1], end: isoRange[2], grain };

  const since = lower.match(/\b(?:since|from|starting)\s+(\d{4}-\d{2}-\d{2})\b/);
  if (since) return { kind: "explicit_range", start: since[1], end: null, grain };

  return null;
}

function calendarYearIntent(
  lower: string,
  grain: WorkbenchPlannerDateGrain | null,
): WorkbenchPlannerDateIntent | null {
  const fullYear = lower.match(
    /\b(?:entire|full|whole|all)\s+(?:of\s+)?(?:year\s+)?(20\d{2})\b|\b(?:for|in|during|throughout)\s+(?:the\s+)?(?:entire|full|whole|all)\s+(?:of\s+)?(20\d{2})\b/,
  );
  if (fullYear) return { kind: "calendar_year", year: Number(fullYear[1] || fullYear[2]), grain };

  const simpleYear = lower.match(/\b(?:in|for|during|throughout)\s+(20\d{2})\b|\b(20\d{2})\s+(?:weekly|monthly|quarterly|trend|spend|performance)\b/);
  if (simpleYear) return { kind: "calendar_year", year: Number(simpleYear[1] || simpleYear[2]), grain };

  const grainYear = grain ? lower.match(/\b(20\d{2})\b/) : null;
  if (grainYear) return { kind: "calendar_year", year: Number(grainYear[1]), grain };

  return null;
}

function monthIntent(
  lower: string,
  grain: WorkbenchPlannerDateGrain | null,
): WorkbenchPlannerDateIntent | null {
  const names = Object.keys(MONTHS).join("|");
  const monthMatch = lower.match(new RegExp(`\\b(${names})\\s+(20\\d{2})\\b`));
  if (monthMatch) {
    return {
      kind: "calendar_month",
      month: MONTHS[monthMatch[1]],
      year: Number(monthMatch[2]),
      grain,
    };
  }

  return null;
}

function quarterIntent(
  lower: string,
  grain: WorkbenchPlannerDateGrain | null,
): WorkbenchPlannerDateIntent | null {
  const qMatch = lower.match(/\bq([1-4])\s+(20\d{2})\b|\b(20\d{2})\s+q([1-4])\b/);
  if (qMatch) {
    return {
      kind: "calendar_quarter",
      quarter: Number(qMatch[1] || qMatch[4]) as 1 | 2 | 3 | 4,
      year: Number(qMatch[2] || qMatch[3]),
      grain,
    };
  }

  const ordinalMatch = lower.match(/\b(first|second|third|fourth)\s+quarter\s+(?:of\s+)?(20\d{2})\b/);
  if (ordinalMatch) {
    return {
      kind: "calendar_quarter",
      quarter: ORDINAL_QUARTERS[ordinalMatch[1]],
      year: Number(ordinalMatch[2]),
      grain,
    };
  }

  return null;
}

function rollingIntent(
  lower: string,
  grain: WorkbenchPlannerDateGrain | null,
): WorkbenchPlannerDateIntent | null {
  const relativeLead = "(?:last|past|previous|prior|recent|trailing)";
  const countMatch = lower.match(
    new RegExp(`\\b${relativeLead}\\s+([a-z]+|\\d+)\\s+(days?|weeks?|months?|quarters?)\\b`),
  );
  if (countMatch) {
    return {
      kind: "rolling",
      unit: singularUnit(countMatch[2]),
      count: wordNumber(countMatch[1]),
      grain,
    };
  }

  const implicit = lower.match(new RegExp(`\\b${relativeLead}\\s+(day|week|month|quarter)\\b`));
  if (implicit) return { kind: "rolling", unit: implicit[1] as WorkbenchPlannerRollingUnit, count: 1, grain };

  return null;
}

function rollingDateRange(
  end: string,
  unit: WorkbenchPlannerRollingUnit,
  count: number,
): AnalysisWorkbenchContextDateRange {
  const daysByUnit: Record<WorkbenchPlannerRollingUnit, number> = {
    day: 1,
    week: 7,
    month: 30,
    quarter: 90,
  };
  const days = Math.max(1, count * daysByUnit[unit]);
  const start = format(subDays(parseISO(end), days - 1), "yyyy-MM-dd");
  const unitLabel = days === 1 ? "day" : "days";
  return {
    start,
    end,
    days,
    label: `Last ${days} ${unitLabel}`,
  };
}

function labeledRange(start: string, end: string, label: string): AnalysisWorkbenchContextDateRange {
  const rangeStart = isDateString(start) ? start : end;
  const rangeEnd = isDateString(end) ? end : rangeStart;
  return {
    start: rangeStart,
    end: rangeEnd,
    days: inclusiveDateDays(rangeStart, rangeEnd),
    label,
  };
}

function relativeDateAssumption() {
  return {
    code: "relative_date_range",
    message: "Relative date range ends at the latest complete synced Meta Ads date.",
  };
}

function normalizeDateGrain(
  grain: WorkbenchPlannerDateIntent["grain"],
): WorkbenchDateGrain | null {
  if (grain === "day" || grain === "week" || grain === "month" || grain === "quarter") return grain;
  return null;
}

function singularUnit(value: string): WorkbenchPlannerRollingUnit {
  if (value.startsWith("week")) return "week";
  if (value.startsWith("month")) return "month";
  if (value.startsWith("quarter")) return "quarter";
  return "day";
}

function wordNumber(value: string) {
  if (/^\d+$/.test(value)) return Number(value);
  return NUMBER_WORDS[value] || 1;
}

function validCount(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value > 0;
}

function validYear(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 2000 && value <= 2100;
}

function validMonth(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 1 && value <= 12;
}

function validQuarter(value: unknown): value is 1 | 2 | 3 | 4 {
  return typeof value === "number" && Number.isInteger(value) && value >= 1 && value <= 4;
}

function monthLabel(month: number) {
  return [
    "January",
    "February",
    "March",
    "April",
    "May",
    "June",
    "July",
    "August",
    "September",
    "October",
    "November",
    "December",
  ][month - 1];
}

function inclusiveDateDays(start: string, end: string) {
  const startTime = Date.parse(`${start}T00:00:00.000Z`);
  const endTime = Date.parse(`${end}T00:00:00.000Z`);
  if (!Number.isFinite(startTime) || !Number.isFinite(endTime) || endTime < startTime) return 1;
  return Math.round((endTime - startTime) / 86_400_000) + 1;
}

function monthsInclusive(start: string, end: string) {
  const startDate = parseISO(start);
  const endDate = parseISO(end);
  return Math.max(
    1,
    (endDate.getFullYear() - startDate.getFullYear()) * 12 +
      (endDate.getMonth() - startDate.getMonth()) +
      1,
  );
}

function inputDate(year: number, monthIndex: number, day: number) {
  return new Date(Date.UTC(year, monthIndex, day));
}

function isoDate(date: Date) {
  return date.toISOString().slice(0, 10);
}

function isDateString(value: unknown): value is string {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value);
}
