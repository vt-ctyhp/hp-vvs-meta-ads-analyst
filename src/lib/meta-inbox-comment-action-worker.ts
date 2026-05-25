import { createAdsAnalystClient } from "./ads-analyst-db.ts";
import { getMetaApiVersion } from "./env.ts";
import { safeErrorMessage } from "./error-message.ts";
import {
  scopeActiveMetaInboxEnvironment,
  withActiveMetaInboxEnvironment,
} from "./meta-inbox-environment.ts";
import {
  buildMetaInboxCommentActionDeliveryTarget,
  buildMetaInboxCommentActionFailureUpdate,
  buildMetaInboxCommentActionSendingUpdate,
  buildMetaInboxCommentActionSuccessUpdate,
  type MetaInboxCommentActionConversationInput,
  type MetaInboxCommentActionDeliveryFailure,
  type MetaInboxCommentActionDeliveryTarget,
  type MetaInboxCommentActionRecord,
} from "./meta-inbox-comment-actions.ts";
import { isLiveSendEnabled } from "./social-reply-send-flags.ts";

type JsonRecord = Record<string, unknown>;

type DynamicQueryResult = {
  data: JsonRecord[] | null;
  error: Error | null;
};

type DynamicSingleResult = {
  data: JsonRecord | null;
  error: Error | null;
};

type DynamicMaybeSingleResult = {
  data: JsonRecord | null;
  error: Error | null;
};

type DynamicQueryOrder = {
  limit: (count: number) => Promise<DynamicQueryResult>;
};

type DynamicQuery = {
  eq: (column: string, value: string | boolean | number) => DynamicQuery;
  in: (column: string, values: string[]) => DynamicQuery;
  order: (
    column: string,
    options?: { ascending?: boolean; nullsFirst?: boolean },
  ) => DynamicQueryOrder;
  limit: (count: number) => Promise<DynamicQueryResult>;
};

type DynamicUpdateQuery = {
  eq: (column: string, value: string | boolean | number) => DynamicUpdateQuery;
  select: (columns: string) => {
    maybeSingle: () => Promise<DynamicMaybeSingleResult>;
    single: () => Promise<DynamicSingleResult>;
  };
};

type DynamicTable = {
  insert: (row: JsonRecord) => {
    select: (columns: string) => {
      single: () => Promise<DynamicSingleResult>;
    };
  };
  update: (row: JsonRecord) => DynamicUpdateQuery;
  select: (columns: string) => DynamicQuery;
};

type DynamicSupabaseClient = {
  from: (table: string) => DynamicTable;
};

type MetaInboxCommentActionConversation = MetaInboxCommentActionConversationInput & {
  page_id: string | null;
  ig_user_id: string | null;
};

type MetaInboxManagedPageResolver = (pageSelector: string) => Promise<{
  pageId: string;
  accessToken: string;
  igUserId: string | null;
} | null>;

export type MetaInboxCommentActionBatchResult = {
  status: "disabled" | "success" | "partial" | "failed";
  live: boolean;
  scanned: number;
  attempted: number;
  succeeded: number;
  failedRetryable: number;
  failedTerminal: number;
  errors: string[];
};

export async function deliverQueuedMetaInboxCommentActions(
  options: {
    limit?: number;
    now?: string;
    supabase?: DynamicSupabaseClient;
    managedPageResolver?: MetaInboxManagedPageResolver;
  } = {},
): Promise<MetaInboxCommentActionBatchResult> {
  const limit = positiveLimit(options.limit, 25);
  const now = options.now || new Date().toISOString();
  if (!isLiveSendEnabled()) {
    return {
      status: "disabled",
      live: false,
      scanned: 0,
      attempted: 0,
      succeeded: 0,
      failedRetryable: 0,
      failedTerminal: 0,
      errors: [],
    };
  }

  const supabase =
    options.supabase || (createAdsAnalystClient("worker") as unknown as DynamicSupabaseClient);
  const managedPageResolver = options.managedPageResolver || defaultManagedPageResolver;
  const queued = await selectActiveMetaInboxRows(supabase, "meta_inbox_comment_actions")
    .in("status", ["queued", "failed_retryable"])
    .order("created_at", { ascending: true, nullsFirst: false })
    .limit(limit * 4);
  if (queued.error) throw queued.error;

  const actions = rows(queued.data)
    .map(mapCommentActionRecord)
    .filter((action) => isCommentActionDueForDelivery(action, now))
    .slice(0, limit);
  const result: MetaInboxCommentActionBatchResult = {
    status: "success",
    live: true,
    scanned: actions.length,
    attempted: 0,
    succeeded: 0,
    failedRetryable: 0,
    failedTerminal: 0,
    errors: [],
  };

  for (const action of actions) {
    let activeAction = action;
    try {
      const conversation = await loadCommentActionConversation(supabase, action.conversation_id);
      const claimed = await claimCommentActionForDelivery(supabase, action, {
        now: new Date().toISOString(),
      });
      if (!claimed) continue;
      result.attempted += 1;
      activeAction = mapCommentActionRecord(claimed.row);
      await insertCommentActionEvent(supabase, conversation.id, claimed.event, now);

      const target = buildMetaInboxCommentActionDeliveryTarget(conversation, activeAction);
      const managed = await managedPageResolver(target.pageSelector);
      if (!managed) {
        throw commentActionFailure(
          `Current Meta token does not manage page ${target.pageSelector}.`,
          { httpStatus: 403 },
        );
      }

      const delivered = await sendMetaInboxCommentAction(target, managed.accessToken);
      const completedAt = new Date().toISOString();
      const success = buildMetaInboxCommentActionSuccessUpdate(activeAction, {
        metaActionId: delivered.metaActionId,
        metaResponse: delivered.metaResponse,
        completedAt,
      });
      try {
        await updateCommentAction(supabase, action.id, success.update);
        await insertCommentActionEvent(supabase, conversation.id, success.event, completedAt);
      } catch (error) {
        result.errors.push(
          `${action.id}: Meta accepted comment action but local persistence failed: ${safeErrorMessage(error)}`,
        );
      }
      result.succeeded += 1;
    } catch (error) {
      const failure = normalizeCommentActionFailure(error);
      const failed = buildMetaInboxCommentActionFailureUpdate(activeAction, failure, {
        now: new Date().toISOString(),
      });
      await updateCommentAction(supabase, action.id, failed.update);
      await insertCommentActionEvent(supabase, action.conversation_id, failed.event, now);
      if (failed.update.status === "failed_retryable") result.failedRetryable += 1;
      else result.failedTerminal += 1;
      result.errors.push(`${action.id}: ${failure.message}`);
    }
  }

  if (result.errors.length) {
    result.status = result.succeeded || result.failedRetryable || result.failedTerminal
      ? "partial"
      : "failed";
  }
  return result;
}

async function defaultManagedPageResolver(pageSelector: string) {
  const { getManagedPage } = await import("./social-inbox.ts");
  return getManagedPage(pageSelector);
}

function selectActiveMetaInboxRows(
  supabase: DynamicSupabaseClient,
  table: string,
  columns = "*",
) {
  return scopeActiveMetaInboxEnvironment(supabase.from(table).select(columns));
}

async function loadCommentActionConversation(
  supabase: DynamicSupabaseClient,
  conversationId: string,
): Promise<MetaInboxCommentActionConversation> {
  const query = await selectActiveMetaInboxRows(supabase, "meta_inbox_conversations")
    .eq("id", conversationId)
    .limit(1);
  if (query.error) throw query.error;
  const row = rows(query.data)[0];
  if (!row) {
    throw commentActionFailure("Conversation not found for comment action.", { httpStatus: 404 });
  }
  return mapCommentActionConversation(row);
}

async function claimCommentActionForDelivery(
  supabase: DynamicSupabaseClient,
  action: MetaInboxCommentActionRecord,
  context: { now: string },
) {
  const sending = buildMetaInboxCommentActionSendingUpdate(action, context);
  const result = await scopeActiveMetaInboxEnvironment(
    supabase.from("meta_inbox_comment_actions").update(sending.update),
  )
    .eq("id", action.id)
    .eq("status", action.status)
    .select("*")
    .maybeSingle();
  if (result.error) throw result.error;
  if (!result.data) return null;
  return {
    row: result.data,
    event: sending.event,
  };
}

async function updateCommentAction(
  supabase: DynamicSupabaseClient,
  commentActionId: string,
  update: JsonRecord,
) {
  const result = await scopeActiveMetaInboxEnvironment(
    supabase.from("meta_inbox_comment_actions").update(update),
  )
    .eq("id", commentActionId)
    .select("id")
    .single();
  if (result.error) throw result.error;
}

async function insertCommentActionEvent(
  supabase: DynamicSupabaseClient,
  conversationId: string,
  event: {
    eventType: "comment_action";
    previousValue: JsonRecord | null;
    newValue: JsonRecord;
    metadata: JsonRecord;
  },
  now: string,
) {
  const insert = await supabase
    .from("meta_inbox_conversation_events")
    .insert(withActiveMetaInboxEnvironment({
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

async function sendMetaInboxCommentAction(
  target: MetaInboxCommentActionDeliveryTarget,
  pageToken: string,
): Promise<{ metaActionId: string | null; metaResponse: JsonRecord }> {
  const url = new URL(
    `https://graph.facebook.com/${getMetaApiVersion()}/${target.graphPath.replace(/^\//, "")}`,
  );

  const hasBody = target.graphMethod !== "DELETE" && Object.keys(target.graphBody).length > 0;
  const response = await fetchMetaGraph(url.toString(), {
    method: target.graphMethod,
    headers: {
      ...(hasBody ? { "content-type": "application/json" } : {}),
      "Authorization": `Bearer ${pageToken}`,
    },
    body: hasBody ? JSON.stringify(target.graphBody) : undefined,
    cache: "no-store",
  });

  let json: unknown = {};
  const bodyText = await response.text();
  if (bodyText.trim()) {
    try {
      json = JSON.parse(bodyText);
    } catch {
      throw commentActionFailure(`Meta returned non-JSON (HTTP ${response.status}).`, {
        httpStatus: response.status,
      });
    }
  } else if (!response.ok) {
    throw commentActionFailure(`Meta returned an empty error response (HTTP ${response.status}).`, {
      httpStatus: response.status,
    });
  }

  if (!response.ok || (isRecord(json) && "error" in json)) {
    const graphError = isRecord(json) ? recordField(json.error) : {};
    const message =
      stringField(graphError.message) ||
      `Meta Graph API request failed for ${target.graphPath} (HTTP ${response.status}).`;
    throw commentActionFailure(message, {
      httpStatus: response.status,
      code: numberField(graphError.code),
      subcode: numberField(graphError.error_subcode) || numberField(graphError.subcode),
      traceId: stringField(graphError.fbtrace_id),
      isTransient: typeof graphError.is_transient === "boolean" ? graphError.is_transient : null,
    });
  }

  const record = recordField(json);
  return {
    metaActionId:
      stringField(record.id) ||
      stringField(record.message_id) ||
      stringField(record.comment_id) ||
      target.expectedResultId ||
      null,
    metaResponse: record,
  };
}

async function fetchMetaGraph(url: string, init: RequestInit) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 20_000);

  try {
    return await fetch(url, {
      ...init,
      signal: controller.signal,
    });
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw commentActionFailure("Meta Graph API request timed out.", {
        httpStatus: 408,
        isTransient: true,
      });
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

function mapCommentActionRecord(row: JsonRecord): MetaInboxCommentActionRecord {
  return {
    id: String(row.id),
    conversation_id: String(row.conversation_id || ""),
    comment_id: String(row.comment_id || ""),
    action_type: commentActionType(row.action_type),
    message_text: stringField(row.message_text),
    reason_note: stringField(row.reason_note),
    status: commentActionStatus(row.status),
    attempt_count: numberField(row.attempt_count) || 0,
    next_retry_at: stringField(row.next_retry_at),
    meta_error_message: stringField(row.meta_error_message),
  };
}

function isCommentActionDueForDelivery(action: MetaInboxCommentActionRecord, now: string) {
  if (action.status === "queued") return true;
  if (action.status !== "failed_retryable") return false;
  if (!action.next_retry_at) return true;

  const retryAt = Date.parse(action.next_retry_at);
  const base = Date.parse(now);
  if (!Number.isFinite(retryAt) || !Number.isFinite(base)) return false;
  return retryAt <= base;
}

function mapCommentActionConversation(row: JsonRecord): MetaInboxCommentActionConversation {
  return {
    id: String(row.id),
    source_type:
      row.source_type === "public_comment" ||
      row.source_type === "private_reply" ||
      row.source_type === "ad_referral" ||
      row.source_type === "other"
        ? row.source_type
        : "message_thread",
    source_id: stringField(row.source_id),
    platform: row.platform === "instagram" ? "instagram" : "facebook",
    page_id: stringField(row.page_id),
    ig_user_id: stringField(row.ig_user_id),
  };
}

function normalizeCommentActionFailure(error: unknown): MetaInboxCommentActionDeliveryFailure {
  if (error instanceof MetaInboxCommentActionGraphError) return error.details;
  return {
    message: safeErrorMessage(error),
    httpStatus: null,
    code: null,
    subcode: null,
    traceId: null,
    isTransient: null,
  };
}

function commentActionFailure(
  message: string,
  details: Partial<MetaInboxCommentActionDeliveryFailure>,
) {
  return new MetaInboxCommentActionGraphError({
    message,
    httpStatus: details.httpStatus ?? null,
    code: details.code ?? null,
    subcode: details.subcode ?? null,
    traceId: details.traceId ?? null,
    isTransient: details.isTransient ?? null,
  });
}

class MetaInboxCommentActionGraphError extends Error {
  details: MetaInboxCommentActionDeliveryFailure;

  constructor(details: MetaInboxCommentActionDeliveryFailure) {
    super(details.message);
    this.name = "MetaInboxCommentActionGraphError";
    this.details = details;
  }
}

function commentActionType(value: unknown): MetaInboxCommentActionRecord["action_type"] {
  switch (value) {
    case "private_reply":
    case "like":
    case "hide":
    case "delete":
      return value;
    case "public_reply":
    default:
      return "public_reply";
  }
}

function commentActionStatus(value: unknown): MetaInboxCommentActionRecord["status"] {
  switch (value) {
    case "approved":
    case "queued":
    case "sending":
    case "succeeded":
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
