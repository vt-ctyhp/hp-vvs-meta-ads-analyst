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

describe("meta_inbox_user_preferences migration", () => {
  it("creates the table keyed by app_user_id with tz default", () => {
    const sql = migrationContaining("create table if not exists public.meta_inbox_user_preferences");
    assert.match(sql, /user_id\s+uuid not null/i);
    assert.match(sql, /primary key \(environment, user_id\)/i);
    assert.match(sql, /timezone\s+text not null default 'America\/Los_Angeles'/i);
  });
  it("follows the ads_analyst role + environment RLS pattern", () => {
    const sql = migrationContaining("create table if not exists public.meta_inbox_user_preferences");
    assert.match(sql, /enable row level security/i);
    assert.match(sql, /analytics\.ads_analyst_environment_matches\(environment\)/i);
    assert.match(sql, /to ads_analyst_web, ads_analyst_worker, ads_analyst_ingest/i);
  });
  it("adds the defense-in-depth current_app_user_id owner policy", () => {
    const sql = migrationContaining("create table if not exists public.meta_inbox_user_preferences");
    assert.match(sql, /public\.current_app_user_id\(\)/i);
  });
});
