import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  isMetaInboxConversationStatusKey,
  isMetaInboxQueueCategoryKey,
  isMetaInboxSourceChannelKey,
  metaInboxAllowedQueueCategoriesForTeams,
  validateMetaInboxFinalState,
} from "../src/lib/meta-inbox-foundation.ts";

describe("Meta inbox foundation helpers", () => {
  it("validates canonical queue categories and source channels", () => {
    assert.equal(isMetaInboxQueueCategoryKey("cash_for_gold"), true);
    assert.equal(isMetaInboxQueueCategoryKey("gold"), false);
    assert.equal(isMetaInboxSourceChannelKey("facebook_message"), true);
    assert.equal(isMetaInboxSourceChannelKey("facebook"), false);
    assert.equal(isMetaInboxConversationStatusKey("lost_lead"), true);
    assert.equal(isMetaInboxConversationStatusKey("snoozed"), false);
  });

  it("builds the All view as the ordered union of team queue access", () => {
    assert.deepEqual(
      metaInboxAllowedQueueCategoriesForTeams([
        { queueCategoryKey: "vn_product" },
        { queueCategoryKey: "cash_for_gold" },
        { queueCategoryKey: "cash_for_gold" },
        { queueCategoryKey: "unknown" },
        { queueCategoryKey: null },
      ]),
      ["cash_for_gold", "vn_product"],
    );
  });

  it("allows active conversations before final lead and outcome labels exist", () => {
    assert.deepEqual(
      validateMetaInboxFinalState({
        conversationStatus: "needs_reply",
        leadQuality: null,
        leadQualityReasonTags: [],
        inboxOutcome: "no_outcome_yet",
      }),
      { ok: true, issues: [] },
    );
  });

  it("requires lead quality, reason tags, and final outcome before closing", () => {
    assert.deepEqual(
      validateMetaInboxFinalState({
        conversationStatus: "closed",
        leadQuality: null,
        leadQualityReasonTags: [],
        inboxOutcome: "no_outcome_yet",
      }),
      {
        ok: false,
        issues: [
          { field: "leadQuality", reason: "required" },
          { field: "leadQualityReasonTags", reason: "required" },
          { field: "inboxOutcome", reason: "required" },
        ],
      },
    );
  });

  it("requires a canonical lost reason for lost status or lost outcome", () => {
    assert.deepEqual(
      validateMetaInboxFinalState({
        conversationStatus: "lost_lead",
        leadQuality: "high_intent",
        leadQualityReasonTags: ["asked_price"],
        inboxOutcome: "lost",
      }),
      {
        ok: false,
        issues: [{ field: "inboxLostReason", reason: "required" }],
      },
    );

    assert.deepEqual(
      validateMetaInboxFinalState({
        conversationStatus: "lost_lead",
        leadQuality: "high_intent",
        leadQualityReasonTags: ["asked_price"],
        inboxOutcome: "lost",
        inboxLostReason: "price_concerns",
      }),
      { ok: true, issues: [] },
    );
  });

  it("rejects non-canonical final labels and reason tags", () => {
    assert.deepEqual(
      validateMetaInboxFinalState({
        conversationStatus: "done",
        leadQuality: "very_hot",
        leadQualityReasonTags: ["asked_price", "made_up"],
        inboxOutcome: "won",
        inboxLostReason: "too_far",
      }),
      {
        ok: false,
        issues: [
          { field: "conversationStatus", reason: "invalid" },
          { field: "leadQuality", reason: "invalid" },
          { field: "inboxOutcome", reason: "invalid" },
          { field: "inboxLostReason", reason: "invalid" },
          { field: "leadQualityReasonTags", reason: "invalid" },
        ],
      },
    );
  });
});
