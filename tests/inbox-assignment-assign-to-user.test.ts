import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  buildMetaInboxWorkflowMutation,
  type MetaInboxWorkflowPatchInput,
} from "../src/lib/meta-inbox-workflow.ts";
import { assertAssignmentEventEmitted } from "../src/lib/inbox-assignment.ts";

type Conversation = Parameters<typeof buildMetaInboxWorkflowMutation>[0];

const ACTOR_ID = "11111111-1111-4111-8111-111111111111";
const TARGET_ID = "33333333-3333-4333-8333-333333333333";

// Full conversation fixture matching the shape of tests/meta-inbox-workflow.test.ts.
function conversationFixture(overrides: Partial<Conversation> = {}): Conversation {
  return {
    id: "44444444-4444-4444-8444-444444444444",
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
    first_inbound_at: "2026-05-28T18:00:00.000Z",
    latest_inbound_at: "2026-05-28T18:00:00.000Z",
    latest_outbound_at: null,
    last_activity_at: "2026-05-28T18:00:00.000Z",
    needs_reply: true,
    reply_window_expires_at: null,
    human_agent_window_expires_at: null,
    send_eligibility: "standard_reply_allowed",
    conversation_status: "new_inquiry",
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
  } as unknown as Conversation;
}

describe("assign_to_user workflow mode", () => {
  it("assigns the conversation to the target user and emits assignment_changed", () => {
    const mutation = buildMetaInboxWorkflowMutation(
      conversationFixture(),
      { assignmentMode: "assign_to_user", targetUserId: TARGET_ID } as MetaInboxWorkflowPatchInput,
      { actorUserId: ACTOR_ID, now: "2026-05-28T18:00:00.000Z" },
    );
    assert.equal(mutation.update.assigned_user_id, TARGET_ID);
    assert.equal(mutation.events.length, 1);
    assert.equal(mutation.events[0].eventType, "assignment_changed");
    assert.deepEqual(mutation.events[0].newValue, {
      assignedUserId: TARGET_ID,
      assignedTeamId: null,
    });
  });

  it("records a null actor for a system (auto) assign while still moving the user", () => {
    const mutation = buildMetaInboxWorkflowMutation(
      conversationFixture(),
      { assignmentMode: "assign_to_user", targetUserId: TARGET_ID } as MetaInboxWorkflowPatchInput,
      { actorUserId: null, now: "2026-05-28T18:00:00.000Z" },
    );
    assert.equal(mutation.update.assigned_user_id, TARGET_ID);
    assert.equal(mutation.events[0].eventType, "assignment_changed");
  });

  it("is a no-op (no event) when the target is already assigned", () => {
    const mutation = buildMetaInboxWorkflowMutation(
      conversationFixture({ assigned_user_id: TARGET_ID } as Partial<Conversation>),
      { assignmentMode: "assign_to_user", targetUserId: TARGET_ID } as MetaInboxWorkflowPatchInput,
      { actorUserId: ACTOR_ID, now: "2026-05-28T18:00:00.000Z" },
    );
    assert.equal(mutation.events.length, 0);
  });

  it("throws when targetUserId is missing or not a uuid", () => {
    assert.throws(
      () =>
        buildMetaInboxWorkflowMutation(
          conversationFixture(),
          { assignmentMode: "assign_to_user" } as MetaInboxWorkflowPatchInput,
          { actorUserId: ACTOR_ID, now: "2026-05-28T18:00:00.000Z" },
        ),
      /target user/i,
    );
  });
});

describe("facade assignment-event guard", () => {
  it("passes for an assign_to_user mutation (an assignment_changed event was emitted)", () => {
    const mutation = buildMetaInboxWorkflowMutation(
      conversationFixture(),
      { assignmentMode: "assign_to_user", targetUserId: TARGET_ID } as MetaInboxWorkflowPatchInput,
      { actorUserId: null, now: "2026-05-28T18:00:00.000Z" },
    );
    assert.doesNotThrow(() => assertAssignmentEventEmitted(mutation));
  });

  it("throws for a no-op assignment (no event emitted)", () => {
    const mutation = buildMetaInboxWorkflowMutation(
      conversationFixture({ assigned_user_id: TARGET_ID } as Partial<Parameters<typeof buildMetaInboxWorkflowMutation>[0]>),
      { assignmentMode: "assign_to_user", targetUserId: TARGET_ID } as MetaInboxWorkflowPatchInput,
      { actorUserId: null, now: "2026-05-28T18:00:00.000Z" },
    );
    assert.throws(() => assertAssignmentEventEmitted(mutation), /assignment_changed/);
  });
});
