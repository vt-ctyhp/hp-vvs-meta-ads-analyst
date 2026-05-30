import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { socialSyncBoundsForTrigger } from "../src/lib/social-sync-bounds.ts";

describe("socialSyncBoundsForTrigger", () => {
  it("bounds the cron backstop to the newest page of conversations", () => {
    assert.deepEqual(socialSyncBoundsForTrigger("cron"), {
      conversationPages: 1,
      messageThreadLimit: 25,
    });
  });

  it("leaves manual and webhook syncs unbounded (env-configured)", () => {
    assert.equal(socialSyncBoundsForTrigger("manual"), null);
    assert.equal(socialSyncBoundsForTrigger("webhook"), null);
  });
});
