import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  normalizeAnalystPeriodCount,
  rollingAnalystPeriods,
} from "../src/lib/analyst-periods.ts";

describe("normalizeAnalystPeriodCount", () => {
  it("accepts only the analyst period options", () => {
    assert.equal(normalizeAnalystPeriodCount("2"), 2);
    assert.equal(normalizeAnalystPeriodCount("4"), 4);
    assert.equal(normalizeAnalystPeriodCount(8), 8);
    assert.equal(normalizeAnalystPeriodCount("12"), 2);
    assert.equal(normalizeAnalystPeriodCount(undefined, 4), 4);
  });
});

describe("rollingAnalystPeriods", () => {
  it("uses same-length rolling windows newest first", () => {
    const periods = rollingAnalystPeriods(
      { start: "2026-05-14", end: "2026-05-20" },
      4,
    );

    assert.deepEqual(
      periods.map((period) => [period.start, period.end]),
      [
        ["2026-05-14", "2026-05-20"],
        ["2026-05-07", "2026-05-13"],
        ["2026-04-30", "2026-05-06"],
        ["2026-04-23", "2026-04-29"],
      ],
    );
    assert.equal(periods[0].isCurrent, true);
    assert.equal(periods[1].isCurrent, false);
  });

  it("keeps inclusive range length when crossing months", () => {
    const periods = rollingAnalystPeriods(
      { start: "2026-05-30", end: "2026-06-02" },
      2,
    );

    assert.deepEqual(
      periods.map((period) => [period.start, period.end]),
      [
        ["2026-05-30", "2026-06-02"],
        ["2026-05-26", "2026-05-29"],
      ],
    );
  });

  it("normalizes reversed date ranges", () => {
    const periods = rollingAnalystPeriods(
      { start: "2026-05-20", end: "2026-05-14" },
      2,
    );

    assert.deepEqual(
      periods.map((period) => [period.start, period.end]),
      [
        ["2026-05-14", "2026-05-20"],
        ["2026-05-07", "2026-05-13"],
      ],
    );
  });

  it("returns no windows without complete valid dates", () => {
    assert.deepEqual(rollingAnalystPeriods({ start: null, end: "2026-05-20" }, 2), []);
    assert.deepEqual(rollingAnalystPeriods({ start: "bad", end: "2026-05-20" }, 2), []);
  });
});
