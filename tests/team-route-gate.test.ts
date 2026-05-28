import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { resolvePeriodParam } from "../src/lib/inbox-metrics.ts";

describe("resolvePeriodParam", () => {
  it("defaults to today and accepts valid periods", () => {
    assert.equal(resolvePeriodParam(undefined), "today");
    assert.equal(resolvePeriodParam("yesterday"), "yesterday");
    assert.equal(resolvePeriodParam("7d"), "7d");
    assert.equal(resolvePeriodParam("30d"), "30d");
    assert.equal(resolvePeriodParam("garbage"), "today");
    assert.equal(resolvePeriodParam(["7d"]), "7d"); // array form from searchParams
  });
});
