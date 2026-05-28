import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, it } from "node:test";

const MIGRATIONS_DIR = resolve("supabase/migrations");
function migrationContaining(snippet: string): string {
  const file = readdirSync(MIGRATIONS_DIR)
    .filter((n) => n.endsWith(".sql"))
    .find((n) => readFileSync(resolve(MIGRATIONS_DIR, n), "utf8").includes(snippet));
  if (!file) throw new Error(`No migration contains: ${snippet}`);
  return readFileSync(resolve(MIGRATIONS_DIR, file), "utf8");
}

describe("meta_inbox_metrics_daily migration", () => {
  it("creates the rollup table with the spec columns", () => {
    const sql = migrationContaining("create table if not exists public.meta_inbox_metrics_daily");
    for (const col of [
      "avg_response_seconds   integer",
      "on_time_replies        integer not null default 0",
      "total_replies          integer not null default 0",
      "team_claims            integer not null default 0",
      "breached_at_eod        integer not null default 0",
    ]) assert.ok(sql.includes(col), `missing column: ${col}`);
  });
  it("creates the unique (environment,user_id,date) index and the date index", () => {
    const sql = migrationContaining("create table if not exists public.meta_inbox_metrics_daily");
    assert.match(sql, /create unique index if not exists meta_inbox_metrics_daily_user_date_idx[\s\S]*\(environment, user_id, date\)/i);
    assert.match(sql, /create index if not exists meta_inbox_metrics_daily_date_idx[\s\S]*\(environment, date desc\)/i);
  });
  it("uses ads_analyst environment RLS and restricts writes to worker/ingest", () => {
    const sql = migrationContaining("create table if not exists public.meta_inbox_metrics_daily");
    assert.match(sql, /analytics\.ads_analyst_environment_matches\(environment\)/i);
    // ads_analyst_web gets SELECT only (cron/backfill run as worker/ingest).
    assert.match(sql, /grant select on table public\.meta_inbox_metrics_daily\s+to ads_analyst_web/i);
    assert.match(sql, /grant select, insert, update on table public\.meta_inbox_metrics_daily\s+to ads_analyst_worker, ads_analyst_ingest/i);
  });
});
