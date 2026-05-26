import { normalizeMetaInboxAttachments } from "./meta-inbox-attachments.ts";

export type JsonRecord = Record<string, unknown>;

export type WebhookMessageRow = {
  thread: JsonRecord;
  message: JsonRecord;
};

export type WebhookReferralRow = {
  thread: JsonRecord;
  referral: {
    ad_id: string | null;
    ref: string | null;
    source: string | null;
    type: string | null;
    ads_context_data: JsonRecord;
    raw_event: JsonRecord;
  };
};

export function webhookMessageRow(
  object: string | null,
  entry: JsonRecord,
  event: JsonRecord,
): WebhookMessageRow | null {
  const message = recordField(event.message);
  const messageId = stringField(message.mid) || stringField(message.id);
  if (!messageId) return null;

  const sender = recordField(event.sender);
  const recipient = recordField(event.recipient);
  const senderId = stringField(sender.id);
  const recipientId = stringField(recipient.id);
  const senderName = stringField(sender.name) || stringField(sender.username);
  const recipientName = stringField(recipient.name) || stringField(recipient.username);
  const platform = object === "instagram" ? "instagram" : "facebook";
  const pageId = platform === "facebook" ? stringField(entry.id) || recipientId : null;
  const igUserId = platform === "instagram" ? stringField(entry.id) || recipientId : null;
  const businessId = platform === "instagram" ? igUserId : pageId;
  const isEcho = Boolean(message.is_echo);
  const participantId = isEcho ? recipientId : senderId;
  const participantName = isEcho ? recipientName : senderName;
  const threadId = `${platform}:webhook:${businessId || "unknown"}:${participantId || "unknown"}`;
  const sentAt = timestampToIso(event.timestamp) || new Date().toISOString();
  const body = stringField(message.text) || stringField(message.quick_reply);
  const messageReferral = recordField(message.referral);
  const eventReferral = recordField(event.referral);
  const referral = Object.keys(messageReferral).length
    ? messageReferral
    : Object.keys(eventReferral).length
      ? eventReferral
      : null;
  const rawJson = referral ? { ...event, referral } : event;

  return {
    thread: {
      platform,
      thread_id: threadId,
      page_id: pageId,
      ig_user_id: igUserId,
      thread_type: "message",
      participant_id: participantId,
      participant_name: participantName,
      snippet: body,
      message_count: 1,
      unread_count: isEcho ? 0 : 1,
      last_message_at: sentAt,
      raw_json: rawJson,
      last_synced_at: new Date().toISOString(),
    },
    message: {
      platform,
      thread_id: threadId,
      message_id: messageId,
      direction: isEcho ? "outbound" : "inbound",
      sender_id: senderId,
      sender_name: senderName,
      recipient_id: recipientId,
      recipient_name: recipientName,
      body,
      attachments: normalizeMetaInboxAttachments(recordField(message.attachments).data),
      sent_at: sentAt,
      raw_json: event,
    },
  };
}

export function webhookReferralRow(
  object: string | null,
  entry: JsonRecord,
  event: JsonRecord,
): WebhookReferralRow | null {
  const referral = recordField(event.referral);
  if (!Object.keys(referral).length) return null;

  const sender = recordField(event.sender);
  const recipient = recordField(event.recipient);
  const senderId = stringField(sender.id);
  const recipientId = stringField(recipient.id);
  const senderName = stringField(sender.name) || stringField(sender.username);
  const platform = object === "instagram" ? "instagram" : "facebook";
  const pageId = platform === "facebook" ? stringField(entry.id) || recipientId : null;
  const igUserId = platform === "instagram" ? stringField(entry.id) || recipientId : null;
  const businessId = platform === "instagram" ? igUserId : pageId;
  const participantId = senderId;
  const threadId = `${platform}:webhook:${businessId || "unknown"}:${participantId || "unknown"}`;
  const sentAt = timestampToIso(event.timestamp) || new Date().toISOString();

  return {
    thread: {
      platform,
      thread_id: threadId,
      page_id: pageId,
      ig_user_id: igUserId,
      thread_type: "message",
      participant_id: participantId,
      participant_name: senderName,
      snippet: null,
      message_count: 0,
      unread_count: 0,
      last_message_at: sentAt,
      raw_json: { ...event, referral },
      last_synced_at: new Date().toISOString(),
    },
    referral: {
      ad_id: stringField(referral.ad_id),
      ref: stringField(referral.ref),
      source: stringField(referral.source),
      type: stringField(referral.type),
      ads_context_data: recordField(referral.ads_context_data),
      raw_event: event,
    },
  };
}

function recordField(value: unknown): JsonRecord {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as JsonRecord) : {};
}

function stringField(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function timestampToIso(value: unknown): string | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return new Date(value).toISOString();
  }
  if (typeof value === "string" && value.trim()) {
    const numeric = Number(value);
    if (Number.isFinite(numeric)) return new Date(numeric).toISOString();
    const parsed = Date.parse(value);
    if (Number.isFinite(parsed)) return new Date(parsed).toISOString();
  }
  return null;
}
