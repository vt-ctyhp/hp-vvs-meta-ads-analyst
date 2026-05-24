type JsonRecord = Record<string, unknown>;

export type MetaInboxIdempotencyDecision =
  | { action: "insert" }
  | { action: "return_existing"; row: JsonRecord };

export function resolveMetaInboxSendAttemptIdempotency(
  existing: JsonRecord | null | undefined,
  draft: JsonRecord,
): MetaInboxIdempotencyDecision {
  if (!hasSameIdempotencyKey(existing, draft)) return { action: "insert" };
  if (hasSameSendAttemptPayload(existing, draft)) {
    return { action: "return_existing", row: existing };
  }
  throw new Error("Idempotency key was already used with a different send attempt payload.");
}

export function resolveMetaInboxCommentActionIdempotency(
  existing: JsonRecord | null | undefined,
  draft: JsonRecord,
): MetaInboxIdempotencyDecision {
  if (!hasSameIdempotencyKey(existing, draft)) return { action: "insert" };
  if (hasSameCommentActionPayload(existing, draft)) {
    return { action: "return_existing", row: existing };
  }
  throw new Error("Idempotency key was already used with a different comment action payload.");
}

function hasSameIdempotencyKey(
  existing: JsonRecord | null | undefined,
  draft: JsonRecord,
): existing is JsonRecord {
  if (!existing) return false;
  const existingKey = textField(existing.idempotency_key);
  return existingKey.length > 0 && existingKey === textField(draft.idempotency_key);
}

function hasSameSendAttemptPayload(existing: JsonRecord, draft: JsonRecord) {
  return (
    textField(existing.conversation_id) === textField(draft.conversation_id) &&
    textField(existing.reply_text) === textField(draft.reply_text) &&
    nullableTextField(existing.messaging_type) === nullableTextField(draft.messaging_type) &&
    nullableTextField(existing.tag) === nullableTextField(draft.tag) &&
    stableStringArray(existing.attachment_ids) === stableStringArray(draft.attachment_ids)
  );
}

function hasSameCommentActionPayload(existing: JsonRecord, draft: JsonRecord) {
  return (
    textField(existing.conversation_id) === textField(draft.conversation_id) &&
    textField(existing.comment_id) === textField(draft.comment_id) &&
    textField(existing.action_type) === textField(draft.action_type) &&
    nullableTextField(existing.message_text) === nullableTextField(draft.message_text) &&
    nullableTextField(existing.reason_note) === nullableTextField(draft.reason_note)
  );
}

function textField(value: unknown) {
  return typeof value === "string" ? value : "";
}

function nullableTextField(value: unknown) {
  const text = textField(value);
  return text.length > 0 ? text : null;
}

function stableStringArray(value: unknown) {
  if (!Array.isArray(value)) return "[]";
  return JSON.stringify(value.map((item) => String(item)));
}
