import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

import {
  activeMetaInboxOnConflict,
  scopeActiveMetaInboxEnvironment,
  withActiveMetaInboxEnvironment,
  withActiveMetaInboxEnvironmentRows,
} from "../src/lib/meta-inbox-environment.ts";

const SOCIAL_INBOX = readFileSync("src/lib/social-inbox.ts", "utf8");
const DELIVERY_WORKER = readFileSync("src/lib/meta-inbox-delivery-worker.ts", "utf8");
const COMMENT_WORKER = readFileSync("src/lib/meta-inbox-comment-action-worker.ts", "utf8");

describe("Meta inbox environment isolation", () => {
  it("stamps inbox writes with the configured environment without feature flags", () => {
    withTemporaryEnvironment("staging", () => {
      assert.deepEqual(
        withActiveMetaInboxEnvironment({ conversation_id: "conversation-1" }),
        {
          environment: "staging",
          conversation_id: "conversation-1",
        },
      );
      assert.deepEqual(
        withActiveMetaInboxEnvironment({
          environment: "production",
          conversation_id: "conversation-1",
        }),
        {
          environment: "staging",
          conversation_id: "conversation-1",
        },
      );
      assert.deepEqual(
        withActiveMetaInboxEnvironmentRows([{ id: "row-1" }, { id: "row-2" }]),
        [
          { environment: "staging", id: "row-1" },
          { environment: "staging", id: "row-2" },
        ],
      );
      assert.equal(
        activeMetaInboxOnConflict("platform,thread_id"),
        "environment,platform,thread_id",
      );
      assert.equal(
        activeMetaInboxOnConflict("environment,conversation_id"),
        "environment,conversation_id",
      );
    });
  });

  it("adds an active-environment filter to service-role style reads", () => {
    withTemporaryEnvironment("staging", () => {
      const calls: Array<[string, string]> = [];
      const query = {
        eq(column: string, value: string) {
          calls.push([column, value]);
          return this;
        },
      };

      assert.equal(scopeActiveMetaInboxEnvironment(query), query);
      assert.deepEqual(calls, [["environment", "staging"]]);
    });
  });

  it("uses explicit environment helpers in inbox service and workers", () => {
    for (const source of [SOCIAL_INBOX, DELIVERY_WORKER, COMMENT_WORKER]) {
      assert.match(source, /scopeActiveMetaInboxEnvironment/);
      assert.match(source, /withActiveMetaInboxEnvironment/);
      assert.doesNotMatch(source, /withAdsAnalystEnvironment/);
    }

    assert.match(SOCIAL_INBOX, /updateActiveMetaInboxRows/);
  });
});

function withTemporaryEnvironment<T>(value: string, run: () => T): T {
  const previous = process.env.ADS_ANALYST_ENVIRONMENT;
  const previousLimited = process.env.ADS_ANALYST_ENFORCE_LIMITED_DB_ACCESS;
  const previousScopedUpserts = process.env.ADS_ANALYST_USE_ENVIRONMENT_SCOPED_UPSERTS;
  process.env.ADS_ANALYST_ENVIRONMENT = value;
  delete process.env.ADS_ANALYST_ENFORCE_LIMITED_DB_ACCESS;
  delete process.env.ADS_ANALYST_USE_ENVIRONMENT_SCOPED_UPSERTS;
  try {
    return run();
  } finally {
    restoreEnv("ADS_ANALYST_ENVIRONMENT", previous);
    restoreEnv("ADS_ANALYST_ENFORCE_LIMITED_DB_ACCESS", previousLimited);
    restoreEnv("ADS_ANALYST_USE_ENVIRONMENT_SCOPED_UPSERTS", previousScopedUpserts);
  }
}

function restoreEnv(key: string, value: string | undefined) {
  if (value === undefined) {
    delete process.env[key];
  } else {
    process.env[key] = value;
  }
}
