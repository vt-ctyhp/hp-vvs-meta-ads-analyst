import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  buildCreativeDiagnostics,
  deriveCreativeMetrics,
  type CreativeScoreInput,
} from "../src/lib/creative-score.ts";

function input(overrides: Partial<CreativeScoreInput> = {}): CreativeScoreInput {
  return {
    id: "act_1:ad_1",
    spend: 100,
    impressions: 1000,
    reach: 800,
    frequency: 1.25,
    cpm: 100,
    clicks: 20,
    inlineLinkClicks: 10,
    ctr: 2,
    inlineLinkClickCtr: 1,
    cpc: 5,
    actions: [],
    costPerActionType: [],
    videoPlayActions: [],
    videoP25WatchedActions: [],
    videoP50WatchedActions: [],
    videoP75WatchedActions: [],
    videoP95WatchedActions: [],
    videoP100WatchedActions: [],
    videoThruplayWatchedActions: [],
    ...overrides,
  };
}

describe("creative score helpers", () => {
  it("uses video play actions as an estimated hook rate", () => {
    const metrics = deriveCreativeMetrics(
      input({
        impressions: 1000,
        videoPlayActions: [{ action_type: "video_view", value: "250" }],
      }),
    );

    assert.equal(metrics.hookViews, 250);
    assert.equal(metrics.hookRate, 0.25);
    assert.equal(metrics.hookRateEstimated, true);
    assert.match(metrics.hookRateSource, /video play/i);
  });

  it("uses ThruPlays before retention proxies for hold rate", () => {
    const metrics = deriveCreativeMetrics(
      input({
        videoPlayActions: [{ action_type: "video_view", value: 200 }],
        videoP50WatchedActions: [{ action_type: "video_view", value: 80 }],
        videoThruplayWatchedActions: [{ action_type: "video_view", value: 100 }],
      }),
    );

    assert.equal(metrics.holdViews, 100);
    assert.equal(metrics.holdRate, 0.5);
    assert.equal(metrics.holdRateEstimated, false);
  });

  it("uses the campaign KPI when resolving cost efficiency", () => {
    const metrics = deriveCreativeMetrics(
      input({
        campaignName: "CBI | Prospecting | VN | Promotion | Messenger Campaign",
        objective: "OUTCOME_ENGAGEMENT",
        optimizationGoal: "REPLIES",
        actions: [
          { action_type: "onsite_conversion.total_messaging_connection", value: 8 },
          { action_type: "onsite_conversion.lead", value: 2 },
        ],
        costPerActionType: [
          { action_type: "onsite_conversion.total_messaging_connection", value: 12.5 },
          { action_type: "onsite_conversion.lead", value: 5 },
        ],
      }),
    );

    assert.equal(metrics.resultKpiLabel, "Messages");
    assert.equal(metrics.resultCount, 8);
    assert.equal(metrics.costPerResult, 12.5);
  });

  it("uses bookings for appointment campaigns", () => {
    const metrics = deriveCreativeMetrics(
      input({
        campaignName: "CBI_Evergreen_Scheduled_Test_BookAppointment_Prospecting_US_2025",
        actions: [
          { action_type: "offsite_conversion.fb_pixel_custom", value: 4 },
          { action_type: "onsite_conversion.total_messaging_connection", value: 20 },
        ],
      }),
    );

    assert.equal(metrics.resultKpiLabel, "Bookings");
    assert.equal(metrics.resultCount, 4);
    assert.equal(metrics.costPerResult, 25);
  });

  it("flags high hook and weak conversion as clickbait risk", () => {
    const [diagnostic] = buildCreativeDiagnostics([
      input({
        spend: 250,
        impressions: 1000,
        clicks: 80,
        inlineLinkClicks: 50,
        ctr: 8,
        videoPlayActions: [{ action_type: "video_view", value: 700 }],
        actions: [],
      }),
      input({
        id: "act_1:ad_2",
        spend: 250,
        impressions: 1000,
        clicks: 20,
        inlineLinkClicks: 10,
        ctr: 2,
        videoPlayActions: [{ action_type: "video_view", value: 200 }],
        actions: [{ action_type: "lead", value: 5 }],
      }),
    ]);

    assert.equal(diagnostic.status, "Clickbait Risk");
    assert.match(diagnostic.recommendation, /landing page|lead quality/i);
  });
});
