import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  isFrequency,
  lastNPeriods,
  periodsNewestFirst,
  type PeriodWindow,
} from "../src/lib/period-windows.ts";

// All test "now" values use UTC midnight so the assertions don't depend on
// the test runner's local timezone.
const utcDate = (iso: string) => new Date(`${iso}T12:00:00Z`);

describe("isFrequency", () => {
  it("accepts the four supported values", () => {
    assert.equal(isFrequency("day"), true);
    assert.equal(isFrequency("week"), true);
    assert.equal(isFrequency("month"), true);
    assert.equal(isFrequency("quarter"), true);
  });

  it("rejects anything else", () => {
    assert.equal(isFrequency("year"), false);
    assert.equal(isFrequency("hour"), false);
    assert.equal(isFrequency(""), false);
    assert.equal(isFrequency(undefined), false);
    assert.equal(isFrequency(4), false);
  });
});

describe("lastNPeriods — day", () => {
  it("returns N consecutive days ending today, oldest first", () => {
    const windows = lastNPeriods(utcDate("2026-05-20"), 4, "day");
    assert.equal(windows.length, 4);
    assert.deepEqual(
      windows.map((w) => w.key),
      ["2026-05-17", "2026-05-18", "2026-05-19", "2026-05-20"],
    );
    assert.equal(windows[3].isCurrent, true);
    assert.equal(windows[0].isCurrent, false);
  });

  it("start === end for day windows", () => {
    const windows = lastNPeriods(utcDate("2026-05-20"), 4, "day");
    for (const w of windows) assert.equal(w.start, w.end);
  });

  it("crosses month boundaries cleanly", () => {
    const windows = lastNPeriods(utcDate("2026-06-02"), 5, "day");
    assert.deepEqual(
      windows.map((w) => w.key),
      ["2026-05-29", "2026-05-30", "2026-05-31", "2026-06-01", "2026-06-02"],
    );
  });

  it("uses 'May 20' style short labels", () => {
    const windows = lastNPeriods(utcDate("2026-05-20"), 1, "day");
    assert.equal(windows[0].label, "May 20");
  });
});

describe("lastNPeriods — week (Mon-Sun ISO)", () => {
  it("anchors the rightmost week on the Monday containing `now`", () => {
    // May 20 2026 is a Wednesday. ISO week starts Monday May 18.
    const windows = lastNPeriods(utcDate("2026-05-20"), 4, "week");
    assert.equal(windows.length, 4);
    assert.deepEqual(
      windows.map((w) => w.key),
      ["2026-04-27", "2026-05-04", "2026-05-11", "2026-05-18"],
    );
    assert.equal(windows[3].isCurrent, true);
    assert.equal(windows[3].start, "2026-05-18");
    // Today (May 20) is before Sunday (May 24) → end clamped to today.
    assert.equal(windows[3].end, "2026-05-20");
  });

  it("handles `now` on a Sunday (last day of an ISO week)", () => {
    // May 24 2026 is a Sunday — ISO week is May 18-24.
    const windows = lastNPeriods(utcDate("2026-05-24"), 2, "week");
    assert.deepEqual(
      windows.map((w) => w.key),
      ["2026-05-11", "2026-05-18"],
    );
    // Current week's end is the Sunday itself, not clamped.
    assert.equal(windows[1].end, "2026-05-24");
  });

  it("handles `now` on a Monday (first day of an ISO week)", () => {
    // May 18 2026 is a Monday → that week's first day.
    const windows = lastNPeriods(utcDate("2026-05-18"), 2, "week");
    assert.deepEqual(
      windows.map((w) => w.key),
      ["2026-05-11", "2026-05-18"],
    );
    assert.equal(windows[1].start, "2026-05-18");
    assert.equal(windows[1].end, "2026-05-18"); // clamped to today
  });

  it("uses 'May 18-24' label when week stays in one month, 'Apr 27 – May 3' when it crosses", () => {
    const sameMonth = lastNPeriods(utcDate("2026-05-24"), 1, "week");
    assert.equal(sameMonth[0].label, "May 18-24");

    // Week of April 27 – May 3 crosses the Apr/May boundary.
    const crossesMonth = lastNPeriods(utcDate("2026-05-03"), 1, "week");
    assert.equal(crossesMonth[0].label, "Apr 27 – May 3");
  });

  it("can return 12 weeks without skipping or duplicating", () => {
    const windows = lastNPeriods(utcDate("2026-05-20"), 12, "week");
    assert.equal(windows.length, 12);
    const seen = new Set(windows.map((w) => w.key));
    assert.equal(seen.size, 12, "all keys unique");
    // Mondays should be exactly 7 days apart.
    for (let i = 1; i < windows.length; i++) {
      const prev = Date.parse(`${windows[i - 1].key}T00:00:00Z`);
      const cur = Date.parse(`${windows[i].key}T00:00:00Z`);
      assert.equal(cur - prev, 7 * 86_400_000, `week ${i} not 7 days after ${i - 1}`);
    }
  });
});

describe("lastNPeriods — month", () => {
  it("returns N consecutive months ending in the current month", () => {
    const windows = lastNPeriods(utcDate("2026-05-20"), 4, "month");
    assert.deepEqual(
      windows.map((w) => w.key),
      ["2026-02", "2026-03", "2026-04", "2026-05"],
    );
    assert.equal(windows[3].isCurrent, true);
    assert.equal(windows[3].start, "2026-05-01");
    assert.equal(windows[3].end, "2026-05-20"); // clamped to today
  });

  it("crosses year boundary correctly", () => {
    const windows = lastNPeriods(utcDate("2026-02-15"), 4, "month");
    assert.deepEqual(
      windows.map((w) => w.key),
      ["2025-11", "2025-12", "2026-01", "2026-02"],
    );
  });

  it("uses 'May 2026' style labels", () => {
    const windows = lastNPeriods(utcDate("2026-05-20"), 1, "month");
    assert.equal(windows[0].label, "May 2026");
  });

  it("end-of-month dates compute correctly across short months", () => {
    // February 2026 is not a leap year — 28 days.
    const windows = lastNPeriods(utcDate("2026-03-01"), 2, "month");
    assert.equal(windows[0].key, "2026-02");
    assert.equal(windows[0].end, "2026-02-28");
  });

  it("end-of-month dates compute correctly for a leap-year February", () => {
    // 2028 is a leap year — Feb has 29 days.
    const windows = lastNPeriods(utcDate("2028-03-01"), 2, "month");
    assert.equal(windows[0].key, "2028-02");
    assert.equal(windows[0].end, "2028-02-29");
  });
});

describe("lastNPeriods — quarter", () => {
  it("returns N consecutive quarters anchored on the current quarter", () => {
    // May 2026 is in Q2.
    const windows = lastNPeriods(utcDate("2026-05-20"), 4, "quarter");
    assert.deepEqual(
      windows.map((w) => w.key),
      ["2025-Q3", "2025-Q4", "2026-Q1", "2026-Q2"],
    );
    assert.equal(windows[3].isCurrent, true);
    assert.equal(windows[3].start, "2026-04-01");
    // Q2 ends June 30; today is May 20 → clamped.
    assert.equal(windows[3].end, "2026-05-20");
  });

  it("Q1/Q4 boundary math is right", () => {
    // March 31 = last day of Q1.
    const q1End = lastNPeriods(utcDate("2026-03-31"), 1, "quarter")[0];
    assert.equal(q1End.key, "2026-Q1");
    assert.equal(q1End.start, "2026-01-01");
    assert.equal(q1End.end, "2026-03-31");

    // April 1 = first day of Q2.
    const q2Start = lastNPeriods(utcDate("2026-04-01"), 1, "quarter")[0];
    assert.equal(q2Start.key, "2026-Q2");
    assert.equal(q2Start.start, "2026-04-01");
    assert.equal(q2Start.end, "2026-04-01");
  });

  it("can return 4 quarters crossing a year boundary without drift", () => {
    const windows = lastNPeriods(utcDate("2026-01-15"), 4, "quarter");
    assert.deepEqual(
      windows.map((w) => w.key),
      ["2025-Q2", "2025-Q3", "2025-Q4", "2026-Q1"],
    );
  });

  it("uses '2026 Q2' label format", () => {
    const windows = lastNPeriods(utcDate("2026-05-20"), 1, "quarter");
    assert.equal(windows[0].label, "2026 Q2");
  });
});

describe("lastNPeriods — guards", () => {
  it("throws on count < 1", () => {
    assert.throws(() => lastNPeriods(utcDate("2026-05-20"), 0, "week"));
    assert.throws(() => lastNPeriods(utcDate("2026-05-20"), -3, "week"));
  });

  it("throws on non-finite count", () => {
    assert.throws(() => lastNPeriods(utcDate("2026-05-20"), Number.NaN, "week"));
    assert.throws(() => lastNPeriods(utcDate("2026-05-20"), Number.POSITIVE_INFINITY, "week"));
  });

  it("count = 1 returns exactly the current period", () => {
    const windows: PeriodWindow[] = lastNPeriods(utcDate("2026-05-20"), 1, "week");
    assert.equal(windows.length, 1);
    assert.equal(windows[0].isCurrent, true);
    assert.equal(windows[0].key, "2026-05-18");
  });
});

describe("periodsNewestFirst", () => {
  it("returns the same period windows with the most recent start first", () => {
    const windows = lastNPeriods(utcDate("2026-05-20"), 4, "week");
    const newestFirst = periodsNewestFirst(windows);

    assert.deepEqual(
      newestFirst.map((w) => w.key),
      ["2026-05-18", "2026-05-11", "2026-05-04", "2026-04-27"],
    );
    assert.equal(newestFirst[0].isCurrent, true);
  });

  it("does not mutate the source array", () => {
    const windows = lastNPeriods(utcDate("2026-05-20"), 4, "month");
    periodsNewestFirst(windows);

    assert.deepEqual(
      windows.map((w) => w.key),
      ["2026-02", "2026-03", "2026-04", "2026-05"],
    );
  });
});
