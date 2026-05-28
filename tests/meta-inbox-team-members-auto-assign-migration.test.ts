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

describe("meta_inbox_team_members.auto_assign_eligible migration", () => {
  it("adds an opt-in boolean column defaulting to false", () => {
    const sql = migrationContaining("auto_assign_eligible");
    assert.match(sql, /alter table public\.meta_inbox_team_members/i);
    assert.match(sql, /add column if not exists auto_assign_eligible boolean not null default false/i);
  });
});
