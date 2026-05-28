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

describe("compute_inbox_metrics_daily_for_tz migration", () => {
  it("defines the function and upserts on the unique key", () => {
    const sql = migrationContaining("function public.compute_inbox_metrics_daily_for_tz");
    assert.match(sql, /create or replace function public\.compute_inbox_metrics_daily_for_tz\(\s*p_tz text,\s*p_target_date date\s*\)/i);
    assert.match(sql, /on conflict \(environment, user_id, date\) do update/i);
    assert.match(sql, /public\.business_seconds_between\(/i);
  });

  it("truncates response-time inputs to whole seconds for JS parity", () => {
    const sql = migrationContaining("function public.compute_inbox_metrics_daily_for_tz");
    assert.match(sql, /date_trunc\('second', c\.first_inbound_at\)/i);
    assert.match(sql, /date_trunc\('second', fr\.first_outbound_at\)/i);
  });
});
