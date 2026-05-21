import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  isPeriodMetric,
  normalizePeriodCount,
} from "../src/lib/period-pivot-data.ts";

describe("period pivot controls", () => {
  it("normalizes allowed period counts and falls back to 4", () => {
    assert.equal(normalizePeriodCount("1"), 1);
    assert.equal(normalizePeriodCount("4"), 4);
    assert.equal(normalizePeriodCount("8"), 8);
    assert.equal(normalizePeriodCount("12"), 12);
    assert.equal(normalizePeriodCount("24"), 4);
    assert.equal(normalizePeriodCount(undefined), 4);
  });

  it("accepts only supported period metrics", () => {
    assert.equal(isPeriodMetric("spend"), true);
    assert.equal(isPeriodMetric("primary_results"), true);
    assert.equal(isPeriodMetric("cost_per_primary_results"), true);
    assert.equal(isPeriodMetric("unknown"), false);
    assert.equal(isPeriodMetric(null), false);
  });
});
