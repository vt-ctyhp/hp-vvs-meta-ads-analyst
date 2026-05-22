import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { rollingAnalystPeriods } from "../src/lib/analyst-periods.ts";
import {
  buildAnalystPeriodBreakdown,
  type AnalystPeriodAggregateBucket,
} from "../src/lib/analyst-period-breakdown.ts";
import type { MetaInsightAggregateRow } from "../src/lib/meta-insight-aggregates.ts";

describe("buildAnalystPeriodBreakdown", () => {
  it("buckets entity metrics by same-length rolling period keys", () => {
    const periods = rollingAnalystPeriods(
      { start: "2026-05-14", end: "2026-05-20" },
      2,
    );
    const breakdown = buildAnalystPeriodBreakdown([
      bucket(periods[0], {
        campaignRows: [
          row({
            campaign_id: "c1",
            spend: 100,
            impressions: 1000,
            clicks: 20,
            primary_results: 4,
          }),
        ],
      }),
      bucket(periods[1], {
        campaignRows: [
          row({
            campaign_id: "c1",
            spend: 50,
            impressions: 500,
            clicks: 5,
            primary_results: 1,
          }),
        ],
      }),
    ]);

    assert.deepEqual(
      breakdown.periods.map((period) => period.key),
      ["2026-05-14:2026-05-20", "2026-05-07:2026-05-13"],
    );

    const current = breakdown.campaigns.c1["2026-05-14:2026-05-20"];
    assert.equal(current.spend, 100);
    assert.equal(current.primary_results, 4);
    assert.equal(current.cost_per_primary_results, 25);
    assert.equal(current.impressions, 1000);
    assert.equal(current.ctr, 2);
    assert.equal(current.cpc, 5);

    const prior = breakdown.campaigns.c1["2026-05-07:2026-05-13"];
    assert.equal(prior.spend, 50);
    assert.equal(prior.primary_results, 1);
  });

  it("rolls duplicate rows into one entity-period before deriving ratios", () => {
    const [period] = rollingAnalystPeriods(
      { start: "2026-05-14", end: "2026-05-20" },
      2,
    );
    const breakdown = buildAnalystPeriodBreakdown([
      bucket(period, {
        creativeRows: [
          row({ creative_id: "cr1", spend: 100, impressions: 1000, clicks: 20, primary_results: 4 }),
          row({ creative_id: "cr1", spend: 50, impressions: 500, clicks: 5, primary_results: 1 }),
        ],
      }),
    ]);

    const metrics = breakdown.creatives.cr1[period.key];
    assert.equal(metrics.spend, 150);
    assert.equal(metrics.primary_results, 5);
    assert.equal(metrics.cost_per_primary_results, 30);
    assert.equal(metrics.impressions, 1500);
    assert.equal(metrics.ctr, 1.67);
    assert.equal(metrics.cpc, 6);
  });

  it("uses the normalized umbrella id for scorecard period rows", () => {
    const [period] = rollingAnalystPeriods(
      { start: "2026-05-14", end: "2026-05-20" },
      2,
    );
    const breakdown = buildAnalystPeriodBreakdown([
      bucket(period, {
        byUmbrellaRows: [
          row({ campaign_umbrella: "Book Appts US", spend: 20, primary_results: 2 }),
          row({ campaign_umbrella: null, spend: 5, primary_results: 1 }),
        ],
      }),
    ]);

    assert.equal(breakdown.byUmbrella["Book Appts US"][period.key].spend, 20);
    assert.equal(breakdown.byUmbrella["Needs review"][period.key].spend, 5);
  });
});

function bucket(
  period: AnalystPeriodAggregateBucket["period"],
  overrides: Partial<Omit<AnalystPeriodAggregateBucket, "period">>,
): AnalystPeriodAggregateBucket {
  return {
    period,
    byUmbrellaRows: [],
    campaignRows: [],
    adSetRows: [],
    creativeRows: [],
    ...overrides,
  };
}

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
