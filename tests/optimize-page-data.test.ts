import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  buildOptimizeSummaryFromAggregates,
} from "../src/lib/optimize-page-data.ts";
import type { MetaInsightAggregateRow } from "../src/lib/meta-insight-aggregates.ts";

describe("buildOptimizeSummaryFromAggregates", () => {
  it("builds filtered chart rows and lean action counts without dashboard metadata", () => {
    const summary = buildOptimizeSummaryFromAggregates({
      dateRangeStart: "2026-05-01",
      overviewRows: [
        row({
          spend: 1000,
          impressions: 10000,
          clicks: 100,
          reach: 5000,
        }),
      ],
      dailyTrendRows: [
        row({
          date: "2026-05-02",
          brand: "HP",
          campaign_umbrella: "Book Appts US",
          spend: 200,
          impressions: 2000,
          clicks: 40,
          website_bookings: 3,
          primary_results: 3,
        }),
      ],
      creativeRows: [
        row({
          creative: "Ready to scale",
          creative_id: "cr-scale",
          spend: 100,
          impressions: 1000,
          clicks: 25,
          reach: 800,
          primary_results: 2,
        }),
        row({
          creative: "Fatigued",
          creative_id: "cr-fix",
          spend: 10,
          impressions: 1000,
          clicks: 5,
          reach: 250,
          primary_results: 1,
        }),
        row({
          creative: "Inefficient",
          creative_id: "cr-watch",
          spend: 40,
          impressions: 1000,
          clicks: 7,
          reach: 1000,
          primary_results: 0,
        }),
      ],
    });

    assert.equal(summary.creativeCount, 3);
    assert.equal(summary.spendTotal, 1000);
    assert.equal(summary.winnersCount, 1);
    assert.equal(summary.criticalCount, 2);
    assert.deepEqual(summary.dailyTrend, [
      {
        date: "2026-05-02",
        brandCode: "HP",
        campaignUmbrella: "Book Appts US",
        spend: 200,
        impressions: 2000,
        clicks: 40,
        leads: 0,
        primaryResults: 3,
        websiteBookings: 3,
        messagingContacts: 0,
        newMessagingContacts: 0,
        ctr: 2,
        cpc: 5,
      },
    ]);
  });
});

function row(overrides: Partial<MetaInsightAggregateRow> = {}): MetaInsightAggregateRow {
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
    source_rows: 1,
    ...overrides,
  };
}
