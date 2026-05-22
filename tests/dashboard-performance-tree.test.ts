import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  buildPerformanceTree,
  UNASSIGNED_CAMPAIGN_ID,
  UNASSIGNED_AD_SET_ID,
} from "../src/lib/dashboard-performance-tree.ts";
import type { PerformanceRow } from "../src/lib/analytics.ts";

describe("buildPerformanceTree", () => {
  it("nests campaigns, ad sets, and creatives by ids", () => {
    const campaign = row({ id: "c1", name: "Campaign 1", spend: 100 });
    const adSet = row({
      id: "as1",
      name: "Ad Set 1",
      campaignId: "c1",
      campaignName: "Campaign 1",
      spend: 80,
    });
    const creative = row({
      id: "cr1",
      name: "Creative 1",
      campaignId: "c1",
      campaignName: "Campaign 1",
      adSetId: "as1",
      adSetName: "Ad Set 1",
      spend: 20,
    });

    const tree = buildPerformanceTree({
      campaigns: [campaign],
      adSets: [adSet],
      creatives: [creative],
    });

    assert.equal(tree.length, 1);
    assert.equal(tree[0].campaign.id, "c1");
    assert.equal(tree[0].adSets.length, 1);
    assert.equal(tree[0].adSets[0].adSet.id, "as1");
    assert.deepEqual(tree[0].adSets[0].creatives.map((item) => item.id), ["cr1"]);
  });

  it("creates an unassigned ad set under a known campaign when creative metadata lacks ad set rows", () => {
    const campaign = row({ id: "c1", name: "Campaign 1", spend: 100 });
    const creative = row({
      id: "cr1",
      name: "Creative 1",
      campaignId: "c1",
      campaignName: "Campaign 1",
      spend: 25,
      impressions: 100,
      clicks: 5,
      primaryResults: 1,
    });

    const tree = buildPerformanceTree({
      campaigns: [campaign],
      adSets: [],
      creatives: [creative],
    });

    assert.equal(tree.length, 1);
    assert.equal(tree[0].campaign.id, "c1");
    assert.equal(tree[0].adSets.length, 1);
    assert.equal(tree[0].adSets[0].isSynthetic, true);
    assert.equal(tree[0].adSets[0].id, `${UNASSIGNED_AD_SET_ID}:c1`);
    assert.equal(tree[0].adSets[0].adSet.spend, 25);
    assert.equal(tree[0].adSets[0].adSet.ctr, 5);
  });

  it("does not drop creatives when both parent rows are missing", () => {
    const creative = row({
      id: "cr1",
      name: "Creative 1",
      spend: 12,
      impressions: 100,
      clicks: 4,
      primaryResults: 2,
    });

    const tree = buildPerformanceTree({
      campaigns: [],
      adSets: [],
      creatives: [creative],
    });

    assert.equal(tree.length, 1);
    assert.equal(tree[0].id, UNASSIGNED_CAMPAIGN_ID);
    assert.equal(tree[0].isSynthetic, true);
    assert.equal(tree[0].campaign.spend, 12);
    assert.equal(tree[0].adSets.length, 1);
    assert.deepEqual(tree[0].adSets[0].creatives.map((item) => item.id), ["cr1"]);
  });
});

function row(input: Partial<PerformanceRow> & { id: string; name: string }): PerformanceRow {
  const impressions = input.impressions ?? 0;
  const clicks = input.clicks ?? 0;
  const spend = input.spend ?? 0;
  const primaryResults = input.primaryResults ?? 0;

  return {
    spend,
    impressions,
    reach: input.reach ?? 0,
    clicks,
    leads: input.leads ?? 0,
    bookings: input.bookings ?? 0,
    websiteBookings: input.websiteBookings ?? 0,
    messagingContacts: input.messagingContacts ?? 0,
    newMessagingContacts: input.newMessagingContacts ?? 0,
    primaryResults,
    primaryResultLabel: input.primaryResultLabel ?? "Messages",
    secondaryResults: input.secondaryResults ?? null,
    secondaryResultLabel: input.secondaryResultLabel ?? null,
    conversions: input.conversions ?? 0,
    ctr: impressions > 0 ? (clicks / impressions) * 100 : 0,
    cpm: impressions > 0 ? (spend / impressions) * 1000 : 0,
    cpc: clicks > 0 ? spend / clicks : 0,
    cpl: null,
    costPerPrimaryResult: primaryResults > 0 ? spend / primaryResults : null,
    frequency: 0,
    brandCode: input.brandCode ?? "HP",
    campaignUmbrella: input.campaignUmbrella ?? "Facebook US Product",
    ...input,
  };
}
