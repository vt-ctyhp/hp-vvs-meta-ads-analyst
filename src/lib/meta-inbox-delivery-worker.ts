import { createAdsAnalystClient, withAdsAnalystEnvironment } from "./ads-analyst-db";
import { getMetaApiVersion } from "./env";
import { safeErrorMessage } from "./error-message";
import { getManagedPage } from "./social-inbox";
import { isLiveSendEnabled } from "./social-reply-send-flags";
import {
  buildMetaInboxDeliveryFailureUpdate,
  buildMetaInboxDeliverySendingUpdate,
  buildMetaInboxDeliverySuccessUpdate,
  buildMetaInboxDeliveryTarget,
  type MetaInboxDeliveryAttempt,
  type MetaInboxDeliveryConversation,
  type MetaInboxDeliveryFailure,
  type MetaInboxDeliveryTarget,
} from "./meta-inbox-delivery";

type JsonRecord = Record<string, unknown>;

type DynamicQueryResult = {
  data: JsonRecord[] | null;
  error: Error | null;
};

type DynamicSingleResult = {
  data: JsonRecord | null;
  error: Error | null;
};

type DynamicQueryOrder = {
  limit: (count: number) => Promise<DynamicQueryResult>;
};

type DynamicQuery = {
  eq: (column: string, value: string | boolean | number) => DynamicQuery;
  order: (
    column: string,
    options?: { ascending?: boolean; nullsFirst?: boolean },
  ) => DynamicQueryOrder;
  limit: (count: number) => Promise<DynamicQueryResult>;
};

type DynamicTable = {
  insert: (row: JsonRecord) => {
    select: (columns: string) => {
      single: () => Promise<DynamicSingleResult>;
    };
  };
  update: (row: JsonRecord) => {
    eq: (column: string, value: string) => Promise<{ error: Error | null }>;
  };
  select: (columns: string) => DynamicQuery;
};

type DynamicSupabaseClient = {
  from: (table: string) => DynamicTable;
};

export type MetaInboxDeliveryBatchResult = {
  status: "disabled" | "success" | "partial" | "failed";
  live: boolean;
  scanned: number;
  attempted: number;
  delivered: number;
  failedRetryable: number;
  failedTerminal: number;
  errors: string[];
};

export async function deliverQueuedMetaInboxSendAttempts(
  options: { limit?: number; now?: string } = {},
): Promise<MetaInboxDeliveryBatchResult> {
  const limit = positiveLimit(options.limit, 25);
  const now = options.now || new Date().toISOString();
  if (!isLiveSendEnabled()) {
    return {
      status: "disabled",
      live: false,
      scanned: 0,
      attempted: 0,
      delivered: 0,
      failedRetryable: 0,
      failedTerminal: 0,
      errors: [],
    };
  }

  const supabase = createAdsAnalystClient("worker") as unknown as DynamicSupabaseClient;
  const queued = await supabase
    .from("meta_inbox_send_attempts")
    .select("*")
    .eq("status", "queued")
    .order("created_at", { ascending: true, nullsFirst: false })
    .limit(limit);
  if (queued.error) throw queued.error;

  const attempts = rows(queued.data).map(mapDeliveryAttempt);
  const result: MetaInboxDeliveryBatchResult = {
    status: "success",
    live: true,
    scanned: attempts.length,
    attempted: 0,
    delivered: 0,
    failedRetryable: 0,
    failedTerminal: 0,
    errors: [],
  };

  for (const attempt of attempts) {
    result.attempted += 1;
    try {
      const conversation = await loadDeliveryConversation(supabase, attempt.conversation_id);
      const sending = buildMetaInboxDeliverySendingUpdate(attempt, { now: new Date().toISOString() });
      await updateSendAttempt(supabase, attempt.id, sending.update);
      await insertSendAttemptEvent(supabase, conversation.id, sending.event, now);

      const sendingAttempt = {
        ...attempt,
        status: "sending" as const,
        attempt_count: Number(sending.update.attempt_count || attempt.attempt_count),
      };
      const target = buildMetaInboxDeliveryTarget(conversation, sendingAttempt);
      const managed = await getManagedPage(target.pageSelector);
      if (!managed) {
        throw deliveryFailure(
          `Current Meta token does not manage page ${target.pageSelector}.`,
          { httpStatus: 403 },
        );
      }

      const send = await postMetaInboxReply(target, managed.accessToken);
      const sentAt = new Date().toISOString();
      const success = buildMetaInboxDeliverySuccessUpdate(sendingAttempt, {
        metaSendId: send.metaSendId,
        sentAt,
      });
      await updateSendAttempt(supabase, attempt.id, success.update);
      const outboundError = await recordOutboundDeliveryRow(supabase, {
        conversation,
        attempt: sendingAttempt,
        target,
        metaSendId: send.metaSendId,
        sentAt,
        pageId: managed.pageId,
        igUserId: managed.igUserId,
      });
      await insertSendAttemptEvent(supabase, conversation.id, {
        ...success.event,
        metadata: {
          ...success.event.metadata,
          ...(outboundError ? { outboundRecordError: outboundError } : {}),
        },
      }, sentAt);
      result.delivered += 1;
    } catch (error) {
      const failure = normalizeDeliveryFailure(error);
      const failed = buildMetaInboxDeliveryFailureUpdate(attempt, failure, {
        now: new Date().toISOString(),
      });
      await updateSendAttempt(supabase, attempt.id, failed.update).catch(() => undefined);
      await insertSendAttemptEvent(supabase, attempt.conversation_id, failed.event, now).catch(() => undefined);
      if (failed.update.status === "failed_retryable") result.failedRetryable += 1;
      else result.failedTerminal += 1;
      result.errors.push(`${attempt.id}: ${failure.message}`);
    }
  }

  if (result.errors.length) {
    result.status = result.delivered || result.failedRetryable || result.failedTerminal
      ? "partial"
      : "failed";
  }
  return result;
}

async function loadDeliveryConversation(
  supabase: DynamicSupabaseClient,
  conversationId: string,
): Promise<MetaInboxDeliveryConversation> {
  const query = await supabase
    .from("meta_inbox_conversations")
    .select("*")
    .eq("id", conversationId)
    .limit(1);
  if (query.error) throw query.error;
  const row = rows(query.data)[0];
  if (!row) throw deliveryFailure("Conversation not found for send attempt.", { httpStatus: 404 });
  return mapDeliveryConversation(row);
}

async function updateSendAttempt(
  supabase: DynamicSupabaseClient,
  sendAttemptId: string,
  update: JsonRecord,
) {
  const result = await supabase
    .from("meta_inbox_send_attempts")
    .update(update)
    .eq("id", sendAttemptId);
  if (result.error) throw result.error;
}

async function insertSendAttemptEvent(
  supabase: DynamicSupabaseClient,
  conversationId: string,
  event: {
    eventType: "send_attempt";
    previousValue: JsonRecord | null;
    newValue: JsonRecord;
    metadata: JsonRecord;
  },
  now: string,
) {
  const insert = await supabase
    .from("meta_inbox_conversation_events")
    .insert(withAdsAnalystEnvironment({
      conversation_id: conversationId,
      event_type: event.eventType,
      actor_user_id: null,
      event_at: now,
      previous_value: event.previousValue,
      new_value: event.newValue,
      metadata: event.metadata,
    }))
    .select("id")
    .single();
  if (insert.error) throw insert.error;
}

async function postMetaInboxReply(
  target: MetaInboxDeliveryTarget,
  pageToken: string,
): Promise<{ metaSendId: string }> {
  const url = new URL(
    `https://graph.facebook.com/${getMetaApiVersion()}/${target.graphPath.replace(/^\//, "")}`,
  );
  url.searchParams.set("access_token", pageToken);

  const response = await fetch(url.toString(), {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(target.graphBody),
    cache: "no-store",
  });

  let json: unknown;
  try {
    json = await response.json();
  } catch {
    throw deliveryFailure(`Meta returned non-JSON (HTTP ${response.status}).`, {
      httpStatus: response.status,
    });
  }

  if (!response.ok || (isRecord(json) && "error" in json)) {
    const graphError = isRecord(json) ? recordField(json.error) : {};
    const message =
      stringField(graphError.message) ||
      `Meta Graph API request failed for ${target.graphPath} (HTTP ${response.status}).`;
    throw deliveryFailure(message, {
      httpStatus: response.status,
      code: numberField(graphError.code),
      subcode: numberField(graphError.error_subcode) || numberField(graphError.subcode),
      traceId: stringField(graphError.fbtrace_id),
      isTransient: typeof graphError.is_transient === "boolean" ? graphError.is_transient : null,
    });
  }

  const record = recordField(json);
  const metaSendId =
    target.sourceType === "comment"
      ? stringField(record.id)
      : stringField(record.message_id);
  if (!metaSendId) {
    throw deliveryFailure("Meta accepted send but did not return a message id.", {
      httpStatus: response.status,
    });
  }

  return { metaSendId };
}

async function recordOutboundDeliveryRow(
  supabase: DynamicSupabaseClient,
  args: {
    conversation: MetaInboxDeliveryConversation;
    attempt: MetaInboxDeliveryAttempt;
    target: MetaInboxDeliveryTarget;
    metaSendId: string;
    sentAt: string;
    pageId: string;
    igUserId: string | null;
  },
) {
  try {
    if (args.target.sourceType === "message") {
      const insert = await supabase
        .from("meta_social_messages")
        .insert(withAdsAnalystEnvironment({
          platform: args.conversation.platform,
          thread_id: args.target.sourceId,
          message_id: args.metaSendId,
          direction: "outbound",
          sender_id: args.pageId,
          sender_name: null,
          recipient_id: args.target.participantId,
          recipient_name: null,
          body: args.attempt.reply_text,
          attachments: [],
          sent_at: args.sentAt,
          raw_json: {
            source: "meta_inbox_send_attempt",
            send_attempt_id: args.attempt.id,
          },
        }))
        .select("id")
        .single();
      if (insert.error) throw insert.error;
      return null;
    }

    const insert = await supabase
      .from("meta_social_comments")
      .insert(withAdsAnalystEnvironment({
        platform: args.conversation.platform,
        comment_id: args.metaSendId,
        parent_comment_id: args.target.sourceId,
        page_id: args.pageId,
        ig_user_id: args.conversation.platform === "instagram" ? args.igUserId : null,
        content_id: null,
        content_permalink: null,
        author_id: args.pageId,
        author_name: null,
        body: args.attempt.reply_text,
        like_count: 0,
        reply_count: 0,
        hidden: false,
        created_time: args.sentAt,
        raw_json: {
          source: "meta_inbox_send_attempt",
          send_attempt_id: args.attempt.id,
        },
        last_synced_at: args.sentAt,
      }))
      .select("id")
      .single();
    if (insert.error) throw insert.error;
    return null;
  } catch (error) {
    return safeErrorMessage(error).slice(0, 1000);
  }
}

function mapDeliveryAttempt(row: JsonRecord): MetaInboxDeliveryAttempt {
  return {
    id: String(row.id),
    conversation_id: String(row.conversation_id || ""),
    reply_text: String(row.reply_text || ""),
    status: deliveryAttemptStatus(row.status),
    messaging_type:
      row.messaging_type === "MESSAGE_TAG" || row.messaging_type === "RESPONSE"
        ? row.messaging_type
        : null,
    tag: row.tag === "HUMAN_AGENT" ? "HUMAN_AGENT" : null,
    attempt_count: numberField(row.attempt_count) || 0,
  };
}

function mapDeliveryConversation(row: JsonRecord): MetaInboxDeliveryConversation {
  return {
    id: String(row.id),
    source_type:
      row.source_type === "public_comment" ||
      row.source_type === "private_reply" ||
      row.source_type === "ad_referral" ||
      row.source_type === "other"
        ? row.source_type
        : "message_thread",
    platform: row.platform === "instagram" ? "instagram" : "facebook",
    page_id: stringField(row.page_id),
    ig_user_id: stringField(row.ig_user_id),
    participant_id: stringField(row.participant_id),
    platform_thread_id: stringField(row.platform_thread_id),
    source_id: stringField(row.source_id),
  };
}

function normalizeDeliveryFailure(error: unknown): MetaInboxDeliveryFailure {
  if (error instanceof MetaInboxDeliveryGraphError) return error.details;
  return {
    message: safeErrorMessage(error),
    httpStatus: null,
    code: null,
    subcode: null,
    traceId: null,
    isTransient: null,
  };
}

function deliveryFailure(message: string, details: Partial<MetaInboxDeliveryFailure>) {
  return new MetaInboxDeliveryGraphError({
    message,
    httpStatus: details.httpStatus ?? null,
    code: details.code ?? null,
    subcode: details.subcode ?? null,
    traceId: details.traceId ?? null,
    isTransient: details.isTransient ?? null,
  });
}

class MetaInboxDeliveryGraphError extends Error {
  details: MetaInboxDeliveryFailure;

  constructor(details: MetaInboxDeliveryFailure) {
    super(details.message);
    this.name = "MetaInboxDeliveryGraphError";
    this.details = details;
  }
}

function deliveryAttemptStatus(value: unknown): MetaInboxDeliveryAttempt["status"] {
  switch (value) {
    case "approved":
    case "queued":
    case "sending":
    case "sent":
    case "failed_retryable":
    case "failed_terminal":
    case "canceled":
      return value;
    default:
      return "queued";
  }
}

function rows(data: JsonRecord[] | null) {
  return Array.isArray(data) ? data : [];
}

function recordField(value: unknown): JsonRecord {
  return isRecord(value) ? value : {};
}

function stringField(value: unknown): string | null {
  if (typeof value === "string" && value.length) return value;
  if (typeof value === "number") return String(value);
  return null;
}

function numberField(value: unknown): number | null {
  if (typeof value === "number") return value;
  if (typeof value === "string" && value.length) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function positiveLimit(value: number | null | undefined, fallback: number) {
  return Number.isFinite(value) && Number(value) > 0 ? Math.floor(Number(value)) : fallback;
}

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
