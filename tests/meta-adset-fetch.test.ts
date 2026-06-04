import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { adSetAdsRequest, META_AD_CATALOG_PAGE_LIMIT } from "../src/lib/meta.ts";

describe("adSetAdsRequest", () => {
  it("targets the ad set's /ads edge with catalog fields, safe page size, active filter", () => {
    const req = adSetAdsRequest("120242517363420650");
    assert.equal(req.path, "120242517363420650/ads");
    assert.equal(req.params.limit, String(META_AD_CATALOG_PAGE_LIMIT));
    assert.ok(req.params.fields.includes("creative{"), "fields include nested creative");
    assert.ok(req.params.filtering.includes("effective_status"), "active-inventory filter applied");
  });
});
