import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { buildSnapshotByEntity } from "../src/lib/period-pivot-data.ts";

// Build a partial-but-typed insight row. Only fields that buildSnapshotByEntity
// reads need real values; the rest are null/0 placeholders so TypeScript stays
// happy without us having to model every column.
function row(overrides: Record<string, unknown>) {
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
    ...overrides,
  } as Parameters<typeof buildSnapshotByEntity>[0][number];
}

describe("buildSnapshotByEntity", () => {
  it("returns an empty object when given no rows", () => {
    assert.deepEqual(buildSnapshotByEntity([], "campaign_id"), {});
  });

  it("sums spend + primary_results per entity and derives ratios from totals", () => {
    const result = buildSnapshotByEntity(
      [
        row({ campaign_id: "c1", spend: 100, impressions: 1000, clicks: 20, primary_results: 4 }),
        row({ campaign_id: "c1", spend: 50, impressions: 500, clicks: 5, primary_results: 1 }),
        row({ campaign_id: "c2", spend: 200, impressions: 2000, clicks: 40, primary_results: 0 }),
      ],
      "campaign_id",
    );

    // c1: spend 150, primary 5, ctr = 25/1500 = ~1.67%, $/KPI = 30, cpc = 6
    const c1 = result.c1;
    assert.ok(c1);
    assert.equal(c1.spend, 150);
    assert.equal(c1.primary_results, 5);
    assert.equal(c1.cost_per_primary_results, 30);
    assert.equal(c1.impressions, 1500);
    assert.equal(Math.round(c1.ctr * 100) / 100, 1.67);
    assert.equal(c1.cpc, 6);

    // c2: spend 200, primary 0 → cost_per_primary_results is 0 (guard against ÷0)
    const c2 = result.c2;
    assert.ok(c2);
    assert.equal(c2.spend, 200);
    assert.equal(c2.primary_results, 0);
    assert.equal(c2.cost_per_primary_results, 0);
  });

  it("skips rows with a missing or non-string entity id (defensive)", () => {
    const result = buildSnapshotByEntity(
      [
        row({ campaign_id: null, spend: 999 }),
        row({ campaign_id: "", spend: 999 }),
        row({ campaign_id: "real", spend: 5 }),
      ],
      "campaign_id",
    );
    assert.deepEqual(Object.keys(result), ["real"]);
    assert.equal(result.real.spend, 5);
  });

  it("can roll up against ad_set_id when called from the ad-set fetcher", () => {
    const result = buildSnapshotByEntity(
      [
        row({ ad_set_id: "as1", spend: 10, impressions: 100, clicks: 2, primary_results: 1 }),
        row({ ad_set_id: "as2", spend: 20, impressions: 200, clicks: 4, primary_results: 2 }),
      ],
      "ad_set_id",
    );
    assert.equal(result.as1.spend, 10);
    assert.equal(result.as2.spend, 20);
    assert.equal(result.as1.cpc, 5);
  });

  it("computes CPC = 0 when clicks = 0 (no divide-by-zero)", () => {
    const result = buildSnapshotByEntity(
      [
        row({ campaign_id: "c1", spend: 50, impressions: 100, clicks: 0, primary_results: 0 }),
      ],
      "campaign_id",
    );
    assert.equal(result.c1.cpc, 0);
    assert.equal(result.c1.ctr, 0);
    assert.equal(result.c1.cost_per_primary_results, 0);
  });
});
