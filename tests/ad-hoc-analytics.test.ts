import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { normalizeAnalysisSpecForPrompt } from "../src/lib/ad-hoc-analytics.ts";

describe("ad-hoc analytics prompt normalization", () => {
  it("repairs saved specs for cash-for-gold message spend tables", () => {
    const spec = normalizeAnalysisSpecForPrompt(
      {
        sort: { field: "date", direction: "asc" },
        grain: "daily",
        limit: 50,
        title: "Ad-hoc analysis",
        filters: [],
        metrics: ["spend"],
        widgets: [
          {
            x: "date",
            type: "table",
            title: "Comparison table",
            metrics: ["spend"],
          },
        ],
        dateRange: { preset: "last_30_days" },
        dimensions: ["date"],
      },
      "Okay, give me the cash for gold ad spend and number of messages by day for the past seven days in table format.",
    );

    assert.deepEqual(spec.dateRange, { preset: "last_7_days" });
    assert.deepEqual(spec.dimensions, ["date"]);
    assert.deepEqual(spec.metrics, ["spend", "messaging_contacts"]);
    assert.deepEqual(spec.filters, [
      { field: "search", operator: "contains", value: "cash for gold" },
    ]);
    assert.deepEqual(spec.widgets, [
      {
        x: "date",
        type: "table",
        title: "Comparison table",
        metrics: ["spend", "messaging_contacts"],
      },
    ]);
  });

  it("parses non-preset rolling day ranges without model inference", () => {
    const spec = normalizeAnalysisSpecForPrompt(
      {},
      "Show spend and messages by day for the previous ten days in table format.",
    );

    assert.deepEqual(spec.dateRange, { days: 10 });
    assert.deepEqual(spec.metrics, ["spend", "messaging_contacts"]);
    assert.deepEqual(spec.dimensions, ["date"]);
  });
});
