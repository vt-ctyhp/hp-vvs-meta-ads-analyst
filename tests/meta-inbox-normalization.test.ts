import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  applyCampaignUmbrellaRouting,
  buildMetaInboxNormalizationBatch,
  type MetaAdsLookupRow,
} from "../src/lib/meta-inbox-normalization.ts";

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
      canonicalConversationKey: "facebook:message_thread:page-1:customer-1",
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
      queueCategoryKey: "general_inquiry",
      routingSource: "fallback",
      routingConfidence: 0.35,
      routingExplanation: "No ad attribution captured — routed to General Inquiry.",
    });

    assert.equal(batch.firstTouchSources.length, 1);
    assert.equal(batch.firstTouchSources[0].adId, "ad-123");
    assert.equal(batch.firstTouchSources[0].ref, "Cash for Gold May");
    assert.equal(batch.firstTouchSources[0].sourcePermalink, "https://fb.me/source");
    assert.equal(batch.firstTouchSources[0].attributionMethod, "meta_referral");

    // Once the ad lookup resolves to a campaign umbrella, the second pass
    // upgrades the routing to the matching queue.
    const adLookup = new Map<string, MetaAdsLookupRow>([
      [
        "ad-123",
        {
          ad_id: "ad-123",
          campaign_id: "campaign-1",
          ad_set_id: "adset-1",
          creative_id: "creative-1",
          campaign_name: "Whatever the analyst named it",
          ad_set_name: null,
          campaign_umbrella: "Cash for Gold US",
        },
      ],
    ]);
    const enriched = applyCampaignUmbrellaRouting(batch, adLookup);
    assert.equal(enriched.conversations[0].queueCategoryKey, "cash_for_gold");
    assert.equal(enriched.conversations[0].routingSource, "campaign_umbrella");
    assert.equal(enriched.conversations[0].routingConfidence, 0.85);
    assert.equal(
      enriched.conversations[0].routingExplanation,
      "Routed by campaign umbrella: Cash for Gold US.",
    );
    assert.equal(enriched.firstTouchSources[0].campaignUmbrellaId, "Cash for Gold US");
    assert.equal(enriched.firstTouchSources[0].campaignId, "campaign-1");
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
    // No ad attribution on this comment → falls back to general_inquiry
    // under the umbrella-only routing rule (no message-keyword matching).
    assert.equal(batch.conversations[0].queueCategoryKey, "general_inquiry");
    assert.equal(batch.conversations[0].routingSource, "fallback");
    assert.equal(batch.conversations[0].sendEligibility, "human_agent_allowed");
    assert.equal(batch.firstTouchSources[0].sourceCommentId, "comment-1");
    assert.equal(batch.firstTouchSources[0].sourcePermalink, "https://instagram.com/p/media-1");
  });

  it("normalizes public comment replies under the root comment conversation", () => {
    const batch = buildMetaInboxNormalizationBatch({
      now: new Date("2026-05-24T00:00:00.000Z"),
      comments: [
        {
          id: "row-root",
          platform: "facebook",
          comment_id: "comment-root",
          parent_comment_id: null,
          page_id: "page-1",
          content_id: "post-1",
          content_permalink: "https://facebook.com/post-1",
          author_id: "customer-root",
          author_name: "Root Customer",
          body: "Is this ring available?",
          created_time: "2026-05-23T10:00:00.000Z",
          raw_json: { permalink_url: "https://facebook.com/comment-root" },
        },
        {
          id: "row-reply-1",
          platform: "facebook",
          comment_id: "comment-reply-1",
          parent_comment_id: "comment-root",
          page_id: "page-1",
          content_id: "post-1",
          content_permalink: "https://facebook.com/comment-reply-1",
          author_id: "customer-reply",
          author_name: "Reply Customer",
          body: "Following up on this.",
          created_time: "2026-05-23T10:02:00.000Z",
          raw_json: { permalink_url: "https://facebook.com/comment-reply-1" },
        },
      ],
    });

    assert.equal(batch.conversations.length, 1);
    assert.equal(
      batch.conversations[0].canonicalConversationKey,
      "facebook:public_comment:comment-root",
    );
    assert.equal(batch.conversations[0].sourceId, "comment-root");
    assert.equal(batch.conversations[0].rawCommentId, "row-root");
    assert.equal(batch.conversations[0].firstInboundAt, "2026-05-23T10:00:00.000Z");
    assert.equal(batch.conversations[0].latestInboundAt, "2026-05-23T10:02:00.000Z");
    assert.equal(batch.conversations[0].lastActivityAt, "2026-05-23T10:02:00.000Z");
    assert.equal(batch.firstTouchSources.length, 1);
    assert.equal(batch.firstTouchSources[0].sourceCommentId, "comment-root");
    assert.equal(batch.firstTouchSources[0].sourcePermalink, "https://facebook.com/post-1");
  });

  it("keeps orphan public comment replies visible in a review fallback conversation", () => {
    const batch = buildMetaInboxNormalizationBatch({
      now: new Date("2026-05-24T00:00:00.000Z"),
      comments: [
        {
          id: "row-orphan-1",
          platform: "facebook",
          comment_id: "comment-reply-1",
          parent_comment_id: "missing-root",
          page_id: "page-1",
          content_id: "post-1",
          author_id: "customer-1",
          author_name: "First Reply",
          body: "Can you help?",
          created_time: "2026-05-23T10:01:00.000Z",
          raw_json: {},
        },
        {
          id: "row-orphan-2",
          platform: "facebook",
          comment_id: "comment-reply-2",
          parent_comment_id: "missing-root",
          page_id: "page-1",
          content_id: "post-1",
          author_id: "customer-2",
          author_name: "Second Reply",
          body: "I need the details too.",
          created_time: "2026-05-23T10:03:00.000Z",
          raw_json: {},
        },
      ],
    });

    assert.equal(batch.conversations.length, 1);
    assert.equal(
      batch.conversations[0].canonicalConversationKey,
      "facebook:public_comment:missing-root",
    );
    assert.equal(batch.conversations[0].sourceId, "missing-root");
    assert.equal(batch.conversations[0].firstInboundAt, "2026-05-23T10:01:00.000Z");
    assert.equal(batch.conversations[0].latestInboundAt, "2026-05-23T10:03:00.000Z");
    assert.equal(batch.conversations[0].queueCategoryKey, "uncategorized_needs_review");
    assert.equal(batch.conversations[0].routingExplanation, "Root comment missing; needs human review.");
    assert.equal(batch.firstTouchSources[0].sourceCommentId, "missing-root");
  });

  it("derives the same canonical key for webhook and polled inputs of the same participant", () => {
    const webhookBatch = buildMetaInboxNormalizationBatch({
      now: new Date("2026-05-23T01:00:00.000Z"),
      threads: [
        {
          id: "thread-row-webhook",
          platform: "facebook",
          thread_id: "facebook:webhook:page-1:customer-1",
          page_id: "page-1",
          participant_id: "customer-1",
          last_message_at: "2026-05-23T00:00:00.000Z",
        },
      ],
      messages: [
        {
          id: "message-row-webhook",
          platform: "facebook",
          thread_id: "facebook:webhook:page-1:customer-1",
          message_id: "mid.1",
          direction: "inbound",
          sender_id: "customer-1",
          sender_name: "Viv Customer",
          body: "hello",
          sent_at: "2026-05-23T00:00:00.000Z",
        },
      ],
    });
    const polledBatch = buildMetaInboxNormalizationBatch({
      now: new Date("2026-05-23T01:00:00.000Z"),
      threads: [
        {
          id: "thread-row-polled",
          platform: "facebook",
          thread_id: "t_1814121942489626",
          page_id: "page-1",
          participant_id: "customer-1",
          participant_name: "Viv Customer",
          last_message_at: "2026-05-23T00:00:00.000Z",
        },
      ],
      messages: [
        {
          id: "message-row-polled",
          platform: "facebook",
          thread_id: "t_1814121942489626",
          message_id: "mid.1",
          direction: "inbound",
          sender_id: "customer-1",
          sender_name: "Viv Customer",
          body: "hello",
          sent_at: "2026-05-23T00:00:00.000Z",
        },
      ],
    });
    assert.equal(
      webhookBatch.conversations[0].canonicalConversationKey,
      "facebook:message_thread:page-1:customer-1",
    );
    assert.equal(
      polledBatch.conversations[0].canonicalConversationKey,
      webhookBatch.conversations[0].canonicalConversationKey,
    );
    assert.equal(
      webhookBatch.conversations[0].platformThreadId,
      "facebook:webhook:page-1:customer-1",
    );
    assert.equal(polledBatch.conversations[0].platformThreadId, "t_1814121942489626");
  });

  it("uses ig_user_id as the business identity for Instagram message threads", () => {
    const batch = buildMetaInboxNormalizationBatch({
      now: new Date("2026-05-23T01:00:00.000Z"),
      threads: [
        {
          id: "thread-row-ig",
          platform: "instagram",
          thread_id: "ig-thread-arbitrary",
          ig_user_id: "ig-1",
          participant_id: "ig-customer-1",
          last_message_at: "2026-05-23T00:00:00.000Z",
        },
      ],
      messages: [
        {
          id: "message-row-ig",
          platform: "instagram",
          thread_id: "ig-thread-arbitrary",
          direction: "inbound",
          sender_id: "ig-customer-1",
          body: "hello",
          sent_at: "2026-05-23T00:00:00.000Z",
        },
      ],
    });
    assert.equal(
      batch.conversations[0].canonicalConversationKey,
      "instagram:message_thread:ig-1:ig-customer-1",
    );
  });

  it("falls back to the thread id when business identity is missing", () => {
    const batch = buildMetaInboxNormalizationBatch({
      now: new Date("2026-05-23T01:00:00.000Z"),
      threads: [
        {
          id: "thread-row-orphan",
          platform: "facebook",
          thread_id: "t_orphan",
          last_message_at: "2026-05-23T00:00:00.000Z",
        },
      ],
      messages: [
        {
          id: "message-row-orphan",
          platform: "facebook",
          thread_id: "t_orphan",
          direction: "inbound",
          body: "hello",
          sent_at: "2026-05-23T00:00:00.000Z",
        },
      ],
    });
    assert.equal(
      batch.conversations[0].canonicalConversationKey,
      "facebook:message_thread:t_orphan",
    );
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

  it("applyCampaignUmbrellaRouting maps every umbrella to the right queue", () => {
    const umbrellaCases: ReadonlyArray<{
      adId: string;
      umbrella: string;
      expectedQueue: string;
      expectedSource: "campaign_umbrella" | "fallback";
    }> = [
      { adId: "ad-c4g", umbrella: "Cash for Gold US", expectedQueue: "cash_for_gold", expectedSource: "campaign_umbrella" },
      { adId: "ad-book", umbrella: "Book Appts US", expectedQueue: "book_appointment", expectedSource: "campaign_umbrella" },
      { adId: "ad-us-prod", umbrella: "Facebook US Product", expectedQueue: "us_product", expectedSource: "campaign_umbrella" },
      { adId: "ad-vn-prod", umbrella: "Facebook VN Product", expectedQueue: "vn_product", expectedSource: "campaign_umbrella" },
      { adId: "ad-us-promo", umbrella: "US Promotions (WKDS / OOAK)", expectedQueue: "us_promotions", expectedSource: "campaign_umbrella" },
      { adId: "ad-vn-promo", umbrella: "VN Promotions (WKDS / OOAK)", expectedQueue: "vn_promotions", expectedSource: "campaign_umbrella" },
      // "Excluded / Non-umbrella" and "Needs review" have no queue mapping —
      // routing keeps the initial fallback bucket (general_inquiry here,
      // since the thread carries inbound text).
      { adId: "ad-excluded", umbrella: "Excluded / Non-umbrella", expectedQueue: "general_inquiry", expectedSource: "fallback" },
      { adId: "ad-needs-review", umbrella: "Needs review", expectedQueue: "general_inquiry", expectedSource: "fallback" },
    ];

    for (const testCase of umbrellaCases) {
      const batch = buildMetaInboxNormalizationBatch({
        now: new Date("2026-05-26T01:00:00.000Z"),
        threads: [
          {
            id: `thread-${testCase.adId}`,
            platform: "facebook",
            thread_id: `facebook:webhook:page-1:${testCase.adId}`,
            page_id: "page-1",
            participant_id: `customer-${testCase.adId}`,
            snippet: "hello",
            last_message_at: "2026-05-26T00:00:00.000Z",
          },
        ],
        messages: [
          {
            id: `message-${testCase.adId}`,
            platform: "facebook",
            thread_id: `facebook:webhook:page-1:${testCase.adId}`,
            message_id: `mid.${testCase.adId}`,
            direction: "inbound",
            sender_id: `customer-${testCase.adId}`,
            body: "hello",
            sent_at: "2026-05-26T00:00:00.000Z",
            raw_json: { message: { referral: { ad_id: testCase.adId } } },
          },
        ],
      });
      const adLookup = new Map<string, MetaAdsLookupRow>([
        [
          testCase.adId,
          {
            ad_id: testCase.adId,
            campaign_id: null,
            ad_set_id: null,
            creative_id: null,
            campaign_name: null,
            ad_set_name: null,
            campaign_umbrella: testCase.umbrella,
          },
        ],
      ]);
      const enriched = applyCampaignUmbrellaRouting(batch, adLookup);
      assert.equal(
        enriched.conversations[0].queueCategoryKey,
        testCase.expectedQueue,
        `umbrella '${testCase.umbrella}' should route to '${testCase.expectedQueue}'`,
      );
      assert.equal(
        enriched.conversations[0].routingSource,
        testCase.expectedSource,
        `umbrella '${testCase.umbrella}' should use routingSource '${testCase.expectedSource}'`,
      );
    }
  });

  it("applyCampaignUmbrellaRouting falls back to regex classification when meta_ads.campaign_umbrella is null", () => {
    const batch = buildMetaInboxNormalizationBatch({
      now: new Date("2026-05-26T01:00:00.000Z"),
      threads: [
        {
          id: "thread-fallback-1",
          platform: "facebook",
          thread_id: "facebook:webhook:page-1:fallback",
          page_id: "page-1",
          participant_id: "customer-fallback",
          snippet: "hi",
          last_message_at: "2026-05-26T00:00:00.000Z",
        },
      ],
      messages: [
        {
          id: "message-fallback-1",
          platform: "facebook",
          thread_id: "facebook:webhook:page-1:fallback",
          message_id: "mid.fallback",
          direction: "inbound",
          sender_id: "customer-fallback",
          body: "hi",
          sent_at: "2026-05-26T00:00:00.000Z",
          raw_json: { message: { referral: { ad_id: "ad-new" } } },
        },
      ],
    });
    // Brand-new ad not yet stamped by the analyst sync: stored umbrella is
    // null, so enrichment falls back to in-place regex classification of
    // the campaign + ad-set names.
    const adLookup = new Map<string, MetaAdsLookupRow>([
      [
        "ad-new",
        {
          ad_id: "ad-new",
          campaign_id: "campaign-new",
          ad_set_id: "adset-new",
          creative_id: "creative-new",
          campaign_name: "Cash for Gold US — May launch",
          ad_set_name: null,
          campaign_umbrella: null,
        },
      ],
    ]);
    const enriched = applyCampaignUmbrellaRouting(batch, adLookup);
    assert.equal(enriched.conversations[0].queueCategoryKey, "cash_for_gold");
    assert.equal(enriched.conversations[0].routingSource, "campaign_umbrella");
    assert.equal(enriched.firstTouchSources[0].campaignUmbrellaId, "Cash for Gold US");
  });
});
