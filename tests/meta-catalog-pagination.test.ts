import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  DEFAULT_META_SYNC_MAX_AD_PAGES,
  META_AD_CATALOG_PAGE_LIMIT,
} from "../src/lib/meta.ts";

// Regression guard for the May 2026 catalog outage: the daily ad-catalog
// refresh fetches a whole account's active+paused ad inventory via graphPages,
// which THROWS (aborting the entire refresh — zero ads/creatives written) the
// moment a `next` cursor survives maxPages. The old 50/page x 100-page ceiling
// (5,000 ads) was crossed by the HP account, so every ad newer than 2026-05-16
// — and its thumbnail — silently stopped reaching the ledger. These assertions
// keep the ingestion ceiling well above real inventory so the cap can't quietly
// strand new ads again.
describe("meta ad catalog pagination ceiling", () => {
  it("does not raise the per-page size into Meta's 'reduce the amount of data' error", () => {
    // META_AD_CATALOG_FIELDS is heavy; a 100/page run was rejected by Meta before
    // writing any ad. The page size must stay at the proven-safe 50.
    assert.ok(
      META_AD_CATALOG_PAGE_LIMIT <= 50,
      `catalog page size raised to ${META_AD_CATALOG_PAGE_LIMIT}; Meta rejects pages heavier than 50 with "please reduce the amount of data"`,
    );
  });

  it("keeps total catalog capacity far above the account inventory that broke it", () => {
    const capacity = META_AD_CATALOG_PAGE_LIMIT * DEFAULT_META_SYNC_MAX_AD_PAGES;
    assert.ok(
      capacity >= 10_000,
      `catalog ingestion capacity is ${capacity} ads; the May 2026 outage hit a 5,000-ad cap, so keep capacity >= 10,000`,
    );
  });
});
