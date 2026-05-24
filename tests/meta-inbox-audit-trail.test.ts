import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

import { filterSocialInboxDataForQueueAccess } from "../src/lib/meta-inbox-access.ts";

type SocialInboxData = Parameters<typeof filterSocialInboxDataForQueueAccess>[0];
type SocialInboxConversation = SocialInboxData["inboxConversations"][number];
type SocialInboxConversationEvent = SocialInboxData["conversationEvents"][number];

const MIGRATION = readFileSync(
  "supabase/migrations/20260523090000_meta_inbox_foundation.sql",
  "utf8",
);
const SOCIAL_INBOX_LIB = readFileSync("src/lib/social-inbox.ts", "utf8");
const DESKTOP_INBOX = readFileSync("src/components/social-inbox-client.tsx", "utf8");

describe("Meta inbox audit trail visibility", () => {
  it("keeps conversation audit events append-only and manager-visible", () => {
    assert.match(MIGRATION, /create table if not exists public\.meta_inbox_conversation_events/);
    assert.match(MIGRATION, /event_type text not null check/);
    assert.match(MIGRATION, /meta_inbox_conversation_events_lookup_idx/);
    assert.match(MIGRATION, /Manager-visible audit trail/);
    assert.match(MIGRATION, /grant insert on table public\.%I to ads_analyst_web/);
    assert.match(SOCIAL_INBOX_LIB, /selectConversationEventsForQueueAccess/);
    assert.match(SOCIAL_INBOX_LIB, /mapConversationEvent/);
    assert.match(SOCIAL_INBOX_LIB, /conversationEvents: SocialInboxConversationEvent\[\]/);
  });

  it("filters audit events to conversations in the allowed sales queues", () => {
    const data = socialInboxDataFixture();
    data.inboxConversations = [
      conversationFixture("conv-cash", "cash_for_gold"),
      conversationFixture("conv-vn", "vn_product"),
    ];
    data.conversationEvents = [
      auditEventFixture("event-cash", "conv-cash"),
      auditEventFixture("event-vn", "conv-vn"),
      auditEventFixture("event-orphan", "conv-orphan"),
    ];

    const filtered = filterSocialInboxDataForQueueAccess(data, {
      mode: "team",
      allowedQueueCategoryKeys: ["cash_for_gold"],
      reason: "team_queue_access",
    });

    assert.deepEqual(
      filtered.conversationEvents.map((event) => event.id),
      ["event-cash"],
    );
  });

  it("surfaces a compact audit trail panel without raw Meta payload UI", () => {
    assert.match(DESKTOP_INBOX, /AuditTrailPanel/);
    assert.match(DESKTOP_INBOX, /Audit Trail/);
    assert.match(DESKTOP_INBOX, /Sales can see accessible conversation audit history/);
    assert.match(DESKTOP_INBOX, /Raw Meta payload stays hidden from UI/);
    assert.match(DESKTOP_INBOX, /mergeConversationEvents/);
    assert.match(DESKTOP_INBOX, /auditEventSummary/);
    assert.doesNotMatch(DESKTOP_INBOX, /raw_payload_json/);
  });
});

function socialInboxDataFixture(): SocialInboxData {
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

function conversationFixture(
  id: string,
  queueCategoryKey: SocialInboxConversation["queue_category_key"],
): SocialInboxConversation {
  return {
    id,
    canonical_conversation_key: `facebook:thread:${id}`,
    source_channel: "facebook_message",
    source_type: "message_thread",
    platform: "facebook",
    customer_profile_id: null,
    page_id: "page-1",
    ig_user_id: null,
    participant_id: "customer-1",
    platform_thread_id: `thread-${id}`,
    parent_content_id: null,
    source_id: `thread-${id}`,
    first_inbound_at: "2026-05-24T10:00:00.000Z",
    latest_inbound_at: "2026-05-24T10:00:00.000Z",
    latest_outbound_at: null,
    last_activity_at: "2026-05-24T10:00:00.000Z",
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
    queue_category_key: queueCategoryKey,
    routing_source: null,
    routing_confidence: null,
    routing_explanation: null,
  };
}

function auditEventFixture(id: string, conversationId: string): SocialInboxConversationEvent {
  return {
    id,
    conversation_id: conversationId,
    event_type: "status_changed",
    actor_user_id: "11111111-1111-4111-8111-111111111111",
    event_at: "2026-05-24T10:05:00.000Z",
    previous_value: { conversationStatus: "new_inquiry" },
    new_value: { conversationStatus: "needs_reply" },
    metadata: { changeReason: "Customer asked a question." },
    created_at: "2026-05-24T10:05:00.000Z",
  };
}
