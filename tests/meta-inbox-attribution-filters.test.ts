import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

import { buildMetaInboxManagerDashboard } from "../src/lib/meta-inbox-manager-dashboard.ts";
import type {
  SocialInboxConversation,
  SocialInboxData,
  SocialInboxFirstTouchSource,
  SocialInboxSendAttempt,
} from "../src/lib/social-inbox.ts";

const DESKTOP_INBOX = readFileSync("src/components/social-inbox-client.tsx", "utf8");
const QUEUE_RAIL = readFileSync("src/components/v2/inbox/queue-rail.tsx", "utf8");
const DETAILS_DRAWER = readFileSync("src/components/v2/inbox/details-drawer-panel.tsx", "utf8");
const INBOX_FILTERS = readFileSync("src/components/v2/inbox/use-inbox-filters.ts", "utf8");

describe("Meta inbox attribution filters", () => {
  it("rolls manager health up by campaign umbrella, ad, and creative", () => {
    const dashboard = buildMetaInboxManagerDashboard(attributionDataFixture(), {
      now: "2026-05-24T12:00:00.000Z",
    });

    assert.deepEqual(
      dashboard.byCampaignUmbrella.map((row) => [
        row.key,
        row.label,
        row.totalConversations,
        row.needsReply,
        row.failedSends,
      ]),
      [
        ["cash-may", "cash-may", 2, 1, 1],
        ["custom-may", "custom-may", 1, 1, 0],
        ["unattributed", "Unattributed", 1, 1, 0],
      ],
    );
    assert.deepEqual(
      dashboard.byAd.map((row) => [row.key, row.label, row.totalConversations]),
      [
        ["ad-cash-001", "Cash May Creative A · ad-cash-001", 1],
        ["ad-custom-001", "Custom May · ad-custom-001", 1],
        ["ad-cash-002", "Cash May Creative B · ad-cash-002", 1],
      ],
    );
    assert.deepEqual(
      dashboard.byCreative.map((row) => [row.key, row.totalConversations]),
      [
        ["creative-cash-a", 1],
        ["creative-custom-a", 1],
        ["creative-cash-b", 1],
      ],
    );
    assert.equal(dashboard.byCampaignUmbrella[0].averageAttributionConfidence, 0.86);
  });

  it("surfaces campaign umbrella, ad, and creative filters in the inbox queue", () => {
    assert.match(DESKTOP_INBOX, /campaignUmbrellaFilter/);
    assert.match(INBOX_FILTERS, /adFilter/);
    assert.match(INBOX_FILTERS, /creativeFilter/);
    assert.match(QUEUE_RAIL, /Campaign Umbrella/);
    assert.match(QUEUE_RAIL, /All Campaign Umbrellas/);
    assert.doesNotMatch(DESKTOP_INBOX, /All Ads/);
    assert.doesNotMatch(DESKTOP_INBOX, /All Creatives/);
    assert.match(INBOX_FILTERS, /buildAttributionFilterOptions/);
    assert.match(INBOX_FILTERS, /item\.firstTouch\?\.campaign_umbrella_id/);
    assert.match(INBOX_FILTERS, /item\.firstTouch\?\.ad_id/);
    assert.match(INBOX_FILTERS, /item\.firstTouch\?\.creative_id/);
    assert.match(DETAILS_DRAWER, /First Touch/);
    assert.match(DETAILS_DRAWER, /Umbrella/);
  });
});

function attributionDataFixture(): SocialInboxData {
  return {
    queueAccess: { mode: "all", allowedQueueCategoryKeys: null, reason: "full_access_role" },
    threads: [],
    messages: [],
    comments: [],
    customerProfiles: [],
    customerContactMethods: [],
    syncRuns: [],
    commentActions: [],
    conversationEvents: [],
    savedReplies: [],
    notes: [],
    qaScorecards: [],
    inboxConversations: [
      conversationFixture({
        id: "conversation-cash-a",
        queue_category_key: "cash_for_gold",
        needs_reply: true,
        latest_inbound_at: "2026-05-24T11:00:00.000Z",
        last_activity_at: "2026-05-24T11:00:00.000Z",
      }),
      conversationFixture({
        id: "conversation-cash-b",
        queue_category_key: "cash_for_gold",
        first_inbound_at: "2026-05-24T08:00:00.000Z",
        latest_outbound_at: "2026-05-24T09:00:00.000Z",
        last_activity_at: "2026-05-24T09:00:00.000Z",
      }),
      conversationFixture({
        id: "conversation-custom",
        queue_category_key: "custom_jewelry",
        needs_reply: true,
        latest_inbound_at: "2026-05-24T10:00:00.000Z",
        last_activity_at: "2026-05-24T10:00:00.000Z",
      }),
      conversationFixture({
        id: "conversation-organic",
        queue_category_key: "general_inquiry",
        needs_reply: true,
        latest_inbound_at: "2026-05-24T10:30:00.000Z",
        last_activity_at: "2026-05-24T10:30:00.000Z",
      }),
    ],
    firstTouchSources: [
      firstTouchFixture({
        conversation_id: "conversation-cash-a",
        campaign_umbrella_id: "cash-may",
        campaign_id: "campaign-cash",
        adset_id: "adset-cash",
        ad_id: "ad-cash-001",
        creative_id: "creative-cash-a",
        ref: "Cash May Creative A",
        attribution_confidence: 0.91,
      }),
      firstTouchFixture({
        conversation_id: "conversation-cash-b",
        campaign_umbrella_id: "cash-may",
        campaign_id: "campaign-cash",
        adset_id: "adset-cash",
        ad_id: "ad-cash-002",
        creative_id: "creative-cash-b",
        ref: "Cash May Creative B",
        attribution_confidence: 0.81,
      }),
      firstTouchFixture({
        conversation_id: "conversation-custom",
        campaign_umbrella_id: "custom-may",
        campaign_id: "campaign-custom",
        adset_id: "adset-custom",
        ad_id: "ad-custom-001",
        creative_id: "creative-custom-a",
        ref: "Custom May",
        attribution_confidence: 0.7,
      }),
    ],
    sendAttempts: [
      sendAttemptFixture({
        conversation_id: "conversation-cash-b",
        status: "failed_terminal",
      }),
    ],
  };
}

function conversationFixture(
  overrides: Partial<SocialInboxConversation> = {},
): SocialInboxConversation {
  return {
    id: "conversation",
    canonical_conversation_key: "facebook:page:thread",
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
    first_inbound_at: "2026-05-24T08:00:00.000Z",
    latest_inbound_at: "2026-05-24T08:00:00.000Z",
    latest_outbound_at: null,
    last_activity_at: "2026-05-24T08:00:00.000Z",
    needs_reply: false,
    reply_window_expires_at: null,
    human_agent_window_expires_at: null,
    send_eligibility: "unknown",
    conversation_status: "new_inquiry",
    assigned_team_id: null,
    assigned_user_id: null,
    follow_up_at: null,
    lead_quality: null,
    lead_quality_reason_tags: [],
    inbox_outcome: "no_outcome_yet",
    inbox_lost_reason: null,
    queue_category_key: "general_inquiry",
    routing_source: null,
    routing_confidence: null,
    routing_explanation: null,
    ...overrides,
  };
}

function firstTouchFixture(
  overrides: Partial<SocialInboxFirstTouchSource> = {},
): SocialInboxFirstTouchSource {
  return {
    id: "first-touch",
    conversation_id: "conversation",
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
    attribution_method: "meta_referral",
    attribution_confidence: null,
    ...overrides,
  };
}

function sendAttemptFixture(overrides: Partial<SocialInboxSendAttempt> = {}): SocialInboxSendAttempt {
  return {
    id: "send-attempt",
    conversation_id: "conversation",
    reply_text: "Reply",
    approved_by: null,
    approved_at: null,
    status: "approved",
    messaging_type: "RESPONSE",
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
    idempotency_key: "send-key",
    created_at: "2026-05-24T00:00:00.000Z",
    updated_at: "2026-05-24T00:00:00.000Z",
    ...overrides,
  };
}
