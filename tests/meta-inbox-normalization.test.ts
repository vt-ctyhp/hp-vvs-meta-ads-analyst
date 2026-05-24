import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { buildMetaInboxNormalizationBatch } from "../src/lib/meta-inbox-normalization.ts";

describe("Meta inbox raw normalization", () => {
  it("normalizes a click-to-message webhook into profile, conversation, routing, and first-touch source", () => {
    const batch = buildMetaInboxNormalizationBatch({
      now: new Date("2026-05-23T01:00:00.000Z"),
      threads: [
        {
          id: "thread-row-1",
          platform: "facebook",
          thread_id: "facebook:webhook:page-1:customer-1",
          page_id: "page-1",
          participant_id: "customer-1",
          snippet: "I want cash for gold",
          last_message_at: "2026-05-23T00:00:00.000Z",
        },
      ],
      messages: [
        {
          id: "message-row-1",
          platform: "facebook",
          thread_id: "facebook:webhook:page-1:customer-1",
          message_id: "mid.1",
          direction: "inbound",
          sender_id: "customer-1",
          sender_name: "Viv Customer",
          body: "I want cash for gold",
          sent_at: "2026-05-23T00:00:00.000Z",
          raw_json: {
            sender: {
              id: "customer-1",
              name: "Viv Customer",
              link: "https://facebook.com/customer-1",
              profile_picture_url: "https://cdn.example/avatar.jpg",
            },
            message: {
              text: "I want cash for gold",
              referral: {
                ad_id: "ad-123",
                ref: "Cash for Gold May",
                source_url: "https://fb.me/source",
              },
            },
          },
        },
      ],
    });

    assert.equal(batch.customerProfiles.length, 1);
    assert.deepEqual(batch.customerProfiles[0], {
      profileKey: "facebook:page-1::customer-1",
      platform: "facebook",
      pageId: "page-1",
      igUserId: null,
      participantId: "customer-1",
      displayName: "Viv Customer",
      username: null,
      profilePictureUrl: "https://cdn.example/avatar.jpg",
      profileUrl: "https://facebook.com/customer-1",
      profileReference: "https://facebook.com/customer-1",
      rawProfileJson: {
        sender: {
          id: "customer-1",
          name: "Viv Customer",
          link: "https://facebook.com/customer-1",
          profile_picture_url: "https://cdn.example/avatar.jpg",
        },
        message: {
          text: "I want cash for gold",
          referral: {
            ad_id: "ad-123",
            ref: "Cash for Gold May",
            source_url: "https://fb.me/source",
          },
        },
      },
    });

    assert.equal(batch.conversations.length, 1);
    assert.deepEqual(batch.conversations[0], {
      canonicalConversationKey: "facebook:message_thread:facebook:webhook:page-1:customer-1",
      customerProfileKey: "facebook:page-1::customer-1",
      sourceChannel: "ad_referral",
      sourceType: "ad_referral",
      platform: "facebook",
      rawThreadId: "thread-row-1",
      rawCommentId: null,
      pageId: "page-1",
      igUserId: null,
      participantId: "customer-1",
      platformThreadId: "facebook:webhook:page-1:customer-1",
      parentContentId: null,
      sourceId: "facebook:webhook:page-1:customer-1",
      firstInboundAt: "2026-05-23T00:00:00.000Z",
      latestInboundAt: "2026-05-23T00:00:00.000Z",
      latestOutboundAt: null,
      lastActivityAt: "2026-05-23T00:00:00.000Z",
      needsReply: true,
      replyWindowExpiresAt: "2026-05-24T00:00:00.000Z",
      humanAgentWindowExpiresAt: "2026-05-30T00:00:00.000Z",
      sendEligibility: "standard_reply_allowed",
      conversationStatus: "new_inquiry",
      queueCategoryKey: "cash_for_gold",
      routingSource: "attribution_keyword",
      routingConfidence: 0.85,
      routingExplanation: "Matched cash for gold from first-touch attribution.",
    });

    assert.equal(batch.firstTouchSources.length, 1);
    assert.equal(batch.firstTouchSources[0].adId, "ad-123");
    assert.equal(batch.firstTouchSources[0].ref, "Cash for Gold May");
    assert.equal(batch.firstTouchSources[0].sourcePermalink, "https://fb.me/source");
    assert.equal(batch.firstTouchSources[0].attributionMethod, "meta_referral");
  });

  it("normalizes public comments with source-channel filters independent from queue category", () => {
    const batch = buildMetaInboxNormalizationBatch({
      now: new Date("2026-05-26T00:00:00.000Z"),
      comments: [
        {
          id: "comment-row-1",
          platform: "instagram",
          comment_id: "comment-1",
          ig_user_id: "ig-1",
          content_id: "media-1",
          content_permalink: "https://instagram.com/p/media-1",
          author_name: "Anna Buyer",
          body: "Can I book appointment this weekend?",
          created_time: "2026-05-23T00:00:00.000Z",
          raw_json: {
            value: {
              from: {
                username: "anna_buyer",
              },
            },
          },
        },
      ],
    });

    assert.equal(batch.customerProfiles[0].profileKey, "instagram::ig-1:comment-author:comment-1");
    assert.equal(batch.customerProfiles[0].displayName, "Anna Buyer");
    assert.equal(batch.customerProfiles[0].username, "anna_buyer");
    assert.equal(batch.conversations[0].sourceChannel, "instagram_public_comment");
    assert.equal(batch.conversations[0].queueCategoryKey, "book_appointment");
    assert.equal(batch.conversations[0].sendEligibility, "human_agent_allowed");
    assert.equal(batch.firstTouchSources[0].sourceCommentId, "comment-1");
    assert.equal(batch.firstTouchSources[0].sourcePermalink, "https://instagram.com/p/media-1");
  });

  it("marks old conversations expired when no reply window remains", () => {
    const batch = buildMetaInboxNormalizationBatch({
      now: new Date("2026-06-01T00:00:00.000Z"),
      threads: [
        {
          id: "thread-row-2",
          platform: "instagram",
          thread_id: "ig-thread-1",
          ig_user_id: "ig-1",
          participant_id: "customer-2",
          participant_name: "Expired Customer",
          last_message_at: "2026-05-20T00:00:00.000Z",
        },
      ],
      messages: [
        {
          id: "message-row-2",
          platform: "instagram",
          thread_id: "ig-thread-1",
          direction: "inbound",
          sender_id: "customer-2",
          sender_name: "Expired Customer",
          body: "price?",
          sent_at: "2026-05-20T00:00:00.000Z",
        },
      ],
    });

    assert.equal(batch.conversations[0].sourceChannel, "instagram_message");
    assert.equal(batch.conversations[0].sendEligibility, "expired");
    assert.equal(batch.conversations[0].queueCategoryKey, "general_inquiry");
  });
});
