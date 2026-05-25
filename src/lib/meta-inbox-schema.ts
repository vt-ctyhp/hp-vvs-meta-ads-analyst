import { safeErrorMessage } from "./error-message.ts";

export const META_INBOX_REQUIRED_MIGRATIONS = [
  "20260514190000_social_inbox.sql",
  "20260523090000_meta_inbox_foundation.sql",
  "20260524100000_meta_inbox_reply_reliability.sql",
  "20260524110000_meta_inbox_attachments.sql",
  "20260524120000_meta_inbox_comment_actions.sql",
  "20260524130000_meta_inbox_presence.sql",
  "20260524140000_meta_inbox_saved_replies.sql",
  "20260524150000_meta_inbox_notes.sql",
  "20260524160000_meta_inbox_qa_scorecards.sql",
  "20260524170000_meta_inbox_environment_relationships.sql",
] as const;

export const META_INBOX_REQUIRED_TABLES = [
  "meta_social_pages",
  "meta_social_threads",
  "meta_social_messages",
  "meta_social_comments",
  "meta_social_sync_runs",
  "meta_inbox_queue_categories",
  "meta_inbox_teams",
  "meta_inbox_team_members",
  "meta_inbox_team_queue_access",
  "meta_inbox_customer_profiles",
  "meta_inbox_conversations",
  "meta_inbox_customer_contact_methods",
  "meta_inbox_first_touch_sources",
  "meta_inbox_conversation_events",
  "meta_inbox_send_attempts",
  "meta_inbox_attachments",
  "meta_inbox_comment_actions",
  "meta_inbox_presence",
  "meta_inbox_saved_replies",
  "meta_inbox_notes",
  "meta_inbox_qa_scorecards",
] as const;

const META_INBOX_REQUIRED_TABLE_SET = new Set<string>(META_INBOX_REQUIRED_TABLES);
const LAST_REQUIRED_MIGRATION =
  META_INBOX_REQUIRED_MIGRATIONS[META_INBOX_REQUIRED_MIGRATIONS.length - 1];

export function missingMetaInboxSchemaTable(error: unknown): string | null {
  const text = schemaErrorText(error);
  if (!isMissingSchemaShape(text)) return null;

  for (const table of META_INBOX_REQUIRED_TABLES) {
    if (text.includes(table)) return table;
  }

  const relation = text.match(/(?:public\.)?(meta_(?:social|inbox)_[a-z0-9_]+)/i)?.[1];
  if (relation && META_INBOX_REQUIRED_TABLE_SET.has(relation)) return relation;

  return null;
}

export function isMissingMetaInboxSchemaError(error: unknown): boolean {
  return missingMetaInboxSchemaTable(error) !== null;
}

export function metaInboxSchemaReadinessMessage(error: unknown): string | null {
  const table = missingMetaInboxSchemaTable(error);
  if (!table) return null;

  return [
    "Social inbox database schema is not ready.",
    `Missing table: public.${table}.`,
    `Apply Supabase inbox migrations through supabase/migrations/${LAST_REQUIRED_MIGRATION} before using /convert/inbox, syncing, replying, or queueing comment actions.`,
  ].join(" ");
}

export function normalizeMetaInboxSchemaError(error: unknown): unknown {
  const message = metaInboxSchemaReadinessMessage(error);
  return message ? new Error(message) : error;
}

function schemaErrorText(error: unknown) {
  if (typeof error === "object" && error !== null) {
    const fields = error as Record<string, unknown>;
    return [
      safeErrorMessage(error),
      stringField(fields.code),
      stringField(fields.details),
      stringField(fields.hint),
    ]
      .join(" ")
      .toLowerCase();
  }

  return safeErrorMessage(error).toLowerCase();
}

function isMissingSchemaShape(text: string) {
  return (
    text.includes("schema cache") ||
    text.includes("does not exist") ||
    text.includes("pgrst205") ||
    text.includes("undefined_table") ||
    text.includes("42p01")
  );
}

function stringField(value: unknown) {
  return typeof value === "string" ? value : "";
}
