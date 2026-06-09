import assert from "node:assert/strict";
import test from "node:test";

import {
  QueryToolError,
  QUERY_PERFORMANCE_MAX_LIMIT,
  QUERY_PERFORMANCE_MAX_RANGE_DAYS,
  QUERY_ENTITIES_MAX_LIMIT,
  QUERY_TOOLS_SCHEMA_DESCRIPTION,
  queryPerformance,
  queryEntities,
  type RawEntityRow,
} from "../src/lib/analysis-workbench-query-tools.ts";
import type { AnalysisWorkbenchPipelineAggregateRequest } from "../src/lib/analysis-workbench-pipeline.ts";
import type { MetaInsightAggregateRow } from "../src/lib/meta-insight-aggregates.ts";

function aggregateRow(overrides: Partial<MetaInsightAggregateRow> = {}): MetaInsightAggregateRow {
  return {
    date: null,
    week: null,
    month: null,
    quarter: null,
    brand: null,
    campaign_umbrella: null,
    campaign: null,
    campaign_id: null,
    ad_set: null,
    ad_set_id: null,
    ad: null,
    ad_id: null,
    creative: null,
    creative_id: null,
    spend: 0,
    monthly_budget: 0,
    daily_budget: 0,
    lifetime_budget: 0,
    budget_remaining: 0,
    impressions: 0,
    reach: 0,
    clicks: 0,
    leads: 0,
    bookings: 0,
    conversions: 0,
    website_bookings: 0,
    messaging_contacts: 0,
    new_messaging_contacts: 0,
    primary_results: 0,
    secondary_results: 0,
    ctr: 0,
    cpm: 0,
    cpc: 0,
    cpl: null,
    frequency: 0,
    source_rows: 0,
    ...overrides,
  };
}

function entityRow(overrides: Partial<RawEntityRow> = {}): RawEntityRow {
  return {
    entityType: "ad",
    id: "ad_1",
    name: "Ad One",
    status: null,
    effectiveStatus: "ACTIVE",
    campaignName: null,
    adSetName: null,
    brandCode: null,
    dailyBudget: null,
    lifetimeBudget: null,
    thumbnailUrl: null,
    ...overrides,
  };
}

// ----- query_performance -----

test("query_performance maps params onto a capped aggregate request and projects requested fields", async () => {
  const requests: AnalysisWorkbenchPipelineAggregateRequest[] = [];
  const result = await queryPerformance(
    {
      start: "2026-05-01",
      end: "2026-05-07",
      metrics: ["spend", "messaging_contacts"],
      dimensions: ["campaign_umbrella"],
    },
    {
      executeAggregate: async (request) => {
        requests.push(request);
        return [
          aggregateRow({ campaign_umbrella: "Facebook US Product", spend: 1200, messaging_contacts: 30 }),
          aggregateRow({ campaign_umbrella: "Facebook VN Product", spend: 800, messaging_contacts: 18 }),
        ];
      },
    },
  );

  assert.equal(requests.length, 1);
  assert.deepEqual(requests[0].metrics, ["spend", "messaging_contacts"]);
  assert.deepEqual(requests[0].dimensions, ["campaign_umbrella"]);
  assert.equal(result.rowCount, 2);
  // rows are projected down to only the requested dimensions + metrics
  assert.deepEqual(result.rows[0], {
    campaign_umbrella: "Facebook US Product",
    spend: 1200,
    messaging_contacts: 30,
  });
  assert.match(result.summary, /2 row/);
});

test("query_performance clamps an oversized limit to the maximum", async () => {
  let capturedLimit = -1;
  await queryPerformance(
    { start: "2026-05-01", end: "2026-05-07", metrics: ["spend"], limit: 99999 },
    {
      executeAggregate: async (request) => {
        capturedLimit = request.limit;
        return [];
      },
    },
  );
  assert.equal(capturedLimit, QUERY_PERFORMANCE_MAX_LIMIT);
});

test("query_performance clamps an oversized date range by moving start forward", async () => {
  let capturedStart = "";
  await queryPerformance(
    { start: "2000-01-01", end: "2026-05-07", metrics: ["spend"] },
    {
      executeAggregate: async (request) => {
        capturedStart = request.start;
        return [];
      },
    },
  );
  const start = Date.parse(`${capturedStart}T00:00:00.000Z`);
  const end = Date.parse("2026-05-07T00:00:00.000Z");
  const days = Math.round((end - start) / 86_400_000) + 1;
  assert.equal(days, QUERY_PERFORMANCE_MAX_RANGE_DAYS);
});

test("query_performance rejects an unknown metric with a QueryToolError", async () => {
  await assert.rejects(
    queryPerformance(
      { start: "2026-05-01", end: "2026-05-07", metrics: ["revenue"] },
      { executeAggregate: async () => [] },
    ),
    (error: unknown) => error instanceof QueryToolError && /metric/i.test((error as Error).message),
  );
});

test("query_performance rejects an unknown dimension with a QueryToolError", async () => {
  await assert.rejects(
    queryPerformance(
      { start: "2026-05-01", end: "2026-05-07", metrics: ["spend"], dimensions: ["staff"] },
      { executeAggregate: async () => [] },
    ),
    (error: unknown) => error instanceof QueryToolError && /dimension/i.test((error as Error).message),
  );
});

test("query_performance rejects an unsupported delivery_status filter value", async () => {
  await assert.rejects(
    queryPerformance(
      {
        start: "2026-05-01",
        end: "2026-05-07",
        metrics: ["spend"],
        filters: [{ field: "delivery_status", operator: "equals", value: "archived" }],
      },
      { executeAggregate: async () => [] },
    ),
    (error: unknown) => error instanceof QueryToolError,
  );
});

// ----- query_entities -----

test("query_entities derives live/paused/off status and reports a breakdown", async () => {
  const result = await queryEntities(
    { entityType: "ad" },
    {
      fetchEntities: async () => [
        entityRow({ id: "a", effectiveStatus: "ACTIVE" }),
        entityRow({ id: "b", effectiveStatus: "PAUSED" }),
        entityRow({ id: "c", effectiveStatus: "ARCHIVED" }),
        entityRow({ id: "d", effectiveStatus: null, status: "ACTIVE" }),
      ],
    },
  );

  const byId = new Map(result.rows.map((row) => [row.id, row.status]));
  assert.equal(byId.get("a"), "live");
  assert.equal(byId.get("b"), "paused");
  assert.equal(byId.get("c"), "off");
  assert.equal(byId.get("d"), "live");
  assert.deepEqual(result.statusBreakdown, { live: 2, paused: 1, off: 1 });
});

test("query_entities classifies campaign umbrella from campaign and ad set names", async () => {
  const result = await queryEntities(
    { entityType: "ad" },
    {
      fetchEntities: async () => [
        entityRow({ id: "us", campaignName: "Master Product US Evergreen" }),
        entityRow({ id: "vn", campaignName: "VN Product Carousel" }),
      ],
    },
  );
  const byId = new Map(result.rows.map((row) => [row.id, row.campaignUmbrella]));
  assert.equal(byId.get("us"), "Facebook US Product");
  assert.equal(byId.get("vn"), "Facebook VN Product");
});

test("query_entities answers the US/VN Product active-vs-off roster question", async () => {
  // Acceptance anchor: "are the US Product and VN Product ads still active or turned off?"
  const result = await queryEntities(
    { entityType: "ad", filters: { campaignUmbrella: "Facebook US Product" } },
    {
      fetchEntities: async () => [
        entityRow({ id: "us1", campaignName: "Master Product US Evergreen", effectiveStatus: "ACTIVE" }),
        entityRow({ id: "us2", campaignName: "Master Product US Evergreen", effectiveStatus: "PAUSED" }),
        entityRow({ id: "us3", campaignName: "US Product Single", effectiveStatus: "PAUSED" }),
        entityRow({ id: "vn1", campaignName: "VN Product Carousel", effectiveStatus: "ACTIVE" }),
      ],
    },
  );

  // VN ad is filtered out; only the 3 US Product ads remain.
  assert.equal(result.rowCount, 3);
  assert.ok(result.rows.every((row) => row.campaignUmbrella === "Facebook US Product"));
  assert.deepEqual(result.statusBreakdown, { live: 1, paused: 2, off: 0 });
});

test("query_entities supports a status filter", async () => {
  const result = await queryEntities(
    { entityType: "ad", filters: { status: "paused" } },
    {
      fetchEntities: async () => [
        entityRow({ id: "a", effectiveStatus: "ACTIVE" }),
        entityRow({ id: "b", effectiveStatus: "PAUSED" }),
        entityRow({ id: "c", effectiveStatus: "PAUSED" }),
      ],
    },
  );
  assert.equal(result.rowCount, 2);
  assert.ok(result.rows.every((row) => row.status === "paused"));
});

test("query_entities supports a case-insensitive name filter", async () => {
  const result = await queryEntities(
    { entityType: "campaign", filters: { nameContains: "evergreen" } },
    {
      fetchEntities: async () => [
        entityRow({ entityType: "campaign", id: "c1", name: "US Evergreen Master" }),
        entityRow({ entityType: "campaign", id: "c2", name: "Cash for Gold" }),
      ],
    },
  );
  assert.equal(result.rowCount, 1);
  assert.equal(result.rows[0].id, "c1");
});

test("query_entities caps rows to the limit and reports the pre-limit total", async () => {
  const result = await queryEntities(
    { entityType: "ad", limit: 2 },
    {
      fetchEntities: async () => [
        entityRow({ id: "a" }),
        entityRow({ id: "b" }),
        entityRow({ id: "c" }),
        entityRow({ id: "d" }),
      ],
    },
  );
  assert.equal(result.rowCount, 2);
  assert.equal(result.totalBeforeLimit, 4);
});

test("query_entities clamps an oversized limit to the maximum", async () => {
  const result = await queryEntities(
    { entityType: "ad", limit: 999999 },
    { fetchEntities: async () => [entityRow()] },
  );
  assert.ok(result.appliedLimit <= QUERY_ENTITIES_MAX_LIMIT);
});

test("query_entities rejects an unknown entity type", async () => {
  await assert.rejects(
    queryEntities(
      { entityType: "widget" as never },
      { fetchEntities: async () => [] },
    ),
    (error: unknown) => error instanceof QueryToolError,
  );
});

// ----- schema description -----

test("schema description names the entity tables and the delivery values", () => {
  assert.match(QUERY_TOOLS_SCHEMA_DESCRIPTION, /meta_campaigns/);
  assert.match(QUERY_TOOLS_SCHEMA_DESCRIPTION, /meta_ads/);
  assert.match(QUERY_TOOLS_SCHEMA_DESCRIPTION, /aggregate_meta_daily_insights/);
  assert.match(QUERY_TOOLS_SCHEMA_DESCRIPTION, /live/);
  assert.match(QUERY_TOOLS_SCHEMA_DESCRIPTION, /paused/);
});
