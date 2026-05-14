export type DateChunk = {
  start: string;
  end: string;
};

export type InsightDateRange =
  | { kind: "preset"; datePreset?: string }
  | { kind: "range"; since: string; until: string };

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export function monthlyDateChunks(start: string, end: string): DateChunk[] {
  const startDate = parseDate(start);
  const endDate = parseDate(end);
  if (!startDate || !endDate) {
    throw new Error("Backfill start and end dates must be YYYY-MM-DD.");
  }

  const first = startOfMonth(startDate);
  const last = startOfMonth(endDate);
  const chunks: DateChunk[] = [];

  for (let cursor = first; cursor <= last; cursor = addMonths(cursor, 1)) {
    const chunkStart = cursor < startDate ? startDate : cursor;
    const chunkEndOfMonth = endOfMonth(cursor);
    const chunkEnd = chunkEndOfMonth > endDate ? endDate : chunkEndOfMonth;
    chunks.push({ start: formatDate(chunkStart), end: formatDate(chunkEnd) });
  }

  return chunks;
}

export function buildInsightDateParams(range: InsightDateRange): Record<string, string> {
  if (range.kind === "range") {
    return {
      "time_range[since]": range.since,
      "time_range[until]": range.until,
    };
  }

  return { date_preset: range.datePreset || "last_90d" };
}

export function incrementalDatePreset(env: Record<string, string | undefined> = process.env) {
  const explicitPreset = env.META_SYNC_DATE_PRESET?.trim();
  if (explicitPreset) return explicitPreset;

  const days = Number(env.META_INCREMENTAL_SYNC_DAYS);
  const normalizedDays = Number.isFinite(days) && days > 0 ? Math.floor(days) : 90;
  return `last_${normalizedDays}d`;
}

export function normalizeDateInput(value: string | null | undefined) {
  return value && DATE_PATTERN.test(value) ? value : null;
}

export function todayString(now = new Date()) {
  return formatDate(now);
}

function parseDate(value: string) {
  if (!DATE_PATTERN.test(value)) return null;
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isNaN(date.getTime()) || formatDate(date) !== value ? null : date;
}

function startOfMonth(date: Date) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1));
}

function endOfMonth(date: Date) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0));
}

function addMonths(date: Date, months: number) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + months, 1));
}

function formatDate(date: Date) {
  return date.toISOString().slice(0, 10);
}
