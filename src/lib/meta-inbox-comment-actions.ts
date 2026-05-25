type JsonRecord = Record<string, unknown>;

export type MetaInboxCommentActionType =
  | "public_reply"
  | "private_reply"
  | "like"
  | "hide"
  | "delete";

export type MetaInboxCommentActionStatus =
  | "approved"
  | "queued"
  | "sending"
  | "succeeded"
  | "failed_retryable"
  | "failed_terminal"
  | "canceled";

export type MetaInboxCommentActionConversationInput = {
  id: string;
  source_type: "message_thread" | "public_comment" | "private_reply" | "ad_referral" | "other";
  source_id: string | null;
  platform: "facebook" | "instagram";
};

export type MetaInboxCommentActionInput = {
  actionType?: MetaInboxCommentActionType | null;
  messageText?: string | null;
  reasonNote?: string | null;
  idempotencyKey?: string | null;
};

export type MetaInboxCommentActionEventDraft = {
  eventType: "comment_action";
  previousValue: JsonRecord | null;
  newValue: JsonRecord;
  metadata: JsonRecord;
};

export type MetaInboxCommentActionDraft = {
  row: JsonRecord;
  event: MetaInboxCommentActionEventDraft;
};

export type MetaInboxCommentActionRecord = {
  id: string;
  conversation_id: string;
  comment_id: string;
  action_type: MetaInboxCommentActionType;
  message_text: string | null;
  reason_note: string | null;
  status: MetaInboxCommentActionStatus;
  attempt_count: number;
  next_retry_at: string | null;
  meta_error_message: string | null;
};

export type MetaInboxCommentActionUpdate = {
  expectedStatus?: MetaInboxCommentActionStatus;
  update: JsonRecord;
  event: MetaInboxCommentActionEventDraft;
};

export type MetaInboxCommentActionDeliveryTarget = {
  actionType: MetaInboxCommentActionType;
  platform: "facebook" | "instagram";
  pageSelector: string;
  graphMethod: "POST" | "DELETE";
  graphPath: string;
  graphBody: JsonRecord;
  expectedResultId: string;
};

export type MetaInboxCommentActionDeliverySuccess = {
  metaActionId: string | null;
  metaResponse?: JsonRecord;
  completedAt: string;
};

export type MetaInboxCommentActionDeliveryFailure = {
  message: string;
  httpStatus: number | null;
  code: number | null;
  subcode: number | null;
  traceId: string | null;
  isTransient: boolean | null;
};

const COMMENT_ACTIONS = new Set<MetaInboxCommentActionType>([
  "public_reply",
  "private_reply",
  "like",
  "hide",
  "delete",
]);
const MESSAGE_ACTIONS = new Set<MetaInboxCommentActionType>(["public_reply", "private_reply"]);
const REASON_REQUIRED_ACTIONS = new Set<MetaInboxCommentActionType>(["hide", "delete"]);
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MAX_MESSAGE_TEXT_LENGTH = 8000;
const MAX_REASON_NOTE_LENGTH = 500;
const RETRYABLE_HTTP_STATUSES = new Set([408, 425, 429, 500, 502, 503, 504]);
const RETRYABLE_META_CODES = new Set([1, 2, 4, 17, 32, 613]);
const MAX_DELIVERY_ATTEMPTS = 5;

export function buildMetaInboxCommentActionDraft(
  conversation: MetaInboxCommentActionConversationInput,
  input: MetaInboxCommentActionInput,
  context: { actorUserId: string | null; now: string },
): MetaInboxCommentActionDraft {
  const actorUserId = requireUuid(context.actorUserId, "A valid sales user");
  const conversationId = requireUuid(conversation.id, "Conversation");
  const commentId = normalizeCommentId(conversation);
  const actionType = normalizeActionType(input.actionType);
  const messageText = MESSAGE_ACTIONS.has(actionType)
    ? normalizeMessageText(input.messageText)
    : null;
  const reasonNote = REASON_REQUIRED_ACTIONS.has(actionType)
    ? normalizeReasonNote(input.reasonNote, actionType)
    : normalizeOptionalReason(input.reasonNote);
  const idempotencyKey = normalizeIdempotencyKey(input.idempotencyKey, {
    conversationId,
    actorUserId,
    actionType,
    commentId,
    messageText,
    reasonNote,
    now: context.now,
  });

  return {
    row: {
      conversation_id: conversationId,
      comment_id: commentId,
      action_type: actionType,
      message_text: messageText,
      reason_note: reasonNote,
      requested_by: actorUserId,
      requested_at: context.now,
      status: "approved",
      attempt_count: 0,
      idempotency_key: idempotencyKey,
    },
    event: {
      eventType: "comment_action",
      previousValue: null,
      newValue: {
        action: "created",
        actionType,
        status: "approved",
        commentId,
        idempotencyKey,
        hasMessage: Boolean(messageText),
        reasonRequired: REASON_REQUIRED_ACTIONS.has(actionType),
      },
      metadata: {
        source: "inbox_comment_action",
        actorUserId,
        platform: conversation.platform,
        liveMetaDelivery: false,
      },
    },
  };
}

export function isMetaInboxCommentModerationAction(actionType: unknown) {
  return actionType === "hide" || actionType === "delete";
}

export function buildMetaInboxQueueCommentActionUpdate(
  action: MetaInboxCommentActionRecord,
  conversation: MetaInboxCommentActionConversationInput,
  context: { actorUserId: string | null; now: string },
): MetaInboxCommentActionUpdate {
  const actorUserId = requireUuid(context.actorUserId, "A valid sales user");
  const conversationId = requireUuid(conversation.id, "Conversation");
  if (action.conversation_id !== conversationId) {
    throw new Error("Comment action is not attached to this conversation.");
  }
  if (action.status !== "approved") {
    throw new Error("Only approved comment actions can be queued for delivery.");
  }

  return {
    expectedStatus: "approved",
    update: {
      status: "queued",
      next_retry_at: null,
      meta_error_message: null,
      meta_error_code: null,
      meta_error_subcode: null,
      meta_trace_id: null,
      updated_at: context.now,
    },
    event: {
      eventType: "comment_action",
      previousValue: {
        commentActionId: action.id,
        actionType: action.action_type,
        status: action.status,
        attemptCount: action.attempt_count,
      },
      newValue: {
        action: "delivery_queued",
        commentActionId: action.id,
        actionType: action.action_type,
        status: "queued",
        attemptCount: action.attempt_count,
      },
      metadata: {
        source: "inbox_comment_action_queue",
        actorUserId,
        liveMetaDelivery: false,
      },
    },
  };
}

export function buildMetaInboxRetryCommentActionUpdate(
  action: MetaInboxCommentActionRecord,
  conversation: MetaInboxCommentActionConversationInput,
  context: { actorUserId: string | null; now: string },
): MetaInboxCommentActionUpdate {
  const actorUserId = requireUuid(context.actorUserId, "A valid sales user");
  const conversationId = requireUuid(conversation.id, "Conversation");
  if (action.conversation_id !== conversationId) {
    throw new Error("Comment action is not attached to this conversation.");
  }
  if (action.status !== "failed_retryable") {
    throw new Error("Only failed_retryable comment actions can be retried.");
  }

  const attemptCount = Math.max(0, Number(action.attempt_count) || 0) + 1;
  return {
    expectedStatus: "failed_retryable",
    update: {
      status: "queued",
      attempt_count: attemptCount,
      next_retry_at: null,
      last_attempted_at: context.now,
      meta_error_message: null,
      meta_error_code: null,
      meta_error_subcode: null,
      meta_trace_id: null,
      updated_at: context.now,
    },
    event: {
      eventType: "comment_action",
      previousValue: {
        commentActionId: action.id,
        actionType: action.action_type,
        status: action.status,
        attemptCount: action.attempt_count,
        nextRetryAt: action.next_retry_at,
        metaErrorMessage: action.meta_error_message,
      },
      newValue: {
        action: "retry_queued",
        commentActionId: action.id,
        actionType: action.action_type,
        status: "queued",
        attemptCount,
      },
      metadata: {
        source: "inbox_comment_action_retry",
        actorUserId,
        liveMetaDelivery: false,
      },
    },
  };
}

export function buildMetaInboxCommentActionDeliveryTarget(
  conversation: MetaInboxCommentActionConversationInput & {
    page_id?: string | null;
    ig_user_id?: string | null;
  },
  action: MetaInboxCommentActionRecord,
): MetaInboxCommentActionDeliveryTarget {
  if (action.conversation_id !== conversation.id) {
    throw new Error("Comment action is not attached to this conversation.");
  }
  const commentId = normalizeCommentId(conversation);
  const pageSelector =
    conversation.platform === "facebook"
      ? conversation.page_id
      : conversation.page_id || conversation.ig_user_id;
  if (!pageSelector) {
    throw new Error("Conversation is missing a Meta page selector.");
  }

  if (action.action_type === "public_reply") {
    const message = normalizeMessageText(action.message_text);
    return {
      actionType: action.action_type,
      platform: conversation.platform,
      pageSelector,
      graphMethod: "POST",
      graphPath: `${commentId}/comments`,
      graphBody: { message },
      expectedResultId: commentId,
    };
  }

  if (action.action_type === "private_reply") {
    const message = normalizeMessageText(action.message_text);
    if (conversation.platform === "instagram") {
      const igUserId = conversation.ig_user_id?.trim();
      if (!igUserId) {
        throw new Error("Instagram private replies require the IG user id.");
      }
      return {
        actionType: action.action_type,
        platform: conversation.platform,
        pageSelector,
        graphMethod: "POST",
        graphPath: `${igUserId}/messages`,
        graphBody: {
          recipient: { comment_id: commentId },
          message: { text: message },
        },
        expectedResultId: commentId,
      };
    }

    return {
      actionType: action.action_type,
      platform: conversation.platform,
      pageSelector,
      graphMethod: "POST",
      graphPath: `${commentId}/private_replies`,
      graphBody: { message },
      expectedResultId: commentId,
    };
  }

  if (action.action_type === "like") {
    return {
      actionType: action.action_type,
      platform: conversation.platform,
      pageSelector,
      graphMethod: "POST",
      graphPath: `${commentId}/likes`,
      graphBody: {},
      expectedResultId: commentId,
    };
  }

  if (action.action_type === "hide") {
    normalizeReasonNote(action.reason_note, "hide");
    return {
      actionType: action.action_type,
      platform: conversation.platform,
      pageSelector,
      graphMethod: "POST",
      graphPath: commentId,
      graphBody: { is_hidden: true },
      expectedResultId: commentId,
    };
  }

  normalizeReasonNote(action.reason_note, "delete");
  return {
    actionType: action.action_type,
    platform: conversation.platform,
    pageSelector,
    graphMethod: "DELETE",
    graphPath: commentId,
    graphBody: {},
    expectedResultId: commentId,
  };
}

export function buildMetaInboxCommentActionSendingUpdate(
  action: MetaInboxCommentActionRecord,
  context: { now: string },
): MetaInboxCommentActionUpdate {
  const attemptCount = Math.max(1, Math.trunc(Number(action.attempt_count) || 0));
  return {
    update: {
      status: "sending",
      attempt_count: attemptCount,
      last_attempted_at: context.now,
      next_retry_at: null,
      updated_at: context.now,
    },
    event: {
      eventType: "comment_action",
      previousValue: {
        commentActionId: action.id,
        actionType: action.action_type,
        status: action.status,
        attemptCount: action.attempt_count,
      },
      newValue: {
        action: "delivery_started",
        commentActionId: action.id,
        actionType: action.action_type,
        status: "sending",
        attemptCount,
      },
      metadata: {
        source: "inbox_comment_action_delivery",
        liveMetaDelivery: true,
      },
    },
  };
}

export function buildMetaInboxCommentActionSuccessUpdate(
  action: MetaInboxCommentActionRecord,
  result: MetaInboxCommentActionDeliverySuccess,
): MetaInboxCommentActionUpdate {
  return {
    update: {
      status: "succeeded",
      meta_action_id: result.metaActionId,
      meta_response: result.metaResponse || {},
      meta_error_message: null,
      meta_error_code: null,
      meta_error_subcode: null,
      meta_trace_id: null,
      next_retry_at: null,
      completed_at: result.completedAt,
      updated_at: result.completedAt,
    },
    event: {
      eventType: "comment_action",
      previousValue: {
        commentActionId: action.id,
        actionType: action.action_type,
        status: action.status,
        attemptCount: action.attempt_count,
      },
      newValue: {
        action: "delivered",
        commentActionId: action.id,
        actionType: action.action_type,
        status: "succeeded",
        metaActionId: result.metaActionId,
      },
      metadata: {
        source: "inbox_comment_action_delivery",
        liveMetaDelivery: true,
      },
    },
  };
}

export function buildMetaInboxCommentActionFailureUpdate(
  action: MetaInboxCommentActionRecord,
  failure: MetaInboxCommentActionDeliveryFailure,
  context: { now: string },
): MetaInboxCommentActionUpdate {
  const retryable = isRetryableMetaInboxCommentActionFailure(failure);
  const attemptCount = Math.max(1, Math.trunc(Number(action.attempt_count) || 0));
  const maxAttemptsReached = retryable && attemptCount >= MAX_DELIVERY_ATTEMPTS;
  const status = retryable && !maxAttemptsReached ? "failed_retryable" : "failed_terminal";
  const nextRetryAt =
    retryable && !maxAttemptsReached ? nextRetryAtForAttempt(context.now, attemptCount) : null;

  return {
    update: {
      status,
      meta_error_message: failure.message.slice(0, 1000),
      meta_error_code: failure.code,
      meta_error_subcode: failure.subcode,
      meta_trace_id: failure.traceId,
      next_retry_at: nextRetryAt,
      updated_at: context.now,
    },
    event: {
      eventType: "comment_action",
      previousValue: {
        commentActionId: action.id,
        actionType: action.action_type,
        status: action.status,
        attemptCount: action.attempt_count,
      },
      newValue: {
        action: "delivery_failed",
        commentActionId: action.id,
        actionType: action.action_type,
        status,
        nextRetryAt,
      },
      metadata: {
        source: "inbox_comment_action_delivery",
        liveMetaDelivery: true,
        httpStatus: failure.httpStatus,
        metaErrorCode: failure.code,
        metaErrorSubcode: failure.subcode,
        metaTraceId: failure.traceId,
        maxAttemptsReached,
      },
    },
  };
}

export function isRetryableMetaInboxCommentActionFailure(
  failure: MetaInboxCommentActionDeliveryFailure,
) {
  if (failure.isTransient === true) return true;
  if (failure.httpStatus && RETRYABLE_HTTP_STATUSES.has(failure.httpStatus)) return true;
  if (failure.httpStatus && failure.httpStatus >= 500) return true;
  if (failure.code && RETRYABLE_META_CODES.has(failure.code)) return true;
  return false;
}

export function nextRetryAtForAttempt(now: string, attemptCount: number) {
  const base = Date.parse(now);
  const safeBase = Number.isFinite(base) ? base : Date.now();
  const minutes = Math.min(60, 5 * 2 ** Math.max(0, Math.trunc(attemptCount) - 1));
  return new Date(safeBase + minutes * 60_000).toISOString();
}

function normalizeActionType(value: MetaInboxCommentActionType | null | undefined) {
  const actionType = typeof value === "string" ? value.trim() : "";
  if (!COMMENT_ACTIONS.has(actionType as MetaInboxCommentActionType)) {
    throw new Error("Comment action type is required.");
  }
  return actionType as MetaInboxCommentActionType;
}

function normalizeCommentId(conversation: MetaInboxCommentActionConversationInput) {
  if (conversation.source_type !== "public_comment" && conversation.source_type !== "private_reply") {
    throw new Error("Public comment actions require a comment conversation.");
  }

  const commentId = typeof conversation.source_id === "string" ? conversation.source_id.trim() : "";
  if (!commentId) {
    throw new Error("Conversation is missing a source comment id.");
  }
  return commentId;
}

function normalizeMessageText(value: string | null | undefined) {
  const messageText = String(value || "").trim();
  if (!messageText) throw new Error("Reply text is required for this comment action.");
  if (messageText.length > MAX_MESSAGE_TEXT_LENGTH) {
    throw new Error(`Reply text is too long (max ${MAX_MESSAGE_TEXT_LENGTH} characters).`);
  }
  return messageText;
}

function normalizeReasonNote(
  value: string | null | undefined,
  actionType: MetaInboxCommentActionType,
) {
  const reasonNote = String(value || "").trim();
  if (!reasonNote) {
    throw new Error(`A reason note is required to ${actionType} a public comment.`);
  }
  if (reasonNote.length > MAX_REASON_NOTE_LENGTH) {
    throw new Error(`Reason note is too long (max ${MAX_REASON_NOTE_LENGTH} characters).`);
  }
  return reasonNote;
}

function normalizeOptionalReason(value: string | null | undefined) {
  const reasonNote = String(value || "").trim();
  if (!reasonNote) return null;
  return reasonNote.slice(0, MAX_REASON_NOTE_LENGTH);
}

function normalizeIdempotencyKey(
  value: string | null | undefined,
  fallback: {
    conversationId: string;
    actorUserId: string;
    actionType: MetaInboxCommentActionType;
    commentId: string;
    messageText: string | null;
    reasonNote: string | null;
    now: string;
  },
) {
  const trimmed = typeof value === "string" ? value.trim() : "";
  if (trimmed) return trimmed.slice(0, 200);

  return [
    "comment",
    fallback.conversationId,
    fallback.actorUserId,
    fallback.actionType,
    fallback.commentId,
    stableIdempotencyHash(fallback.messageText || ""),
    stableIdempotencyHash(fallback.reasonNote || ""),
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

function requireUuid(value: string | null | undefined, label: string) {
  const normalized = typeof value === "string" ? value.trim() : "";
  if (!UUID_RE.test(normalized)) {
    throw new Error(`${label} is required.`);
  }
  return normalized;
}
