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

describe("meta_inbox_assign_rotation migration", () => {
  const sql = () =>
    migrationContaining("create table if not exists public.meta_inbox_assign_rotation");

  it("keys one pointer row per (environment, queue_category_key)", () => {
    assert.match(sql(), /queue_category_key\s+text not null/i);
    assert.match(sql(), /last_assigned_user_id\s+uuid/i);
    assert.match(sql(), /primary key \(environment, queue_category_key\)/i);
  });

  it("follows the ads_analyst role + environment RLS pattern", () => {
    assert.match(sql(), /enable row level security/i);
    assert.match(sql(), /analytics\.ads_analyst_environment_matches\(environment\)/i);
    assert.match(sql(), /grant select, insert, update on table public\.meta_inbox_assign_rotation/i);
    assert.match(sql(), /to ads_analyst_web, ads_analyst_worker, ads_analyst_ingest/i);
  });
});
