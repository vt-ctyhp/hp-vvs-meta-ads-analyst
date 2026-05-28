import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  mapAggregateRow,
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

  it("maps current-state budget fields from the aggregate RPC", () => {
    const row = mapAggregateRow({
      spend: "123.45",
      monthly_budget: "3100",
      daily_budget: "100",
      lifetime_budget: "5000",
      budget_remaining: "4200",
    });

    assert.equal(row.spend, 123.45);
    assert.equal(row.daily_budget, 100);
    assert.equal(row.monthly_budget, 3100);
    assert.equal(row.lifetime_budget, 5000);
    assert.equal(row.budget_remaining, 4200);
  });
});
