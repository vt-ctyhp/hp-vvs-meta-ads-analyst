/**
 * Period window resolver for the dashboard's period-pivot table.
 *
 * Given a frequency and a count, returns N consecutive windows ending at
 * (and including) the period that contains `now`. Each window carries the
 * `key` that matches the dim column the `aggregate_meta_daily_insights` RPC
 * emits for that grain — so client-side pivoting can index server rows by
 * key with no extra string-munging.
 *
 * Conventions:
 *   - Weeks are Mon-Sun (ISO). Locked project-wide so we agree with Meta.
 *   - Quarters are calendar (Q1 = Jan-Mar, Q2 = Apr-Jun, etc.).
 *   - All boundary math is UTC. Avoids "I tested in PST and shipped wrong
 *     window labels to operators in EST" pain.
 *   - The most-recent period (`windows[count - 1]`) always includes today
 *     and reads as "so far". An analyst lands and sees the in-progress
 *     period next to the prior completed ones — no need to jump tabs to
 *     check "this week so far".
 *
 * Pure function on (now, count, freq). Heavy unit-test coverage in
 * tests/period-windows.test.ts.
 */

export type Frequency = "day" | "week" | "month" | "quarter";

export type PeriodWindow = {
  /** ISO date YYYY-MM-DD inclusive. */
  start: string;
  /** ISO date YYYY-MM-DD inclusive. End-of-period or today, whichever is sooner. */
  end: string;
  /**
   * Stable identity for this window. Matches the RPC `dim` column the
   * server emits when called with the matching frequency dimension:
   *   - day:     `2026-05-19`
   *   - week:    `2026-05-18`   (Monday of the week)
   *   - month:   `2026-05`
   *   - quarter: `2026-Q2`
   */
  key: string;
  /** Short display label, e.g. "May 18-24", "May 2026", or "2026 Q2". */
  label: string;
  /** True for the in-progress (rightmost) period. */
  isCurrent: boolean;
};

export function isFrequency(value: unknown): value is Frequency {
  return value === "day" || value === "week" || value === "month" || value === "quarter";
}

export function lastNPeriods(
  now: Date,
  count: number,
  freq: Frequency,
): PeriodWindow[] {
  if (!Number.isFinite(count) || count < 1) {
    throw new Error(`lastNPeriods: count must be a positive integer (got ${count}).`);
  }
  switch (freq) {
    case "day":
      return lastNDays(now, count);
    case "week":
      return lastNWeeks(now, count);
    case "month":
      return lastNMonths(now, count);
    case "quarter":
      return lastNQuarters(now, count);
    default: {
      const exhaustive: never = freq;
      throw new Error(`Unknown frequency: ${String(exhaustive)}`);
    }
  }
}

export function periodsNewestFirst(periods: readonly PeriodWindow[]): PeriodWindow[] {
  return [...periods].sort((a, b) => b.start.localeCompare(a.start));
}

// ── Day ───────────────────────────────────────────────────────────────────

function lastNDays(now: Date, count: number): PeriodWindow[] {
  const today = atUtcMidnight(now);
  const windows: PeriodWindow[] = [];

  for (let i = count - 1; i >= 0; i--) {
    const d = new Date(today);
    d.setUTCDate(today.getUTCDate() - i);
    const ymd = toYMD(d);
    windows.push({
      start: ymd,
      end: ymd,
      key: ymd,
      label: shortDayLabel(d),
      isCurrent: i === 0,
    });
  }
  return windows;
}

// ── Week (Mon-Sun, ISO) ───────────────────────────────────────────────────

function lastNWeeks(now: Date, count: number): PeriodWindow[] {
  const currentMonday = startOfIsoWeek(now);
  const today = atUtcMidnight(now);
  const windows: PeriodWindow[] = [];

  for (let i = count - 1; i >= 0; i--) {
    const monday = new Date(currentMonday);
    monday.setUTCDate(currentMonday.getUTCDate() - i * 7);
    const sunday = new Date(monday);
    sunday.setUTCDate(monday.getUTCDate() + 6);

    const isCurrent = i === 0;
    const endDate = isCurrent && today < sunday ? today : sunday;

    windows.push({
      start: toYMD(monday),
      end: toYMD(endDate),
      key: toYMD(monday),
      label: weekLabel(monday, sunday),
      isCurrent,
    });
  }
  return windows;
}

// ── Month ─────────────────────────────────────────────────────────────────

function lastNMonths(now: Date, count: number): PeriodWindow[] {
  const today = atUtcMidnight(now);
  const currentYear = today.getUTCFullYear();
  const currentMonthIdx = today.getUTCMonth();
  const windows: PeriodWindow[] = [];

  for (let i = count - 1; i >= 0; i--) {
    const monthIdx = currentMonthIdx - i;
    // Date constructor normalizes negative months back across year boundaries.
    const firstOfMonth = new Date(Date.UTC(currentYear, monthIdx, 1));
    const firstOfNext = new Date(Date.UTC(firstOfMonth.getUTCFullYear(), firstOfMonth.getUTCMonth() + 1, 1));
    const lastOfMonth = new Date(firstOfNext.getTime() - 86_400_000);

    const isCurrent = i === 0;
    const endDate = isCurrent && today < lastOfMonth ? today : lastOfMonth;

    windows.push({
      start: toYMD(firstOfMonth),
      end: toYMD(endDate),
      key: monthKey(firstOfMonth),
      label: monthLabel(firstOfMonth),
      isCurrent,
    });
  }
  return windows;
}

// ── Quarter ───────────────────────────────────────────────────────────────

function lastNQuarters(now: Date, count: number): PeriodWindow[] {
  const today = atUtcMidnight(now);
  const currentYear = today.getUTCFullYear();
  const currentQuarterIdx = Math.floor(today.getUTCMonth() / 3); // 0..3
  const windows: PeriodWindow[] = [];

  for (let i = count - 1; i >= 0; i--) {
    const absQuarter = currentYear * 4 + currentQuarterIdx - i;
    const year = Math.floor(absQuarter / 4);
    const quarterIdx = ((absQuarter % 4) + 4) % 4; // safe modulo
    const monthIdx = quarterIdx * 3;

    const firstOfQuarter = new Date(Date.UTC(year, monthIdx, 1));
    const firstOfNextQuarter = new Date(Date.UTC(year, monthIdx + 3, 1));
    const lastOfQuarter = new Date(firstOfNextQuarter.getTime() - 86_400_000);

    const isCurrent = i === 0;
    const endDate = isCurrent && today < lastOfQuarter ? today : lastOfQuarter;

    windows.push({
      start: toYMD(firstOfQuarter),
      end: toYMD(endDate),
      key: `${year}-Q${quarterIdx + 1}`,
      label: `${year} Q${quarterIdx + 1}`,
      isCurrent,
    });
  }
  return windows;
}

// ── Date helpers ──────────────────────────────────────────────────────────

function atUtcMidnight(date: Date): Date {
  return new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()),
  );
}

function startOfIsoWeek(date: Date): Date {
  // ISO weeks start Monday. getUTCDay: 0 = Sunday, 1 = Monday, …, 6 = Saturday.
  const d = atUtcMidnight(date);
  const day = d.getUTCDay();
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

function monthKey(firstOfMonth: Date): string {
  const y = firstOfMonth.getUTCFullYear();
  const m = String(firstOfMonth.getUTCMonth() + 1).padStart(2, "0");
  return `${y}-${m}`;
}

const MONTH_NAMES = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

function shortDayLabel(date: Date): string {
  return `${MONTH_NAMES[date.getUTCMonth()]} ${date.getUTCDate()}`;
}

function weekLabel(monday: Date, sunday: Date): string {
  const sameMonth = monday.getUTCMonth() === sunday.getUTCMonth();
  if (sameMonth) {
    return `${MONTH_NAMES[monday.getUTCMonth()]} ${monday.getUTCDate()}-${sunday.getUTCDate()}`;
  }
  return `${MONTH_NAMES[monday.getUTCMonth()]} ${monday.getUTCDate()} – ${MONTH_NAMES[sunday.getUTCMonth()]} ${sunday.getUTCDate()}`;
}

function monthLabel(firstOfMonth: Date): string {
  return `${MONTH_NAMES[firstOfMonth.getUTCMonth()]} ${firstOfMonth.getUTCFullYear()}`;
}
