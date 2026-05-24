import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

import { buildMetaInboxManagerDashboard } from "../src/lib/meta-inbox-manager-dashboard.ts";
import type {
  SocialInboxConversation,
  SocialInboxData,
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
    assert.match(ROUTE, /getSocialInboxData\(profile\)/);
    assert.match(ROUTE, /buildMetaInboxManagerDashboard/);
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
});

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
