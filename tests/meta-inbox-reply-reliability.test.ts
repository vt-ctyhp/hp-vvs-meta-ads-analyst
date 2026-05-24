import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";

import {
  buildMetaInboxRetryAttemptUpdate,
  buildMetaInboxSendAttemptDraft,
  resolveMetaInboxReplyWindow,
  type MetaInboxReplyConversationInput,
  type MetaInboxSendAttemptRecord,
} from "../src/lib/meta-inbox-reply-reliability.ts";

const REPO_ROOT = fileURLToPath(new URL("..", import.meta.url));
const MIGRATION = join(
  REPO_ROOT,
  "supabase/migrations/20260524100000_meta_inbox_reply_reliability.sql",
);
const migration = readFileSync(MIGRATION, "utf8");

const NOW = "2026-05-24T12:00:00.000Z";
const ACTOR_ID = "11111111-1111-4111-8111-111111111111";

describe("Meta inbox reply reliability foundation", () => {
  it("creates the inbox send attempts table with retry and Meta error fields", () => {
    assert.match(migration, /create table if not exists public\.meta_inbox_send_attempts/);
    for (const column of [
      "conversation_id",
      "reply_text",
      "approved_by",
      "status",
      "messaging_type",
      "tag",
      "attachment_ids",
      "meta_send_id",
      "meta_error_message",
      "meta_error_code",
      "meta_error_subcode",
      "meta_trace_id",
      "attempt_count",
      "next_retry_at",
      "idempotency_key",
    ]) {
      assert.match(migration, new RegExp(column));
    }
    assert.match(migration, /failed_retryable/);
    assert.match(migration, /failed_terminal/);
    assert.match(migration, /meta_inbox_send_attempts_idempotency_idx/);
    assert.match(migration, /meta_inbox_send_attempts_delivery_queue_idx/);
    assert.match(migration, /event_type = 'send_attempt'/);
  });

  it("resolves standard, Human Agent, expired, and unknown reply windows", () => {
    assert.deepEqual(
      resolveMetaInboxReplyWindow(
        conversationFixture({
          send_eligibility: "standard_reply_allowed",
          reply_window_expires_at: "2026-05-24T12:30:00.000Z",
        }),
        { now: NOW, humanAgentEnabled: true },
      ),
      {
        eligibility: "standard_reply_allowed",
        canAttemptSend: true,
        messagingType: "RESPONSE",
        tag: null,
        countdownTargetAt: "2026-05-24T12:30:00.000Z",
        reason: "Standard 24-hour reply window is open.",
      },
    );

    const humanAgent = resolveMetaInboxReplyWindow(
      conversationFixture({
        send_eligibility: "human_agent_allowed",
        human_agent_window_expires_at: "2026-05-25T12:00:00.000Z",
      }),
      { now: NOW, humanAgentEnabled: true },
    );
    assert.equal(humanAgent.canAttemptSend, true);
    assert.equal(humanAgent.messagingType, "MESSAGE_TAG");
    assert.equal(humanAgent.tag, "HUMAN_AGENT");

    const expired = resolveMetaInboxReplyWindow(
      conversationFixture({
        send_eligibility: "standard_reply_allowed",
        reply_window_expires_at: "2026-05-24T11:00:00.000Z",
        human_agent_window_expires_at: "2026-05-24T11:30:00.000Z",
      }),
      { now: NOW, humanAgentEnabled: true },
    );
    assert.equal(expired.eligibility, "expired");
    assert.equal(expired.canAttemptSend, false);

    const unknown = resolveMetaInboxReplyWindow(
      conversationFixture({ send_eligibility: "unknown" }),
      { now: NOW, humanAgentEnabled: true },
    );
    assert.equal(unknown.canAttemptSend, false);
  });

  it("builds an approved send-attempt draft without live Meta delivery", () => {
    const draft = buildMetaInboxSendAttemptDraft(
      conversationFixture({
        reply_window_expires_at: "2026-05-24T12:30:00.000Z",
      }),
      {
        replyText: "Thanks, we can help with that.",
        idempotencyKey: "client-key-1",
      },
      { actorUserId: ACTOR_ID, now: NOW, humanAgentEnabled: true },
    );

    assert.equal(draft.row.status, "approved");
    assert.equal(draft.row.messaging_type, "RESPONSE");
    assert.equal(draft.row.tag, null);
    assert.equal(draft.row.reply_text, "Thanks, we can help with that.");
    assert.equal(draft.row.idempotency_key, "client-key-1");
    assert.equal(draft.event.eventType, "send_attempt");
    assert.equal(draft.event.newValue.status, "approved");
  });

  it("blocks send-attempt drafts when the reply window is expired", () => {
    assert.throws(
      () =>
        buildMetaInboxSendAttemptDraft(
          conversationFixture({
            send_eligibility: "expired",
            reply_window_expires_at: "2026-05-24T11:00:00.000Z",
          }),
          { replyText: "Can still send?" },
          { actorUserId: ACTOR_ID, now: NOW, humanAgentEnabled: true },
        ),
      /reply window/i,
    );
  });

  it("allows retry only for failed_retryable attempts and resets retry metadata", () => {
    const retry = buildMetaInboxRetryAttemptUpdate(
      sendAttemptFixture({ status: "failed_retryable", attempt_count: 2 }),
      conversationFixture({
        reply_window_expires_at: "2026-05-24T12:30:00.000Z",
      }),
      { actorUserId: ACTOR_ID, now: NOW, humanAgentEnabled: true },
    );

    assert.equal(retry.update.status, "queued");
    assert.equal(retry.update.attempt_count, 3);
    assert.equal(retry.update.next_retry_at, null);
    assert.equal(retry.event.eventType, "send_attempt");

    assert.throws(
      () =>
        buildMetaInboxRetryAttemptUpdate(
          sendAttemptFixture({ status: "failed_terminal" }),
          conversationFixture(),
          { actorUserId: ACTOR_ID, now: NOW, humanAgentEnabled: true },
        ),
      /retryable/i,
    );
  });
});

function conversationFixture(
  overrides: Partial<MetaInboxReplyConversationInput> = {},
): MetaInboxReplyConversationInput {
  return {
    id: "33333333-3333-4333-8333-333333333333",
    send_eligibility: "standard_reply_allowed",
    reply_window_expires_at: "2026-05-24T13:00:00.000Z",
    human_agent_window_expires_at: "2026-05-30T12:00:00.000Z",
    ...overrides,
  };
}

function sendAttemptFixture(
  overrides: Partial<MetaInboxSendAttemptRecord> = {},
): MetaInboxSendAttemptRecord {
  return {
    id: "44444444-4444-4444-8444-444444444444",
    conversation_id: "33333333-3333-4333-8333-333333333333",
    reply_text: "hello",
    status: "failed_retryable",
    messaging_type: "RESPONSE",
    tag: null,
    attempt_count: 1,
    next_retry_at: "2026-05-24T12:05:00.000Z",
    meta_error_message: "Meta transient error",
    ...overrides,
  };
}
