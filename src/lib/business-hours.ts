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
