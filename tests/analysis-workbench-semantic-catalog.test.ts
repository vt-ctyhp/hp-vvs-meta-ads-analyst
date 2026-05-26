import assert from "node:assert/strict";
import test from "node:test";

import {
  getAnalysisWorkbenchSemanticCatalog,
  getPrimaryKpiRule,
  resolveSemanticAlias,
  validateAnalysisWorkbenchSemanticIntent,
} from "../src/lib/analysis-workbench-semantic-catalog.ts";

test("semantic catalog exposes governed Meta Ads fields and compatibility rules", () => {
  const catalog = getAnalysisWorkbenchSemanticCatalog();

  assert.equal(catalog.source.key, "meta_ads");
  assert.equal(catalog.source.table, "meta_daily_insights");
  assert.ok(catalog.metrics.some((metric) => metric.key === "spend"));
  assert.ok(catalog.metrics.some((metric) => metric.key === "primary_results"));
  assert.ok(catalog.dimensions.some((dimension) => dimension.key === "campaign_umbrella"));
  assert.ok(catalog.filters.some((filter) => filter.key === "delivery_status"));
  assert.deepEqual(
    catalog.dateGrains.map((grain) => grain.key),
    ["summary", "day", "week", "month", "quarter"],
  );
  assert.equal(resolveSemanticAlias("messages")?.key, "messaging_contacts");
  assert.equal(resolveSemanticAlias("group")?.key, "campaign_umbrella");
  assert.equal(resolveSemanticAlias("weekly")?.key, "week");
  assert.ok(catalog.unsupportedBoundaries.some((boundary) => boundary.key === "crm"));
  assert.ok(catalog.chartCompatibility.some((rule) => rule.visualType === "scatter_chart"));
});

test("primary KPI rules stay group-specific and expose metric caveats", () => {
  const appointment = getPrimaryKpiRule(["Book Appts US"]);
  assert.equal(appointment.metric, "website_bookings");
  assert.equal(appointment.label, "Primary KPI (Website Bookings)");
  assert.match(appointment.caveat, /proxy/i);

  const product = getPrimaryKpiRule(["Facebook US Product"]);
  assert.equal(product.metric, "messaging_contacts");
  assert.equal(product.label, "Primary KPI (Messaging Contacts)");

  const blended = getPrimaryKpiRule(["Book Appts US", "Facebook US Product"]);
  assert.equal(blended.metric, "primary_results");
  assert.equal(blended.label, "Primary KPI (blended website bookings and messaging contacts)");
  assert.match(blended.caveat, /mixed units/i);
});

test("validator blocks unsupported CRM, revenue, ROAS, staff, website, and inbox prompts", () => {
  const result = validateAnalysisWorkbenchSemanticIntent({
    prompt:
      "Show CRM revenue, ROAS, staff response time, website traffic, and social inbox messages by campaign.",
    metrics: ["spend"],
    dimensions: ["campaign"],
  });

  assert.equal(result.status, "blocked");
  assert.deepEqual(
    result.blockers.map((blocker) => blocker.code),
    [
      "unsupported_crm",
      "unsupported_revenue",
      "unsupported_roas",
      "unsupported_staff",
      "unsupported_website",
      "unsupported_social_inbox",
    ],
  );
  assert.ok(result.blockers.every((blocker) => blocker.message.includes("not governed")));
});

test("validator repairs known filter aliases and blocks hallucinated values", () => {
  const result = validateAnalysisWorkbenchSemanticIntent({
    metrics: ["spend"],
    dimensions: ["campaign_umbrella"],
    filters: [
      { field: "brand", operator: "equals", value: "Hung Phat" },
      { field: "campaign_umbrella", operator: "equals", value: "Book Appointments" },
      { field: "campaign_umbrella", operator: "equals", value: "Spring Sale 2026" },
    ],
  });

  assert.equal(result.status, "blocked");
  assert.deepEqual(result.repairedIntent.filters, [
    { field: "brand", operator: "equals", value: "HP" },
    { field: "campaign_umbrella", operator: "equals", value: "Book Appts US" },
    { field: "campaign_umbrella", operator: "equals", value: "Spring Sale 2026" },
  ]);
  assert.deepEqual(
    result.assumptions.map((assumption) => assumption.message),
    [
      'Interpreted brand "Hung Phat" as "HP".',
      'Interpreted group "Book Appointments" as "Book Appts US".',
    ],
  );
  assert.deepEqual(result.blockers.map((blocker) => blocker.code), ["invalid_filter_value"]);
});

test("validator rejects invalid fields and impossible chart combinations", () => {
  const result = validateAnalysisWorkbenchSemanticIntent({
    metrics: ["spend", "gross_margin"],
    dimensions: ["campaign", "sales_rep"],
    dateGrain: "hour",
    visual: {
      type: "scatter_chart",
      metrics: ["spend", "cpl"],
      dimensions: ["date"],
    },
  });

  assert.equal(result.status, "blocked");
  assert.deepEqual(
    result.blockers.map((blocker) => blocker.code),
    ["invalid_metric", "invalid_dimension", "invalid_date_grain", "incompatible_chart"],
  );
  assert.match(result.blockers.at(-1)?.message || "", /entity dimension/);
});

test("validator repairs obvious pivot and scatter chart requests", () => {
  const pivot = validateAnalysisWorkbenchSemanticIntent({
    metrics: ["spend"],
    dimensions: ["campaign_umbrella", "week"],
    visual: {
      type: "pivot_table",
      metrics: ["spend"],
      dimensions: ["campaign_umbrella", "week"],
    },
  });

  assert.equal(pivot.status, "ready");
  assert.deepEqual(pivot.repairedIntent.visual, {
    type: "pivot_table",
    metrics: ["spend"],
    dimensions: ["campaign_umbrella", "week"],
    rowDimension: "campaign_umbrella",
    columnDimension: "week",
  });
  assert.deepEqual(
    pivot.assumptions.map((assumption) => assumption.code),
    ["repaired_visual_layout"],
  );

  const scatter = validateAnalysisWorkbenchSemanticIntent({
    metrics: ["spend"],
    dimensions: ["campaign_umbrella"],
    visual: {
      type: "scatter_chart",
      metrics: ["spend"],
      dimensions: ["campaign_umbrella"],
    },
  });

  assert.equal(scatter.status, "ready");
  assert.equal(scatter.repairedIntent.visual?.type, "bar_chart");
  assert.deepEqual(
    scatter.assumptions.map((assumption) => assumption.code),
    ["repaired_visual_type"],
  );
});

test("validator blocks impossible pivot and scatter requests with suggested fixes", () => {
  const pivot = validateAnalysisWorkbenchSemanticIntent({
    metrics: ["spend"],
    dimensions: ["campaign_umbrella"],
    visual: {
      type: "pivot_table",
      metrics: ["spend"],
      dimensions: ["campaign_umbrella"],
      rowDimension: "campaign_umbrella",
      columnDimension: "campaign_umbrella",
    },
  });

  assert.equal(pivot.status, "blocked");
  assert.equal(pivot.blockers[0]?.code, "incompatible_chart");
  assert.match(pivot.blockers[0]?.suggestedRequest || "", /campaign group by week/i);

  const scatter = validateAnalysisWorkbenchSemanticIntent({
    metrics: ["spend", "cpl"],
    dimensions: ["date"],
    visual: {
      type: "scatter_chart",
      metrics: ["spend", "cpl"],
      dimensions: ["date"],
    },
  });

  assert.equal(scatter.status, "blocked");
  assert.equal(scatter.blockers[0]?.code, "incompatible_chart");
  assert.match(scatter.blockers[0]?.suggestedRequest || "", /by campaign group/i);
});
