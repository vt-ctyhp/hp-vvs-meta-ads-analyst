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

describe("inbox auto-assign cron schedule migration", () => {
  const sql = () => migrationContaining("inbox-auto-assign");
  it("schedules a recurring job that posts to the sweep route", () => {
    assert.match(sql(), /cron\.schedule\(/i);
    assert.match(sql(), /\/api\/cron\/inbox-auto-assign/);
    assert.match(sql(), /\*\/5 \* \* \* \*/); // every 5 minutes
  });
  it("dispatches via pg_net with the cron secret", () => {
    assert.match(sql(), /net\.http_post/i);
    assert.match(sql(), /x-cron-secret/i);
  });
});
