import { safeErrorMessage } from "./error-message";
import { getMetaApiVersion } from "./env";
import { getManagedPage } from "./social-inbox";
import {
  createAdsAnalystClient,
  withAdsAnalystEnvironment,
} from "./ads-analyst-db";
import {
  isLiveSendEnabled,
  SendReplyError,
} from "./social-reply-send-flags";
import type { BrandLabel } from "./social-brand";

/**
 * Phase 11 — real Meta Page send for human-approved replies.
 *
 * The /api/social-inbox/send-reply route only ever runs this when:
 *   1. The caller carries the `send_inbox_reply` permission.
 *   2. The reply composer's two-click confirmation has been satisfied.
 *   3. ALLOW_LIVE_META_SEND === "true" — otherwise the route stays in
 *      dry-run mode and only writes the audit row to ai_reply_suggestions.
 *
 * This module owns the actual Graph POST, the outbound message/comment
 * row, and the audit row's status transition from `approved` to `sent`.
 *
 * Nothing here is exposed to the client. Anything thrown from this module
 * is caught by the route handler and surfaced via `safeErrorMessage`, so
 * we never leak [object Object] or Meta's verbose JSON back to the UI.
 */

type Platform = "facebook" | "instagram";
type SourceType = "message" | "comment";

export type SendSocialReplyInput = {
  platform: Platform;
  sourceType: SourceType;
  sourceId: string;
  brand: BrandLabel;
  text: string;
  suggestionId: string;
  approverUserId: string | null;
  approverEmail: string | null;
};

export type SendSocialReplyResult = {
  ok: true;
  metaSendId: string;
  sentAt: string;
};

type ThreadRow = {
  id: string;
  page_id: string | null;
  ig_user_id: string | null;
  participant_id: string | null;
};

type CommentRow = {
  page_id: string | null;
  ig_user_id: string | null;
};

type DynamicSelectChain = {
  select: (cols: string) => {
    eq: (col: string, value: string) => {
      maybeSingle: () => Promise<{ data: unknown; error: Error | null }>;
    };
  };
  insert: (
    row: Record<string, unknown>,
  ) => {
    select: (cols: string) => {
      single: () => Promise<{ data: unknown; error: Error | null }>;
    };
  };
  update: (
    row: Record<string, unknown>,
  ) => {
    eq: (col: string, value: string) => Promise<{ error: Error | null }>;
  };
};

type DynamicSupabase = {
  from: (table: string) => DynamicSelectChain;
};

/**
 * Execute the live send. Caller MUST have already inserted an `approved`
 * audit row into ai_reply_suggestions and pass its id as `suggestionId`.
 * On success, this updates that row to `status='sent'` with `meta_send_id`
 * + `sent_at`. On Meta failure, sets `send_error` on the row and throws.
 */
export async function sendSocialReply(
  input: SendSocialReplyInput,
): Promise<SendSocialReplyResult> {
  const text = input.text.trim();
  if (!text) {
    throw new SendReplyError("Reply text is required.", 400);
  }
  if (text.length > 8000) {
    throw new SendReplyError(
      "Reply text is too long (max 8000 characters).",
      400,
    );
  }

  const supabase = createAdsAnalystClient("worker") as unknown as DynamicSupabase;

  // 1. Look up the source row to recover the page/ig signal + participant id.
  const source = await loadSource(supabase, {
    platform: input.platform,
    sourceType: input.sourceType,
    sourceId: input.sourceId,
  });

  // 2. Resolve a Page Access Token for the page that owns this conversation.
  //    For Instagram, the same Page Access Token is used because IG messaging/
  //    commenting flows through the connected FB Page.
  const pageSelector =
    input.platform === "facebook"
      ? source.pageId
      : (source.pageId ?? source.igUserId);
  if (!pageSelector) {
    throw new SendReplyError(
      `Cannot resolve Meta page for ${input.platform} ${input.sourceType}. ` +
        "The synced row is missing a page_id — re-run an inbox sync and retry.",
      409,
    );
  }
  const managed = await getManagedPage(pageSelector);
  if (!managed) {
    throw new SendReplyError(
      `The current Meta token does not manage page ${pageSelector}. ` +
        "Re-issue META_ACCESS_TOKEN from an account that has access to this Page.",
      403,
    );
  }

  // 3. Perform the actual Graph POST. We do NOT update the audit row until
  //    Meta confirms the send so a transient failure leaves the row at
  //    status='approved' (the caller can decide whether to retry).
  let metaSendId: string;
  try {
    metaSendId = await postToMeta({
      platform: input.platform,
      sourceType: input.sourceType,
      sourceId: input.sourceId,
      text,
      pageToken: managed.accessToken,
      participantId: source.participantId,
    });
  } catch (error) {
    // Best-effort: record the error on the audit row so Operate room can
    // surface it. Swallow secondary failures.
    await supabase
      .from("ai_reply_suggestions")
      .update({
        send_error: safeErrorMessage(error).slice(0, 1000),
      })
      .eq("id", input.suggestionId)
      .catch(() => undefined);
    // Preserve original SendReplyError instances (including their status
    // code) — only wrap unknown errors. This way a Meta 4xx surfaces as
    // 4xx instead of being collapsed to 502.
    if (error instanceof SendReplyError) {
      throw error;
    }
    throw new SendReplyError(safeErrorMessage(error), 502);
  }

  const sentAt = new Date().toISOString();

  // 4. Update audit row + insert outbound row in parallel. Each step has its
  //    own catch so a partial failure produces a useful, actionable error.
  await Promise.all([
    updateAuditRow(supabase, {
      suggestionId: input.suggestionId,
      metaSendId,
      sentAt,
    }),
    recordOutboundRow(supabase, {
      platform: input.platform,
      sourceType: input.sourceType,
      sourceId: input.sourceId,
      text,
      metaSendId,
      sentAt,
      threadRefId: source.threadRefId,
      participantId: source.participantId,
      pageId: managed.pageId,
      igUserId: managed.igUserId,
      suggestionId: input.suggestionId,
      approverEmail: input.approverEmail,
    }),
  ]);

  return { ok: true, metaSendId, sentAt };
}

async function loadSource(
  supabase: DynamicSupabase,
  args: { platform: Platform; sourceType: SourceType; sourceId: string },
): Promise<{
  pageId: string | null;
  igUserId: string | null;
  participantId: string | null;
  threadRefId: string | null;
}> {
  if (args.sourceType === "message") {
    const { data, error } = await supabase
      .from("meta_social_threads")
      .select("id, page_id, ig_user_id, participant_id")
      .eq("thread_id", args.sourceId)
      .maybeSingle();
    if (error) throw new SendReplyError(`Failed to load thread: ${safeErrorMessage(error)}`);
    if (!data) throw new SendReplyError(`Thread ${args.sourceId} not found.`, 404);
    const row = data as ThreadRow;
    return {
      pageId: row.page_id,
      igUserId: row.ig_user_id,
      participantId: row.participant_id,
      threadRefId: row.id,
    };
  }

  const { data, error } = await supabase
    .from("meta_social_comments")
    .select("page_id, ig_user_id")
    .eq("comment_id", args.sourceId)
    .maybeSingle();
  if (error) throw new SendReplyError(`Failed to load comment: ${safeErrorMessage(error)}`);
  if (!data) throw new SendReplyError(`Comment ${args.sourceId} not found.`, 404);
  const row = data as CommentRow;
  return {
    pageId: row.page_id,
    igUserId: row.ig_user_id,
    participantId: null,
    threadRefId: null,
  };
}

type PostInput = {
  platform: Platform;
  sourceType: SourceType;
  sourceId: string;
  text: string;
  pageToken: string;
  participantId: string | null;
};

async function postToMeta(input: PostInput): Promise<string> {
  if (input.sourceType === "comment") {
    // Both FB and IG comment-reply endpoint is `{comment_id}/comments` (the
    // legacy `/replies` edge still works for IG but Meta has consolidated
    // on `/comments`). Body field is `message`.
    const json = await graphPost(`${input.sourceId}/comments`, input.pageToken, {
      message: input.text,
    });
    const id = (json as { id?: unknown }).id;
    if (typeof id !== "string" || !id) {
      throw new SendReplyError("Meta accepted the comment but did not return an id.");
    }
    return id;
  }

  // DM path. `me/messages` is the canonical send endpoint when authenticated
  // with a Page Access Token (`/me` resolves to that page). For FB we pass
  // `messaging_type: "RESPONSE"`; IG does not require it.
  if (!input.participantId) {
    throw new SendReplyError(
      "Thread is missing a participant id. Re-sync the inbox and retry.",
      409,
    );
  }
  const body: Record<string, unknown> = {
    recipient: { id: input.participantId },
    message: { text: input.text },
  };
  if (input.platform === "facebook") {
    body.messaging_type = "RESPONSE";
  }
  const json = await graphPost("me/messages", input.pageToken, body);
  const messageId = (json as { message_id?: unknown }).message_id;
  if (typeof messageId !== "string" || !messageId) {
    throw new SendReplyError("Meta accepted the message but did not return a message_id.");
  }
  return messageId;
}

async function graphPost(
  path: string,
  pageToken: string,
  body: Record<string, unknown>,
): Promise<unknown> {
  const url = new URL(
    `https://graph.facebook.com/${getMetaApiVersion()}/${path.replace(/^\//, "")}`,
  );
  url.searchParams.set("access_token", pageToken);

  const response = await fetch(url.toString(), {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
    cache: "no-store",
  });

  let json: unknown;
  try {
    json = await response.json();
  } catch {
    throw new SendReplyError(
      `Meta Graph API returned non-JSON (HTTP ${response.status}).`,
    );
  }

  if (!response.ok || (isRecord(json) && "error" in json)) {
    const err = isRecord(json) ? (json.error as Record<string, unknown> | undefined) : undefined;
    const message =
      (err && typeof err.message === "string" && err.message) ||
      `Meta Graph API request failed for ${path} (HTTP ${response.status}).`;
    throw new SendReplyError(message);
  }
  return json;
}

async function updateAuditRow(
  supabase: DynamicSupabase,
  args: { suggestionId: string; metaSendId: string; sentAt: string },
): Promise<void> {
  const { error } = await supabase
    .from("ai_reply_suggestions")
    .update({
      status: "sent",
      meta_send_id: args.metaSendId,
      sent_at: args.sentAt,
      send_error: null,
    })
    .eq("id", args.suggestionId);
  if (error) {
    throw new SendReplyError(
      `Meta send succeeded but audit row update failed: ${safeErrorMessage(error)}`,
    );
  }
}

async function recordOutboundRow(
  supabase: DynamicSupabase,
  args: {
    platform: Platform;
    sourceType: SourceType;
    sourceId: string;
    text: string;
    metaSendId: string;
    sentAt: string;
    threadRefId: string | null;
    participantId: string | null;
    pageId: string;
    igUserId: string | null;
    suggestionId: string;
    approverEmail: string | null;
  },
): Promise<void> {
  if (args.sourceType === "message") {
    const { error } = await supabase
      .from("meta_social_messages")
      .insert(
        withAdsAnalystEnvironment({
          thread_ref_id: args.threadRefId,
          platform: args.platform,
          thread_id: args.sourceId,
          message_id: args.metaSendId,
          direction: "outbound",
          sender_id: args.pageId,
          sender_name: args.approverEmail,
          recipient_id: args.participantId,
          recipient_name: null,
          body: args.text,
          attachments: [],
          sent_at: args.sentAt,
          raw_json: {
            source: "send-reply",
            suggestion_id: args.suggestionId,
            approved_by: args.approverEmail,
          },
        }),
      )
      .select("id")
      .single();
    if (error) {
      throw new SendReplyError(
        `Meta send succeeded but outbound message row insert failed: ${safeErrorMessage(error)}`,
      );
    }
    return;
  }

  // Comment reply — record as a new outbound comment row.
  const { error } = await supabase
    .from("meta_social_comments")
    .insert(
      withAdsAnalystEnvironment({
        platform: args.platform,
        comment_id: args.metaSendId,
        parent_comment_id: args.sourceId,
        page_id: args.pageId,
        ig_user_id: args.platform === "instagram" ? args.igUserId : null,
        content_id: null,
        content_permalink: null,
        author_id: args.pageId,
        author_name: args.approverEmail,
        body: args.text,
        like_count: 0,
        reply_count: 0,
        hidden: false,
        created_time: args.sentAt,
        raw_json: {
          source: "send-reply",
          suggestion_id: args.suggestionId,
          approved_by: args.approverEmail,
        },
        last_synced_at: args.sentAt,
      }),
    )
    .select("id")
    .single();
  if (error) {
    throw new SendReplyError(
      `Meta send succeeded but outbound comment row insert failed: ${safeErrorMessage(error)}`,
    );
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

// Re-export safety primitives so route handlers can pull everything from a
// single module entry point. The actual definitions live in
// social-reply-send-flags.ts so they can be unit-tested without dragging
// in the rest of the Next.js alias graph.
export { isLiveSendEnabled, SendReplyError };
