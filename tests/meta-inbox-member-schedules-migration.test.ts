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

describe("meta_inbox_member_schedules migration", () => {
  const sql = () =>
    migrationContaining("create table if not exists public.meta_inbox_member_schedules");

  it("keys one row per (environment, app_user_id, weekday) with no tz column", () => {
    assert.match(sql(), /weekday\s+smallint not null check \(weekday between 0 and 6\)/i);
    assert.match(sql(), /start_time\s+time not null/i);
    assert.match(sql(), /end_time\s+time not null/i);
    assert.match(sql(), /primary key \(environment, app_user_id, weekday\)/i);
    assert.ok(!/timezone/i.test(sql()), "schedules must not store timezone (reuse user prefs)");
  });

  it("follows the ads_analyst role + environment RLS pattern and allows delete", () => {
    assert.match(sql(), /enable row level security/i);
    assert.match(sql(), /analytics\.ads_analyst_environment_matches\(environment\)/i);
    assert.match(sql(), /grant select, insert, update, delete on table public\.meta_inbox_member_schedules/i);
    assert.match(sql(), /to ads_analyst_web, ads_analyst_worker, ads_analyst_ingest/i);
    assert.match(sql(), /create policy ads_analyst_web_delete/i);
  });
});
