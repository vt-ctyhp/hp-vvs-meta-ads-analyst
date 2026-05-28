import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { assertAssignmentEventEmitted } from "../src/lib/inbox-assignment.ts";
import { buildMetaInboxWorkflowMutation } from "../src/lib/meta-inbox-workflow.ts";

const ACTOR = "11111111-1111-4111-8111-111111111111";

function baseConversation(overrides: Record<string, unknown> = {}) {
  return {
    id: "c1",
    canonical_conversation_key: "k",
    source_channel: "instagram_comment",
    customer_profile_id: null,
    first_inbound_at: null,
    latest_inbound_at: null,
    latest_outbound_at: null,
    last_activity_at: null,
    needs_reply: false,
    reply_window_expires_at: null,
    human_agent_window_expires_at: null,
    send_eligibility: "unknown",
    conversation_status: "needs_reply",
    assigned_team_id: null,
    assigned_user_id: null,
    follow_up_at: null,
    lead_quality: null,
    lead_quality_reason_tags: [],
    inbox_outcome: "no_outcome_yet",
    inbox_lost_reason: null,
    queue_category_key: "us_product",
    routing_source: null,
    routing_confidence: null,
    routing_explanation: null,
    ...overrides,
  } as never;
}

describe("assertAssignmentEventEmitted", () => {
  it("passes when a self-claim produced an assignment_changed event", () => {
    const mutation = buildMetaInboxWorkflowMutation(
      baseConversation({ assigned_user_id: null }),
      { assignmentMode: "claim_self" },
      { actorUserId: ACTOR, now: "2026-05-27T19:00:00Z" },
    );
    assert.doesNotThrow(() => assertAssignmentEventEmitted(mutation));
    assert.equal(mutation.events.filter((e) => e.eventType === "assignment_changed").length, 1);
  });
  it("throws when no assignment change occurred (already assigned to actor)", () => {
    const mutation = buildMetaInboxWorkflowMutation(
      baseConversation({ assigned_user_id: ACTOR }),
      { assignmentMode: "claim_self" },
      { actorUserId: ACTOR, now: "2026-05-27T19:00:00Z" },
    );
    assert.throws(() => assertAssignmentEventEmitted(mutation), /assignment_changed/);
  });
});
