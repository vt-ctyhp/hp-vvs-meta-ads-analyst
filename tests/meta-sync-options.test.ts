import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { syncOptionsForTrigger } from "../src/lib/meta-sync-options.ts";

describe("syncOptionsForTrigger", () => {
  it("keeps normal manual sync on the cheap incremental path", () => {
    assert.deepEqual(syncOptionsForTrigger("manual"), {
      refreshPreviews: false,
      refreshAdCatalog: false,
      refreshRankingDiagnostics: false,
      includeCreativeDiagnostics: false,
    });
  });

  it("keeps cron on the same incremental path as normal manual sync", () => {
    assert.deepEqual(syncOptionsForTrigger("cron"), syncOptionsForTrigger("manual"));
  });

  it("requires the explicit catalog trigger for full ad and creative refresh", () => {
    assert.deepEqual(syncOptionsForTrigger("manual_catalog"), {
      refreshPreviews: true,
      refreshAdCatalog: true,
      refreshRankingDiagnostics: true,
      includeCreativeDiagnostics: true,
    });
  });
});
