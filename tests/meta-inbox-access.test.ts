import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  filterSocialInboxDataForQueueAccess,
  metaInboxQueueAccessScopeForProfile,
  type MetaInboxQueueAccessDecision,
} from "../src/lib/meta-inbox-access.ts";

type SocialInboxData = Parameters<typeof filterSocialInboxDataForQueueAccess>[0];

describe("Meta inbox team queue access", () => {
  it("lets admin and marketing read all queues while team operators require team access", () => {
    assert.deepEqual(metaInboxQueueAccessScopeForProfile({ appUserId: "admin-1", roles: ["admin"] }), {
      mode: "all",
      allowedQueueCategoryKeys: null,
      reason: "full_access_role",
    });

    assert.deepEqual(
      metaInboxQueueAccessScopeForProfile({ appUserId: "marketing-1", roles: ["marketing"] }),
      {
        mode: "all",
        allowedQueueCategoryKeys: null,
        reason: "full_access_role",
      },
    );

    assert.deepEqual(
      metaInboxQueueAccessScopeForProfile({ appUserId: "sales-1", roles: ["sales"] }),
      {
        mode: "team",
        allowedQueueCategoryKeys: [],
        reason: "team_queue_access",
      },
    );

    assert.deepEqual(
      metaInboxQueueAccessScopeForProfile({ appUserId: null, roles: ["sales_lead"] }),
      {
        mode: "none",
        allowedQueueCategoryKeys: [],
        reason: "missing_app_user",
      },
    );
  });

  it("filters conversations and raw history to the allowed queue union", () => {
    const data = socialInboxFixture();
    const access: MetaInboxQueueAccessDecision = {
      mode: "team",
      allowedQueueCategoryKeys: ["cash_for_gold", "book_appointment"],
      reason: "team_queue_access",
    };

    const filtered = filterSocialInboxDataForQueueAccess(data, access);

    assert.deepEqual(
      filtered.inboxConversations.map((conversation) => conversation.id),
      ["conv-cash", "conv-book"],
    );
    assert.deepEqual(filtered.threads.map((thread) => thread.thread_id), ["thread-cash"]);
    assert.deepEqual(filtered.messages.map((message) => message.thread_id), ["thread-cash"]);
    assert.deepEqual(
      filtered.comments.map((comment) => comment.comment_id),
      ["comment-book", "comment-book-reply"],
    );
    assert.deepEqual(
      filtered.customerProfiles.map((profile) => profile.id),
      ["profile-cash", "profile-book"],
    );
    assert.deepEqual(
      filtered.firstTouchSources.map((source) => source.conversation_id),
      ["conv-cash", "conv-book"],
    );
    assert.deepEqual(
      filtered.sendAttempts.map((attempt) => attempt.conversation_id),
      ["conv-cash", "conv-book"],
    );
    assert.deepEqual(filtered.syncRuns, data.syncRuns);
  });

  it("returns no conversation data when a team-scoped user has no queue access", () => {
    const filtered = filterSocialInboxDataForQueueAccess(socialInboxFixture(), {
      mode: "team",
      allowedQueueCategoryKeys: [],
      reason: "team_queue_access",
    });

    assert.equal(filtered.inboxConversations.length, 0);
    assert.equal(filtered.threads.length, 0);
    assert.equal(filtered.messages.length, 0);
    assert.equal(filtered.comments.length, 0);
    assert.equal(filtered.customerProfiles.length, 0);
    assert.equal(filtered.firstTouchSources.length, 0);
    assert.equal(filtered.sendAttempts.length, 0);
    assert.equal(filtered.syncRuns.length, 1);
  });

  it("preserves unnormalized raw rows only for full-access readers", () => {
    const data = socialInboxFixture();

    assert.equal(
      filterSocialInboxDataForQueueAccess(data, {
        mode: "all",
        allowedQueueCategoryKeys: null,
        reason: "full_access_role",
      }).threads.some((thread) => thread.thread_id === "thread-raw-only"),
      true,
    );

    assert.equal(
      filterSocialInboxDataForQueueAccess(data, {
        mode: "team",
        allowedQueueCategoryKeys: ["cash_for_gold"],
        reason: "team_queue_access",
      }).threads.some((thread) => thread.thread_id === "thread-raw-only"),
      false,
    );
  });
});

function socialInboxFixture(): SocialInboxData {
  return {
    queueAccess: {
      mode: "all",
      allowedQueueCategoryKeys: null,
      reason: "unscoped_internal_read",
    },
    inboxConversations: [
      {
        id: "conv-cash",
        canonical_conversation_key: "facebook:thread:cash",
        source_channel: "facebook_message",
        source_type: "message_thread",
        platform: "facebook",
        customer_profile_id: "profile-cash",
        page_id: "page-1",
        ig_user_id: null,
        participant_id: "customer-cash",
        platform_thread_id: "thread-cash",
        parent_content_id: null,
        source_id: "thread-cash",
        first_inbound_at: "2026-05-23T10:00:00.000Z",
        latest_inbound_at: "2026-05-23T10:00:00.000Z",
        latest_outbound_at: null,
        last_activity_at: "2026-05-23T10:00:00.000Z",
        needs_reply: true,
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
        routing_source: "ad_referral",
        routing_confidence: 0.9,
        routing_explanation: "Cash campaign",
      },
      {
        id: "conv-book",
        canonical_conversation_key: "facebook:comment:book",
        source_channel: "facebook_public_comment",
        source_type: "public_comment",
        platform: "facebook",
        customer_profile_id: "profile-book",
        page_id: "page-1",
        ig_user_id: null,
        participant_id: "customer-book",
        platform_thread_id: null,
        parent_content_id: "post-book",
        source_id: "comment-book",
        first_inbound_at: "2026-05-23T11:00:00.000Z",
        latest_inbound_at: "2026-05-23T11:00:00.000Z",
        latest_outbound_at: null,
        last_activity_at: "2026-05-23T11:00:00.000Z",
        needs_reply: true,
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
        queue_category_key: "book_appointment",
        routing_source: "ad_referral",
        routing_confidence: 0.8,
        routing_explanation: "Appointment ad",
      },
      {
        id: "conv-vn",
        canonical_conversation_key: "instagram:thread:vn",
        source_channel: "instagram_message",
        source_type: "message_thread",
        platform: "instagram",
        customer_profile_id: "profile-vn",
        page_id: null,
        ig_user_id: "ig-1",
        participant_id: "customer-vn",
        platform_thread_id: "thread-vn",
        parent_content_id: null,
        source_id: "thread-vn",
        first_inbound_at: "2026-05-23T12:00:00.000Z",
        latest_inbound_at: "2026-05-23T12:00:00.000Z",
        latest_outbound_at: null,
        last_activity_at: "2026-05-23T12:00:00.000Z",
        needs_reply: true,
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
        queue_category_key: "vn_product",
        routing_source: "ad_referral",
        routing_confidence: 0.7,
        routing_explanation: "VN ad",
      },
    ],
    customerProfiles: [
      customerProfile("profile-cash", "facebook", "customer-cash"),
      customerProfile("profile-book", "facebook", "customer-book"),
      customerProfile("profile-vn", "instagram", "customer-vn"),
    ],
    customerContactMethods: [],
    firstTouchSources: [
      firstTouchSource("source-cash", "conv-cash"),
      firstTouchSource("source-book", "conv-book"),
      firstTouchSource("source-vn", "conv-vn"),
    ],
    sendAttempts: [
      sendAttempt("attempt-cash", "conv-cash"),
      sendAttempt("attempt-book", "conv-book"),
      sendAttempt("attempt-vn", "conv-vn"),
    ],
    threads: [
      thread("thread-cash", "facebook"),
      thread("thread-vn", "instagram"),
      thread("thread-raw-only", "facebook"),
    ],
    messages: [
      message("message-cash", "thread-cash", "facebook"),
      message("message-vn", "thread-vn", "instagram"),
      message("message-raw-only", "thread-raw-only", "facebook"),
    ],
    comments: [
      comment("comment-book", null),
      comment("comment-book-reply", "comment-book"),
      comment("comment-raw-only", null),
    ],
    syncRuns: [
      {
        id: "sync-1",
        trigger: "manual",
        status: "success",
        started_at: "2026-05-23T09:00:00.000Z",
        completed_at: "2026-05-23T09:01:00.000Z",
        metrics: {},
        errors: [],
      },
    ],
  };
}

function sendAttempt(id: string, conversationId: string) {
  return {
    id,
    conversation_id: conversationId,
    reply_text: "Thanks for reaching out.",
    approved_by: null,
    approved_at: null,
    status: "approved" as const,
    messaging_type: "RESPONSE" as const,
    tag: null,
    attachment_ids: [],
    meta_send_id: null,
    meta_error_message: null,
    meta_error_code: null,
    meta_error_subcode: null,
    meta_trace_id: null,
    attempt_count: 0,
    next_retry_at: null,
    last_attempted_at: null,
    sent_at: null,
    idempotency_key: id,
    created_at: "2026-05-23T10:05:00.000Z",
    updated_at: "2026-05-23T10:05:00.000Z",
  };
}

function customerProfile(
  id: string,
  platform: "facebook" | "instagram",
  participantId: string,
) {
  return {
    id,
    platform,
    page_id: platform === "facebook" ? "page-1" : null,
    ig_user_id: platform === "instagram" ? "ig-1" : null,
    participant_id: participantId,
    display_name: participantId,
    username: null,
    profile_picture_url: null,
    profile_url: null,
    profile_reference: null,
    last_profile_synced_at: null,
  };
}

function firstTouchSource(id: string, conversationId: string) {
  return {
    id,
    conversation_id: conversationId,
    first_message_id: null,
    first_message_at: null,
    ad_id: null,
    ref: null,
    source_post_id: null,
    source_media_id: null,
    source_comment_id: null,
    source_product_id: null,
    source_permalink: null,
    campaign_umbrella_id: null,
    campaign_id: null,
    adset_id: null,
    creative_id: null,
    attribution_method: null,
    attribution_confidence: null,
  };
}

function thread(threadId: string, platform: "facebook" | "instagram") {
  return {
    id: `row-${threadId}`,
    platform,
    thread_id: threadId,
    page_id: platform === "facebook" ? "page-1" : null,
    ig_user_id: platform === "instagram" ? "ig-1" : null,
    participant_id: `customer-${threadId}`,
    participant_name: null,
    snippet: null,
    message_count: 1,
    unread_count: 1,
    last_message_at: "2026-05-23T10:00:00.000Z",
    last_synced_at: null,
  };
}

function message(
  id: string,
  threadId: string,
  platform: "facebook" | "instagram",
) {
  return {
    id,
    platform,
    thread_id: threadId,
    message_id: id,
    direction: "inbound" as const,
    sender_id: "customer",
    sender_name: null,
    recipient_id: "business",
    recipient_name: null,
    body: "Hi",
    attachments: [],
    sent_at: "2026-05-23T10:00:00.000Z",
  };
}

function comment(commentId: string, parentCommentId: string | null) {
  return {
    id: `row-${commentId}`,
    platform: "facebook" as const,
    comment_id: commentId,
    parent_comment_id: parentCommentId,
    page_id: "page-1",
    ig_user_id: null,
    content_id: "post-book",
    content_permalink: null,
    author_id: "customer",
    author_name: null,
    body: "Interested",
    like_count: 0,
    reply_count: 0,
    created_time: "2026-05-23T11:00:00.000Z",
    last_synced_at: null,
  };
}
