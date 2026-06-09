import assert from "node:assert/strict";
import test from "node:test";

import { createEntityFetcher, type TableReader } from "../src/lib/analysis-workbench-entity-fetcher.ts";
import { queryEntities } from "../src/lib/analysis-workbench-query-tools.ts";

type TableData = Record<string, Record<string, unknown>[]>;

/** Build a TableReader backed by in-memory tables, recording each read. */
function fakeReader(tables: TableData, calls: Array<{ table: string; filter?: unknown }> = []): TableReader {
  return async (table, _columns, filter) => {
    calls.push({ table, filter });
    const rows = tables[table] ?? [];
    if (!filter) return rows;
    const values = new Set(filter.values);
    return rows.filter((row) => values.has(String(row[filter.column])));
  };
}

test("createEntityFetcher enriches ads with campaign, ad set, brand, and thumbnail", async () => {
  const fetchEntities = createEntityFetcher(
    fakeReader({
      meta_ads: [
        {
          ad_id: "ad_1",
          name: "US Evergreen Ad",
          status: "ACTIVE",
          effective_status: "ACTIVE",
          creative_id: "cr_1",
          ad_set_id: "set_1",
          campaign_id: "camp_1",
          brand_id: "brand_hp",
        },
      ],
      meta_campaigns: [{ campaign_id: "camp_1", name: "Master Product US Evergreen" }],
      meta_ad_sets: [{ ad_set_id: "set_1", name: "US Evergreen Set" }],
      meta_creatives: [{ creative_id: "cr_1", supabase_thumbnail_url: "https://cdn/thumb.jpg" }],
      brands: [{ id: "brand_hp", code: "HP" }],
    }),
  );

  const rows = await fetchEntities({ entityType: "ad" });
  assert.equal(rows.length, 1);
  const row = rows[0];
  assert.equal(row.entityType, "ad");
  assert.equal(row.id, "ad_1");
  assert.equal(row.campaignName, "Master Product US Evergreen");
  assert.equal(row.adSetName, "US Evergreen Set");
  assert.equal(row.brandCode, "HP");
  assert.equal(row.thumbnailUrl, "https://cdn/thumb.jpg");
  assert.equal(row.effectiveStatus, "ACTIVE");
});

test("createEntityFetcher reads campaign budgets and status", async () => {
  const fetchEntities = createEntityFetcher(
    fakeReader({
      meta_campaigns: [
        {
          campaign_id: "camp_1",
          name: "VN Product Carousel",
          status: "PAUSED",
          effective_status: "PAUSED",
          daily_budget: 25,
          lifetime_budget: null,
          brand_id: "brand_vvs",
        },
      ],
      brands: [{ id: "brand_vvs", code: "VVS" }],
    }),
  );

  const rows = await fetchEntities({ entityType: "campaign" });
  assert.equal(rows.length, 1);
  assert.equal(rows[0].name, "VN Product Carousel");
  assert.equal(rows[0].effectiveStatus, "PAUSED");
  assert.equal(rows[0].dailyBudget, 25);
  assert.equal(rows[0].brandCode, "VVS");
});

test("createEntityFetcher feeds query_entities end-to-end for the roster question", async () => {
  const fetchEntities = createEntityFetcher(
    fakeReader({
      meta_ads: [
        { ad_id: "us1", campaign_id: "c_us", effective_status: "ACTIVE" },
        { ad_id: "us2", campaign_id: "c_us", effective_status: "PAUSED" },
        { ad_id: "vn1", campaign_id: "c_vn", effective_status: "ACTIVE" },
      ],
      meta_campaigns: [
        { campaign_id: "c_us", name: "Master Product US Evergreen" },
        { campaign_id: "c_vn", name: "VN Product Carousel" },
      ],
    }),
  );

  const result = await queryEntities(
    { entityType: "ad", filters: { campaignUmbrella: "Facebook US Product" } },
    { fetchEntities },
  );

  assert.equal(result.rowCount, 2);
  assert.deepEqual(result.statusBreakdown, { live: 1, paused: 1, off: 0 });
});

test("createEntityFetcher skips lookups when there are no parent ids", async () => {
  const calls: Array<{ table: string; filter?: unknown }> = [];
  const fetchEntities = createEntityFetcher(fakeReader({ meta_ads: [] }, calls));
  const rows = await fetchEntities({ entityType: "ad" });
  assert.equal(rows.length, 0);
  // Only the meta_ads read should run; no parent lookups for an empty set.
  assert.deepEqual(
    calls.map((call) => call.table),
    ["meta_ads"],
  );
});
