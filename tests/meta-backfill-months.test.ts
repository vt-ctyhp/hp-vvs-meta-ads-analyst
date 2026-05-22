import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  buildMetaAdsBackfillMonthRows,
  type BackfillMonthAccount,
  type BackfillMonthChunk,
  type BackfillMonthCoverage,
  type BackfillMonthSyncRun,
} from "../src/lib/meta-backfill-months.ts";

const accounts: BackfillMonthAccount[] = [
  { metaAccountId: "act_1", accountName: "HP" },
  { metaAccountId: "act_2", accountName: "VVS" },
];

describe("buildMetaAdsBackfillMonthRows", () => {
  it("marks a finalized month synced, loaded, and locked when every account backfilled rows", () => {
    const rows = buildRows({
      chunks: [
        successChunk("act_1", "2026-01", 12),
        successChunk("act_2", "2026-01", 8),
      ],
      coverage: [
        coverageRow("act_1", "2026-01", 12),
        coverageRow("act_2", "2026-01", 8),
      ],
    });

    assert.equal(rows[0].syncStatus, "synced");
    assert.equal(rows[0].loadStatus, "loaded");
    assert.equal(rows[0].lockStatus, "locked");
    assert.equal(rows[0].syncedAccounts, 2);
    assert.equal(rows[0].loadedAccounts, 2);
    assert.equal(rows[0].insightRows, 20);
  });

  it("keeps a month partial when one configured account is missing", () => {
    const rows = buildRows({
      chunks: [successChunk("act_1", "2026-01", 12)],
      coverage: [coverageRow("act_1", "2026-01", 12)],
    });

    assert.equal(rows[0].syncStatus, "partial");
    assert.equal(rows[0].loadStatus, "partial");
    assert.equal(rows[0].syncedAccounts, 1);
    assert.equal(rows[0].loadedAccounts, 1);
    assert.deepEqual(rows[0].notes, [
      "1/2 accounts synced.",
      "1/2 accounts loaded.",
    ]);
  });

  it("treats successful row-writing backfill chunks as loaded", () => {
    const rows = buildRows({
      chunks: [
        successChunk("act_1", "2026-01", 12),
        successChunk("act_2", "2026-01", 8),
      ],
      coverage: [],
    });

    assert.equal(rows[0].syncStatus, "synced");
    assert.equal(rows[0].loadStatus, "loaded");
    assert.equal(rows[0].loadedAccounts, 2);
    assert.equal(rows[0].insightRows, 20);
  });

  it("treats successful zero-row backfill as loaded with no data", () => {
    const rows = buildRows({
      chunks: [
        successChunk("act_1", "2026-01", 0),
        successChunk("act_2", "2026-01", 0),
      ],
      coverage: [
        coverageRow("act_1", "2026-01", 0),
        coverageRow("act_2", "2026-01", 0),
      ],
    });

    assert.equal(rows[0].syncStatus, "synced");
    assert.equal(rows[0].loadStatus, "loaded_no_data");
    assert.equal(rows[0].insightRows, 0);
    assert.deepEqual(rows[0].notes, ["Loaded successfully with no insight rows."]);
  });

  it("keeps the current month active even when synced and loaded", () => {
    const rows = buildRows({
      startDate: "2026-05-01",
      endDate: "2026-05-21",
      cutoffDate: "2026-04-24",
      chunks: [
        successChunk("act_1", "2026-05", 5),
        successChunk("act_2", "2026-05", 7),
      ],
      coverage: [
        coverageRow("act_1", "2026-05", 5),
        coverageRow("act_2", "2026-05", 7),
      ],
    });

    assert.equal(rows[0].syncStatus, "synced");
    assert.equal(rows[0].loadStatus, "loaded");
    assert.equal(rows[0].lockStatus, "active");
  });

  it("does not count normal incremental sync runs as historical backfill synced", () => {
    const rows = buildRows({
      chunks: [],
      coverage: [
        coverageRow("act_1", "2026-01", 12),
        coverageRow("act_2", "2026-01", 8),
      ],
      syncRuns: [
        {
          trigger: "manual",
          status: "success",
          startedAt: "2026-02-01T00:00:00.000Z",
          completedAt: "2026-02-01T00:01:00.000Z",
          metrics: { month: "2026-01", accounts: 2, insightRows: 20 },
        },
      ],
    });

    assert.equal(rows[0].syncStatus, "missing");
    assert.equal(rows[0].loadStatus, "loaded");
  });

  it("counts explicit month re-sync as backfill synced", () => {
    const rows = buildRows({
      chunks: [],
      coverage: [],
      syncRuns: [
        {
          trigger: "manual_month_resync",
          status: "success",
          startedAt: "2026-02-01T00:00:00.000Z",
          completedAt: "2026-02-01T00:01:00.000Z",
          metrics: { month: "2026-01", accounts: 2, insightRows: 0 },
        },
      ],
    });

    assert.equal(rows[0].syncStatus, "synced");
    assert.equal(rows[0].loadStatus, "loaded_no_data");
    assert.equal(rows[0].latestBackfillOrResyncAt, "2026-02-01T00:01:00.000Z");
  });
});

function buildRows(input: {
  startDate?: string;
  endDate?: string;
  cutoffDate?: string;
  chunks: BackfillMonthChunk[];
  coverage: BackfillMonthCoverage[];
  syncRuns?: BackfillMonthSyncRun[];
}) {
  return buildMetaAdsBackfillMonthRows({
    startDate: input.startDate || "2026-01-01",
    endDate: input.endDate || "2026-01-31",
    finalizedCutoffDate: input.cutoffDate || "2026-02-15",
    accounts,
    chunks: input.chunks,
    coverage: input.coverage,
    syncRuns: input.syncRuns,
  });
}

function successChunk(
  metaAccountId: string,
  month: string,
  insightRows: number,
): BackfillMonthChunk {
  return {
    metaAccountId,
    startDate: `${month}-01`,
    endDate: `${month}-31`,
    status: "success",
    insightRows,
    completedAt: `${month}-15T00:00:00.000Z`,
  };
}

function coverageRow(
  metaAccountId: string,
  month: string,
  insightRows: number,
): BackfillMonthCoverage {
  return {
    metaAccountId,
    month,
    insightRows,
    firstDate: insightRows > 0 ? `${month}-01` : null,
    lastDate: insightRows > 0 ? `${month}-31` : null,
  };
}
