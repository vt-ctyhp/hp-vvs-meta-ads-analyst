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

  it("keeps new inbox child relationships environment-aware", () => {
    for (const index of [
      "meta_social_messages_environment_id_idx",
      "meta_social_comments_environment_id_idx",
      "meta_inbox_teams_environment_id_idx",
      "meta_inbox_customer_profiles_environment_id_idx",
      "meta_inbox_conversations_environment_id_idx",
      "meta_inbox_send_attempts_environment_id_idx",
    ]) {
      assert.match(migrationText, new RegExp(`create unique index if not exists ${index}`));
    }

    for (const constraint of [
      "meta_inbox_team_members_environment_team_fk",
      "meta_inbox_team_queue_access_environment_team_fk",
      "meta_inbox_conversations_environment_profile_fk",
      "meta_inbox_contact_methods_environment_profile_fk",
      "meta_inbox_first_touch_sources_environment_conversation_fk",
      "meta_inbox_conversation_events_environment_conversation_fk",
      "meta_inbox_send_attempts_environment_conversation_fk",
      "meta_inbox_attachments_environment_conversation_fk",
      "meta_inbox_attachments_environment_send_attempt_fk",
      "meta_inbox_comment_actions_environment_conversation_fk",
      "meta_inbox_presence_environment_conversation_fk",
      "meta_inbox_notes_environment_conversation_fk",
      "meta_inbox_qa_scorecards_environment_conversation_fk",
    ]) {
      assert.match(migrationText, new RegExp(`constraint ${constraint}`));
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
    assert.match(String(message), /20260524170000_meta_inbox_environment_relationships\.sql/);
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
