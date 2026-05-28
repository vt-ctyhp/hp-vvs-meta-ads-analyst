import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { enumerateBackfillDates } from "../scripts/backfill-inbox-metrics-daily.ts";

describe("enumerateBackfillDates", () => {
  it("lists each date from start to end inclusive", () => {
    const dates = enumerateBackfillDates("2026-05-25", "2026-05-27");
    assert.deepEqual(dates, ["2026-05-25", "2026-05-26", "2026-05-27"]);
  });
  it("returns a single date when start === end", () => {
    assert.deepEqual(enumerateBackfillDates("2026-05-27", "2026-05-27"), ["2026-05-27"]);
  });
  it("returns empty when start is after end", () => {
    assert.deepEqual(enumerateBackfillDates("2026-05-28", "2026-05-27"), []);
  });
  it("defaults to a 30-day window ending today when no args (count check)", () => {
    const dates = enumerateBackfillDates(); // uses default 30-day window
    assert.equal(dates.length, 30);
  });
});
