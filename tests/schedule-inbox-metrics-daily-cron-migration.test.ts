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

describe("inbox metrics daily cron migration", () => {
  it("defines a dispatcher and schedules it every 15 minutes", () => {
    const sql = migrationContaining("function public.run_inbox_metrics_daily_dispatch");
    assert.match(sql, /create or replace function public\.run_inbox_metrics_daily_dispatch\(\)/i);
    assert.match(sql, /compute_inbox_metrics_daily_for_tz/i);
    assert.match(sql, /cron\.schedule\(\s*'inbox-metrics-daily'\s*,\s*'\*\/15 \* \* \* \*'/i);
  });
});
