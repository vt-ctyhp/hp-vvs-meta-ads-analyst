import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  buildMetaInboxMobileConversationItems,
  buildMetaInboxQueueItems,
} from "../src/lib/meta-inbox-queue-view.ts";
import type { SocialInboxData } from "../src/lib/social-inbox.ts";

describe("Meta inbox canonical queue view", () => {
  it("renders normalized conversations with profile and source data when raw thread rows are capped out", () => {
    const queue = buildMetaInboxQueueItems({
      ...emptyInboxData(),
      inboxConversations: [
        {
          id: "conversation-1",
          canonical_conversation_key: "facebook:thread:customer-1",
          source_channel: "facebook_message",
          source_type: "message_thread",
          platform: "facebook",
          customer_profile_id: "profile-1",
          page_id: "100615618793615",
          ig_user_id: null,
          participant_id: "customer-1",
          platform_thread_id: "thread-capped-out",
          parent_content_id: null,
          source_id: "thread-capped-out",
          first_inbound_at: "2026-05-23T09:00:00.000Z",
          latest_inbound_at: "2026-05-23T09:02:00.000Z",
          latest_outbound_at: null,
          last_activity_at: "2026-05-23T09:02:00.000Z",
          needs_reply: true,
          reply_window_expires_at: "2026-05-24T09:02:00.000Z",
          human_agent_window_expires_at: "2026-05-30T09:02:00.000Z",
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
          routing_source: "ad_attribution",
          routing_confidence: 0.96,
          routing_explanation: "Cash for Gold because first touch came from campaign HP Cash.",
        },
      ],
      customerProfiles: [
        {
          id: "profile-1",
          platform: "facebook",
          page_id: "100615618793615",
          ig_user_id: null,
          participant_id: "customer-1",
          display_name: "Ada Customer",
          username: "ada.customer",
          profile_picture_url: null,
          profile_url: "https://facebook.com/ada.customer",
          profile_reference: "facebook:customer-1",
          last_profile_synced_at: "2026-05-23T09:01:00.000Z",
        },
      ],
      firstTouchSources: [
        {
          id: "source-1",
          conversation_id: "conversation-1",
          first_message_id: "message-1",
          first_message_at: "2026-05-23T09:00:00.000Z",
          ad_id: "ad-1",
          ref: "cash-for-gold",
          source_post_id: "post-1",
          source_media_id: null,
          source_comment_id: null,
          source_product_id: null,
          source_permalink: "https://facebook.com/post-1",
          campaign_umbrella_id: "cash-umbrella",
          campaign_id: "campaign-1",
          adset_id: "adset-1",
          creative_id: "creative-1",
          attribution_method: "webhook_referral",
          attribution_confidence: 0.96,
          creative_image_url: null,
          ad_title: null,
        },
      ],
    });

    assert.equal(queue.length, 1);
    assert.equal(queue[0].id, "conversation:conversation-1");
    assert.equal(queue[0].sourceId, "thread-capped-out");
    assert.equal(queue[0].sender, "Ada Customer");
    assert.equal(queue[0].brand, "HP");
    assert.equal(queue[0].type, "message");
    assert.equal(queue[0].sourceChannel, "facebook_message");
    assert.equal(queue[0].queueCategoryKey, "cash_for_gold");
    assert.equal(queue[0].status, "Needs reply");
    assert.equal(queue[0].routingExplanation, "Cash for Gold because first touch came from campaign HP Cash.");
    assert.equal(queue[0].profile?.profile_url, "https://facebook.com/ada.customer");
    assert.equal(queue[0].firstTouch?.ad_id, "ad-1");
  });

  it("builds mobile links from normalized conversation IDs instead of raw source IDs", () => {
    const items = buildMetaInboxMobileConversationItems({
      ...emptyInboxData(),
      threads: [
        {
          id: "thread-row-1",
          platform: "facebook",
          page_id: "page-1",
          ig_user_id: null,
          thread_id: "raw-thread-1",
          participant_id: "customer-1",
          participant_name: "Raw Name",
          snippet: "Raw snippet",
          unread_count: 1,
          message_count: 4,
          last_message_at: "2026-05-23T09:01:00.000Z",
          last_synced_at: "2026-05-23T09:01:30.000Z",
        },
      ],
      inboxConversations: [
        {
          id: "conversation-1",
          canonical_conversation_key: "facebook:thread:customer-1",
          source_channel: "facebook_message",
          source_type: "message_thread",
          platform: "facebook",
          customer_profile_id: null,
          page_id: "page-1",
          ig_user_id: null,
          participant_id: "customer-1",
          platform_thread_id: "raw-thread-1",
          parent_content_id: null,
          source_id: "raw-thread-1",
          first_inbound_at: "2026-05-23T09:00:00.000Z",
          latest_inbound_at: "2026-05-23T09:01:00.000Z",
          latest_outbound_at: null,
          last_activity_at: "2026-05-23T09:01:00.000Z",
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
          routing_source: null,
          routing_confidence: null,
          routing_explanation: null,
        },
      ],
    });

    assert.equal(items.length, 1);
    assert.equal(items[0].href, "/m/inbox/conversation-1");
    assert.equal(items[0].legacySourceHref, "/m/inbox/t-raw-thread-1");
  });

  it("ignores raw Meta unread counts when normalized reply state is waiting on customer", () => {
    const inboxData = {
      ...emptyInboxData(),
      threads: [
        rawThread({
          id: "thread-row-nhu",
          thread_id: "t_nhu",
          participant_id: "psid-nhu",
          participant_name: "Nhu Bui",
          unread_count: 60,
          last_message_at: "2026-05-26T14:47:51.000Z",
        }),
      ],
      inboxConversations: [
        {
          ...normalizedConversation({
            id: "conversation-nhu",
            platform_thread_id: "t_nhu",
            participant_id: "psid-nhu",
            customer_profile_id: null,
          }),
          latest_inbound_at: "2026-05-26T14:38:13.000Z",
          latest_outbound_at: "2026-05-26T14:47:51.000Z",
          last_activity_at: "2026-05-26T14:47:51.000Z",
          needs_reply: false,
          conversation_status: "waiting_on_customer" as const,
        },
      ],
    };

    const queue = buildMetaInboxQueueItems(inboxData);
    const mobileItems = buildMetaInboxMobileConversationItems(inboxData);

    assert.equal(queue.length, 1);
    assert.equal(queue[0].sender, "Nhu Bui");
    assert.equal(queue[0].status, "Synced");
    assert.equal(mobileItems[0].status, "Synced");
  });

  it("renders normalized public comment conversations even when raw comment rows are capped out", () => {
    const queue = buildMetaInboxQueueItems({
      ...emptyInboxData(),
      inboxConversations: [
        {
          id: "conversation-comment-1",
          canonical_conversation_key: "instagram:comment:comment-1",
          source_channel: "instagram_public_comment",
          source_type: "public_comment",
          platform: "instagram",
          customer_profile_id: "profile-ig-1",
          page_id: null,
          ig_user_id: "17841473309777050",
          participant_id: "ig-customer-1",
          platform_thread_id: null,
          parent_content_id: "media-1",
          source_id: "comment-1",
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
          queue_category_key: "vn_product",
          routing_source: "campaign_rule",
          routing_confidence: 0.8,
          routing_explanation: "VN Product because the source media matched a VN campaign.",
        },
      ],
      customerProfiles: [
        {
          id: "profile-ig-1",
          platform: "instagram",
          page_id: null,
          ig_user_id: "17841473309777050",
          participant_id: "ig-customer-1",
          display_name: "IG Customer",
          username: "ig.customer",
          profile_picture_url: null,
          profile_url: null,
          profile_reference: "instagram:ig-customer-1",
          last_profile_synced_at: null,
        },
      ],
    });

    assert.equal(queue.length, 1);
    assert.equal(queue[0].id, "conversation:conversation-comment-1");
    assert.equal(queue[0].type, "comment");
    assert.equal(queue[0].sender, "IG Customer");
    assert.equal(queue[0].sourceChannel, "instagram_public_comment");
    assert.equal(queue[0].queueCategoryKey, "vn_product");
    assert.equal(queue[0].sourceId, "comment-1");
  });
});

describe("Meta inbox raw-thread participant dedup", () => {
  it("collapses two raw threads with the same (platform, page_id, participant_id) — named version wins", () => {
    const queue = buildMetaInboxQueueItems({
      ...emptyInboxData(),
      threads: [
        rawThread({
          id: "thread-row-webhook",
          thread_id: "facebook:webhook:100615618793615:27355382180747029",
          participant_name: null,
          last_message_at: "2026-05-26T14:32:56.000Z",
        }),
        rawThread({
          id: "thread-row-graph",
          thread_id: "t_1306976474238038",
          participant_name: "Maxine Gathwright",
          last_message_at: "2026-05-26T14:33:00.000Z",
        }),
      ],
    });

    assert.equal(queue.length, 1);
    assert.equal(queue[0].sender, "Maxine Gathwright");
    assert.equal(queue[0].sourceId, "t_1306976474238038");
  });

  it("hides a webhook-format raw thread when a normalized conversation covers the same (page_id, participant_id)", () => {
    const queue = buildMetaInboxQueueItems({
      ...emptyInboxData(),
      inboxConversations: [
        normalizedConversation({
          id: "conversation-1",
          platform_thread_id: "t_1306976474238038",
          participant_id: "27355382180747029",
          customer_profile_id: "profile-1",
        }),
      ],
      customerProfiles: [
        customerProfile({
          id: "profile-1",
          participant_id: "27355382180747029",
          display_name: "Maxine Gathwright",
        }),
      ],
      threads: [
        rawThread({
          id: "thread-row-webhook",
          thread_id: "facebook:webhook:100615618793615:27355382180747029",
          participant_name: null,
          last_message_at: "2026-05-26T14:32:56.000Z",
        }),
        rawThread({
          id: "thread-row-graph",
          thread_id: "t_1306976474238038",
          participant_name: "Maxine Gathwright",
          last_message_at: "2026-05-26T14:33:00.000Z",
        }),
      ],
    });

    assert.equal(queue.length, 1);
    assert.equal(queue[0].id, "conversation:conversation-1");
    assert.equal(queue[0].sender, "Maxine Gathwright");
  });

  it("keeps raw threads with different participants separate", () => {
    const queue = buildMetaInboxQueueItems({
      ...emptyInboxData(),
      threads: [
        rawThread({
          id: "thread-a",
          thread_id: "t_aaa",
          participant_id: "psid-a",
          participant_name: "Customer A",
          last_message_at: "2026-05-26T14:00:00.000Z",
        }),
        rawThread({
          id: "thread-b",
          thread_id: "t_bbb",
          participant_id: "psid-b",
          participant_name: "Customer B",
          last_message_at: "2026-05-26T13:00:00.000Z",
        }),
      ],
    });

    assert.equal(queue.length, 2);
    const senders = queue.map((q) => q.sender).sort();
    assert.deepEqual(senders, ["Customer A", "Customer B"]);
  });

  it("does not promote raw thread unread counts into operator urgency", () => {
    const queue = buildMetaInboxQueueItems({
      ...emptyInboxData(),
      threads: [
        rawThread({
          id: "thread-unread",
          thread_id: "t_unread",
          participant_id: "psid-unread",
          participant_name: "Raw Unread",
          unread_count: 3,
          last_message_at: "2026-05-26T14:00:00.000Z",
        }),
      ],
    });

    assert.equal(queue.length, 1);
    assert.equal(queue[0].sender, "Raw Unread");
    assert.equal(queue[0].status, "Synced");
  });

  it("does not dedup raw threads with null participant_id (keeps them all)", () => {
    const queue = buildMetaInboxQueueItems({
      ...emptyInboxData(),
      threads: [
        rawThread({
          id: "thread-x",
          thread_id: "t_xxx",
          participant_id: null,
          participant_name: null,
          last_message_at: "2026-05-26T14:00:00.000Z",
        }),
        rawThread({
          id: "thread-y",
          thread_id: "t_yyy",
          participant_id: null,
          participant_name: null,
          last_message_at: "2026-05-26T13:00:00.000Z",
        }),
      ],
    });

    assert.equal(queue.length, 2);
  });
});

function rawThread(overrides: {
  id: string;
  thread_id: string;
  participant_id?: string | null;
  participant_name?: string | null;
  last_message_at?: string | null;
  page_id?: string | null;
  unread_count?: number;
}) {
  return {
    id: overrides.id,
    platform: "facebook" as const,
    thread_id: overrides.thread_id,
    page_id: overrides.page_id !== undefined ? overrides.page_id : "100615618793615",
    ig_user_id: null,
    participant_id:
      overrides.participant_id !== undefined ? overrides.participant_id : "27355382180747029",
    participant_name:
      overrides.participant_name !== undefined ? overrides.participant_name : null,
    snippet: null,
    message_count: 1,
    unread_count: overrides.unread_count || 0,
    last_message_at: overrides.last_message_at || null,
    last_synced_at: null,
  };
}

function normalizedConversation(overrides: {
  id: string;
  platform_thread_id: string;
  participant_id: string;
  customer_profile_id: string | null;
}) {
  return {
    id: overrides.id,
    canonical_conversation_key: `facebook:message_thread:${overrides.platform_thread_id}`,
    source_channel: "facebook_message" as const,
    source_type: "message_thread" as const,
    platform: "facebook" as const,
    customer_profile_id: overrides.customer_profile_id,
    page_id: "100615618793615",
    ig_user_id: null,
    participant_id: overrides.participant_id,
    platform_thread_id: overrides.platform_thread_id,
    parent_content_id: null,
    source_id: overrides.platform_thread_id,
    first_inbound_at: "2026-05-26T14:32:56.000Z",
    latest_inbound_at: "2026-05-26T14:32:56.000Z",
    latest_outbound_at: null,
    last_activity_at: "2026-05-26T14:32:56.000Z",
    needs_reply: true,
    reply_window_expires_at: "2026-05-27T14:32:56.000Z",
    human_agent_window_expires_at: "2026-06-02T14:32:56.000Z",
    send_eligibility: "standard_reply_allowed" as const,
    conversation_status: "needs_reply" as const,
    assigned_team_id: null,
    assigned_user_id: null,
    follow_up_at: null,
    lead_quality: null,
    lead_quality_reason_tags: [],
    inbox_outcome: "no_outcome_yet" as const,
    inbox_lost_reason: null,
    queue_category_key: "general_inquiry" as const,
    routing_source: "fallback",
    routing_confidence: 0.35,
    routing_explanation: "test",
  };
}

function customerProfile(overrides: {
  id: string;
  participant_id: string;
  display_name: string | null;
}) {
  return {
    id: overrides.id,
    platform: "facebook" as const,
    page_id: "100615618793615",
    ig_user_id: null,
    participant_id: overrides.participant_id,
    display_name: overrides.display_name,
    username: null,
    profile_picture_url: null,
    profile_url: null,
    profile_reference: overrides.display_name || overrides.participant_id,
    last_profile_synced_at: null,
  };
}

function emptyInboxData(): SocialInboxData {
  return {
    queueAccess: {
      mode: "all",
      allowedQueueCategoryKeys: null,
      reason: "unscoped_internal_read",
    },
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
