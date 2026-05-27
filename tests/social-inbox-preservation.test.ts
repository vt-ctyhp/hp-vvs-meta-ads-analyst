import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { preserveMetaInboxConversationWorkflowFields } from "../src/lib/social-inbox.ts";

describe("preserveMetaInboxConversationWorkflowFields", () => {
  const baseRow = {
    canonical_conversation_key: "facebook:message_thread:page-1:customer-1",
    conversation_status: "new_inquiry",
    queue_category_key: "cash_for_gold",
    routing_source: "campaign_umbrella",
    routing_confidence: 0.85,
    routing_explanation: "Routed by campaign umbrella: Cash for Gold US.",
  };

  it("upgrades fallback routing to campaign_umbrella when ad attribution arrives later", () => {
    const existing = {
      conversation_status: "needs_reply",
      queue_category_key: "general_inquiry",
      routing_source: "fallback",
      routing_confidence: 0.35,
      routing_explanation: "No ad attribution captured — routed to General Inquiry.",
    };

    const merged = preserveMetaInboxConversationWorkflowFields(baseRow, existing);

    // Routing fields take the fresh values from the batch.
    assert.equal(merged.queue_category_key, "cash_for_gold");
    assert.equal(merged.routing_source, "campaign_umbrella");
    assert.equal(merged.routing_confidence, 0.85);
    assert.equal(
      merged.routing_explanation,
      "Routed by campaign umbrella: Cash for Gold US.",
    );
    // Conversation status is still owned by the existing workflow state.
    assert.equal(merged.conversation_status, "needs_reply");
  });

  it("preserves manual_override even when a campaign_umbrella row arrives", () => {
    const existing = {
      conversation_status: "appointment_scheduled",
      queue_category_key: "book_appointment",
      routing_source: "manual_override",
      routing_confidence: 1,
      routing_explanation: "Manual routing override: triaged by Sarah.",
    };

    const merged = preserveMetaInboxConversationWorkflowFields(baseRow, existing);

    assert.equal(merged.queue_category_key, "book_appointment");
    assert.equal(merged.routing_source, "manual_override");
    assert.equal(merged.routing_confidence, 1);
    assert.equal(merged.routing_explanation, "Manual routing override: triaged by Sarah.");
    assert.equal(merged.conversation_status, "appointment_scheduled");
  });

  it("does not downgrade an existing campaign_umbrella row when a later fallback arrives", () => {
    const existing = {
      conversation_status: "needs_reply",
      queue_category_key: "cash_for_gold",
      routing_source: "campaign_umbrella",
      routing_confidence: 0.85,
      routing_explanation: "Routed by campaign umbrella: Cash for Gold US.",
    };
    const fallbackRow = {
      ...baseRow,
      queue_category_key: "general_inquiry",
      routing_source: "fallback",
      routing_confidence: 0.35,
      routing_explanation: "No ad attribution captured — routed to General Inquiry.",
    };

    const merged = preserveMetaInboxConversationWorkflowFields(fallbackRow, existing);

    assert.equal(merged.queue_category_key, "cash_for_gold");
    assert.equal(merged.routing_source, "campaign_umbrella");
  });

  it("preserves existing fallback routing when fresh batch also produces fallback", () => {
    const existing = {
      conversation_status: "needs_reply",
      queue_category_key: "general_inquiry",
      routing_source: "fallback",
      routing_confidence: 0.35,
      routing_explanation: "Original explanation.",
    };
    const fallbackRow = {
      ...baseRow,
      queue_category_key: "uncategorized_needs_review",
      routing_source: "fallback",
      routing_confidence: 0.15,
      routing_explanation: "Different fallback explanation.",
    };

    const merged = preserveMetaInboxConversationWorkflowFields(fallbackRow, existing);

    assert.equal(merged.queue_category_key, "general_inquiry");
    assert.equal(merged.routing_source, "fallback");
    assert.equal(merged.routing_confidence, 0.35);
    assert.equal(merged.routing_explanation, "Original explanation.");
  });
});
