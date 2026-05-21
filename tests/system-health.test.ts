import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { metaInsightRollupSystemHealthIssue } from "../src/lib/system-health.ts";

describe("metaInsightRollupSystemHealthIssue", () => {
  it("returns no issue when recent rollups are healthy", () => {
    assert.equal(
      metaInsightRollupSystemHealthIssue({
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
      }),
      null,
    );
  });

  it("warns operators when recent rollups need repair", () => {
    const issue = metaInsightRollupSystemHealthIssue({
      rawRows: 10,
      rollupRows: 8,
      missingRollups: 1,
      staleRollups: 1,
      orphanRollups: 0,
      newestRawUpdate: null,
      newestRollupUpdate: null,
      oldestProblemDate: "2026-05-01",
      repairMetaAccountId: "act_123",
      repairMonth: "2026-05",
      ok: false,
    });

    assert.equal(issue?.level, "warning");
    assert.equal(issue?.title, "Meta rollups need repair");
    assert.match(issue?.detail || "", /raw rows: 10, rollup rows: 8, missing: 1, stale: 1/);
    assert.deepEqual(issue?.link, { href: "/admin/backfill", label: "Open backfill" });
  });
});
