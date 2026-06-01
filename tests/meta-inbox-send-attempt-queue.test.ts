import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

import {
  buildMetaInboxQueueAttemptUpdate,
  buildMetaInboxRetryAttemptUpdate,
  type MetaInboxReplyConversationInput,
  type MetaInboxSendAttemptRecord,
} from "../src/lib/meta-inbox-reply-reliability.ts";

const NOW = "2026-05-24T12:00:00.000Z";
const ACTOR_ID = "11111111-1111-4111-8111-111111111111";

describe("Meta inbox approved send-attempt queue slice", () => {
  it("queues approved attempts for the delivery worker without incrementing attempt count", () => {
    const queued = buildMetaInboxQueueAttemptUpdate(
      sendAttemptFixture({ status: "approved", attempt_count: 0 }),
      conversationFixture({
        reply_window_expires_at: "2026-05-24T12:30:00.000Z",
      }),
      { actorUserId: ACTOR_ID, now: NOW, humanAgentEnabled: true },
    );

    assert.equal(queued.update.status, "queued");
    assert.equal(queued.update.messaging_type, "RESPONSE");
    assert.equal(queued.update.tag, null);
    assert.equal(queued.update.next_retry_at, null);
    assert.equal(queued.update.meta_error_message, null);
    assert.equal(queued.update.updated_at, NOW);
    assert.equal(queued.update.attempt_count, undefined);
    assert.equal(queued.expectedStatus, "approved");
    assert.equal(queued.event.eventType, "send_attempt");
    assert.equal(queued.event.newValue.action, "delivery_queued");
    assert.equal(queued.event.newValue.status, "queued");
    assert.equal(queued.event.newValue.attemptCount, 0);
    assert.equal(queued.event.metadata.source, "inbox_send_attempt_queue");
    assert.equal(queued.event.metadata.liveMetaDelivery, false);
  });

  it("blocks non-approved attempts, expired windows, and mismatched conversations", () => {
    assert.throws(
      () =>
        buildMetaInboxQueueAttemptUpdate(
          sendAttemptFixture({ status: "queued" }),
          conversationFixture(),
          { actorUserId: ACTOR_ID, now: NOW, humanAgentEnabled: true },
        ),
      /approved/i,
    );

    assert.throws(
      () =>
        buildMetaInboxQueueAttemptUpdate(
          sendAttemptFixture({ status: "approved" }),
          conversationFixture({
            send_eligibility: "expired",
            reply_window_expires_at: "2026-05-24T11:00:00.000Z",
          }),
          { actorUserId: ACTOR_ID, now: NOW, humanAgentEnabled: true },
        ),
      /reply window/i,
    );

    assert.throws(
      () =>
        buildMetaInboxQueueAttemptUpdate(
          sendAttemptFixture({
            status: "approved",
            conversation_id: "55555555-5555-4555-8555-555555555555",
          }),
          conversationFixture(),
          { actorUserId: ACTOR_ID, now: NOW, humanAgentEnabled: true },
        ),
      /not attached/i,
    );
  });

  it("exposes expected statuses so service updates cannot revive stale send attempts", () => {
    const retry = buildMetaInboxRetryAttemptUpdate(
      sendAttemptFixture({ status: "failed_retryable", attempt_count: 2 }),
      conversationFixture(),
      { actorUserId: ACTOR_ID, now: NOW, humanAgentEnabled: true },
    );
    const socialInbox = readFileSync("src/lib/social-inbox.ts", "utf8");

    assert.equal(retry.expectedStatus, "failed_retryable");
    assert.match(socialInbox, /updateSendAttemptWithExpectedStatus/);
    assert.match(socialInbox, /\.eq\("status", expectedStatus\)/);
  });

  it("exposes a send-attempt queue API route and UI action", () => {
    const route = readFileSync(
      "src/app/api/social-inbox/conversations/[conversationId]/send-attempts/queue/route.ts",
      "utf8",
    );
    const socialInbox = readFileSync("src/lib/social-inbox.ts", "utf8");
    const inboxMutations = readFileSync(
      "src/components/v2/inbox/use-social-inbox-mutations.ts",
      "utf8",
    );
    const replyComposer = readFileSync("src/components/v2/inbox/reply-composer.tsx", "utf8");

    assert.match(route, /queueSocialInboxSendAttempt/);
    assert.match(route, /requirePermissionFromRequest\(request, "send_inbox_reply"\)/);
    assert.match(socialInbox, /buildMetaInboxQueueAttemptUpdate/);
    assert.match(replyComposer, /Queue Delivery/);
    assert.match(
      inboxMutations,
      /\/api\/social-inbox\/conversations\/\$\{encodeURIComponent\(conversationId\)\}\/send-attempts\/queue/,
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
    ai_reply_suggestion_id: null,
    status: "approved",
    messaging_type: "RESPONSE",
    tag: null,
    attempt_count: 0,
    next_retry_at: null,
    meta_error_message: null,
    ...overrides,
  };
}
