import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";

import { ANALYST_OWNED_TABLES } from "../src/lib/data-boundaries.ts";
import {
  isMissingMetaInboxSchemaError,
  META_INBOX_REQUIRED_MIGRATIONS,
  META_INBOX_REQUIRED_TABLES,
  metaInboxSchemaReadinessMessage,
  missingMetaInboxSchemaTable,
  normalizeMetaInboxSchemaError,
} from "../src/lib/meta-inbox-schema.ts";

const REPO_ROOT = fileURLToPath(new URL("..", import.meta.url));
const migrationText = META_INBOX_REQUIRED_MIGRATIONS.map((migration) => {
  const path = join(REPO_ROOT, "supabase/migrations", migration);
  assert.equal(existsSync(path), true, `${migration} must exist`);
  return readFileSync(path, "utf8");
}).join("\n");

describe("Meta inbox schema readiness", () => {
  it("keeps every runtime inbox table backed by migrations and data-boundary ownership", () => {
    for (const table of META_INBOX_REQUIRED_TABLES) {
      assert.match(
        migrationText,
        new RegExp(`create table if not exists public\\.${table}`),
        `${table} must be created by a required inbox migration`,
      );
      assert.equal(
        ANALYST_OWNED_TABLES.includes(table),
        true,
        `${table} must be registered as analyst-owned`,
      );
    }
  });

  it("turns missing PostgREST schema-cache errors into migration guidance", () => {
    const error = {
      code: "PGRST205",
      message: "Could not find the table 'public.meta_inbox_conversations' in the schema cache",
    };

    assert.equal(isMissingMetaInboxSchemaError(error), true);
    assert.equal(missingMetaInboxSchemaTable(error), "meta_inbox_conversations");

    const message = metaInboxSchemaReadinessMessage(error);
    assert.match(String(message), /Social inbox database schema is not ready/);
    assert.match(String(message), /public\.meta_inbox_conversations/);
    assert.match(String(message), /20260524160000_meta_inbox_qa_scorecards\.sql/);
    assert.doesNotMatch(String(message), /schema cache/);

    const normalized = normalizeMetaInboxSchemaError(error);
    assert.equal(normalized instanceof Error, true);
    assert.equal((normalized as Error).message, message);
  });

  it("leaves unrelated database errors alone", () => {
    const error = { code: "42501", message: "permission denied for table users" };

    assert.equal(isMissingMetaInboxSchemaError(error), false);
    assert.equal(metaInboxSchemaReadinessMessage(error), null);
    assert.equal(normalizeMetaInboxSchemaError(error), error);
  });
});
