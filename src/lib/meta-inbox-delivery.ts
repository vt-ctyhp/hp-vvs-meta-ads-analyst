type JsonRecord = Record<string, unknown>;

export type MetaInboxDeliveryAttachment = {
  id: string;
  attachment_type: "image" | "video" | "audio" | "file";
  meta_attachment_id: string | null;
  media_url: string | null;
  is_sendable: boolean;
};

export type MetaInboxDeliveryAttempt = {
  id: string;
  conversation_id: string;
  reply_text: string;
  status: "queued" | "sending" | "sent" | "failed_retryable" | "failed_terminal" | "approved" | "canceled";
  messaging_type: "RESPONSE" | "MESSAGE_TAG" | null;
  tag: "HUMAN_AGENT" | null;
  attempt_count: number;
  next_retry_at: string | null;
  attachment_ids?: string[];
  attachments: MetaInboxDeliveryAttachment[];
};

export type MetaInboxDeliveryConversation = {
  id: string;
  source_type: "message_thread" | "public_comment" | "private_reply" | "ad_referral" | "other";
  platform: "facebook" | "instagram";
  page_id: string | null;
  ig_user_id: string | null;
  participant_id: string | null;
  platform_thread_id: string | null;
  source_id: string | null;
};

export type MetaInboxDeliveryTarget = {
  sourceType: "message" | "comment";
  platform: "facebook" | "instagram";
  graphHost: "facebook" | "instagram";
  pageSelector: string;
  sourceId: string;
  participantId: string | null;
  graphPath: string;
  graphBody: JsonRecord;
};

export type MetaInboxDeliverySuccess = {
  metaSendId: string;
  sentAt: string;
};

export type MetaInboxDeliveryFailure = {
  message: string;
  httpStatus: number | null;
  code: number | null;
  subcode: number | null;
  traceId: string | null;
  isTransient: boolean | null;
};

export type MetaInboxDeliveryEventDraft = {
  eventType: "send_attempt";
  previousValue: JsonRecord | null;
  newValue: JsonRecord;
  metadata: JsonRecord;
};

export type MetaInboxDeliveryUpdate = {
  update: JsonRecord;
  event: MetaInboxDeliveryEventDraft;
};

const RETRYABLE_HTTP_STATUSES = new Set([408, 425, 429, 500, 502, 503, 504]);
const RETRYABLE_META_CODES = new Set([1, 2, 4, 17, 32, 613]);
const MAX_DELIVERY_ATTEMPTS = 5;

export function buildMetaInboxDeliveryTarget(
  conversation: MetaInboxDeliveryConversation,
  attempt: MetaInboxDeliveryAttempt,
): MetaInboxDeliveryTarget {
  if (attempt.conversation_id !== conversation.id) {
    throw new Error("Send attempt is not attached to this conversation.");
  }

  const pageSelector =
    conversation.platform === "facebook"
      ? conversation.page_id
      : conversation.page_id || conversation.ig_user_id;
  if (!pageSelector) {
    throw new Error("Conversation is missing a Meta page selector.");
  }

  if (conversation.source_type === "message_thread" || conversation.platform_thread_id) {
    const sourceId = conversation.platform_thread_id || conversation.source_id;
    if (!sourceId) throw new Error("Conversation is missing a message thread id.");
    if (!conversation.participant_id) {
      throw new Error("Conversation is missing a participant id.");
    }

    const graphBody: JsonRecord = {
      recipient: { id: conversation.participant_id },
      message: messagePayloadForAttempt(attempt),
    };
    if (conversation.platform === "facebook") {
      graphBody.messaging_type = attempt.messaging_type || "RESPONSE";
      if (attempt.tag) graphBody.tag = attempt.tag;
    }
    const graphHost = conversation.platform === "instagram" ? "instagram" : "facebook";
    const graphPath = conversation.platform === "instagram"
      ? `${conversation.ig_user_id || ""}/messages`
      : "me/messages";
    if (conversation.platform === "instagram" && !conversation.ig_user_id) {
      throw new Error("Conversation is missing an Instagram user id.");
    }

    return {
      sourceType: "message",
      platform: conversation.platform,
      graphHost,
      pageSelector,
      sourceId,
      participantId: conversation.participant_id,
      graphPath,
      graphBody,
    };
  }

  if (conversation.source_type === "public_comment" || conversation.source_type === "private_reply") {
    const sourceId = conversation.source_id;
    if (!sourceId) throw new Error("Conversation is missing a source comment id.");
    return {
      sourceType: "comment",
      platform: conversation.platform,
      graphHost: "facebook",
      pageSelector,
      sourceId,
      participantId: null,
      graphPath: `${sourceId}/comments`,
      graphBody: {
        message: requireReplyText(attempt.reply_text),
      },
    };
  }

  throw new Error(`Unsupported conversation source type: ${conversation.source_type}.`);
}

function messagePayloadForAttempt(attempt: MetaInboxDeliveryAttempt): JsonRecord {
  const attachment = attempt.attachments.find((item) => item.is_sendable);
  if (!attachment) return { text: requireReplyText(attempt.reply_text) };

  const payload = attachment.meta_attachment_id
    ? { attachment_id: attachment.meta_attachment_id }
    : attachment.media_url
      ? { url: attachment.media_url, is_reusable: true }
      : null;
  if (!payload) {
    throw new Error("Send attempt attachment is missing Meta attachment id or media URL.");
  }

  return {
    attachment: {
      type: attachment.attachment_type,
      payload,
    },
  };
}

function requireReplyText(value: string) {
  const text = String(value || "").trim();
  if (!text) throw new Error("Reply text is required for this delivery target.");
  return text;
}

export function buildMetaInboxDeliverySendingUpdate(
  attempt: MetaInboxDeliveryAttempt,
  context: { now: string },
): MetaInboxDeliveryUpdate {
  const attemptCount = Math.max(1, Math.trunc(Number(attempt.attempt_count) || 0));
  return {
    update: {
      status: "sending",
      attempt_count: attemptCount,
      last_attempted_at: context.now,
      next_retry_at: null,
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
        action: "delivery_started",
        sendAttemptId: attempt.id,
        status: "sending",
        attemptCount,
      },
      metadata: {
        source: "inbox_send_attempt_delivery",
        liveMetaDelivery: true,
      },
    },
  };
}

export function buildMetaInboxDeliverySuccessUpdate(
  attempt: MetaInboxDeliveryAttempt,
  result: MetaInboxDeliverySuccess,
): MetaInboxDeliveryUpdate {
  return {
    update: {
      status: "sent",
      meta_send_id: result.metaSendId,
      meta_error_message: null,
      meta_error_code: null,
      meta_error_subcode: null,
      meta_trace_id: null,
      next_retry_at: null,
      sent_at: result.sentAt,
      updated_at: result.sentAt,
    },
    event: {
      eventType: "send_attempt",
      previousValue: {
        sendAttemptId: attempt.id,
        status: attempt.status,
        attemptCount: attempt.attempt_count,
      },
      newValue: {
        action: "delivered",
        sendAttemptId: attempt.id,
        status: "sent",
        metaSendId: result.metaSendId,
      },
      metadata: {
        source: "inbox_send_attempt_delivery",
        liveMetaDelivery: true,
      },
    },
  };
}

export function buildMetaInboxDeliveryFailureUpdate(
  attempt: MetaInboxDeliveryAttempt,
  failure: MetaInboxDeliveryFailure,
  context: { now: string },
): MetaInboxDeliveryUpdate {
  const retryable = isRetryableMetaInboxDeliveryFailure(failure);
  const attemptCount = Math.max(1, Math.trunc(Number(attempt.attempt_count) || 0));
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
      eventType: "send_attempt",
      previousValue: {
        sendAttemptId: attempt.id,
        status: attempt.status,
        attemptCount: attempt.attempt_count,
      },
      newValue: {
        action: "delivery_failed",
        sendAttemptId: attempt.id,
        status,
        nextRetryAt,
      },
      metadata: {
        source: "inbox_send_attempt_delivery",
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

export function isRetryableMetaInboxDeliveryFailure(failure: MetaInboxDeliveryFailure) {
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
