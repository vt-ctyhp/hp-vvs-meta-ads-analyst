import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

import { permissionsForRoles } from "../src/lib/access-control.ts";
import {
  buildMetaInboxDeliveryTarget,
  type MetaInboxDeliveryAttempt,
  type MetaInboxDeliveryConversation,
} from "../src/lib/meta-inbox-delivery.ts";
import { buildMetaInboxManagerDashboard } from "../src/lib/meta-inbox-manager-dashboard.ts";
import {
  buildMetaInboxSavedReplyStatusUpdate,
  filterMetaInboxSavedRepliesForProfile,
  type MetaInboxSavedReply,
} from "../src/lib/meta-inbox-saved-replies.ts";
import { filterSocialInboxDataForQueueAccess } from "../src/lib/meta-inbox-access.ts";
import type { SocialInboxData } from "../src/lib/social-inbox.ts";

const SOCIAL_INBOX = readFileSync("src/lib/social-inbox.ts", "utf8");
const DELIVERY_WORKER = readFileSync("src/lib/meta-inbox-delivery-worker.ts", "utf8");
const COMMENT_WORKER = readFileSync("src/lib/meta-inbox-comment-action-worker.ts", "utf8");

const NOW = "2026-05-24T12:00:00.000Z";
const SALES_LEAD_ID = "22222222-2222-4222-8222-222222222222";

describe("Meta inbox review regression fixes", () => {
  it("keeps admin aligned with admin-only inbox helper paths", () => {
    const permissions = permissionsForRoles(["admin"]);

    assert.equal(permissions.includes("send_inbox_reply"), true);
    assert.equal(permissions.includes("manage_inbox_state"), true);
  });

  it("does not send Meta page tokens in Graph API URLs", () => {
    assert.doesNotMatch(DELIVERY_WORKER, /searchParams\.set\("access_token"/);
    assert.doesNotMatch(COMMENT_WORKER, /searchParams\.set\("access_token"/);
    assert.match(DELIVERY_WORKER, /Authorization": `Bearer \$\{pageToken\}`/);
    assert.match(COMMENT_WORKER, /Authorization": `Bearer \$\{pageToken\}`/);
  });

  it("claims active send and comment work before live Meta delivery", () => {
    assert.match(DELIVERY_WORKER, /claimSendAttemptForDelivery/);
    assert.match(DELIVERY_WORKER, /\.eq\("status", attempt\.status\)/);
    assert.match(COMMENT_WORKER, /claimCommentActionForDelivery/);
    assert.match(COMMENT_WORKER, /\.eq\("status", action\.status\)/);
  });

  it("does not swallow failed delivery persistence writes", () => {
    assert.doesNotMatch(DELIVERY_WORKER, /catch\(\(\) => undefined\)/);
    assert.doesNotMatch(COMMENT_WORKER, /catch\(\(\) => undefined\)/);
  });

  it("uses a timeout for live Meta delivery fetches", () => {
    assert.match(DELIVERY_WORKER, /AbortController/);
    assert.match(COMMENT_WORKER, /AbortController/);
  });

  it("keeps presence upsert conflict target aligned with the environment-scoped unique index", () => {
    assert.match(SOCIAL_INBOX, /onConflict: "environment,conversation_id,app_user_id"/);
  });

  it("keeps operator-owned conversation workflow fields out of sync upsert rows", () => {
    assert.doesNotMatch(SOCIAL_INBOX, /conversation_status:\s*conversation\.conversationStatus/);
    assert.doesNotMatch(SOCIAL_INBOX, /queue_category_key:\s*conversation\.queueCategoryKey/);
    assert.doesNotMatch(SOCIAL_INBOX, /routing_source:\s*conversation\.routingSource/);
  });

  it("builds attachment delivery payloads instead of dropping send-attempt attachments", () => {
    const target = buildMetaInboxDeliveryTarget(
      conversationFixture(),
      attemptFixture({
        reply_text: "",
        attachments: [
          {
            id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
            attachment_type: "image",
            meta_attachment_id: "attachment-meta-1",
            media_url: null,
            is_sendable: true,
          },
        ],
      }),
    );

    assert.deepEqual(target.graphBody, {
      recipient: { id: "customer-1" },
      message: {
        attachment: {
          type: "image",
          payload: { attachment_id: "attachment-meta-1" },
        },
      },
      messaging_type: "RESPONSE",
    });
  });

  it("uses a true rolling day range for manager dashboard metrics", () => {
    const dashboard = buildMetaInboxManagerDashboard(
      {
        ...emptySocialInboxData(),
        inboxConversations: [
          conversationDataFixture({
            id: "within-one-day",
            first_inbound_at: "2026-05-24T11:00:00.000Z",
            last_activity_at: "2026-05-24T11:00:00.000Z",
          }),
        ],
      },
      { now: NOW, days: 1 },
    );

    assert.equal(dashboard.metrics.totalConversations, 1);
  });

  it("requires an explicit saved-reply approval status", () => {
    assert.throws(
      () =>
        buildMetaInboxSavedReplyStatusUpdate(
          savedReplyFixture({ approval_status: "pending_approval" }),
          {},
          { appUserId: SALES_LEAD_ID, roles: ["sales_lead"] },
          NOW,
        ),
      /approval status/i,
    );
  });

  it("lets approvers see pending shared saved replies while keeping them away from sales", () => {
    const pending = savedReplyFixture({ id: "pending", approval_status: "pending_approval" });

    assert.deepEqual(
      filterMetaInboxSavedRepliesForProfile([pending], {
        appUserId: SALES_LEAD_ID,
        roles: ["sales_lead"],
      }).map((reply) => reply.id),
      ["pending"],
    );
    assert.deepEqual(
      filterMetaInboxSavedRepliesForProfile([pending], {
        appUserId: "11111111-1111-4111-8111-111111111111",
        roles: ["sales"],
      }),
      [],
    );
  });

  it("filters raw history with platform-aware keys for team queue access", () => {
    const filtered = filterSocialInboxDataForQueueAccess(
      {
        ...emptySocialInboxData(),
        inboxConversations: [
          conversationDataFixture({
            id: "facebook-conversation",
            platform: "facebook",
            platform_thread_id: "same-thread-id",
            source_id: "same-thread-id",
            queue_category_key: "cash_for_gold",
          }),
        ],
        threads: [
          threadFixture({ id: "fb-row", platform: "facebook", thread_id: "same-thread-id" }),
          threadFixture({ id: "ig-row", platform: "instagram", thread_id: "same-thread-id" }),
        ],
        messages: [
          messageFixture({ id: "fb-message", platform: "facebook", thread_id: "same-thread-id" }),
          messageFixture({ id: "ig-message", platform: "instagram", thread_id: "same-thread-id" }),
        ],
      },
      {
        mode: "team",
        allowedQueueCategoryKeys: ["cash_for_gold"],
        reason: "team_queue_access",
      },
    );

    assert.deepEqual(filtered.threads.map((thread) => thread.id), ["fb-row"]);
    assert.deepEqual(filtered.messages.map((message) => message.id), ["fb-message"]);
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
    next_retry_at: null,
    attachment_ids: [],
    attachments: [],
    ...overrides,
  };
}

function savedReplyFixture(overrides: Partial<MetaInboxSavedReply> = {}): MetaInboxSavedReply {
  return {
    id: "reply-1",
    title: "Template",
    body: "Thanks for reaching out.",
    visibility: "shared",
    approval_status: "approved",
    owner_user_id: null,
    created_by: "11111111-1111-4111-8111-111111111111",
    approved_by: "11111111-1111-4111-8111-111111111111",
    approved_at: NOW,
    queue_category_key: null,
    source_channel: null,
    language: "en",
    lead_quality: null,
    active: true,
    usage_count: 0,
    last_used_at: null,
    metadata: {},
    created_at: NOW,
    updated_at: NOW,
    ...overrides,
  };
}

function emptySocialInboxData(): SocialInboxData {
  return {
    queueAccess: { mode: "all", allowedQueueCategoryKeys: null, reason: "full_access_role" },
    threads: [],
    messages: [],
    comments: [],
    inboxConversations: [],
    customerProfiles: [],
    customerContactMethods: [],
    firstTouchSources: [],
    sendAttempts: [],
    commentActions: [],
    conversationEvents: [],
    savedReplies: [],
    notes: [],
    qaScorecards: [],
    syncRuns: [],
  };
}

function conversationDataFixture(
  overrides: Partial<SocialInboxData["inboxConversations"][number]> = {},
): SocialInboxData["inboxConversations"][number] {
  return {
    id: "conversation-1",
    canonical_conversation_key: "facebook:thread:customer-1",
    source_channel: "facebook_message",
    source_type: "message_thread",
    platform: "facebook",
    customer_profile_id: null,
    page_id: "page-1",
    ig_user_id: null,
    participant_id: "customer-1",
    platform_thread_id: "thread-1",
    parent_content_id: null,
    source_id: "thread-1",
    first_inbound_at: NOW,
    latest_inbound_at: NOW,
    latest_outbound_at: null,
    last_activity_at: NOW,
    needs_reply: false,
    reply_window_expires_at: null,
    human_agent_window_expires_at: null,
    send_eligibility: "standard_reply_allowed",
    conversation_status: "needs_reply",
    assigned_team_id: null,
    assigned_user_id: null,
    follow_up_at: null,
    lead_quality: null,
    lead_quality_reason_tags: [],
    inbox_outcome: "no_outcome_yet",
    inbox_lost_reason: null,
    queue_category_key: "cash_for_gold",
    routing_source: null,
    routing_confidence: null,
    routing_explanation: null,
    ...overrides,
  };
}

function threadFixture(
  overrides: Partial<SocialInboxData["threads"][number]> = {},
): SocialInboxData["threads"][number] {
  return {
    id: "thread-row",
    platform: "facebook",
    thread_id: "thread-1",
    page_id: "page-1",
    ig_user_id: null,
    participant_id: "customer-1",
    participant_name: null,
    snippet: null,
    message_count: 1,
    unread_count: 0,
    last_message_at: NOW,
    last_synced_at: NOW,
    ...overrides,
  };
}

function messageFixture(
  overrides: Partial<SocialInboxData["messages"][number]> = {},
): SocialInboxData["messages"][number] {
  return {
    id: "message-row",
    platform: "facebook",
    thread_id: "thread-1",
    message_id: "message-1",
    direction: "inbound",
    sender_id: "customer-1",
    sender_name: null,
    recipient_id: "page-1",
    recipient_name: null,
    body: "Hi",
    attachments: [],
    sent_at: NOW,
    ...overrides,
  };
}
