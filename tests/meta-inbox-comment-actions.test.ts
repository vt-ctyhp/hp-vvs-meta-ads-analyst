import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";

import {
  buildMetaInboxCommentActionDraft,
  buildMetaInboxCommentActionDeliveryTarget,
  buildMetaInboxCommentActionFailureUpdate,
  buildMetaInboxCommentActionSendingUpdate,
  buildMetaInboxCommentActionSuccessUpdate,
  buildMetaInboxQueueCommentActionUpdate,
  buildMetaInboxRetryCommentActionUpdate,
  isMetaInboxCommentModerationAction,
  type MetaInboxCommentActionConversationInput,
  type MetaInboxCommentActionRecord,
} from "../src/lib/meta-inbox-comment-actions.ts";

const REPO_ROOT = fileURLToPath(new URL("..", import.meta.url));
const MIGRATION = join(
  REPO_ROOT,
  "supabase/migrations/20260524120000_meta_inbox_comment_actions.sql",
);
const migration = readFileSync(MIGRATION, "utf8");
const route = readFileSync(
  "src/app/api/social-inbox/conversations/[conversationId]/comment-actions/route.ts",
  "utf8",
);
const queueRoute = readFileSync(
  "src/app/api/social-inbox/conversations/[conversationId]/comment-actions/queue/route.ts",
  "utf8",
);
const retryRoute = readFileSync(
  "src/app/api/social-inbox/conversations/[conversationId]/comment-actions/retry/route.ts",
  "utf8",
);
const NOW = "2026-05-24T12:00:00.000Z";
const ACTOR_ID = "11111111-1111-4111-8111-111111111111";

describe("Meta inbox public comment action foundation", () => {
  it("creates comment action storage with reason notes, Meta errors, and audit marker", () => {
    assert.match(migration, /create table if not exists public\.meta_inbox_comment_actions/);
    for (const column of [
      "conversation_id",
      "comment_id",
      "action_type",
      "message_text",
      "reason_note",
      "requested_by",
      "status",
      "meta_action_id",
      "meta_response",
      "meta_error_message",
      "meta_error_code",
      "meta_error_subcode",
      "meta_trace_id",
      "idempotency_key",
    ]) {
      assert.match(migration, new RegExp(column));
    }
    for (const action of ["public_reply", "private_reply", "like", "hide", "delete"]) {
      assert.match(migration, new RegExp(`'${action}'`));
    }
    assert.match(migration, /meta_inbox_comment_actions_idempotency_idx/);
    assert.match(migration, /meta_inbox_comment_actions_failed_retry_idx/);
    assert.match(migration, /meta_inbox_comment_actions_delivery_queue_idx/);
    assert.match(migration, /event_type = 'comment_action'/);
    assert.match(migration, /length\(btrim\(reason_note\)\) > 0/);
  });

  it("builds public and private reply action drafts without live Meta delivery", () => {
    const draft = buildMetaInboxCommentActionDraft(
      conversationFixture(),
      {
        actionType: "public_reply",
        messageText: "Thanks, please DM us your budget.",
        idempotencyKey: "comment-action-1",
      },
      { actorUserId: ACTOR_ID, now: NOW },
    );

    assert.equal(draft.row.status, "approved");
    assert.equal(draft.row.comment_id, "comment-1");
    assert.equal(draft.row.action_type, "public_reply");
    assert.equal(draft.row.message_text, "Thanks, please DM us your budget.");
    assert.equal(draft.row.reason_note, null);
    assert.equal(draft.row.idempotency_key, "comment-action-1");
    assert.equal(draft.event.eventType, "comment_action");
    assert.equal(draft.event.metadata.liveMetaDelivery, false);

    const privateReply = buildMetaInboxCommentActionDraft(
      conversationFixture(),
      { actionType: "private_reply", messageText: "We sent you details." },
      { actorUserId: ACTOR_ID, now: NOW },
    );
    assert.equal(privateReply.row.action_type, "private_reply");
    assert.equal(privateReply.event.newValue.hasMessage, true);
  });

  it("uses a stable comment-action idempotency fallback for duplicate submits", () => {
    const first = buildMetaInboxCommentActionDraft(
      conversationFixture(),
      { actionType: "hide", reasonNote: "Spam link." },
      { actorUserId: ACTOR_ID, now: NOW },
    );
    const retry = buildMetaInboxCommentActionDraft(
      conversationFixture(),
      { actionType: "hide", reasonNote: "Spam link." },
      { actorUserId: ACTOR_ID, now: "2026-05-24T12:02:00.000Z" },
    );
    const changed = buildMetaInboxCommentActionDraft(
      conversationFixture(),
      { actionType: "hide", reasonNote: "Abusive language." },
      { actorUserId: ACTOR_ID, now: NOW },
    );

    assert.equal(first.row.idempotency_key, retry.row.idempotency_key);
    assert.notEqual(first.row.idempotency_key, changed.row.idempotency_key);
  });

  it("requires reason notes for hide/delete but not like", () => {
    assert.throws(
      () =>
        buildMetaInboxCommentActionDraft(
          conversationFixture(),
          { actionType: "hide", reasonNote: "" },
          { actorUserId: ACTOR_ID, now: NOW },
        ),
      /reason note/i,
    );

    const hidden = buildMetaInboxCommentActionDraft(
      conversationFixture(),
      { actionType: "hide", reasonNote: "Contains spam link." },
      { actorUserId: ACTOR_ID, now: NOW },
    );
    assert.equal(hidden.row.reason_note, "Contains spam link.");
    assert.equal(hidden.event.newValue.reasonRequired, true);

    const liked = buildMetaInboxCommentActionDraft(
      conversationFixture(),
      { actionType: "like" },
      { actorUserId: ACTOR_ID, now: NOW },
    );
    assert.equal(liked.row.message_text, null);
    assert.equal(liked.row.reason_note, null);
  });

  it("blocks non-comment conversations and invalid actors", () => {
    assert.throws(
      () =>
        buildMetaInboxCommentActionDraft(
          conversationFixture({ source_type: "message_thread", source_id: "thread-1" }),
          { actionType: "like" },
          { actorUserId: ACTOR_ID, now: NOW },
        ),
      /comment conversation/i,
    );

    assert.throws(
      () =>
        buildMetaInboxCommentActionDraft(
          conversationFixture(),
          { actionType: "like" },
          { actorUserId: null, now: NOW },
        ),
      /valid sales user/i,
    );
  });

  it("exposes a protected API route for sales comment actions", () => {
    assert.match(route, /createSocialInboxCommentAction/);
    assert.match(route, /requirePermissionFromRequest\(request, "send_inbox_reply"\)/);
    assert.match(route, /isMetaInboxCommentModerationAction/);
    assert.match(route, /manage_inbox_state/);
    assert.equal(isMetaInboxCommentModerationAction("hide"), true);
    assert.equal(isMetaInboxCommentModerationAction("delete"), true);
    assert.equal(isMetaInboxCommentModerationAction("like"), false);
  });

  it("queues approved comment actions and retries only retryable failures", () => {
    const queued = buildMetaInboxQueueCommentActionUpdate(
      actionFixture({ status: "approved", attempt_count: 0 }),
      conversationFixture(),
      { actorUserId: ACTOR_ID, now: NOW },
    );

    assert.equal(queued.update.status, "queued");
    assert.equal(queued.expectedStatus, "approved");
    assert.equal(queued.update.attempt_count, undefined);
    assert.equal(queued.event.eventType, "comment_action");
    assert.equal(queued.event.newValue.action, "delivery_queued");
    assert.equal(queued.event.metadata.source, "inbox_comment_action_queue");

    assert.throws(
      () =>
        buildMetaInboxQueueCommentActionUpdate(
          actionFixture({ status: "queued" }),
          conversationFixture(),
          { actorUserId: ACTOR_ID, now: NOW },
        ),
      /approved/i,
    );

    const retry = buildMetaInboxRetryCommentActionUpdate(
      actionFixture({ status: "failed_retryable", attempt_count: 2 }),
      conversationFixture(),
      { actorUserId: ACTOR_ID, now: NOW },
    );
    assert.equal(retry.update.status, "queued");
    assert.equal(retry.expectedStatus, "failed_retryable");
    assert.equal(retry.update.attempt_count, 3);
    assert.equal(retry.event.newValue.action, "retry_queued");

    assert.throws(
      () =>
        buildMetaInboxRetryCommentActionUpdate(
          actionFixture({ status: "failed_terminal" }),
          conversationFixture(),
          { actorUserId: ACTOR_ID, now: NOW },
        ),
      /retryable/i,
    );
  });

  it("builds delivery targets for public/private reply, like, hide, and delete", () => {
    const publicReply = buildMetaInboxCommentActionDeliveryTarget(
      conversationFixture({ page_id: "page-1" }),
      actionFixture({ action_type: "public_reply", message_text: "Public reply" }),
    );
    assert.equal(publicReply.graphMethod, "POST");
    assert.equal(publicReply.graphPath, "comment-1/comments");
    assert.deepEqual(publicReply.graphBody, { message: "Public reply" });

    const facebookPrivate = buildMetaInboxCommentActionDeliveryTarget(
      conversationFixture({ page_id: "page-1", platform: "facebook" }),
      actionFixture({ action_type: "private_reply", message_text: "DM reply" }),
    );
    assert.equal(facebookPrivate.graphPath, "comment-1/private_replies");

    const instagramPrivate = buildMetaInboxCommentActionDeliveryTarget(
      conversationFixture({ platform: "instagram", page_id: "page-1", ig_user_id: "ig-1" }),
      actionFixture({ action_type: "private_reply", message_text: "IG DM reply" }),
    );
    assert.equal(instagramPrivate.graphPath, "ig-1/messages");
    assert.deepEqual(instagramPrivate.graphBody, {
      recipient: { comment_id: "comment-1" },
      message: { text: "IG DM reply" },
    });

    const like = buildMetaInboxCommentActionDeliveryTarget(
      conversationFixture({ page_id: "page-1" }),
      actionFixture({ action_type: "like" }),
    );
    assert.equal(like.graphPath, "comment-1/likes");

    const hide = buildMetaInboxCommentActionDeliveryTarget(
      conversationFixture({ page_id: "page-1" }),
      actionFixture({ action_type: "hide", reason_note: "Spam" }),
    );
    assert.deepEqual(hide.graphBody, { is_hidden: true });

    const deleted = buildMetaInboxCommentActionDeliveryTarget(
      conversationFixture({ page_id: "page-1" }),
      actionFixture({ action_type: "delete", reason_note: "Abusive" }),
    );
    assert.equal(deleted.graphMethod, "DELETE");
    assert.equal(deleted.graphPath, "comment-1");
  });

  it("builds delivery lifecycle updates with retry metadata", () => {
    const sending = buildMetaInboxCommentActionSendingUpdate(
      actionFixture({ status: "queued", attempt_count: 0 }),
      { now: NOW },
    );
    assert.equal(sending.update.status, "sending");
    assert.equal(sending.update.attempt_count, 1);

    const success = buildMetaInboxCommentActionSuccessUpdate(
      actionFixture({ status: "sending" }),
      {
        metaActionId: "comment-action-id",
        metaResponse: { success: true },
        completedAt: NOW,
      },
    );
    assert.equal(success.update.status, "succeeded");
    assert.equal(success.update.meta_action_id, "comment-action-id");
    assert.equal(success.event.newValue.action, "delivered");

    const failure = buildMetaInboxCommentActionFailureUpdate(
      actionFixture({ status: "sending", attempt_count: 2 }),
      {
        message: "Meta temporarily unavailable",
        httpStatus: 500,
        code: 2,
        subcode: null,
        traceId: "trace-1",
        isTransient: true,
      },
      { now: NOW },
    );
    assert.equal(failure.update.status, "failed_retryable");
    assert.equal(failure.update.next_retry_at, "2026-05-24T12:10:00.000Z");
    assert.equal(failure.update.meta_trace_id, "trace-1");

    const cappedFailure = buildMetaInboxCommentActionFailureUpdate(
      actionFixture({ status: "sending", attempt_count: 5 }),
      {
        message: "Meta still unavailable",
        httpStatus: 500,
        code: 2,
        subcode: null,
        traceId: "trace-max",
        isTransient: true,
      },
      { now: NOW },
    );
    assert.equal(cappedFailure.update.status, "failed_terminal");
    assert.equal(cappedFailure.update.next_retry_at, null);
    assert.equal(cappedFailure.event.metadata.maxAttemptsReached, true);
  });

  it("exposes queue and retry API routes for comment actions", () => {
    const socialInbox = readFileSync("src/lib/social-inbox.ts", "utf8");

    assert.match(queueRoute, /queueSocialInboxCommentAction/);
    assert.match(queueRoute, /requirePermissionFromRequest\(request, "send_inbox_reply"\)/);
    assert.match(retryRoute, /retrySocialInboxCommentAction/);
    assert.match(retryRoute, /requirePermissionFromRequest\(request, "send_inbox_reply"\)/);
    assert.match(socialInbox, /updateCommentActionWithExpectedStatus/);
    assert.match(socialInbox, /\.eq\("status", expectedStatus\)/);
  });
});

function conversationFixture(
  overrides: Partial<
    MetaInboxCommentActionConversationInput & { page_id: string | null; ig_user_id: string | null }
  > = {},
): MetaInboxCommentActionConversationInput & { page_id: string | null; ig_user_id: string | null } {
  return {
    id: "33333333-3333-4333-8333-333333333333",
    source_type: "public_comment",
    source_id: "comment-1",
    platform: "facebook",
    page_id: "page-1",
    ig_user_id: null,
    ...overrides,
  };
}

function actionFixture(
  overrides: Partial<MetaInboxCommentActionRecord> = {},
): MetaInboxCommentActionRecord {
  return {
    id: "44444444-4444-4444-8444-444444444444",
    conversation_id: "33333333-3333-4333-8333-333333333333",
    comment_id: "comment-1",
    action_type: "public_reply",
    message_text: "Thanks for reaching out.",
    reason_note: null,
    status: "approved",
    attempt_count: 0,
    next_retry_at: null,
    meta_error_message: null,
    ...overrides,
  };
}
