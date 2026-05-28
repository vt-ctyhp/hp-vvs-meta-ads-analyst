import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { resolveScheduleWrites } from "../src/lib/inbox-team-schedules.ts";

describe("resolveScheduleWrites", () => {
  it("upserts weekdays with both times set", () => {
    const plan = resolveScheduleWrites([{ weekday: 1, startTime: "10:00", endTime: "19:00" }]);
    assert.deepEqual(plan.upserts, [{ weekday: 1, startTime: "10:00", endTime: "19:00" }]);
    assert.deepEqual(plan.deleteWeekdays, []);
  });
  it("treats a blank time as a day off (delete)", () => {
    const plan = resolveScheduleWrites([
      { weekday: 2, startTime: "", endTime: "" },
      { weekday: 3, startTime: "10:00", endTime: null },
    ]);
    assert.deepEqual(plan.upserts, []);
    assert.deepEqual(plan.deleteWeekdays.sort(), [2, 3]);
  });
  it("rejects out-of-range weekdays", () => {
    assert.throws(() => resolveScheduleWrites([{ weekday: 7, startTime: "10:00", endTime: "19:00" }]), /weekday/i);
  });
});
