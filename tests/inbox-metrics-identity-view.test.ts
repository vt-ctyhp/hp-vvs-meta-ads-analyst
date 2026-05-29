import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, it } from "node:test";

const METRICS = readFileSync(resolve("src/lib/inbox-metrics-db.ts"), "utf8");
const DIRECTORY = readFileSync(resolve("src/lib/inbox-user-directory.ts"), "utf8");

describe("team rollup name resolution stays inside the data boundary", () => {
  it("the metrics module never reads public.users directly", () => {
    assert.ok(
      !METRICS.includes('.from("users")'),
      "must not read public.users from the metrics module",
    );
  });

  it("the metrics module resolves names via the mode-aware inbox user directory", () => {
    assert.match(METRICS, /loadInboxUserDirectory/);
  });

  it("the directory helper uses the boundary identity view under limited access", () => {
    assert.match(DIRECTORY, /usesLimitedAdsAnalystDbAccess/);
    assert.match(DIRECTORY, /ads_analyst_identity_profiles_v1/);
  });
});
