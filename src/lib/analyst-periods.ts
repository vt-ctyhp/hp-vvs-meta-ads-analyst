export type AnalystPeriodCount = 2 | 4 | 8;

export type AnalystPeriodWindow = {
  start: string;
  end: string;
  key: string;
  label: string;
  isCurrent: boolean;
};

export const ANALYST_PERIOD_COUNTS: AnalystPeriodCount[] = [2, 4, 8];

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const DAY_MS = 86_400_000;
const MONTH_NAMES = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

export function normalizeAnalystPeriodCount(
  value: unknown,
  fallback: AnalystPeriodCount = 2,
): AnalystPeriodCount {
  const parsed = typeof value === "string" ? Number(value) : value;
  return ANALYST_PERIOD_COUNTS.includes(parsed as AnalystPeriodCount)
    ? (parsed as AnalystPeriodCount)
    : fallback;
}

export function rollingAnalystPeriods(
  range: { start: string | null | undefined; end: string | null | undefined },
  count: AnalystPeriodCount,
): AnalystPeriodWindow[] {
  const normalized = normalizeDateRange(range);
  if (!normalized) return [];

  const currentStart = parseDate(normalized.start);
  const currentEnd = parseDate(normalized.end);
  const periodDays = Math.floor((currentEnd.getTime() - currentStart.getTime()) / DAY_MS) + 1;
  const windows: AnalystPeriodWindow[] = [];

  for (let index = 0; index < count; index += 1) {
    const offsetDays = periodDays * index;
    const start = shiftDate(currentStart, -offsetDays);
    const end = shiftDate(currentEnd, -offsetDays);
    const startKey = toDateString(start);
    const endKey = toDateString(end);
    windows.push({
      start: startKey,
      end: endKey,
      key: `${startKey}:${endKey}`,
      label: formatPeriodLabel(start, end),
      isCurrent: index === 0,
    });
  }

  return windows;
}

function normalizeDateRange(range: {
  start: string | null | undefined;
  end: string | null | undefined;
}) {
  if (!range.start || !range.end) return null;
  if (!DATE_PATTERN.test(range.start) || !DATE_PATTERN.test(range.end)) return null;
  return range.start <= range.end
    ? { start: range.start, end: range.end }
    : { start: range.end, end: range.start };
}

function parseDate(value: string) {
  return new Date(`${value}T00:00:00Z`);
}

function shiftDate(value: Date, days: number) {
  const next = new Date(value);
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

function toDateString(value: Date) {
  return value.toISOString().slice(0, 10);
}

function formatPeriodLabel(start: Date, end: Date) {
  const startMonth = MONTH_NAMES[start.getUTCMonth()];
  const endMonth = MONTH_NAMES[end.getUTCMonth()];
  const startDay = start.getUTCDate();
  const endDay = end.getUTCDate();
  const startYear = start.getUTCFullYear();
  const endYear = end.getUTCFullYear();

  if (startYear === endYear && startMonth === endMonth) {
    return `${startMonth} ${startDay}-${endDay}`;
  }

  if (startYear === endYear) {
    return `${startMonth} ${startDay}-${endMonth} ${endDay}`;
  }

  return `${startMonth} ${startDay}, ${startYear}-${endMonth} ${endDay}, ${endYear}`;
}
