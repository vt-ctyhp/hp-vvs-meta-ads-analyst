import { normalizeAttachmentIds } from "./meta-inbox-attachments.ts";

type JsonRecord = Record<string, unknown>;

export type MetaInboxSendEligibility =
  | "standard_reply_allowed"
  | "human_agent_allowed"
  | "expired"
  | "unknown";

export type MetaInboxSendAttemptStatus =
  | "approved"
  | "queued"
  | "sending"
  | "sent"
  | "failed_retryable"
  | "failed_terminal"
  | "canceled";

export type MetaInboxReplyConversationInput = {
  id: string;
  send_eligibility: MetaInboxSendEligibility;
  reply_window_expires_at: string | null;
  human_agent_window_expires_at: string | null;
};

export type MetaInboxSendAttemptRecord = {
  id: string;
  conversation_id: string;
  reply_text: string;
  status: MetaInboxSendAttemptStatus;
  messaging_type: "RESPONSE" | "MESSAGE_TAG" | null;
  tag: "HUMAN_AGENT" | null;
  attempt_count: number;
  next_retry_at: string | null;
  meta_error_message: string | null;
};

export type MetaInboxReplyWindowState = {
  eligibility: MetaInboxSendEligibility;
  canAttemptSend: boolean;
  messagingType: "RESPONSE" | "MESSAGE_TAG" | null;
  tag: "HUMAN_AGENT" | null;
  countdownTargetAt: string | null;
  reason: string;
};

export type MetaInboxSendAttemptEventDraft = {
  eventType: "send_attempt";
  previousValue: JsonRecord | null;
  newValue: JsonRecord;
  metadata: JsonRecord;
};

export type MetaInboxSendAttemptDraft = {
  row: JsonRecord;
  event: MetaInboxSendAttemptEventDraft;
};

export type MetaInboxRetryAttemptUpdate = {
  expectedStatus: "failed_retryable";
  update: JsonRecord;
  event: MetaInboxSendAttemptEventDraft;
};

export type MetaInboxQueueAttemptUpdate = {
  expectedStatus: "approved";
  update: JsonRecord;
  event: MetaInboxSendAttemptEventDraft;
};

type ReplyContext = {
  actorUserId: string | null;
  now: string;
  humanAgentEnabled: boolean;
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MAX_REPLY_TEXT_LENGTH = 8000;

export function resolveMetaInboxReplyWindow(
  conversation: MetaInboxReplyConversationInput,
  context: { now: string; humanAgentEnabled: boolean },
): MetaInboxReplyWindowState {
  const standardOpen = isFuture(conversation.reply_window_expires_at, context.now);
  const humanAgentOpen =
    context.humanAgentEnabled && isFuture(conversation.human_agent_window_expires_at, context.now);

  if (conversation.send_eligibility === "standard_reply_allowed" && standardOpen) {
    return {
      eligibility: "standard_reply_allowed",
      canAttemptSend: true,
      messagingType: "RESPONSE",
      tag: null,
      countdownTargetAt: conversation.reply_window_expires_at,
      reason: "Standard 24-hour reply window is open.",
    };
  }

  if (
    (conversation.send_eligibility === "human_agent_allowed" ||
      conversation.send_eligibility === "standard_reply_allowed") &&
    humanAgentOpen
  ) {
    return {
      eligibility: "human_agent_allowed",
      canAttemptSend: true,
      messagingType: "MESSAGE_TAG",
      tag: "HUMAN_AGENT",
      countdownTargetAt: conversation.human_agent_window_expires_at,
      reason: "Human Agent support window is open.",
    };
  }

  if (
    conversation.send_eligibility === "expired" ||
    conversation.send_eligibility === "standard_reply_allowed" ||
    conversation.send_eligibility === "human_agent_allowed"
  ) {
    return {
      eligibility: "expired",
      canAttemptSend: false,
      messagingType: null,
      tag: null,
      countdownTargetAt: null,
      reason: "Reply window is expired.",
    };
  }

  return {
    eligibility: "unknown",
    canAttemptSend: false,
    messagingType: null,
    tag: null,
    countdownTargetAt: null,
    reason: "Reply eligibility is unknown. Sync or repair this conversation before sending.",
  };
}

export function buildMetaInboxSendAttemptDraft(
  conversation: MetaInboxReplyConversationInput,
  input: { replyText: string; idempotencyKey?: string | null; attachmentIds?: string[] | null },
  context: ReplyContext,
): MetaInboxSendAttemptDraft {
  const actorUserId = requireUuid(context.actorUserId, "A valid sales user");
  const conversationId = requireUuid(conversation.id, "Conversation");
  const attachmentIds = normalizeAttachmentIds(input.attachmentIds);
  if (attachmentIds.length > 1) {
    throw new Error("Send one attachment per send attempt.");
  }
  const replyText = normalizeReplyText(input.replyText, attachmentIds.length > 0);
  if (replyText && attachmentIds.length > 0) {
    throw new Error("Text and attachments must be sent as separate send attempts.");
  }
  const windowState = resolveMetaInboxReplyWindow(conversation, context);
  if (!windowState.canAttemptSend) {
    throw new Error(`${windowState.reason} Cannot record a send attempt.`);
  }

  const idempotencyKey = normalizeIdempotencyKey(input.idempotencyKey, {
    conversationId,
    actorUserId,
    replyText,
    attachmentIds,
    now: context.now,
  });

  return {
    row: {
      conversation_id: conversationId,
      reply_text: replyText,
      approved_by: actorUserId,
      approved_at: context.now,
      status: "approved",
      messaging_type: windowState.messagingType,
      tag: windowState.tag,
      attachment_ids: attachmentIds,
      attempt_count: 0,
      idempotency_key: idempotencyKey,
    },
    event: {
      eventType: "send_attempt",
      previousValue: null,
      newValue: {
        action: "created",
        status: "approved",
        messagingType: windowState.messagingType,
        tag: windowState.tag,
        idempotencyKey,
        attachmentCount: attachmentIds.length,
      },
      metadata: {
        source: "inbox_send_attempt",
        actorUserId,
        replyWindowEligibility: windowState.eligibility,
        liveMetaDelivery: false,
      },
    },
  };
}

export function buildMetaInboxRetryAttemptUpdate(
  attempt: MetaInboxSendAttemptRecord,
  conversation: MetaInboxReplyConversationInput,
  context: ReplyContext,
): MetaInboxRetryAttemptUpdate {
  const actorUserId = requireUuid(context.actorUserId, "A valid sales user");
  if (attempt.status !== "failed_retryable") {
    throw new Error("Only failed_retryable send attempts can be retried.");
  }

  const windowState = resolveMetaInboxReplyWindow(conversation, context);
  if (!windowState.canAttemptSend) {
    throw new Error(`${windowState.reason} Cannot retry send attempt.`);
  }

  return {
    expectedStatus: "failed_retryable",
    update: {
      status: "queued",
      messaging_type: windowState.messagingType,
      tag: windowState.tag,
      attempt_count: Math.max(0, Number(attempt.attempt_count) || 0) + 1,
      next_retry_at: null,
      last_attempted_at: context.now,
      meta_error_message: null,
      meta_error_code: null,
      meta_error_subcode: null,
      meta_trace_id: null,
      updated_at: context.now,
    },
    event: {
      eventType: "send_attempt",
      previousValue: {
        sendAttemptId: attempt.id,
        status: attempt.status,
        attemptCount: attempt.attempt_count,
        nextRetryAt: attempt.next_retry_at,
        metaErrorMessage: attempt.meta_error_message,
      },
      newValue: {
        action: "retry_queued",
        sendAttemptId: attempt.id,
        status: "queued",
        attemptCount: Math.max(0, Number(attempt.attempt_count) || 0) + 1,
        messagingType: windowState.messagingType,
        tag: windowState.tag,
      },
      metadata: {
        source: "inbox_send_attempt_retry",
        actorUserId,
        replyWindowEligibility: windowState.eligibility,
        liveMetaDelivery: false,
      },
    },
  };
}

export function buildMetaInboxQueueAttemptUpdate(
  attempt: MetaInboxSendAttemptRecord,
  conversation: MetaInboxReplyConversationInput,
  context: ReplyContext,
): MetaInboxQueueAttemptUpdate {
  const actorUserId = requireUuid(context.actorUserId, "A valid sales user");
  const conversationId = requireUuid(conversation.id, "Conversation");
  if (attempt.conversation_id !== conversationId) {
    throw new Error("Send attempt is not attached to this conversation.");
  }
  if (attempt.status !== "approved") {
    throw new Error("Only approved send attempts can be queued for delivery.");
  }

  const windowState = resolveMetaInboxReplyWindow(conversation, context);
  if (!windowState.canAttemptSend) {
    throw new Error(`${windowState.reason} Cannot queue send attempt.`);
  }

  return {
    expectedStatus: "approved",
    update: {
      status: "queued",
      messaging_type: windowState.messagingType,
      tag: windowState.tag,
      next_retry_at: null,
      meta_error_message: null,
      meta_error_code: null,
      meta_error_subcode: null,
      meta_trace_id: null,
      updated_at: context.now,
    },
    event: {
      eventType: "send_attempt",
      previousValue: {
        sendAttemptId: attempt.id,
        status: attempt.status,
        attemptCount: attempt.attempt_count,
      },
      newValue: {
        action: "delivery_queued",
        sendAttemptId: attempt.id,
        status: "queued",
        attemptCount: attempt.attempt_count,
        messagingType: windowState.messagingType,
        tag: windowState.tag,
      },
      metadata: {
        source: "inbox_send_attempt_queue",
        actorUserId,
        replyWindowEligibility: windowState.eligibility,
        liveMetaDelivery: false,
      },
    },
  };
}

function normalizeReplyText(value: string, attachmentBacked = false) {
  const replyText = String(value || "").trim();
  if (!replyText && !attachmentBacked) {
    throw new Error("Reply text is required.");
  }
  if (replyText.length > MAX_REPLY_TEXT_LENGTH) {
    throw new Error(`Reply text is too long (max ${MAX_REPLY_TEXT_LENGTH} characters).`);
  }
  return replyText;
}

function normalizeIdempotencyKey(
  value: string | null | undefined,
  fallback: {
    conversationId: string;
    actorUserId: string;
    replyText: string;
    attachmentIds: string[];
    now: string;
  },
) {
  const trimmed = typeof value === "string" ? value.trim() : "";
  if (trimmed) return trimmed.slice(0, 200);

  const attachmentIdentity = fallback.attachmentIds.join("|");
  return [
    "send",
    fallback.conversationId,
    fallback.actorUserId,
    stableIdempotencyHash(fallback.replyText),
    stableIdempotencyHash(attachmentIdentity),
  ].join(":");
}

function stableIdempotencyHash(value: string) {
  const normalized = value.trim().replace(/\s+/g, " ");
  let hash = 2166136261;
  for (let index = 0; index < normalized.length; index += 1) {
    hash ^= normalized.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return `${normalized.length.toString(36)}-${(hash >>> 0).toString(36)}`;
}

function isFuture(value: string | null | undefined, now: string) {
  if (!value) return false;
  const target = Date.parse(value);
  const base = Date.parse(now);
  return Number.isFinite(target) && Number.isFinite(base) && target > base;
}

function requireUuid(value: string | null | undefined, label: string) {
  const normalized = typeof value === "string" ? value.trim() : "";
  if (!UUID_RE.test(normalized)) {
    throw new Error(`${label} is required.`);
  }
  return normalized;
}
