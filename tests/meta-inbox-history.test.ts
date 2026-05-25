import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { canReadMetaInboxConversationForQueueAccess } from "../src/lib/meta-inbox-access.ts";
import {
  buildSocialInboxConversationHistoryPage,
  mergeSocialInboxConversationHistory,
} from "../src/lib/meta-inbox-history.ts";

type Conversation = Parameters<typeof buildSocialInboxConversationHistoryPage>[0];
type Message = Parameters<typeof buildSocialInboxConversationHistoryPage>[1]["messages"][number];
type Comment = Parameters<typeof buildSocialInboxConversationHistoryPage>[1]["comments"][number];

describe("Meta inbox conversation history", () => {
  it("returns the newest known message page ordered oldest to newest with an older cursor", () => {
    const history = buildSocialInboxConversationHistoryPage(
      conversationFixture({ sourceType: "message_thread", platformThreadId: "thread-1" }),
      {
        messages: [
          messageFixture("m1", "2026-05-23T10:00:00.000Z"),
          messageFixture("m2", "2026-05-23T10:01:00.000Z"),
          messageFixture("m3", "2026-05-23T10:02:00.000Z"),
          messageFixture("m4", "2026-05-23T10:03:00.000Z"),
          messageFixture("m5", "2026-05-23T10:04:00.000Z"),
        ],
        comments: [],
      },
      { pageSize: 2 },
    );

    assert.deepEqual(history.messages.map((message) => message.id), ["m4", "m5"]);
    assert.equal(history.pageInfo.nextCursor, "3");
    assert.equal(history.pageInfo.knownTotal, 5);
    assert.equal(history.pageInfo.historyCompleteness, "partial_known_history");

    const older = buildSocialInboxConversationHistoryPage(
      history.conversation,
      {
        messages: [
          messageFixture("m1", "2026-05-23T10:00:00.000Z"),
          messageFixture("m2", "2026-05-23T10:01:00.000Z"),
          messageFixture("m3", "2026-05-23T10:02:00.000Z"),
          messageFixture("m4", "2026-05-23T10:03:00.000Z"),
          messageFixture("m5", "2026-05-23T10:04:00.000Z"),
        ],
        comments: [],
      },
      { pageSize: 2, cursor: history.pageInfo.nextCursor },
    );

    assert.deepEqual(older.messages.map((message) => message.id), ["m2", "m3"]);
    assert.equal(older.pageInfo.nextCursor, "1");

    const merged = mergeSocialInboxConversationHistory(history, older);
    assert.deepEqual(merged.messages.map((message) => message.id), ["m2", "m3", "m4", "m5"]);
    assert.equal(merged.pageInfo.nextCursor, "1");
    assert.equal(merged.pageInfo.historyCompleteness, "partial_known_history");
  });

  it("marks known history complete when no older cursor remains", () => {
    const history = buildSocialInboxConversationHistoryPage(
      conversationFixture({ sourceType: "message_thread", platformThreadId: "thread-1" }),
      {
        messages: [
          messageFixture("m1", "2026-05-23T10:00:00.000Z"),
          messageFixture("m2", "2026-05-23T10:01:00.000Z"),
        ],
        comments: [],
      },
      { pageSize: 10 },
    );

    assert.deepEqual(history.messages.map((message) => message.id), ["m1", "m2"]);
    assert.equal(history.pageInfo.nextCursor, null);
    assert.equal(history.pageInfo.historyCompleteness, "complete_known_history");
  });

  it("returns root comment plus direct replies for public comment chains", () => {
    const history = buildSocialInboxConversationHistoryPage(
      conversationFixture({ sourceType: "public_comment", sourceId: "comment-root" }),
      {
        messages: [],
        comments: [
          commentFixture("comment-root", null, "2026-05-23T10:00:00.000Z"),
          commentFixture("comment-reply-2", "comment-root", "2026-05-23T10:02:00.000Z"),
          commentFixture("unrelated", null, "2026-05-23T10:03:00.000Z"),
          commentFixture("comment-reply-1", "comment-root", "2026-05-23T10:01:00.000Z"),
        ],
      },
      { pageSize: 10 },
    );

    assert.deepEqual(
      history.comments.map((comment) => comment.comment_id),
      ["comment-root", "comment-reply-1", "comment-reply-2"],
    );
    assert.equal(history.pageInfo.knownTotal, 3);
  });

  it("does not allow team-scoped readers to fetch disallowed queue history", () => {
    const conversation = conversationFixture({ queueCategoryKey: "vn_product" });

    assert.equal(
      canReadMetaInboxConversationForQueueAccess(conversation, {
        mode: "team",
        allowedQueueCategoryKeys: ["cash_for_gold", "book_appointment"],
        reason: "team_queue_access",
      }),
      false,
    );

    assert.equal(
      canReadMetaInboxConversationForQueueAccess(conversation, {
        mode: "team",
        allowedQueueCategoryKeys: ["vn_product"],
        reason: "team_queue_access",
      }),
      true,
    );
  });
});

function conversationFixture(
  overrides: Partial<Conversation> & {
    sourceType?: Conversation["source_type"];
    platformThreadId?: string | null;
    sourceId?: string | null;
    queueCategoryKey?: Conversation["queue_category_key"];
  } = {},
): Conversation {
  return {
    id: "conv-1",
    canonical_conversation_key: "facebook:thread:customer-1",
    source_channel: "facebook_message",
    source_type: overrides.sourceType || "message_thread",
    platform: "facebook",
    customer_profile_id: "profile-1",
    page_id: "page-1",
    ig_user_id: null,
    participant_id: "customer-1",
    platform_thread_id: overrides.platformThreadId ?? "thread-1",
    parent_content_id: null,
    source_id: overrides.sourceId ?? "thread-1",
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
    queue_category_key: overrides.queueCategoryKey || "cash_for_gold",
    routing_source: null,
    routing_confidence: null,
    routing_explanation: null,
    ...overrides,
  };
}

function messageFixture(id: string, sentAt: string): Message {
  return {
    id,
    platform: "facebook",
    thread_id: "thread-1",
    message_id: id,
    direction: id === "m5" ? "outbound" : "inbound",
    sender_id: "customer-1",
    sender_name: null,
    recipient_id: "page-1",
    recipient_name: null,
    body: `Message ${id}`,
    attachments: [],
    sent_at: sentAt,
  };
}

function commentFixture(
  commentId: string,
  parentCommentId: string | null,
  createdAt: string,
): Comment {
  return {
    id: `row-${commentId}`,
    platform: "facebook",
    comment_id: commentId,
    parent_comment_id: parentCommentId,
    page_id: "page-1",
    ig_user_id: null,
    content_id: "post-1",
    content_permalink: null,
    author_id: "customer-1",
    author_name: null,
    body: commentId,
    like_count: 0,
    reply_count: 0,
    created_time: createdAt,
    last_synced_at: null,
  };
}
