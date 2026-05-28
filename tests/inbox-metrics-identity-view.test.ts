import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, it } from "node:test";

const SRC = readFileSync(resolve("src/lib/inbox-metrics-db.ts"), "utf8");

describe("team rollup name resolution stays inside the data boundary", () => {
  it("never reads public.users directly", () => {
    assert.ok(!SRC.includes('.from("users")'), "must not read public.users from the metrics module");
  });
  it("resolves names through the ads_analyst identity view", () => {
    assert.match(SRC, /ads_analyst_identity_profiles_v1/);
    assert.match(SRC, /\.schema\("analytics"\)/);
  });
});
