import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

import { buildMetaInboxManagerDashboard } from "../src/lib/meta-inbox-manager-dashboard.ts";
import { filterSocialInboxDataForQueueAccess } from "../src/lib/meta-inbox-access.ts";
import type {
  SocialInboxConversation,
  SocialInboxData,
  SocialInboxFirstTouchSource,
  SocialInboxMessage,
  SocialInboxSendAttempt,
} from "../src/lib/social-inbox.ts";

const ROUTE = readFileSync("src/app/api/social-inbox/manager-dashboard/route.ts", "utf8");
const DESKTOP_INBOX = readFileSync("src/components/social-inbox-client.tsx", "utf8");

describe("Meta inbox manager dashboard foundation", () => {
  it("defaults to last 7 days and measures queue health", () => {
    const dashboard = buildMetaInboxManagerDashboard(dataFixture(), {
      now: "2026-05-24T12:00:00.000Z",
    });

    assert.equal(dashboard.range.label, "Last 7 days");
    assert.equal(dashboard.range.days, 7);
    assert.equal(dashboard.metrics.totalConversations, 2);
    assert.equal(dashboard.metrics.needsReply, 1);
    assert.equal(dashboard.metrics.unassigned, 1);
    assert.equal(dashboard.metrics.missedFollowUps, 1);
    assert.equal(dashboard.metrics.failedSends, 2);
    assert.equal(dashboard.metrics.retryBacklog, 1);
    assert.equal(dashboard.metrics.missingLeadQuality, 2);
    assert.equal(dashboard.metrics.closeoutIncomplete, 1);
    assert.equal(dashboard.metrics.averageFirstResponseMinutes, 45);
    assert.equal(dashboard.metrics.medianFirstResponseMinutes, 45);
    assert.deepEqual(
      dashboard.byQueue.map((row) => [
        row.queueCategoryKey,
        row.totalConversations,
        row.needsReply,
        row.missedFollowUps,
        row.failedSends,
      ]),
      [
        ["cash_for_gold", 1, 1, 1, 1],
        ["book_appointment", 1, 0, 0, 1],
      ],
    );
  });

  it("exposes an inbox-scoped API and compact desktop panel", () => {
    assert.match(ROUTE, /requirePermissionFromRequest\(request, "view_inbox"\)/);
    assert.match(ROUTE, /getSocialInboxManagerDashboardData\(profile\)/);
    assert.match(ROUTE, /buildMetaInboxManagerDashboard/);
    assert.match(ROUTE, /managerDashboardFiltersFromSearchParams/);
    assert.match(DESKTOP_INBOX, /ManagerSnapshotPanel/);
    assert.match(DESKTOP_INBOX, /Manager Snapshot/);
    assert.match(DESKTOP_INBOX, /Needs Reply/);
    assert.match(DESKTOP_INBOX, /Missed Follow-Up/);
    assert.match(DESKTOP_INBOX, /Failed Sends/);
    assert.match(DESKTOP_INBOX, /Avg first response/);
  });

  it("adds response-age, workload, source, outcome, and label-completeness metrics", () => {
    const dashboard = buildMetaInboxManagerDashboard(expandedDataFixture(), {
      now: "2026-05-24T12:00:00.000Z",
    });

    assert.equal(dashboard.metrics.totalConversations, 4);
    assert.equal(dashboard.metrics.needsReply, 3);
    assert.equal(dashboard.metrics.staleConversations, 1);
    assert.equal(dashboard.metrics.labelCompletenessPercent, 25);
    assert.deepEqual(
      dashboard.responseAgeBuckets.map((bucket) => [bucket.key, bucket.count]),
      [
        ["under_1h", 1],
        ["one_to_four_h", 1],
        ["four_to_twentyfour_h", 0],
        ["over_24h", 1],
        ["unknown", 0],
      ],
    );
    assert.deepEqual(
      dashboard.byAssignee.map((row) => [
        row.assigneeUserId,
        row.label,
        row.totalConversations,
        row.needsReply,
        row.missedFollowUps,
        row.failedSends,
      ]),
      [
        [null, "Unassigned", 2, 2, 1, 1],
        ["22222222-2222-4222-8222-222222222222", "22222222...", 1, 1, 0, 0],
        ["11111111-1111-4111-8111-111111111111", "11111111...", 1, 0, 0, 1],
      ],
    );
    assert.deepEqual(
      dashboard.bySourceChannel.map((row) => [
        row.sourceChannelKey,
        row.totalConversations,
        row.needsReply,
        row.failedSends,
      ]),
      [
        ["facebook_message", 2, 1, 2],
        ["instagram_message", 1, 1, 0],
        ["facebook_public_comment", 1, 1, 0],
      ],
    );
    assert.deepEqual(
      dashboard.byOutcome.map((row) => [row.outcomeKey, row.count]),
      [
        ["no_outcome_yet", 3],
        ["lost", 1],
      ],
    );

    assert.match(DESKTOP_INBOX, /Response Age/);
    assert.match(DESKTOP_INBOX, /Workload/);
    assert.match(DESKTOP_INBOX, /Source Health/);
    assert.match(DESKTOP_INBOX, /Label Complete/);
  });

  it("counts complete range data above the inbox list cap", () => {
    const conversations = Array.from({ length: 260 }, (_, index) =>
      conversationFixture({
        id: `conversation-${index}`,
        queue_category_key: index % 2 ? "cash_for_gold" : "book_appointment",
        needs_reply: true,
        first_inbound_at: "2026-05-24T08:00:00.000Z",
        latest_inbound_at: "2026-05-24T08:00:00.000Z",
        last_activity_at: "2026-05-24T08:00:00.000Z",
      }),
    );
    const sendAttempts = conversations.map((conversation, index) =>
      sendAttemptFixture({
        id: `send-attempt-${index}`,
        conversation_id: conversation.id,
        status: index % 3 === 0 ? "failed_retryable" : "approved",
      }),
    );

    const dashboard = buildMetaInboxManagerDashboard(
      {
        ...emptyDataFixture(),
        inboxConversations: conversations,
        sendAttempts,
      },
      { now: "2026-05-24T12:00:00.000Z" },
    );

    assert.equal(dashboard.metrics.totalConversations, 260);
    assert.equal(dashboard.metrics.needsReply, 260);
    assert.equal(dashboard.metrics.retryBacklog, 87);
  });

  it("uses the earliest outbound reply after first inbound for first-response math", () => {
    const dashboard = buildMetaInboxManagerDashboard(
      {
        ...emptyDataFixture(),
        inboxConversations: [
          conversationFixture({
            id: "conversation-response",
            first_inbound_at: "2026-05-24T10:00:00.000Z",
            latest_inbound_at: "2026-05-24T10:00:00.000Z",
            latest_outbound_at: "2026-05-24T12:00:00.000Z",
            last_activity_at: "2026-05-24T12:00:00.000Z",
            assigned_user_id: "11111111-1111-4111-8111-111111111111",
          }),
        ],
        messages: [
          messageFixture({
            id: "inbound",
            direction: "inbound",
            sent_at: "2026-05-24T10:00:00.000Z",
          }),
          messageFixture({
            id: "first-outbound",
            direction: "outbound",
            sent_at: "2026-05-24T10:15:00.000Z",
          }),
          messageFixture({
            id: "latest-outbound",
            direction: "outbound",
            sent_at: "2026-05-24T12:00:00.000Z",
          }),
        ],
      },
      { now: "2026-05-24T12:30:00.000Z" },
    );

    assert.equal(dashboard.metrics.averageFirstResponseMinutes, 15);
    assert.equal(dashboard.metrics.medianFirstResponseMinutes, 15);
    assert.equal(dashboard.byAssignee[0].averageFirstResponseMinutes, 15);
    assert.equal(dashboard.bySourceChannel[0].averageFirstResponseMinutes, 15);
  });

  it("composes manager filters after queue access is applied", () => {
    const data = {
      ...emptyDataFixture(),
      inboxConversations: [
        conversationFixture({
          id: "allowed-match",
          queue_category_key: "cash_for_gold",
          source_channel: "facebook_message",
          assigned_team_id: "team-1",
          assigned_user_id: "11111111-1111-4111-8111-111111111111",
          platform_thread_id: "thread-allowed",
          source_id: "thread-allowed",
          first_inbound_at: "2026-05-24T08:00:00.000Z",
          latest_inbound_at: "2026-05-24T08:00:00.000Z",
          last_activity_at: "2026-05-24T08:00:00.000Z",
        }),
        conversationFixture({
          id: "allowed-wrong-source",
          queue_category_key: "cash_for_gold",
          source_channel: "instagram_message",
          assigned_team_id: "team-1",
          assigned_user_id: "11111111-1111-4111-8111-111111111111",
          first_inbound_at: "2026-05-24T08:00:00.000Z",
          latest_inbound_at: "2026-05-24T08:00:00.000Z",
          last_activity_at: "2026-05-24T08:00:00.000Z",
        }),
        conversationFixture({
          id: "blocked-match",
          queue_category_key: "book_appointment",
          source_channel: "facebook_message",
          assigned_team_id: "team-1",
          assigned_user_id: "11111111-1111-4111-8111-111111111111",
          first_inbound_at: "2026-05-24T08:00:00.000Z",
          latest_inbound_at: "2026-05-24T08:00:00.000Z",
          last_activity_at: "2026-05-24T08:00:00.000Z",
        }),
      ],
      firstTouchSources: [
        firstTouchFixture({
          conversation_id: "allowed-match",
          campaign_umbrella_id: "cash-may",
          ad_id: "ad-1",
          creative_id: "creative-1",
          ref: "message-angle-1",
          source_post_id: "post-1",
        }),
        firstTouchFixture({
          conversation_id: "allowed-wrong-source",
          campaign_umbrella_id: "cash-may",
          ad_id: "ad-1",
          creative_id: "creative-1",
          ref: "message-angle-1",
          source_post_id: "post-1",
        }),
        firstTouchFixture({
          conversation_id: "blocked-match",
          campaign_umbrella_id: "cash-may",
          ad_id: "ad-1",
          creative_id: "creative-1",
          ref: "message-angle-1",
          source_post_id: "post-1",
        }),
      ],
    };
    const scoped = filterSocialInboxDataForQueueAccess(data, {
      mode: "team",
      allowedQueueCategoryKeys: ["cash_for_gold"],
      reason: "team_queue_access",
    });

    const dashboard = buildMetaInboxManagerDashboard(scoped, {
      now: "2026-05-24T12:00:00.000Z",
      filters: {
        assignedTeamId: "team-1",
        assignedUserId: "11111111-1111-4111-8111-111111111111",
        queueCategoryKey: "cash_for_gold",
        sourceChannel: "facebook_message",
        campaignUmbrellaId: "cash-may",
        adId: "ad-1",
        creativeId: "creative-1",
        messageContext: "post-1",
      },
    });

    assert.equal(dashboard.metrics.totalConversations, 1);
    assert.deepEqual(dashboard.byQueue.map((row) => row.queueCategoryKey), ["cash_for_gold"]);
    assert.deepEqual(dashboard.byCampaignUmbrella.map((row) => row.key), ["cash-may"]);
  });
});

function emptyDataFixture(): SocialInboxData {
  return {
    queueAccess: { mode: "all", allowedQueueCategoryKeys: null, reason: "full_access_role" },
    threads: [],
    messages: [],
    comments: [],
    customerProfiles: [],
    customerContactMethods: [],
    firstTouchSources: [],
    syncRuns: [],
    commentActions: [],
    conversationEvents: [],
    savedReplies: [],
    notes: [],
    qaScorecards: [],
    inboxConversations: [],
    sendAttempts: [],
  };
}

function dataFixture(): SocialInboxData {
  return {
    queueAccess: { mode: "all", allowedQueueCategoryKeys: null, reason: "full_access_role" },
    threads: [],
    messages: [],
    comments: [],
    customerProfiles: [],
    customerContactMethods: [],
    firstTouchSources: [],
    syncRuns: [],
    commentActions: [],
    conversationEvents: [],
    savedReplies: [],
    notes: [],
    qaScorecards: [],
    inboxConversations: [
      conversationFixture({
        id: "conversation-cash",
        queue_category_key: "cash_for_gold",
        conversation_status: "follow_up_needed",
        needs_reply: true,
        assigned_user_id: null,
        first_inbound_at: "2026-05-24T10:00:00.000Z",
        latest_outbound_at: "2026-05-24T10:30:00.000Z",
        last_activity_at: "2026-05-24T10:30:00.000Z",
        follow_up_at: "2026-05-24T09:00:00.000Z",
      }),
      conversationFixture({
        id: "conversation-book",
        queue_category_key: "book_appointment",
        conversation_status: "lost_lead",
        assigned_user_id: "11111111-1111-4111-8111-111111111111",
        first_inbound_at: "2026-05-23T00:00:00.000Z",
        latest_outbound_at: "2026-05-23T01:00:00.000Z",
        last_activity_at: "2026-05-23T01:00:00.000Z",
        inbox_outcome: "lost",
      }),
      conversationFixture({
        id: "conversation-old",
        queue_category_key: "us_product",
        needs_reply: true,
        first_inbound_at: "2026-05-01T00:00:00.000Z",
        last_activity_at: "2026-05-01T00:00:00.000Z",
      }),
    ],
    sendAttempts: [
      sendAttemptFixture({
        conversation_id: "conversation-cash",
        status: "failed_retryable",
      }),
      sendAttemptFixture({
        conversation_id: "conversation-book",
        status: "failed_terminal",
      }),
      sendAttemptFixture({
        conversation_id: "conversation-old",
        status: "failed_retryable",
      }),
    ],
  };
}

function expandedDataFixture(): SocialInboxData {
  const base = dataFixture();
  return {
    ...base,
    inboxConversations: [
      ...base.inboxConversations,
      conversationFixture({
        id: "conversation-fast",
        queue_category_key: "vn_product",
        source_channel: "instagram_message",
        needs_reply: true,
        assigned_user_id: "22222222-2222-4222-8222-222222222222",
        first_inbound_at: "2026-05-24T11:45:00.000Z",
        latest_inbound_at: "2026-05-24T11:45:00.000Z",
        last_activity_at: "2026-05-24T11:45:00.000Z",
        lead_quality: "high_intent",
        lead_quality_reason_tags: ["asked_price"],
      }),
      conversationFixture({
        id: "conversation-stale",
        queue_category_key: "custom_jewelry",
        source_channel: "facebook_public_comment",
        needs_reply: true,
        first_inbound_at: "2026-05-21T08:00:00.000Z",
        latest_inbound_at: "2026-05-21T08:00:00.000Z",
        last_activity_at: "2026-05-21T08:00:00.000Z",
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
    first_inbound_at: null,
    latest_inbound_at: null,
    latest_outbound_at: null,
    last_activity_at: null,
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

function messageFixture(overrides: Partial<SocialInboxMessage> = {}): SocialInboxMessage {
  return {
    id: "message",
    platform: "facebook",
    thread_id: "thread-1",
    message_id: "message-1",
    direction: "inbound",
    sender_id: "customer-1",
    sender_name: "Customer",
    recipient_id: "page-1",
    recipient_name: "Page",
    body: "Message",
    attachments: [],
    sent_at: "2026-05-24T10:00:00.000Z",
    ...overrides,
  };
}
