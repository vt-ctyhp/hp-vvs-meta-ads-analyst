import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  buildPeriodPivotInsightFilters,
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

  it("builds aggregate filters for pivot rows and treats all-status as unfiltered", () => {
    assert.deepEqual(
      buildPeriodPivotInsightFilters({
        brand: "VVS",
        group: "Cash for Gold US",
        status: "paused",
      }),
      [
        { field: "brand", operator: "equals", value: "VVS" },
        { field: "campaign_umbrella", operator: "equals", value: "Cash for Gold US" },
        { field: "delivery_status", operator: "equals", value: "paused" },
      ],
    );

    assert.deepEqual(
      buildPeriodPivotInsightFilters({
        brand: "all",
        group: "all",
        status: "all",
      }),
      [],
    );
  });
});
