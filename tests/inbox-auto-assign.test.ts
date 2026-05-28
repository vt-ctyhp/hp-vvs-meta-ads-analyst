import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { isOnShift, type ScheduleRow } from "../src/lib/inbox-auto-assign.ts";

// weekday: 0=Sun..6=Sat. Times "HH:MM".
const PT = "America/Los_Angeles";

describe("isOnShift", () => {
  it("is on shift inside a same-day window in the user's tz", () => {
    const rows: ScheduleRow[] = [{ weekday: 4, startTime: "10:00", endTime: "19:00" }]; // Thu
    // 2026-05-28 is a Thursday. 18:00 UTC == 11:00 PT.
    assert.equal(isOnShift(rows, PT, new Date("2026-05-28T18:00:00Z")), true);
  });

  it("is off shift before the window opens", () => {
    const rows: ScheduleRow[] = [{ weekday: 4, startTime: "10:00", endTime: "19:00" }];
    // 16:00 UTC == 09:00 PT, before 10:00.
    assert.equal(isOnShift(rows, PT, new Date("2026-05-28T16:00:00Z")), false);
  });

  it("is off shift on a weekday with no row (day off)", () => {
    const rows: ScheduleRow[] = [{ weekday: 4, startTime: "10:00", endTime: "19:00" }];
    // 2026-05-29 is a Friday (weekday 5), no row.
    assert.equal(isOnShift(rows, PT, new Date("2026-05-29T18:00:00Z")), false);
  });

  it("respects the user's timezone (same instant, different local day/time)", () => {
    const rows: ScheduleRow[] = [{ weekday: 5, startTime: "00:00", endTime: "06:00" }]; // Fri early
    // 2026-05-29T05:00:00Z == Fri 12:00 in Asia/Ho_Chi_Minh (UTC+7) -> not in 00:00-06:00.
    assert.equal(isOnShift(rows, "Asia/Ho_Chi_Minh", new Date("2026-05-29T05:00:00Z")), false);
    // Same instant in PT == Thu 22:00 -> also not in a Fri 00:00-06:00 window.
    assert.equal(isOnShift(rows, PT, new Date("2026-05-29T05:00:00Z")), false);
  });

  it("handles an overnight window that spills into the next day", () => {
    // Thu 22:00 -> Fri 02:00 (end <= start = overnight).
    const rows: ScheduleRow[] = [{ weekday: 4, startTime: "22:00", endTime: "02:00" }];
    // Fri 01:00 PT: 2026-05-29 09:00Z == 02:00 PT (just after end) -> off.
    assert.equal(isOnShift(rows, PT, new Date("2026-05-29T09:00:00Z")), false);
    // Fri 00:30 PT: 2026-05-29 07:30Z == 00:30 PT -> on (spill from Thu row).
    assert.equal(isOnShift(rows, PT, new Date("2026-05-29T07:30:00Z")), true);
    // Thu 23:00 PT: 2026-05-29 06:00Z == 23:00 PT Thu -> on (evening portion).
    assert.equal(isOnShift(rows, PT, new Date("2026-05-29T06:00:00Z")), true);
  });
});
