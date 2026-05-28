import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, it } from "node:test";

const MIGRATIONS_DIR = resolve("supabase/migrations");

function migrationContaining(snippet: string): string {
  const file = readdirSync(MIGRATIONS_DIR)
    .filter((name) => name.endsWith(".sql"))
    .find((name) => readFileSync(resolve(MIGRATIONS_DIR, name), "utf8").includes(snippet));
  if (!file) throw new Error(`No migration contains: ${snippet}`);
  return readFileSync(resolve(MIGRATIONS_DIR, file), "utf8");
}

describe("queue business-hours migration", () => {
  it("adds timezone + business hour columns to meta_inbox_queue_categories", () => {
    const sql = migrationContaining("add column if not exists business_hours_start");
    assert.match(sql, /alter table public\.meta_inbox_queue_categories/i);
    assert.match(sql, /add column if not exists timezone\s+text not null default 'America\/Los_Angeles'/i);
    assert.match(sql, /add column if not exists business_hours_start\s+time not null default '10:00:00'/i);
    assert.match(sql, /add column if not exists business_hours_end\s+time not null default '19:00:00'/i);
    assert.match(sql, /update public\.meta_inbox_queue_categories[\s\S]*set timezone = 'Asia\/Ho_Chi_Minh'[\s\S]*where key = 'vn_product'/i);
  });
});
