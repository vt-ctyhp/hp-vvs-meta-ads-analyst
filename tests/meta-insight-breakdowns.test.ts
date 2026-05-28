import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  mapMetaInsightBreakdownRow,
  metaInsightBreakdownFieldsForSet,
  stableMetaInsightBreakdownKey,
} from "../src/lib/meta.ts";

describe("Meta insight breakdown helpers", () => {
  it("builds stable keys from entity ids and sorted breakdown values", () => {
    const a = stableMetaInsightBreakdownKey({
      campaignId: "camp_1",
      adSetId: "set_1",
      adId: "ad_1",
      breakdownValues: { gender: "female", age: "35-44" },
    });
    const b = stableMetaInsightBreakdownKey({
      campaignId: "camp_1",
      adSetId: "set_1",
      adId: "ad_1",
      breakdownValues: { age: "35-44", gender: "female" },
    });

    assert.equal(a, b);
    assert.equal(a, "camp_1|set_1|ad_1|age:35-44|gender:female");
  });

  it("keeps placement breakdown as publisher platform plus position", () => {
    assert.deepEqual(metaInsightBreakdownFieldsForSet("placement"), [
      "publisher_platform",
      "platform_position",
    ]);

    const row = mapMetaInsightBreakdownRow("act_123", "placement", {
      campaign_id: "camp_1",
      adset_id: "set_1",
      ad_id: "ad_1",
      date_start: "2026-05-01",
      date_stop: "2026-05-01",
      publisher_platform: "instagram",
      platform_position: "reels",
      spend: "12.34",
      impressions: "1000",
      clicks: "20",
      inline_link_clicks: "5",
    }, "2026-05-02T00:00:00.000Z");

    assert.deepEqual(row.breakdown_values, {
      publisher_platform: "instagram",
      platform_position: "reels",
    });
    assert.equal(
      row.breakdown_key,
      "camp_1|set_1|ad_1|platform_position:reels|publisher_platform:instagram",
    );
    assert.equal(row.spend, 12.34);
    assert.equal(row.impressions, 1000);
  });
});
