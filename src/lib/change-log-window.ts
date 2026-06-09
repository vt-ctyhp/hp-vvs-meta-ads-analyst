import type { ChangeLogEntry, ChangeLogWindow } from "./change-log-types.ts";

/** Inclusive overlap of two ISO date ranges (YYYY-MM-DD compares lexically). */
function rangesOverlap(aStart: string, aEnd: string, bStart: string, bEnd: string) {
  return aStart <= bEnd && bStart <= aEnd;
}

export function entryIntersectsWindow(entry: ChangeLogEntry, window: ChangeLogWindow): boolean {
  const start = entry.effectiveStart ?? entry.eventDate;
  const end = entry.effectiveStart ? entry.effectiveEnd ?? "9999-12-31" : entry.eventDate;
  return rangesOverlap(start, end, window.start, window.end);
}
