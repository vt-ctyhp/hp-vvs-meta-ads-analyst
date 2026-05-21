import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
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
});
