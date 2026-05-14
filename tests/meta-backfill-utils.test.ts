import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  buildInsightDateParams,
  incrementalDatePreset,
  monthlyDateChunks,
} from "../src/lib/meta-backfill-utils.ts";

describe("monthlyDateChunks", () => {
  it("splits a custom range into bounded calendar months", () => {
    assert.deepEqual(monthlyDateChunks("2026-01-15", "2026-03-02"), [
      { start: "2026-01-15", end: "2026-01-31" },
      { start: "2026-02-01", end: "2026-02-28" },
      { start: "2026-03-01", end: "2026-03-02" },
    ]);
  });

  it("handles leap-year February", () => {
    assert.deepEqual(monthlyDateChunks("2024-02-01", "2024-02-29"), [
      { start: "2024-02-01", end: "2024-02-29" },
    ]);
  });

  it("keeps the current month partial when the end date is mid-month", () => {
    assert.deepEqual(monthlyDateChunks("2026-05-01", "2026-05-14"), [
      { start: "2026-05-01", end: "2026-05-14" },
    ]);
  });

  it("rejects invalid dates", () => {
    assert.throws(() => monthlyDateChunks("2026-02-31", "2026-03-01"), /YYYY-MM-DD/);
  });
});

describe("Meta insight date params", () => {
  it("uses date_preset for incremental sync", () => {
    assert.deepEqual(buildInsightDateParams({ kind: "preset", datePreset: "last_30d" }), {
      date_preset: "last_30d",
    });
  });

  it("uses time_range for backfill chunks", () => {
    assert.deepEqual(
      buildInsightDateParams({ kind: "range", since: "2026-01-01", until: "2026-01-31" }),
      {
        "time_range[since]": "2026-01-01",
        "time_range[until]": "2026-01-31",
      },
    );
  });

  it("defaults incremental sync to last_90d and honors overrides", () => {
    assert.equal(incrementalDatePreset({}), "last_90d");
    assert.equal(incrementalDatePreset({ META_INCREMENTAL_SYNC_DAYS: "14" }), "last_14d");
    assert.equal(
      incrementalDatePreset({
        META_INCREMENTAL_SYNC_DAYS: "14",
        META_SYNC_DATE_PRESET: "yesterday",
      }),
      "yesterday",
    );
  });
});
