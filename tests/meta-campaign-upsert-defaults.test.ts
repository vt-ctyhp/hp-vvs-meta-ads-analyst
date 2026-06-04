import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { upsertMany, type DynamicSupabaseClient } from "../src/lib/meta.ts";

/**
 * Regression for the daily Meta sync outage that began 2026-05-29.
 *
 * Migration 20260528203430_meta_api_enrichment_sync added jsonb columns to
 * meta_campaigns/meta_ad_sets/meta_ads/meta_creatives as `NOT NULL DEFAULT`.
 * The sync writes those columns only for entities where Meta returned the
 * field, so a bulk upsert mixes rows that have the key with rows that omit it.
 *
 * PostgREST builds the INSERT column list from the UNION of every row's keys,
 * and a row missing a column gets an explicit NULL — unless `defaultToNull`
 * is false, in which case the column's DB DEFAULT is used. With NULL, the new
 * NOT NULL constraint is violated, the whole upsert throws, and the sync
 * aborts before writing any meta_daily_insights rows.
 *
 * The fake below models exactly that PostgREST behaviour.
 */

const NOT_NULL_JSONB_DEFAULTS: Record<string, unknown> = {
  pacing_type: [],
};

function makeFakeClient() {
  const calls: Array<{
    table: string;
    options: { onConflict: string; defaultToNull?: boolean };
  }> = [];

  const client = {
    from(table: string) {
      return {
        upsert(
          rows: Array<Record<string, unknown>>,
          options: { onConflict: string; defaultToNull?: boolean },
        ) {
          calls.push({ table, options });

          // INSERT column list = union of all keys in the batch.
          const columns = new Set<string>();
          for (const row of rows) {
            for (const key of Object.keys(row)) columns.add(key);
          }

          const stored = rows.map((row) => {
            const out: Record<string, unknown> = { ...row };
            for (const column of columns) {
              if (column in row) continue;
              // Missing key -> NULL, unless defaultToNull===false where the
              // column DEFAULT applies (PostgREST `missing=default`).
              out[column] =
                options.defaultToNull === false && column in NOT_NULL_JSONB_DEFAULTS
                  ? NOT_NULL_JSONB_DEFAULTS[column]
                  : null;
            }
            return out;
          });

          // Enforce the migration's NOT NULL constraints.
          for (const row of stored) {
            for (const column of Object.keys(NOT_NULL_JSONB_DEFAULTS)) {
              if (row[column] === null) {
                return {
                  select: async () => ({
                    data: null,
                    error: new Error(
                      `null value in column "${column}" of relation "${table}" violates not-null constraint`,
                    ),
                  }),
                };
              }
            }
          }

          return {
            select: async () => ({ data: stored, error: null }),
          };
        },
      };
    },
  };

  return { client: client as unknown as DynamicSupabaseClient, calls };
}

describe("upsertMany NOT NULL bulk-upsert handling", () => {
  it("does not violate NOT NULL when some rows omit a defaulted jsonb column", async () => {
    const { client } = makeFakeClient();
    const rows = [
      // Meta returned pacing_type for this campaign.
      { meta_account_id: "act_1", campaign_id: "c1", pacing_type: ["standard"] },
      // Meta omitted pacing_type for this one (key absent).
      { meta_account_id: "act_1", campaign_id: "c2" },
    ];

    await assert.doesNotReject(
      upsertMany("meta_campaigns", rows, "meta_account_id,campaign_id", client),
    );
  });

  it("requests defaultToNull:false so omitted columns fall back to their DB default", async () => {
    const { client, calls } = makeFakeClient();

    await upsertMany(
      "meta_campaigns",
      [{ meta_account_id: "act_1", campaign_id: "c1", pacing_type: ["standard"] }],
      "meta_account_id,campaign_id",
      client,
    );

    assert.equal(calls[0]?.options.defaultToNull, false);
  });
});
