import { CALIFORNIA_TIME_ZONE } from "./california-time.ts";

export type BusinessWindow = { tz: string; startHour: number; endHour: number };

export const CALIFORNIA_BUSINESS_WINDOW: BusinessWindow = {
  tz: CALIFORNIA_TIME_ZONE,
  startHour: 10,
  endHour: 19,
};

export const VN_BUSINESS_WINDOW: BusinessWindow = {
  tz: "Asia/Ho_Chi_Minh",
  startHour: 10,
  endHour: 19,
};

type ZonedParts = {
  year: number;
  month: number; // 1-12
  day: number;
  hour: number;
  minute: number;
  second: number;
};

const PARTS_FORMATTERS = new Map<string, Intl.DateTimeFormat>();

function partsFormatter(tz: string): Intl.DateTimeFormat {
  let formatter = PARTS_FORMATTERS.get(tz);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat("en-US", {
      timeZone: tz,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false,
    });
    PARTS_FORMATTERS.set(tz, formatter);
  }
  return formatter;
}

function zonedParts(date: Date, tz: string): ZonedParts {
  const map: Record<string, number> = {};
  for (const part of partsFormatter(tz).formatToParts(date)) {
    if (part.type !== "literal") map[part.type] = Number(part.value);
  }
  // Intl renders 24:xx for midnight in hour12:false; normalize to 0.
  const hour = map.hour === 24 ? 0 : map.hour;
  return {
    year: map.year,
    month: map.month,
    day: map.day,
    hour,
    minute: map.minute,
    second: map.second,
  };
}

// Find the UTC instant whose wall-clock time in `tz` equals the given
// local Y-M-D h:m:s. Robust across DST via a two-pass correction.
function zonedTimeToUtc(
  tz: string,
  year: number,
  month: number,
  day: number,
  hour: number,
  minute = 0,
  second = 0,
): Date {
  const guess = Date.UTC(year, month - 1, day, hour, minute, second);
  const parts = zonedParts(new Date(guess), tz);
  const asUtc = Date.UTC(
    parts.year,
    parts.month - 1,
    parts.day,
    parts.hour,
    parts.minute,
    parts.second,
  );
  const offset = asUtc - guess;
  return new Date(guess - offset);
}

function dayWindow(now: Date, w: BusinessWindow, dayOffset: number): { start: Date; end: Date } {
  const todayParts = zonedParts(now, w.tz);
  const base = Date.UTC(todayParts.year, todayParts.month - 1, todayParts.day);
  const shifted = new Date(base + dayOffset * 86_400_000);
  const y = shifted.getUTCFullYear();
  const m = shifted.getUTCMonth() + 1;
  const d = shifted.getUTCDate();
  const start = zonedTimeToUtc(w.tz, y, m, d, w.startHour);
  const endDayOffset = w.endHour <= w.startHour ? 1 : 0;
  const endShifted = new Date(Date.UTC(y, m - 1, d) + endDayOffset * 86_400_000);
  const end = zonedTimeToUtc(
    w.tz,
    endShifted.getUTCFullYear(),
    endShifted.getUTCMonth() + 1,
    endShifted.getUTCDate(),
    w.endHour,
  );
  return { start, end };
}

export function todaysWindow(
  now: Date,
  w: BusinessWindow,
): { start: Date; end: Date; state: "before" | "open" | "after" } {
  const { start, end } = dayWindow(now, w, 0);
  const t = now.getTime();
  const state = t < start.getTime() ? "before" : t >= end.getTime() ? "after" : "open";
  return { start, end, state };
}

export function yesterdaysWindow(now: Date, w: BusinessWindow): { start: Date; end: Date } {
  return dayWindow(now, w, -1);
}

// Sum of wall-clock seconds in [startHour,endHour) local to w.tz between
// `from` and `to`. Iterates day-by-day in the tz; safe across DST because
// each day's window is recomputed via zonedTimeToUtc.
export function businessSecondsBetween(from: Date, to: Date, w: BusinessWindow): number {
  if (from.getTime() >= to.getTime()) return 0;

  let total = 0;
  // Start from the calendar day of `from` in tz, walk forward until past `to`.
  const startParts = zonedParts(from, w.tz);
  let cursorBase = Date.UTC(startParts.year, startParts.month - 1, startParts.day);
  const guardEnd = to.getTime();

  // Cap iterations defensively (years of span would still terminate).
  for (let i = 0; i < 4000; i += 1) {
    const shifted = new Date(cursorBase);
    const y = shifted.getUTCFullYear();
    const m = shifted.getUTCMonth() + 1;
    const d = shifted.getUTCDate();
    const dayStart = zonedTimeToUtc(w.tz, y, m, d, w.startHour);
    const endDayOffset = w.endHour <= w.startHour ? 1 : 0;
    const endShift = new Date(Date.UTC(y, m - 1, d) + endDayOffset * 86_400_000);
    const dayEnd = zonedTimeToUtc(
      w.tz,
      endShift.getUTCFullYear(),
      endShift.getUTCMonth() + 1,
      endShift.getUTCDate(),
      w.endHour,
    );

    const overlapStart = Math.max(from.getTime(), dayStart.getTime());
    const overlapEnd = Math.min(to.getTime(), dayEnd.getTime());
    if (overlapEnd > overlapStart) {
      total += Math.round((overlapEnd - overlapStart) / 1000);
    }

    if (dayStart.getTime() > guardEnd) break;
    cursorBase += 86_400_000;
  }
  return total;
}

// The instant `slaSeconds` of business time after `arrivedAt`. Walks
// forward day-by-day consuming each day's open window until the budget
// is spent. If arrival is before open, the clock starts at open.
export function breachAt(arrivedAt: Date, slaSeconds: number, w: BusinessWindow): Date {
  let remaining = slaSeconds;
  const startParts = zonedParts(arrivedAt, w.tz);
  let cursorBase = Date.UTC(startParts.year, startParts.month - 1, startParts.day);

  for (let i = 0; i < 4000; i += 1) {
    const shifted = new Date(cursorBase);
    const y = shifted.getUTCFullYear();
    const m = shifted.getUTCMonth() + 1;
    const d = shifted.getUTCDate();
    const dayStart = zonedTimeToUtc(w.tz, y, m, d, w.startHour);
    const endDayOffset = w.endHour <= w.startHour ? 1 : 0;
    const endShift = new Date(Date.UTC(y, m - 1, d) + endDayOffset * 86_400_000);
    const dayEnd = zonedTimeToUtc(
      w.tz,
      endShift.getUTCFullYear(),
      endShift.getUTCMonth() + 1,
      endShift.getUTCDate(),
      w.endHour,
    );

    const clockStart = Math.max(arrivedAt.getTime(), dayStart.getTime());
    if (clockStart < dayEnd.getTime()) {
      const available = Math.round((dayEnd.getTime() - clockStart) / 1000);
      if (remaining <= available) {
        return new Date(clockStart + remaining * 1000);
      }
      remaining -= available;
    }
    cursorBase += 86_400_000;
  }
  // Defensive fallback: should never hit with positive slaSeconds.
  return new Date(arrivedAt.getTime() + slaSeconds * 1000);
}

// Signed business seconds from `now` to `deadline`. Negative = breached
// (deadline already past in business time).
export function businessSecondsRemainingUntil(
  deadline: Date,
  now: Date,
  w: BusinessWindow,
): number {
  if (deadline.getTime() >= now.getTime()) {
    return businessSecondsBetween(now, deadline, w);
  }
  return -businessSecondsBetween(deadline, now, w);
}
