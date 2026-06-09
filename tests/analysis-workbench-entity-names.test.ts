import assert from "node:assert/strict";
import test from "node:test";

import {
  applyEntityNameMaps,
  buildEntityNameMap,
} from "../src/lib/analysis-workbench-entity-names.ts";
import type { MetaInsightAggregateRow } from "../src/lib/meta-insight-aggregates.ts";

function row(overrides: Partial<MetaInsightAggregateRow>): MetaInsightAggregateRow {
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
  } as MetaInsightAggregateRow;
}

test("replaces an id-shaped creative name with the real name, leaving figures intact", () => {
  const rows = [row({ creative: "2092661268352347", creative_id: "2092661268352347", spend: 252.78 })];
  const out = applyEntityNameMaps(rows, { creative: { "2092661268352347": "Gold Story A" } });
  assert.equal(out[0].creative, "Gold Story A");
  assert.equal(out[0].spend, 252.78);
  // original row is not mutated
  assert.equal(rows[0].creative, "2092661268352347");
});

test("leaves rows untouched when no name is known for the id", () => {
  const rows = [row({ creative: "999", creative_id: "999" })];
  const out = applyEntityNameMaps(rows, { creative: { "123": "Known" } });
  assert.equal(out[0].creative, "999");
});

test("resolves campaign, ad set, and ad names from their id columns", () => {
  const rows = [row({ campaign: "c1", campaign_id: "c1", ad_set: "s1", ad_set_id: "s1", ad: "a1", ad_id: "a1" })];
  const out = applyEntityNameMaps(rows, {
    campaign: { c1: "Cash for Gold US - Local" },
    ad_set: { s1: "Prospecting" },
    ad: { a1: "Gold Story A" },
  });
  assert.equal(out[0].campaign, "Cash for Gold US - Local");
  assert.equal(out[0].ad_set, "Prospecting");
  assert.equal(out[0].ad, "Gold Story A");
});

test("buildEntityNameMap takes the first non-empty name key", () => {
  const map = buildEntityNameMap(
    [
      { creative_id: "1", name: "", title: "Title Fallback" },
      { creative_id: "2", name: "Primary Name", title: "ignored" },
      { creative_id: "", name: "no id" },
    ],
    "creative_id",
    ["name", "title"],
  );
  assert.deepEqual(map, { "1": "Title Fallback", "2": "Primary Name" });
});
