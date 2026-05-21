import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { createMetaRollupsCronHandler } from "../src/lib/meta-rollup-cron.ts";

describe("createMetaRollupsCronHandler", () => {
  it("rejects unauthorized repair requests", async () => {
    const handler = createMetaRollupsCronHandler({
      isAuthorizedRequest: () => false,
      async repairNextChunk() {
        throw new Error("should not repair");
      },
      revalidateAggregates() {
        throw new Error("should not revalidate");
      },
      jsonError(error) {
        return Response.json({ error: String(error) }, { status: 500 });
      },
    });

    const response = await handler(new Request("https://example.com/api/cron/meta-rollups"));
    assert.equal(response.status, 401);
    assert.deepEqual(await response.json(), { error: "Unauthorized cron request" });
  });

  it("returns healthy status without revalidating aggregate cache", async () => {
    let revalidated = false;
    const handler = createMetaRollupsCronHandler({
      isAuthorizedRequest: () => true,
      async repairNextChunk() {
        return {
          status: "healthy",
          health: {
            rawRows: 10,
            rollupRows: 10,
            missingRollups: 0,
            staleRollups: 0,
            orphanRollups: 0,
            newestRawUpdate: null,
            newestRollupUpdate: null,
            oldestProblemDate: null,
            repairMetaAccountId: null,
            repairMonth: null,
            ok: true,
          },
          repair: null,
        };
      },
      revalidateAggregates() {
        revalidated = true;
      },
      jsonError(error) {
        return Response.json({ error: String(error) }, { status: 500 });
      },
    });

    const response = await handler(new Request("https://example.com/api/cron/meta-rollups"));
    assert.equal(response.status, 200);
    assert.equal((await response.json()).status, "healthy");
    assert.equal(revalidated, false);
  });

  it("revalidates aggregate cache after a repair", async () => {
    let revalidated = false;
    const handler = createMetaRollupsCronHandler({
      isAuthorizedRequest: () => true,
      async repairNextChunk() {
        return {
          status: "repaired",
          health: {
            rawRows: 10,
            rollupRows: 9,
            missingRollups: 1,
            staleRollups: 0,
            orphanRollups: 0,
            newestRawUpdate: null,
            newestRollupUpdate: null,
            oldestProblemDate: "2026-05-01",
            repairMetaAccountId: "act_123",
            repairMonth: "2026-05",
            ok: false,
          },
          repair: {
            start: "2026-05-01",
            end: "2026-05-31",
            metaAccountId: "act_123",
            month: "2026-05",
            refreshedRows: 1,
          },
        };
      },
      revalidateAggregates() {
        revalidated = true;
      },
      jsonError(error) {
        return Response.json({ error: String(error) }, { status: 500 });
      },
    });

    const response = await handler(new Request("https://example.com/api/cron/meta-rollups"));
    assert.equal(response.status, 200);
    assert.equal((await response.json()).status, "repaired");
    assert.equal(revalidated, true);
  });
});
