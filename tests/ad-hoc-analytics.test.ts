import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  buildAnalysisPlanForPrompt,
  normalizeAnalysisSpecForPrompt,
} from "../src/lib/ad-hoc-analytics.ts";

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
      { field: "campaign_umbrella", operator: "equals", value: "Cash for Gold US" },
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

  it("normalizes cash-for-gold performance since January 2026", () => {
    const plan = buildAnalysisPlanForPrompt(
      {},
      "performance of Cash for Gold since January 2026",
    );

    assert.equal(plan.validationStatus, "ready");
    assert.deepEqual(plan.spec.dateRange, { preset: "custom", start: "2026-01-01" });
    assert.deepEqual(plan.spec.filters, [
      { field: "campaign_umbrella", operator: "equals", value: "Cash for Gold US" },
    ]);
  });

  it("normalizes booked appointments by ad creative inside Book Appointments US by day", () => {
    const plan = buildAnalysisPlanForPrompt(
      {},
      "booked appointments by ad creative inside Book Appointments US by day",
    );

    assert.equal(plan.validationStatus, "ready");
    assert.deepEqual(plan.spec.metrics, ["bookings"]);
    assert.deepEqual(plan.spec.dimensions, ["date", "creative"]);
    assert.deepEqual(plan.spec.filters, [
      { field: "campaign_umbrella", operator: "equals", value: "Book Appts US" },
    ]);
  });

  it("normalizes top ads by messages for cash for gold last 14 days", () => {
    const plan = buildAnalysisPlanForPrompt(
      {},
      "top ads by messages for cash for gold last 14 days",
    );

    assert.equal(plan.validationStatus, "ready");
    assert.deepEqual(plan.spec.dateRange, { preset: "last_14_days" });
    assert.deepEqual(plan.spec.metrics, ["messaging_contacts"]);
    assert.deepEqual(plan.spec.dimensions, ["ad"]);
    assert.deepEqual(plan.spec.sort, { field: "messaging_contacts", direction: "desc" });
    assert.deepEqual(plan.spec.filters, [
      { field: "campaign_umbrella", operator: "equals", value: "Cash for Gold US" },
    ]);
  });

  it("marks website visitor requests unsupported instead of falling back to Meta defaults", () => {
    const plan = buildAnalysisPlanForPrompt({}, "website visitors by landing page");

    assert.equal(plan.validationStatus, "unsupported");
    assert.ok(plan.unsupportedReasons.some((reason) => reason.includes("website_events")));
  });

  it("marks social inbox employee response requests unsupported", () => {
    const plan = buildAnalysisPlanForPrompt({}, "social inbox response time by employee");

    assert.equal(plan.validationStatus, "unsupported");
    assert.ok(plan.unsupportedReasons.some((reason) => reason.includes("social_inbox")));
  });
});
