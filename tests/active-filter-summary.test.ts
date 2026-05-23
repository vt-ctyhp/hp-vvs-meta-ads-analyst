import { test } from "node:test";
import assert from "node:assert/strict";

import {
  buildActiveFilterSummary,
  buildAskAiFilterSummary,
  buildCreativeAnalysisFilterSummary,
  type ActiveFilterInput,
  type AskAiFilterInput,
  type CreativeAnalysisFilterInput,
} from "../src/lib/active-filter-summary.ts";

const DEFAULTS: ActiveFilterInput = {
  brand: "all",
  delivery: "all",
  startDate: "2026-04-23",
  endDate: "2026-05-22",
  compareEnabled: false,
  periodCount: 2,
  periodMetric: "spend",
  umbrella: "all",
  query: "",
};

test("all defaults — every segment renders, only Range is non-default, no segment is active", () => {
  const summary = buildActiveFilterSummary(DEFAULTS);
  assert.equal(summary.length, 7);
  assert.deepEqual(
    summary.map((s) => s.key),
    ["Brand", "Delivery", "Range", "vs Prev", "Metric", "Umbrella", "Query"],
  );
  assert.deepEqual(
    summary.map((s) => s.isActive),
    [false, false, false, false, false, false, false],
  );
});

test("date range formats short month names from ISO YYYY-MM-DD", () => {
  const summary = buildActiveFilterSummary(DEFAULTS);
  const range = summary.find((s) => s.key === "Range");
  assert.equal(range?.value, "Apr 23 — May 22");
});

test("malformed date range falls back to raw strings", () => {
  const summary = buildActiveFilterSummary({
    ...DEFAULTS,
    startDate: "not-a-date",
    endDate: "",
  });
  const range = summary.find((s) => s.key === "Range");
  assert.equal(range?.value, "not-a-date — —");
});

test("brand non-default → segment shows code and is active", () => {
  const summary = buildActiveFilterSummary({ ...DEFAULTS, brand: "HP" });
  const brand = summary.find((s) => s.key === "Brand");
  assert.equal(brand?.value, "HP");
  assert.equal(brand?.isActive, true);
});

test("delivery non-default → segment shows label and is active", () => {
  const summary = buildActiveFilterSummary({ ...DEFAULTS, delivery: "paused" });
  const delivery = summary.find((s) => s.key === "Delivery");
  assert.equal(delivery?.value, "Paused");
  assert.equal(delivery?.isActive, true);
});

test("vs Prev on → value shows period count and is active", () => {
  const summary = buildActiveFilterSummary({
    ...DEFAULTS,
    compareEnabled: true,
    periodCount: 4,
  });
  const vp = summary.find((s) => s.key === "vs Prev");
  assert.equal(vp?.value, "× 4 periods");
  assert.equal(vp?.isActive, true);
});

test("vs Prev off → value reads 'off' and is not active", () => {
  const summary = buildActiveFilterSummary(DEFAULTS);
  const vp = summary.find((s) => s.key === "vs Prev");
  assert.equal(vp?.value, "off");
  assert.equal(vp?.isActive, false);
});

test("metric default 'spend' is not active and renders 'Spend'", () => {
  const summary = buildActiveFilterSummary({ ...DEFAULTS, periodMetric: "spend" });
  const metric = summary.find((s) => s.key === "Metric");
  assert.equal(metric?.value, "Spend");
  assert.equal(metric?.isActive, false);
});

test("metric ctr → uses PERIOD_METRIC_LABELS short form 'CTR' and is active", () => {
  const summary = buildActiveFilterSummary({
    ...DEFAULTS,
    periodMetric: "ctr",
  });
  const metric = summary.find((s) => s.key === "Metric");
  assert.equal(metric?.value, "CTR");
  assert.equal(metric?.isActive, true);
});

test("metric primary_results without primaryResultLabel → falls back to 'Primary KPI'", () => {
  const summary = buildActiveFilterSummary({
    ...DEFAULTS,
    periodMetric: "primary_results",
  });
  const metric = summary.find((s) => s.key === "Metric");
  assert.equal(metric?.value, "Primary KPI");
  assert.equal(metric?.isActive, true);
});

test("metric primary_results WITH primaryResultLabel → uses the live label", () => {
  const summary = buildActiveFilterSummary({
    ...DEFAULTS,
    periodMetric: "primary_results",
    primaryResultLabel: "Messages",
  });
  const metric = summary.find((s) => s.key === "Metric");
  assert.equal(metric?.value, "Messages");
  assert.equal(metric?.isActive, true);
});

test("metric cost_per_primary_results WITH primaryResultLabel → '$/{label}'", () => {
  const summary = buildActiveFilterSummary({
    ...DEFAULTS,
    periodMetric: "cost_per_primary_results",
    primaryResultLabel: "Appointments",
  });
  const metric = summary.find((s) => s.key === "Metric");
  assert.equal(metric?.value, "$/Appointments");
  assert.equal(metric?.isActive, true);
});

test("metric cost_per_primary_results without primaryResultLabel → '$/Primary KPI'", () => {
  const summary = buildActiveFilterSummary({
    ...DEFAULTS,
    periodMetric: "cost_per_primary_results",
  });
  const metric = summary.find((s) => s.key === "Metric");
  assert.equal(metric?.value, "$/Primary KPI");
  assert.equal(metric?.isActive, true);
});

test("primaryResultLabel is ignored for non-primary metrics", () => {
  const summary = buildActiveFilterSummary({
    ...DEFAULTS,
    periodMetric: "spend",
    primaryResultLabel: "Messages",
  });
  assert.equal(summary.find((s) => s.key === "Metric")?.value, "Spend");
});

test("empty/whitespace primaryResultLabel does not substitute", () => {
  const summary = buildActiveFilterSummary({
    ...DEFAULTS,
    periodMetric: "primary_results",
    primaryResultLabel: "   ",
  });
  assert.equal(summary.find((s) => s.key === "Metric")?.value, "Primary KPI");
});

test("umbrella non-default → segment shows name and is active", () => {
  const summary = buildActiveFilterSummary({
    ...DEFAULTS,
    umbrella: "Facebook US Product",
  });
  const um = summary.find((s) => s.key === "Umbrella");
  assert.equal(um?.value, "Facebook US Product");
  assert.equal(um?.isActive, true);
});

test("everything customised → every segment except Range is active", () => {
  const summary = buildActiveFilterSummary({
    brand: "HP",
    delivery: "active",
    startDate: "2026-01-20",
    endDate: "2026-01-25",
    compareEnabled: true,
    periodCount: 8,
    periodMetric: "ctr",
    umbrella: "Facebook US Product",
    query: "ring",
  });
  assert.deepEqual(
    summary.map((s) => ({ key: s.key, isActive: s.isActive })),
    [
      { key: "Brand", isActive: true },
      { key: "Delivery", isActive: true },
      { key: "Range", isActive: false },
      { key: "vs Prev", isActive: true },
      { key: "Metric", isActive: true },
      { key: "Umbrella", isActive: true },
      { key: "Query", isActive: true },
    ],
  );
});

test("/analyst · empty query → '—' and not active", () => {
  const summary = buildActiveFilterSummary({ ...DEFAULTS, query: "" });
  const q = summary.find((s) => s.key === "Query");
  assert.equal(q?.value, "—");
  assert.equal(q?.isActive, false);
});

test("/analyst · non-empty query → quoted and active", () => {
  const summary = buildActiveFilterSummary({ ...DEFAULTS, query: "ring" });
  const q = summary.find((s) => s.key === "Query");
  assert.equal(q?.value, "\"ring\"");
  assert.equal(q?.isActive, true);
});

// ─── /analyst/creative-analysis builder ──────────────────────────────

const CREATIVE_DEFAULTS: CreativeAnalysisFilterInput = {
  brand: "all",
  delivery: "all",
  startDate: "2026-04-23",
  endDate: "2026-05-22",
  umbrella: "all",
  campaign: "all",
  adSet: "all",
  status: "all",
  query: "",
};

test("creative analysis · all defaults → 8 segments, only Range is non-default, nothing active", () => {
  const summary = buildCreativeAnalysisFilterSummary(CREATIVE_DEFAULTS);
  assert.equal(summary.length, 8);
  assert.deepEqual(
    summary.map((s) => s.key),
    ["Brand", "Delivery", "Range", "Umbrella", "Campaign", "Ad Set", "Status", "Query"],
  );
  assert.deepEqual(
    summary.map((s) => s.isActive),
    [false, false, false, false, false, false, false, false],
  );
});

test("creative analysis · range formats short month names", () => {
  const range = buildCreativeAnalysisFilterSummary(CREATIVE_DEFAULTS)
    .find((s) => s.key === "Range");
  assert.equal(range?.value, "Apr 23 — May 22");
});

test("creative analysis · brand non-default → segment shows brand code and is active", () => {
  const summary = buildCreativeAnalysisFilterSummary({ ...CREATIVE_DEFAULTS, brand: "HP" });
  const brand = summary.find((s) => s.key === "Brand");
  assert.equal(brand?.value, "HP");
  assert.equal(brand?.isActive, true);
});

test("creative analysis · delivery non-default uses title case and is active", () => {
  const summary = buildCreativeAnalysisFilterSummary({ ...CREATIVE_DEFAULTS, delivery: "paused" });
  const delivery = summary.find((s) => s.key === "Delivery");
  assert.equal(delivery?.value, "Paused");
  assert.equal(delivery?.isActive, true);
});

test("creative analysis · umbrella/campaign/ad set cascade — each non-default is active", () => {
  const summary = buildCreativeAnalysisFilterSummary({
    ...CREATIVE_DEFAULTS,
    umbrella: "Facebook US Product",
    campaign: "CBI_Evergreen_FB_Product_2026",
    adSet: "Lookalike 1% — US",
  });
  assert.equal(summary.find((s) => s.key === "Umbrella")?.value, "Facebook US Product");
  assert.equal(summary.find((s) => s.key === "Campaign")?.value, "CBI_Evergreen_FB_Product_2026");
  assert.equal(summary.find((s) => s.key === "Ad Set")?.value, "Lookalike 1% — US");
  for (const key of ["Umbrella", "Campaign", "Ad Set"]) {
    assert.equal(summary.find((s) => s.key === key)?.isActive, true);
  }
});

test("creative analysis · status non-default shows label as-is and is active", () => {
  const summary = buildCreativeAnalysisFilterSummary({ ...CREATIVE_DEFAULTS, status: "ACTIVE" });
  const status = summary.find((s) => s.key === "Status");
  assert.equal(status?.value, "ACTIVE");
  assert.equal(status?.isActive, true);
});

test("creative analysis · empty query → '—' and not active", () => {
  const summary = buildCreativeAnalysisFilterSummary({ ...CREATIVE_DEFAULTS, query: "" });
  const q = summary.find((s) => s.key === "Query");
  assert.equal(q?.value, "—");
  assert.equal(q?.isActive, false);
});

test("creative analysis · non-empty query → quoted and active", () => {
  const summary = buildCreativeAnalysisFilterSummary({ ...CREATIVE_DEFAULTS, query: "ring" });
  const q = summary.find((s) => s.key === "Query");
  assert.equal(q?.value, "\"ring\"");
  assert.equal(q?.isActive, true);
});

test("creative analysis · whitespace-only query is not active", () => {
  const summary = buildCreativeAnalysisFilterSummary({ ...CREATIVE_DEFAULTS, query: "   " });
  const q = summary.find((s) => s.key === "Query");
  assert.equal(q?.isActive, false);
});

// ─── /analysis (Ask AI) builder ──────────────────────────────────────

const ASK_AI_DEFAULTS: AskAiFilterInput = {
  brand: null,
  delivery: null,
  umbrella: null,
  startDate: "2026-04-23",
  endDate: "2026-05-22",
};

test("ask AI · all defaults → 4 segments, only Range is non-default", () => {
  const summary = buildAskAiFilterSummary(ASK_AI_DEFAULTS);
  assert.equal(summary.length, 4);
  assert.deepEqual(
    summary.map((s) => s.key),
    ["Brand", "Delivery", "Umbrella", "Range"],
  );
  assert.deepEqual(
    summary.map((s) => s.isActive),
    [false, false, false, false],
  );
});

test("ask AI · null filters render as 'All'", () => {
  const summary = buildAskAiFilterSummary(ASK_AI_DEFAULTS);
  assert.equal(summary.find((s) => s.key === "Brand")?.value, "All");
  assert.equal(summary.find((s) => s.key === "Delivery")?.value, "All");
  assert.equal(summary.find((s) => s.key === "Umbrella")?.value, "All");
});

test("ask AI · non-null brand → segment is active and shows brand code", () => {
  const summary = buildAskAiFilterSummary({ ...ASK_AI_DEFAULTS, brand: "HP" });
  const brand = summary.find((s) => s.key === "Brand");
  assert.equal(brand?.value, "HP");
  assert.equal(brand?.isActive, true);
});

test("ask AI · non-null delivery shows title case and is active", () => {
  const summary = buildAskAiFilterSummary({ ...ASK_AI_DEFAULTS, delivery: "active" });
  const delivery = summary.find((s) => s.key === "Delivery");
  assert.equal(delivery?.value, "Active");
  assert.equal(delivery?.isActive, true);
});

test("ask AI · non-null umbrella → segment is active and shows umbrella name", () => {
  const summary = buildAskAiFilterSummary({ ...ASK_AI_DEFAULTS, umbrella: "Book Appts US" });
  const um = summary.find((s) => s.key === "Umbrella");
  assert.equal(um?.value, "Book Appts US");
  assert.equal(um?.isActive, true);
});

test("ask AI · range always renders short month format", () => {
  const range = buildAskAiFilterSummary(ASK_AI_DEFAULTS).find((s) => s.key === "Range");
  assert.equal(range?.value, "Apr 23 — May 22");
});
