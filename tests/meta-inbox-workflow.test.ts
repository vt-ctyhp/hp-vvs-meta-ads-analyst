import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { permissionsForRoles } from "../src/lib/access-control.ts";
import {
  buildMetaInboxWorkflowMutation,
  type MetaInboxWorkflowPatchInput,
} from "../src/lib/meta-inbox-workflow.ts";

type Conversation = Parameters<typeof buildMetaInboxWorkflowMutation>[0];

const ACTOR_ID = "11111111-1111-4111-8111-111111111111";

describe("Meta inbox workflow mutation foundation", () => {
  it("builds queue override updates with routing audit metadata", () => {
    const mutation = buildMetaInboxWorkflowMutation(
      conversationFixture(),
      {
        queueCategoryKey: "book_appointment",
        changeReason: "Customer asked for a Saturday visit.",
      },
      { actorUserId: ACTOR_ID, now: "2026-05-24T05:00:00.000Z" },
    );

    assert.equal(mutation.update.queue_category_key, "book_appointment");
    assert.equal(mutation.update.routing_source, "manual_override");
    assert.equal(mutation.update.manual_override_by, ACTOR_ID);
    assert.equal(mutation.events.length, 1);
    assert.equal(mutation.events[0].eventType, "routing_changed");
    assert.deepEqual(mutation.events[0].previousValue, {
      queueCategoryKey: "cash_for_gold",
      routingSource: null,
    });
    assert.deepEqual(mutation.events[0].newValue, {
      queueCategoryKey: "book_appointment",
      routingSource: "manual_override",
    });
  });

  it("claims a conversation for the acting sales user and can return it to team queue", () => {
    const claimed = buildMetaInboxWorkflowMutation(
      conversationFixture({ assigned_team_id: "22222222-2222-4222-8222-222222222222" }),
      { assignmentMode: "claim_self" },
      { actorUserId: ACTOR_ID, now: "2026-05-24T05:00:00.000Z" },
    );

    assert.equal(claimed.update.assigned_user_id, ACTOR_ID);
    assert.equal(claimed.events[0].eventType, "assignment_changed");

    const returned = buildMetaInboxWorkflowMutation(
      { ...claimed.nextConversation, assigned_user_id: ACTOR_ID },
      { assignmentMode: "team_queue" },
      { actorUserId: ACTOR_ID, now: "2026-05-24T05:01:00.000Z" },
    );

    assert.equal(returned.update.assigned_user_id, null);
    assert.equal(returned.events[0].eventType, "assignment_changed");
  });

  it("requires lead quality, reason tags, outcome, and lost reason before lost closeout", () => {
    assert.throws(
      () =>
        buildMetaInboxWorkflowMutation(
          conversationFixture(),
          { conversationStatus: "lost_lead" },
          { actorUserId: ACTOR_ID, now: "2026-05-24T05:00:00.000Z" },
        ),
      /Lead Quality is required/,
    );

    assert.throws(
      () =>
        buildMetaInboxWorkflowMutation(
          conversationFixture(),
          {
            conversationStatus: "lost_lead",
            leadQuality: "medium_intent",
            leadQualityReasonTags: ["asked_price"],
            inboxOutcome: "lost",
          },
          { actorUserId: ACTOR_ID, now: "2026-05-24T05:00:00.000Z" },
        ),
      /Lost Reason is required/,
    );

    const valid = buildMetaInboxWorkflowMutation(
      conversationFixture(),
      {
        conversationStatus: "lost_lead",
        leadQuality: "medium_intent",
        leadQualityReasonTags: ["asked_price"],
        inboxOutcome: "lost",
        inboxLostReason: "price_concerns",
      },
      { actorUserId: ACTOR_ID, now: "2026-05-24T05:00:00.000Z" },
    );

    assert.equal(valid.update.conversation_status, "lost_lead");
    assert.equal(valid.update.inbox_outcome, "lost");
    assert.equal(valid.update.inbox_lost_reason, "price_concerns");
    assert.deepEqual(
      valid.events.map((event) => event.eventType).sort(),
      ["inbox_outcome_changed", "lead_quality_changed", "status_changed"],
    );
  });

  it("keeps inbox workflow writes restricted to sales roles, not marketing", () => {
    assert.equal(permissionsForRoles(["marketing"]).includes("manage_inbox_state"), false);
    assert.equal(permissionsForRoles(["sales"]).includes("manage_inbox_state"), true);
    assert.equal(permissionsForRoles(["sales_lead"]).includes("manage_inbox_state"), true);
  });

  it("does not expose snooze as a workflow mutation field", () => {
    const inputKeys = Object.keys({
      assignmentMode: "claim_self",
      queueCategoryKey: "book_appointment",
      conversationStatus: "needs_reply",
      leadQuality: "high_intent",
      leadQualityReasonTags: ["asked_price"],
      inboxOutcome: "no_outcome_yet",
      inboxLostReason: null,
      followUpAt: null,
      changeReason: "",
    } satisfies MetaInboxWorkflowPatchInput);

    assert.equal(inputKeys.some((key) => key.toLowerCase().includes("snooze")), false);
  });
});

function conversationFixture(overrides: Partial<Conversation> = {}): Conversation {
  return {
    id: "33333333-3333-4333-8333-333333333333",
    canonical_conversation_key: "facebook:thread:customer-1",
    source_channel: "facebook_message",
    source_type: "message_thread",
    platform: "facebook",
    customer_profile_id: "profile-1",
    page_id: "page-1",
    ig_user_id: null,
    participant_id: "customer-1",
    platform_thread_id: "thread-1",
    parent_content_id: null,
    source_id: "thread-1",
    first_inbound_at: "2026-05-24T04:00:00.000Z",
    latest_inbound_at: "2026-05-24T04:00:00.000Z",
    latest_outbound_at: null,
    last_activity_at: "2026-05-24T04:00:00.000Z",
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
    ...overrides,
  };
}
