import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  runAdCatalogChunk,
  type AdSetChunkDeps,
} from "../src/lib/meta-ad-catalog-chunk.ts";

function deps(over: Partial<AdSetChunkDeps> = {}): AdSetChunkDeps {
  return {
    listAdSets: async () => ["a", "b", "c"],
    fetchAds: async () => [{ id: "ad1" }],
    persist: async () => ({ ads: 1, creatives: 1 }),
    stampRefreshed: async () => {},
    now: () => 0,
    budgetMs: 1_000,
    ...over,
  };
}

describe("runAdCatalogChunk", () => {
  it("processes ad sets in the order listAdSets returns and stamps each", async () => {
    const stamped: string[] = [];
    const r = await runAdCatalogChunk(
      deps({ stampRefreshed: async (id) => { stamped.push(id); } }),
    );
    assert.deepEqual(stamped, ["a", "b", "c"]);
    assert.equal(r.adSetsProcessed, 3);
    assert.equal(r.ads, 3);
    assert.equal(r.creatives, 3);
    assert.equal(r.status, "ok");
    assert.deepEqual(r.errors, []);
  });

  it("stops starting ad sets once the wall-clock budget is exceeded", async () => {
    let t = -600;
    const stamped: string[] = [];
    const r = await runAdCatalogChunk(
      deps({
        // start reads 0; first loop check reads 600 (<=1000, ok); next reads 1200 (>1000, stop)
        now: () => (t += 600),
        budgetMs: 1_000,
        stampRefreshed: async (id) => { stamped.push(id); },
      }),
    );
    assert.deepEqual(stamped, ["a"]);
    assert.equal(r.status, "budget_exhausted");
    assert.equal(r.adSetsProcessed, 1);
  });

  it("leaves a failed ad set unstamped, records the error, and keeps going", async () => {
    const stamped: string[] = [];
    const r = await runAdCatalogChunk(
      deps({
        fetchAds: async (id) => {
          if (id === "b") throw new Error("too many calls to this ad-account");
          return [{ id: "x" }];
        },
        stampRefreshed: async (id) => { stamped.push(id); },
      }),
    );
    assert.deepEqual(stamped, ["a", "c"]);
    assert.equal(r.adSetsProcessed, 2);
    assert.equal(r.errors.length, 1);
    assert.match(r.errors[0], /too many calls/);
    assert.equal(r.status, "ok");
  });
});
