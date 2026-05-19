import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { isWowMode, resolveWowWindow, type WowMode } from "../src/lib/wow-window.ts";

function utc(year: number, month: number, day: number) {
  return new Date(Date.UTC(year, month - 1, day));
}

describe("wow-window — calendar mode", () => {
  it("returns Monday → today for a midweek date (in-progress current week)", () => {
    // Wed Apr 8, 2026 (Monday of that ISO week is Apr 6)
    const window = resolveWowWindow("cal", utc(2026, 4, 8));
    assert.equal(window.mode, "cal");
    assert.equal(window.start, "2026-04-06");
    assert.equal(window.end, "2026-04-08");
    assert.equal(window.days, 3);
  });

  it("returns Monday → today on Monday (1 day window)", () => {
    // Mon Apr 6, 2026
    const window = resolveWowWindow("cal", utc(2026, 4, 6));
    assert.equal(window.start, "2026-04-06");
    assert.equal(window.end, "2026-04-06");
    assert.equal(window.days, 1);
  });

  it("returns full Monday–Sunday on Sunday end-of-week", () => {
    // Sun Apr 12, 2026
    const window = resolveWowWindow("cal", utc(2026, 4, 12));
    assert.equal(window.start, "2026-04-06");
    assert.equal(window.end, "2026-04-12");
    assert.equal(window.days, 7);
  });

  it("handles Sunday-rollover: a date on Sunday belongs to that week, not the next", () => {
    // Sunday Apr 12, 2026 — start is the preceding Monday Apr 6
    const window = resolveWowWindow("cal", utc(2026, 4, 12));
    assert.equal(window.start, "2026-04-06");
  });

  it("handles month boundary", () => {
    // Wed Apr 1, 2026 — Monday is Mar 30
    const window = resolveWowWindow("cal", utc(2026, 4, 1));
    assert.equal(window.start, "2026-03-30");
    assert.equal(window.end, "2026-04-01");
    assert.equal(window.days, 3);
  });
});

describe("wow-window — rolling mode", () => {
  it("returns the trailing 7 days ending today", () => {
    // Wed Apr 8, 2026 → Apr 2 - Apr 8 inclusive
    const window = resolveWowWindow("rolling", utc(2026, 4, 8));
    assert.equal(window.mode, "rolling");
    assert.equal(window.start, "2026-04-02");
    assert.equal(window.end, "2026-04-08");
    assert.equal(window.days, 7);
  });

  it("always returns exactly 7 days, regardless of weekday", () => {
    const days: number[] = [];
    for (let dayOfMonth = 1; dayOfMonth <= 30; dayOfMonth += 1) {
      const window = resolveWowWindow("rolling", utc(2026, 4, dayOfMonth));
      days.push(window.days);
    }
    assert.deepEqual(
      days,
      Array.from({ length: 30 }, () => 7),
    );
  });

  it("handles month boundary on rolling window", () => {
    // Apr 3, 2026 → Mar 28 - Apr 3
    const window = resolveWowWindow("rolling", utc(2026, 4, 3));
    assert.equal(window.start, "2026-03-28");
    assert.equal(window.end, "2026-04-03");
  });
});

describe("wow-window — guards", () => {
  it("isWowMode accepts the two supported values", () => {
    assert.equal(isWowMode("cal"), true);
    assert.equal(isWowMode("rolling"), true);
  });

  it("isWowMode rejects anything else", () => {
    for (const value of [null, undefined, "weekly", "", 0, 7, {}, []] as unknown[]) {
      assert.equal(isWowMode(value), false);
    }
  });

  it("works with default `new Date()` argument (smoke test)", () => {
    const window = resolveWowWindow("rolling");
    assert.equal(window.mode, "rolling");
    assert.equal(window.days, 7);
    assert.match(window.start, /^\d{4}-\d{2}-\d{2}$/);
    assert.match(window.end, /^\d{4}-\d{2}-\d{2}$/);
  });

  it("calendar mode also smoke-tests with default `new Date()`", () => {
    const window = resolveWowWindow("cal");
    assert.equal(window.mode, "cal");
    assert.ok(window.days >= 1 && window.days <= 7);
  });
});

describe("wow-window — both modes return matching shape", () => {
  it("both modes return mode/start/end/days", () => {
    for (const mode of ["cal", "rolling"] satisfies WowMode[]) {
      const window = resolveWowWindow(mode, utc(2026, 6, 15));
      assert.ok(typeof window.mode === "string");
      assert.match(window.start, /^\d{4}-\d{2}-\d{2}$/);
      assert.match(window.end, /^\d{4}-\d{2}-\d{2}$/);
      assert.ok(window.days >= 1);
    }
  });
});
