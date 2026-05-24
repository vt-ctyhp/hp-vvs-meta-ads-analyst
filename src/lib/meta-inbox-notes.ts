type JsonRecord = Record<string, unknown>;

export type MetaInboxConversationNoteType = "internal_note" | "manager_coaching";

export type MetaInboxConversationNote = {
  id: string;
  conversation_id: string;
  note_type: MetaInboxConversationNoteType;
  body: string;
  created_by: string;
  mention_user_ids: string[];
  metadata: JsonRecord;
  deleted_by: string | null;
  deleted_at: string | null;
  created_at: string | null;
  updated_at: string | null;
};

export type MetaInboxConversationNoteInput = {
  noteType?: MetaInboxConversationNoteType | null;
  body?: string | null;
  mentionUserIds?: string[] | null;
};

export type MetaInboxConversationNoteActor = {
  appUserId: string | null;
  roles: readonly string[];
};

export function buildMetaInboxConversationNoteCreate(
  conversationId: string,
  input: MetaInboxConversationNoteInput,
  actor: MetaInboxConversationNoteActor,
  now: string,
): {
  row: JsonRecord;
  note: MetaInboxConversationNote;
  event: {
    eventType: "note_added";
    previousValue: null;
    newValue: JsonRecord;
    metadata: JsonRecord;
  };
} {
  if (!isUuid(conversationId)) throw new Error("Conversation id is required.");
  const actorUserId = requireValidActorId(actor.appUserId);
  const noteType = normalizeNoteType(input.noteType);
  if (noteType === "manager_coaching" && !canCreateManagerCoaching(actor)) {
    throw new Error("Only sales lead or admin can add manager coaching.");
  }

  const body = requireText(input.body, "Note", 4000);
  const mentionUserIds = normalizeMentionUserIds(input.mentionUserIds);
  const metadata = {
    source: "inbox_notes",
    hasMentions: mentionUserIds.length > 0,
    mentionCount: mentionUserIds.length,
  };

  const row = {
    conversation_id: conversationId,
    note_type: noteType,
    body,
    created_by: actorUserId,
    mention_user_ids: mentionUserIds,
    metadata,
  };

  return {
    row,
    note: mapMetaInboxConversationNoteRow({
      id: "pending",
      deleted_by: null,
      deleted_at: null,
      created_at: now,
      updated_at: now,
      ...row,
    }),
    event: {
      eventType: "note_added",
      previousValue: null,
      newValue: {
        action: "created",
        noteType,
        hasMentions: mentionUserIds.length > 0,
        mentionCount: mentionUserIds.length,
      },
      metadata: {
        source: "inbox_notes",
        noteType,
        mentionCount: mentionUserIds.length,
      },
    },
  };
}

export function canCreateManagerCoaching(actor: Pick<MetaInboxConversationNoteActor, "roles">) {
  return actor.roles.includes("admin") || actor.roles.includes("sales_lead");
}

export function mapMetaInboxConversationNoteRow(row: JsonRecord): MetaInboxConversationNote {
  return {
    id: String(row.id || ""),
    conversation_id: String(row.conversation_id || ""),
    note_type: normalizeNoteType(row.note_type),
    body: String(row.body || ""),
    created_by: String(row.created_by || ""),
    mention_user_ids: stringArray(row.mention_user_ids).filter(isUuid),
    metadata: isRecord(row.metadata) ? row.metadata : {},
    deleted_by: stringField(row.deleted_by),
    deleted_at: stringField(row.deleted_at),
    created_at: stringField(row.created_at),
    updated_at: stringField(row.updated_at),
  };
}

function normalizeNoteType(value: unknown): MetaInboxConversationNoteType {
  return value === "manager_coaching" ? "manager_coaching" : "internal_note";
}

function normalizeMentionUserIds(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.filter((item): item is string => typeof item === "string"))]
    .map((item) => item.trim())
    .filter(isUuid)
    .slice(0, 25);
}

function requireValidActorId(value: string | null | undefined) {
  if (!value || !isUuid(value)) {
    throw new Error("A valid inbox user is required for notes.");
  }
  return value;
}

function requireText(value: unknown, label: string, maxLength: number) {
  if (typeof value !== "string") throw new Error(`${label} is required.`);
  const trimmed = value.trim();
  if (!trimmed) throw new Error(`${label} is required.`);
  if (trimmed.length > maxLength) {
    throw new Error(`${label} must be ${maxLength} characters or less.`);
  }
  return trimmed;
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];
}

function stringField(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value,
  );
}
