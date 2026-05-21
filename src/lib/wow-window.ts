/**
 * Week-over-week window resolver.
 *
 * Two modes:
 *   - "cal":     current calendar week, Monday → today (capped at Sunday).
 *                Default for the executive snapshot per spec.
 *   - "rolling": trailing 7 days ending today.
 *
 * Both produce {start, end, days} ISO date strings that `fetchDashboardData`
 * already understands; the prior-period comparison resolver downstream uses
 * the same `days` count so comparison windows stay length-matched.
 *
 * Pure function on (mode, now). Easy to unit test.
 */

export type WowMode = "cal" | "rolling";

export type WowWindow = {
  mode: WowMode;
  /** ISO date YYYY-MM-DD */
  start: string;
  /** ISO date YYYY-MM-DD */
  end: string;
  /** Inclusive day count between start and end. */
  days: number;
};

export function isWowMode(value: unknown): value is WowMode {
  return value === "cal" || value === "rolling";
}

export function resolveWowWindow(mode: WowMode, now: Date = new Date()): WowWindow {
  if (mode === "rolling") {
    const end = toYMD(now);
    const startDate = atUtcMidnight(now);
    startDate.setUTCDate(startDate.getUTCDate() - 6);
    return { mode, start: toYMD(startDate), end, days: 7 };
  }

  const monday = startOfIsoWeek(now);
  const sunday = atUtcMidnight(monday);
  sunday.setUTCDate(monday.getUTCDate() + 6);

  const todayYMD = toYMD(now);
  const sundayYMD = toYMD(sunday);
  const end = todayYMD < sundayYMD ? todayYMD : sundayYMD;
  const start = toYMD(monday);

  return { mode, start, end, days: daysBetween(start, end) + 1 };
}

// ── helpers ───────────────────────────────────────────────────────────────

function atUtcMidnight(date: Date): Date {
  return new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()),
  );
}

function startOfIsoWeek(date: Date): Date {
  // ISO weeks start Monday. getUTCDay: 0 = Sunday, 1 = Monday, …, 6 = Saturday.
  const d = atUtcMidnight(date);
  const day = d.getUTCDay();
  // Sunday (0) needs to go back 6 days; Monday (1) is 0; Tuesday (2) back 1; etc.
  const offset = day === 0 ? -6 : 1 - day;
  d.setUTCDate(d.getUTCDate() + offset);
  return d;
}

function toYMD(date: Date): string {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, "0");
  const d = String(date.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function daysBetween(start: string, end: string): number {
  const startMs = Date.parse(`${start}T00:00:00Z`);
  const endMs = Date.parse(`${end}T00:00:00Z`);
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs)) return 0;
  return Math.round((endMs - startMs) / 86_400_000);
}
