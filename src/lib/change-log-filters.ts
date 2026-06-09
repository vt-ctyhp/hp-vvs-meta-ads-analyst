import type { ChangeLogEntry, ChangeLogFilters } from "./change-log-types.ts";

/** Subtract `days` from an ISO date (YYYY-MM-DD), returning an ISO date. */
export function isoMinusDays(today: string, days: number): string {
  const [y, m, d] = today.split("-").map(Number);
  const ms = Date.UTC(y, m - 1, d) - days * 86_400_000;
  return new Date(ms).toISOString().slice(0, 10);
}

export function applyChangeLogFilters(
  entries: ChangeLogEntry[],
  filters: ChangeLogFilters,
  today: string,
): ChangeLogEntry[] {
  const cutoff = filters.rangeDays == null ? null : isoMinusDays(today, filters.rangeDays);
  const q = filters.query.trim().toLowerCase();
  return entries.filter((e) => {
    if (cutoff && e.eventDate < cutoff) return false;
    if (filters.brandCode && e.brandCode !== filters.brandCode) return false;
    if (filters.changeType && e.changeType !== filters.changeType) return false;
    if (q) {
      const hay = [e.title, ...e.entities.map((x) => x.entityName)].join(" ").toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });
}
