import assert from "node:assert/strict";
import test from "node:test";

import { isAuthorizedCronRequest } from "../src/lib/cron-auth.ts";

test("cron authorization accepts bearer and x-cron-secret forms", () => {
  const originalSecret = process.env.CRON_SECRET;
  process.env.CRON_SECRET = "test-cron-secret";

  try {
    assert.equal(
      isAuthorizedCronRequest(
        new Request("https://example.test/api/cron/website-reconciliation", {
          headers: { authorization: "Bearer test-cron-secret" },
        }),
      ),
      true,
    );
    assert.equal(
      isAuthorizedCronRequest(
        new Request("https://example.test/api/cron/website-reconciliation", {
          headers: { "x-cron-secret": "test-cron-secret" },
        }),
      ),
      true,
    );
    assert.equal(
      isAuthorizedCronRequest(
        new Request("https://example.test/api/cron/website-reconciliation", {
          headers: { authorization: "Bearer wrong-secret" },
        }),
      ),
      false,
    );
  } finally {
    if (originalSecret === undefined) {
      delete process.env.CRON_SECRET;
    } else {
      process.env.CRON_SECRET = originalSecret;
    }
  }
});
