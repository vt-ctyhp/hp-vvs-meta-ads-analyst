import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  buildSocialReplyContext,
  buildSocialReplyTranscript,
} from "../src/lib/social-reply-context.ts";
import type { SocialInboxConversationHistory } from "../src/lib/social-inbox.ts";

describe("social reply context", () => {
  it("keeps full known customer and team text as ordered transcript context", () => {
    const context = buildSocialReplyContext({
      history: historyFixture(),
      brand: "HP",
      requestedLanguage: "auto",
      customerName: "Emma",
      staffGuidance: "Push for an appointment if natural.",
    });

    assert.equal(context.contextUsed.messageCount, 3);
    assert.equal(context.contextUsed.commentCount, 0);
    assert.equal(context.transcriptTruncated, false);
    assert.match(context.transcriptText, /Customer \(Emma\): Hi, do you buy 24k gold bars\?/);
    assert.match(context.transcriptText, /Team \(Mia\): Yes, we can assess that in store\./);
    assert.match(context.transcriptText, /Customer \(Emma\): Can I come today around 3\?/);
    assert.match(context.userPrompt, /Push for an appointment if natural/);
    assert.doesNotMatch(context.userPrompt, /threadSummary/);
  });

  it("marks over-cap transcripts as truncated instead of pretending all history was included", () => {
    const context = buildSocialReplyContext({
      history: historyFixture({
        messages: Array.from({ length: 8 }, (_, index) => messageFixture({
          id: `message-${index}`,
          message_id: `mid-${index}`,
          body: `Customer message ${index} with details that take space.`,
          sent_at: `2026-06-01T10:0${index}:00.000Z`,
        })),
      }),
      brand: "HP",
      maxTranscriptChars: 140,
    });

    assert.equal(context.transcriptTruncated, true);
    assert.equal(context.omittedTranscriptItems > 0, true);
    assert.match(context.userPrompt, /omittedOldestItems/);
  });

  it("builds public comment transcript items without message-thread buckets", () => {
    const transcript = buildSocialReplyTranscript({
      messages: [],
      comments: [
        {
          id: "comment-row-1",
          platform: "instagram",
          comment_id: "comment-1",
          parent_comment_id: null,
          page_id: "page-1",
          ig_user_id: "ig-1",
          content_id: "media-1",
          content_permalink: null,
          author_id: "customer-1",
          author_name: "Tina",
          body: "Do you have this ring in store?",
          like_count: 0,
          reply_count: 0,
          created_time: "2026-06-01T10:00:00.000Z",
          last_synced_at: null,
        },
      ],
    });

    assert.deepEqual(transcript.map((item) => item.label), ["Customer (Tina)"]);
    assert.equal(transcript[0]?.body, "Do you have this ring in store?");
  });
});

function historyFixture(
  overrides: Partial<SocialInboxConversationHistory> = {},
): SocialInboxConversationHistory {
  return {
    conversation: {
      id: "33333333-3333-4333-8333-333333333333",
      canonical_conversation_key: "instagram:thread-1",
      source_channel: "instagram_message",
      source_type: "message_thread",
      platform: "instagram",
      customer_profile_id: "profile-1",
      page_id: "page-1",
      ig_user_id: "ig-1",
      participant_id: "customer-1",
      platform_thread_id: "thread-1",
      parent_content_id: null,
      source_id: "thread-1",
      first_inbound_at: "2026-06-01T10:00:00.000Z",
      latest_inbound_at: "2026-06-01T10:05:00.000Z",
      latest_outbound_at: "2026-06-01T10:03:00.000Z",
      last_activity_at: "2026-06-01T10:05:00.000Z",
      needs_reply: true,
      reply_window_expires_at: "2026-06-02T10:05:00.000Z",
      human_agent_window_expires_at: "2026-06-08T10:05:00.000Z",
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
      routing_source: "ai",
      routing_confidence: 0.9,
      routing_explanation: null,
    },
    messages: [
      messageFixture({
        id: "message-1",
        message_id: "mid-1",
        direction: "inbound",
        sender_name: "Emma",
        body: "Hi, do you buy 24k gold bars?",
        sent_at: "2026-06-01T10:00:00.000Z",
      }),
      messageFixture({
        id: "message-2",
        message_id: "mid-2",
        direction: "outbound",
        sender_name: "Mia",
        body: "Yes, we can assess that in store.",
        sent_at: "2026-06-01T10:03:00.000Z",
      }),
      messageFixture({
        id: "message-3",
        message_id: "mid-3",
        direction: "inbound",
        sender_name: "Emma",
        body: "Can I come today around 3?",
        sent_at: "2026-06-01T10:05:00.000Z",
      }),
    ],
    comments: [],
    pageInfo: {
      pageSize: 50,
      returned: 3,
      knownTotal: 3,
      nextCursor: null,
      historyCompleteness: "complete_known_history",
    },
    ...overrides,
  };
}

function messageFixture(overrides: Record<string, unknown>) {
  return {
    id: "message",
    platform: "instagram",
    thread_id: "thread-1",
    message_id: "mid",
    direction: "inbound",
    sender_id: "customer-1",
    sender_name: "Emma",
    recipient_id: "page-1",
    recipient_name: "HP",
    body: "Message body",
    attachments: [],
    sent_at: "2026-06-01T10:00:00.000Z",
    ...overrides,
  } as SocialInboxConversationHistory["messages"][number];
}
