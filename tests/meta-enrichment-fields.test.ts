import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  mapInsightToEnrichmentRow,
  maxMetaUsagePercent,
  META_AD_CATALOG_FIELDS,
  META_AD_CREATIVE_CATALOG_FIELDS,
  META_AD_SET_CATALOG_FIELDS,
  META_CAMPAIGN_CATALOG_FIELDS,
  META_INSIGHT_ENRICHMENT_FIELDS,
  parseMetaUsageHeaders,
} from "../src/lib/meta.ts";

describe("Meta enrichment field lists", () => {
  it("requests approved current-state and Insights enrichment fields", () => {
    assert.ok(META_CAMPAIGN_CATALOG_FIELDS.includes("daily_budget"));
    assert.ok(META_CAMPAIGN_CATALOG_FIELDS.includes("budget_remaining"));
    assert.ok(META_AD_SET_CATALOG_FIELDS.includes("learning_stage_info"));
    assert.ok(META_AD_SET_CATALOG_FIELDS.includes("promoted_object"));
    assert.ok(META_AD_CATALOG_FIELDS.includes("tracking_specs"));
    assert.ok(META_INSIGHT_ENRICHMENT_FIELDS.includes("cost_per_result"));
    assert.ok(META_INSIGHT_ENRICHMENT_FIELDS.includes("conversions"));
  });

  it("does not request instagram_user_id from creative fields", () => {
    assert.equal(META_AD_CREATIVE_CATALOG_FIELDS.join(",").includes("instagram_user_id"), false);
    assert.equal(META_AD_CATALOG_FIELDS.join(",").includes("instagram_user_id"), false);
  });
});

describe("Meta insight enrichment mapping", () => {
  it("stores nested enrichment arrays intact", () => {
    const row = mapInsightToEnrichmentRow({
      brand_id: "brand_1",
      account_id: "account_1",
      meta_account_id: "act_123",
      campaign_id: "camp_1",
      ad_set_id: "set_1",
      ad_id: "ad_1",
      creative_id: "creative_1",
      date_start: "2026-05-01",
      date_stop: "2026-05-01",
      raw_json: {
        account_currency: "USD",
        attribution_setting: "7d_click",
        cost_per_result: [{ indicator: "actions:lead", value: "15.50" }],
        outbound_clicks: [{ action_type: "outbound_click", value: "12" }],
        conversions: [{ action_type: "offsite_conversion.fb_pixel_custom", value: "2" }],
        landing_page_view_per_link_click: "0.25",
      },
    });

    assert.equal(row.account_currency, "USD");
    assert.deepEqual(row.cost_per_result, [{ indicator: "actions:lead", value: "15.50" }]);
    assert.deepEqual(row.outbound_clicks, [{ action_type: "outbound_click", value: "12" }]);
    assert.deepEqual(row.meta_conversions, [
      { action_type: "offsite_conversion.fb_pixel_custom", value: "2" },
    ]);
    assert.equal(row.landing_page_view_per_link_click, 0.25);
  });
});

describe("Meta usage header parsing", () => {
  it("captures max percent across app, ad account, and business usage headers", () => {
    const sample = parseMetaUsageHeaders("act_123/insights", new Headers({
      "x-app-usage": JSON.stringify({ call_count: 12, total_cputime: 5, total_time: 9 }),
      "x-ad-account-usage": JSON.stringify({ acc_id_util_pct: 44 }),
      "x-business-use-case-usage": JSON.stringify({
        "123": [{ type: "ads_insights", call_count: 67 }],
      }),
    }));

    assert.equal(sample?.path, "act_123/insights");
    assert.equal(sample?.maxPercent, 67);
    assert.equal(maxMetaUsagePercent({ nested: [{ total_time: 81 }] }), 81);
  });
});
