import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  buildSharedInsightFilterContext,
  buildSharedInsightFilters,
  normalizeOptimizeDeliveryStatus,
  normalizeOptimizeStatusSelection,
} from "../src/lib/optimize-filters.ts";

describe("optimize filter normalization", () => {
  it("normalizes URL status selections", () => {
    assert.equal(normalizeOptimizeStatusSelection("Live"), "live");
    assert.equal(normalizeOptimizeStatusSelection("paused"), "paused");
    assert.equal(normalizeOptimizeStatusSelection("OFF"), "off");
    assert.equal(normalizeOptimizeStatusSelection("all"), "all");
    assert.equal(normalizeOptimizeStatusSelection("unknown"), null);
    assert.equal(normalizeOptimizeStatusSelection(null), null);
  });

  it("treats all-status as no delivery-status filter", () => {
    assert.equal(normalizeOptimizeDeliveryStatus("all"), null);
    assert.equal(normalizeOptimizeDeliveryStatus("live"), "live");
  });

  it("builds the shared aggregate filter set", () => {
    assert.deepEqual(
      buildSharedInsightFilters({
        brand: "HP",
        group: "Book Appts US",
        status: "paused",
      }),
      [
        { field: "brand", operator: "equals", value: "HP" },
        { field: "campaign_umbrella", operator: "equals", value: "Book Appts US" },
        { field: "delivery_status", operator: "equals", value: "paused" },
      ],
    );
  });

  it("normalizes shared filter context once for filters and query state", () => {
    assert.deepEqual(
      buildSharedInsightFilterContext({
        brand: "all",
        group: "Cash for Gold US",
        status: "all",
      }),
      {
        brand: null,
        group: "Cash for Gold US",
        status: null,
        filters: [
          {
            field: "campaign_umbrella",
            operator: "equals",
            value: "Cash for Gold US",
          },
        ],
      },
    );
  });
});
