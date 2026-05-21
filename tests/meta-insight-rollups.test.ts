import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

import {
  assertBoundedRollupRepair,
  formatMetaInsightRollupHealth,
  getMetaInsightRollupHealth,
  metaInsightRollupHealthRpcArgs,
  repairMetaInsightRollupChunk,
  repairNextMetaInsightRollupChunk,
  refreshMetaInsightRollups,
  refreshMetaInsightRollupsRpcArgs,
  type MetaInsightRollupHealthRpcArgs,
  type RefreshMetaInsightRollupsRpcArgs,
} from "../src/lib/meta-insight-rollups.ts";

const ROLLUP_MIGRATION = readFileSync(
  new URL("../supabase/migrations/20260521120000_meta_insight_rollup_tables.sql", import.meta.url),
  "utf8",
);

describe("meta insight rollup migration", () => {
  it("marks rollups stale when ad-set budget sources change", () => {
    assert.match(ROLLUP_MIGRATION, /left join public\.meta_ad_sets s/);
    assert.match(
      ROLLUP_MIGRATION,
      /greatest\(i\.updated_at, coalesce\(s\.updated_at, i\.updated_at\)\) as source_updated_at/,
    );
    assert.match(ROLLUP_MIGRATION, /source_updated_at > rollup_updated_at/);
  });
});

describe("refreshMetaInsightRollupsRpcArgs", () => {
  it("maps affected insight ranges to the database refresh RPC shape", () => {
    assert.deepEqual(
      refreshMetaInsightRollupsRpcArgs({
        start: "2026-05-01",
        end: "2026-05-21",
        metaAccountId: "act_123",
      }),
      {
        p_start: "2026-05-01",
        p_end: "2026-05-21",
        p_meta_account_id: "act_123",
      },
    );
  });

  it("uses null account scope when refreshing all configured accounts", () => {
    assert.deepEqual(
      refreshMetaInsightRollupsRpcArgs({
        start: "2026-05-01",
        end: "2026-05-21",
      }),
      {
        p_start: "2026-05-01",
        p_end: "2026-05-21",
        p_meta_account_id: null,
      },
    );
  });
});

describe("metaInsightRollupHealthRpcArgs", () => {
  it("maps optional health range and environment to the database RPC shape", () => {
    assert.deepEqual(
      metaInsightRollupHealthRpcArgs({
        start: "2026-05-01",
        end: "2026-05-31",
        environment: "staging",
      }),
      {
        p_start: "2026-05-01",
        p_end: "2026-05-31",
        p_environment: "staging",
      },
    );
  });

  it("uses nulls for unbounded default health checks", () => {
    assert.deepEqual(metaInsightRollupHealthRpcArgs({}), {
      p_start: null,
      p_end: null,
      p_environment: null,
    });
  });
});

describe("refreshMetaInsightRollups", () => {
  it("calls the refresh RPC and returns the refreshed row count", async () => {
    let rpcName = "";
    let rpcArgs: RefreshMetaInsightRollupsRpcArgs | null = null;

    const refreshed = await refreshMetaInsightRollups(
      {
        start: "2026-05-01",
        end: "2026-05-21",
        metaAccountId: "act_123",
      },
      {
        async rpc(name, args) {
          rpcName = name;
          rpcArgs = args;
          return { data: "42", error: null };
        },
      },
    );

    assert.equal(refreshed, 42);
    assert.equal(rpcName, "refresh_meta_daily_insight_rollups");
    assert.deepEqual(rpcArgs, {
      p_start: "2026-05-01",
      p_end: "2026-05-21",
      p_meta_account_id: "act_123",
    });
  });

  it("skips the RPC when the affected range is empty", async () => {
    let called = false;

    const refreshed = await refreshMetaInsightRollups(
      {
        start: null,
        end: "2026-05-21",
        metaAccountId: "act_123",
      },
      {
        async rpc() {
          called = true;
          return { data: 1, error: null };
        },
      },
    );

    assert.equal(refreshed, 0);
    assert.equal(called, false);
  });
});

describe("getMetaInsightRollupHealth", () => {
  it("maps database health rows into app-friendly fields", async () => {
    let rpcName = "";
    let rpcArgs: MetaInsightRollupHealthRpcArgs | null = null;

    const health = await getMetaInsightRollupHealth(
      { start: "2026-05-01", end: "2026-05-31" },
      {
        async rpc(name, args) {
          rpcName = name;
          rpcArgs = args;
          return {
            data: [
              {
                raw_rows: "10",
                rollup_rows: 9,
                missing_rollups: "1",
                stale_rollups: 0,
                orphan_rollups: 0,
                newest_raw_update: "2026-05-21T01:00:00Z",
                newest_rollup_update: "2026-05-21T00:59:00Z",
                oldest_problem_date: "2026-05-02",
                repair_meta_account_id: "act_123",
                repair_month: "2026-05",
                ok: false,
              },
            ],
            error: null,
          };
        },
      },
    );

    assert.equal(rpcName, "meta_insight_rollup_health");
    assert.deepEqual(rpcArgs, {
      p_start: "2026-05-01",
      p_end: "2026-05-31",
      p_environment: null,
    });
    assert.deepEqual(health, {
      rawRows: 10,
      rollupRows: 9,
      missingRollups: 1,
      staleRollups: 0,
      orphanRollups: 0,
      newestRawUpdate: "2026-05-21T01:00:00Z",
      newestRollupUpdate: "2026-05-21T00:59:00Z",
      oldestProblemDate: "2026-05-02",
      repairMetaAccountId: "act_123",
      repairMonth: "2026-05",
      ok: false,
    });
    assert.equal(
      formatMetaInsightRollupHealth(health),
      "raw rows: 10, rollup rows: 9, missing: 1, stale: 0",
    );
  });
});

describe("repairMetaInsightRollupChunk", () => {
  it("refreshes a bounded account-month chunk", async () => {
    let rpcArgs: RefreshMetaInsightRollupsRpcArgs | null = null;

    const refreshed = await repairMetaInsightRollupChunk(
      {
        start: "2026-05-01",
        end: "2026-05-31",
        metaAccountId: "act_123",
      },
      {
        async rpc(_name, args) {
          rpcArgs = args;
          return { data: 31, error: null };
        },
      },
    );

    assert.equal(refreshed, 31);
    assert.deepEqual(rpcArgs, {
      p_start: "2026-05-01",
      p_end: "2026-05-31",
      p_meta_account_id: "act_123",
    });
  });

  it("rejects unscoped or too-large repairs", () => {
    assert.throws(
      () =>
        assertBoundedRollupRepair({
          start: "2026-05-01",
          end: "2026-05-31",
          metaAccountId: "",
        }),
      /scoped to one Meta account/,
    );
    assert.throws(
      () =>
        assertBoundedRollupRepair({
          start: "2026-05-01",
          end: "2026-06-01",
          metaAccountId: "act_123",
        }),
      /limited to 31 days/,
    );
  });
});

describe("repairNextMetaInsightRollupChunk", () => {
  it("repairs the oldest account-month chunk reported by health", async () => {
    const refreshedArgs: RefreshMetaInsightRollupsRpcArgs[] = [];

    const result = await repairNextMetaInsightRollupChunk(
      { start: "2026-05-10", end: "2026-05-20" },
      {
        health: {
          async rpc() {
            return {
              data: [
                {
                  raw_rows: 12,
                  rollup_rows: 10,
                  missing_rollups: 2,
                  stale_rollups: 0,
                  orphan_rollups: 0,
                  newest_raw_update: null,
                  newest_rollup_update: null,
                  oldest_problem_date: "2026-05-10",
                  repair_meta_account_id: "act_123",
                  repair_month: "2026-05",
                  ok: false,
                },
              ],
              error: null,
            };
          },
        },
        refresh: {
          async rpc(_name, args) {
            refreshedArgs.push(args);
            return { data: "2", error: null };
          },
        },
      },
    );

    assert.equal(result.status, "repaired");
    assert.deepEqual(refreshedArgs, [
      {
        p_start: "2026-05-10",
        p_end: "2026-05-20",
        p_meta_account_id: "act_123",
      },
    ]);
    assert.deepEqual(result.repair, {
      start: "2026-05-10",
      end: "2026-05-20",
      metaAccountId: "act_123",
      month: "2026-05",
      refreshedRows: 2,
    });
  });

  it("does not refresh when health is already ok", async () => {
    let refreshed = false;

    const result = await repairNextMetaInsightRollupChunk(
      {},
      {
        health: {
          async rpc() {
            return {
              data: [
                {
                  raw_rows: 10,
                  rollup_rows: 10,
                  missing_rollups: 0,
                  stale_rollups: 0,
                  orphan_rollups: 0,
                  newest_raw_update: null,
                  newest_rollup_update: null,
                  oldest_problem_date: null,
                  repair_meta_account_id: null,
                  repair_month: null,
                  ok: true,
                },
              ],
              error: null,
            };
          },
        },
        refresh: {
          async rpc() {
            refreshed = true;
            return { data: 1, error: null };
          },
        },
      },
    );

    assert.equal(result.status, "healthy");
    assert.equal(result.repair, null);
    assert.equal(refreshed, false);
  });

  it("throws when unhealthy health omits repair scope", async () => {
    await assert.rejects(
      () =>
        repairNextMetaInsightRollupChunk(
          {},
          {
            health: {
              async rpc() {
                return {
                  data: [
                    {
                      raw_rows: 10,
                      rollup_rows: 9,
                      missing_rollups: 1,
                      stale_rollups: 0,
                      orphan_rollups: 0,
                      newest_raw_update: null,
                      newest_rollup_update: null,
                      oldest_problem_date: "2026-05-10",
                      repair_meta_account_id: null,
                      repair_month: null,
                      ok: false,
                    },
                  ],
                  error: null,
                };
              },
            },
          },
        ),
      /without a repair account and month/,
    );
  });

  it("throws when unhealthy health reports an unparseable repair month", async () => {
    await assert.rejects(
      () =>
        repairNextMetaInsightRollupChunk(
          {},
          {
            health: {
              async rpc() {
                return {
                  data: [
                    {
                      raw_rows: 10,
                      rollup_rows: 9,
                      missing_rollups: 1,
                      stale_rollups: 0,
                      orphan_rollups: 0,
                      newest_raw_update: null,
                      newest_rollup_update: null,
                      oldest_problem_date: "2026-05-10",
                      repair_meta_account_id: "act_123",
                      repair_month: "May 2026",
                      ok: false,
                    },
                  ],
                  error: null,
                };
              },
            },
          },
        ),
      /monthDateRange returned null/,
    );
  });
});
