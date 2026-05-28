import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, it } from "node:test";

import { BUSINESS_SECONDS_FIXTURES } from "./business-hours-fixtures.ts";

const MIGRATIONS_DIR = resolve("supabase/migrations");

function migrationContaining(snippet: string): string {
  const file = readdirSync(MIGRATIONS_DIR)
    .filter((n) => n.endsWith(".sql"))
    .find((n) => readFileSync(resolve(MIGRATIONS_DIR, n), "utf8").includes(snippet));
  if (!file) throw new Error(`No migration contains: ${snippet}`);
  return readFileSync(resolve(MIGRATIONS_DIR, file), "utf8");
}

describe("business_seconds_between SQL fn migration", () => {
  it("defines the plpgsql function with the lockstep signature", () => {
    const sql = migrationContaining("function public.business_seconds_between");
    assert.match(
      sql,
      /create or replace function public\.business_seconds_between\(\s*from_ts timestamptz,\s*to_ts timestamptz,\s*tz text,\s*start_time time,\s*end_time time\s*\)\s*returns integer/i,
    );
    assert.match(sql, /language plpgsql/i);
  });

  it("embeds every JS fixture as a cross-check comment", () => {
    const sql = migrationContaining("function public.business_seconds_between");
    for (const f of BUSINESS_SECONDS_FIXTURES) {
      assert.ok(sql.includes(f.label), `fixture comment missing: ${f.label}`);
      assert.ok(sql.includes(String(f.expected)), `expected value missing: ${f.expected}`);
    }
  });
});
