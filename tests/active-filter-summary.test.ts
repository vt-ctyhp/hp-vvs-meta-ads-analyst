import { test } from "node:test";
import assert from "node:assert/strict";

import {
  buildActiveFilterSummary,
  type ActiveFilterInput,
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
};

test("all defaults — every segment renders, only Range is non-default, no segment is active", () => {
  const summary = buildActiveFilterSummary(DEFAULTS);
  assert.equal(summary.length, 6);
  assert.deepEqual(
    summary.map((s) => s.key),
    ["Brand", "Delivery", "Range", "vs Prev", "Metric", "Umbrella"],
  );
  assert.deepEqual(
    summary.map((s) => s.isActive),
    [false, false, false, false, false, false],
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

test("metric default 'spend' (any case) is not active", () => {
  const lower = buildActiveFilterSummary({ ...DEFAULTS, periodMetric: "spend" });
  assert.equal(lower.find((s) => s.key === "Metric")?.isActive, false);
  const upper = buildActiveFilterSummary({ ...DEFAULTS, periodMetric: "Spend" });
  assert.equal(upper.find((s) => s.key === "Metric")?.isActive, false);
});

test("metric non-default → capitalized + active", () => {
  const summary = buildActiveFilterSummary({
    ...DEFAULTS,
    periodMetric: "ctr",
  });
  const metric = summary.find((s) => s.key === "Metric");
  assert.equal(metric?.value, "Ctr");
  assert.equal(metric?.isActive, true);
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
    ],
  );
});
