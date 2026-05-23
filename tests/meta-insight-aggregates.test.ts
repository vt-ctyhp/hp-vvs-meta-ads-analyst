import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  normalizeAggregateInput,
  shouldRevalidateCachedMetaInsightAggregates,
} from "../src/lib/meta-insight-aggregates.ts";

describe("normalizeAggregateInput", () => {
  it("defaults cache-key inputs and sorts equivalent filters", () => {
    const normalized = normalizeAggregateInput({
      start: "2026-05-01",
      end: "2026-05-31",
      dimensions: ["date", "brand"],
      filters: [
        { field: "campaign_umbrella", operator: "equals", value: "Book Appts US" },
        { field: "delivery_status", operator: "equals", value: "live" },
        { field: "brand", operator: "equals", value: "HP" },
      ],
    });

    assert.deepEqual(normalized, {
      start: "2026-05-01",
      end: "2026-05-31",
      dimensions: ["date", "brand"],
      filters: [
        { field: "brand", operator: "equals", value: "HP" },
        { field: "campaign_umbrella", operator: "equals", value: "Book Appts US" },
        { field: "delivery_status", operator: "equals", value: "live" },
      ],
      sortField: "spend",
      sortDirection: "desc",
      limit: 100,
    });
  });

  it("only revalidates cached aggregates in production", () => {
    assert.equal(shouldRevalidateCachedMetaInsightAggregates("development"), false);
    assert.equal(shouldRevalidateCachedMetaInsightAggregates("test"), false);
    assert.equal(shouldRevalidateCachedMetaInsightAggregates(undefined), false);
    assert.equal(shouldRevalidateCachedMetaInsightAggregates("production"), true);
  });
});
