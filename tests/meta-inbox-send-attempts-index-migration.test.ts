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

describe("send_attempts approved/sent index migration", () => {
  it("adds the partial index for B1/B3 today queries", () => {
    const sql = migrationContaining("meta_inbox_send_attempts_approved_sent_idx");
    assert.match(sql, /create index if not exists meta_inbox_send_attempts_approved_sent_idx[\s\S]*on public\.meta_inbox_send_attempts \(environment, approved_by, sent_at\)[\s\S]*where status = 'sent'/i);
  });
});
