import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

import {
  buildMetaInboxDeliveryFailureUpdate,
  buildMetaInboxDeliverySendingUpdate,
  buildMetaInboxDeliverySuccessUpdate,
  buildMetaInboxDeliveryTarget,
  isRetryableMetaInboxDeliveryFailure,
  nextRetryAtForAttempt,
  type MetaInboxDeliveryAttempt,
  type MetaInboxDeliveryConversation,
} from "../src/lib/meta-inbox-delivery.ts";

const NOW = "2026-05-24T12:00:00.000Z";

describe("Meta inbox delivery worker foundation", () => {
  it("builds a Facebook message send target with response messaging type", () => {
    const target = buildMetaInboxDeliveryTarget(
      conversationFixture({
        platform: "facebook",
        source_type: "message_thread",
        page_id: "page-1",
        participant_id: "customer-1",
        platform_thread_id: "thread-1",
      }),
      attemptFixture({ messaging_type: "RESPONSE" }),
    );

    assert.equal(target.sourceType, "message");
    assert.equal(target.pageSelector, "page-1");
    assert.equal(target.graphPath, "me/messages");
    assert.deepEqual(target.graphBody, {
      recipient: { id: "customer-1" },
      message: { text: "Thanks for reaching out." },
      messaging_type: "RESPONSE",
    });
  });

  it("builds a public comment reply target", () => {
    const target = buildMetaInboxDeliveryTarget(
      conversationFixture({
        source_type: "public_comment",
        source_id: "comment-1",
        platform_thread_id: null,
      }),
      attemptFixture(),
    );

    assert.equal(target.sourceType, "comment");
    assert.equal(target.graphPath, "comment-1/comments");
    assert.deepEqual(target.graphBody, { message: "Thanks for reaching out." });
  });

  it("marks queued attempts as sending without double-incrementing retry counts", () => {
    assert.equal(
      buildMetaInboxDeliverySendingUpdate(
        attemptFixture({ attempt_count: 0 }),
        { now: NOW },
      ).update.attempt_count,
      1,
    );
    assert.equal(
      buildMetaInboxDeliverySendingUpdate(
        attemptFixture({ attempt_count: 3 }),
        { now: NOW },
      ).update.attempt_count,
      3,
    );
  });

  it("marks successful Meta sends as sent and clears error details", () => {
    const update = buildMetaInboxDeliverySuccessUpdate(
      attemptFixture({ status: "sending" }),
      { metaSendId: "mid.123", sentAt: NOW },
    );

    assert.equal(update.update.status, "sent");
    assert.equal(update.update.meta_send_id, "mid.123");
    assert.equal(update.update.sent_at, NOW);
    assert.equal(update.update.meta_error_message, null);
    assert.equal(update.event.newValue.action, "delivered");
  });

  it("classifies transient Meta failures as retryable with backoff", () => {
    const failure = {
      message: "Meta temporarily unavailable",
      httpStatus: 500,
      code: 2,
      subcode: null,
      traceId: "trace-1",
      isTransient: true,
    };
    const update = buildMetaInboxDeliveryFailureUpdate(
      attemptFixture({ status: "sending", attempt_count: 2 }),
      failure,
      { now: NOW },
    );

    assert.equal(isRetryableMetaInboxDeliveryFailure(failure), true);
    assert.equal(update.update.status, "failed_retryable");
    assert.equal(update.update.next_retry_at, "2026-05-24T12:10:00.000Z");
    assert.equal(update.update.meta_error_code, 2);
    assert.equal(update.update.meta_trace_id, "trace-1");
  });

  it("classifies auth and permission failures as terminal", () => {
    const update = buildMetaInboxDeliveryFailureUpdate(
      attemptFixture({ status: "sending", attempt_count: 1 }),
      {
        message: "Unsupported post request",
        httpStatus: 403,
        code: 200,
        subcode: 33,
        traceId: "trace-2",
        isTransient: false,
      },
      { now: NOW },
    );

    assert.equal(update.update.status, "failed_terminal");
    assert.equal(update.update.next_retry_at, null);
    assert.equal(update.update.meta_error_subcode, 33);
  });

  it("keeps the live delivery worker gated behind ALLOW_LIVE_META_SEND", () => {
    const worker = readFileSync("src/lib/meta-inbox-delivery-worker.ts", "utf8");
    const route = readFileSync("src/app/api/cron/meta-inbox-delivery/route.ts", "utf8");

    assert.match(worker, /isLiveSendEnabled\(\)/);
    assert.match(worker, /status: "disabled"/);
    assert.match(route, /isAuthorizedCronRequest/);
    assert.match(route, /deliverQueuedMetaInboxSendAttempts/);
  });

  it("uses capped exponential retry delays", () => {
    assert.equal(nextRetryAtForAttempt(NOW, 1), "2026-05-24T12:05:00.000Z");
    assert.equal(nextRetryAtForAttempt(NOW, 2), "2026-05-24T12:10:00.000Z");
    assert.equal(nextRetryAtForAttempt(NOW, 8), "2026-05-24T13:00:00.000Z");
  });
});

function conversationFixture(
  overrides: Partial<MetaInboxDeliveryConversation> = {},
): MetaInboxDeliveryConversation {
  return {
    id: "33333333-3333-4333-8333-333333333333",
    source_type: "message_thread",
    platform: "facebook",
    page_id: "page-1",
    ig_user_id: null,
    participant_id: "customer-1",
    platform_thread_id: "thread-1",
    source_id: "thread-1",
    ...overrides,
  };
}

function attemptFixture(
  overrides: Partial<MetaInboxDeliveryAttempt> = {},
): MetaInboxDeliveryAttempt {
  return {
    id: "44444444-4444-4444-8444-444444444444",
    conversation_id: "33333333-3333-4333-8333-333333333333",
    reply_text: "Thanks for reaching out.",
    status: "queued",
    messaging_type: "RESPONSE",
    tag: null,
    attempt_count: 1,
    ...overrides,
  };
}
