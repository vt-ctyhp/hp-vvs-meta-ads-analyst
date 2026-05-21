import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  refreshMetaInsightRollups,
  refreshMetaInsightRollupsRpcArgs,
  type RefreshMetaInsightRollupsRpcArgs,
} from "../src/lib/meta-insight-rollups.ts";

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
