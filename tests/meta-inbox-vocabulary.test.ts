import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  META_INBOX_CONVERSATION_STATUSES,
  META_INBOX_CUSTOMER_CONTACT_METHODS,
  META_INBOX_LEAD_QUALITY_LABELS,
  META_INBOX_LEAD_QUALITY_REASON_TAGS,
  META_INBOX_LOST_REASONS,
  META_INBOX_OUTCOMES,
  META_INBOX_QUEUE_CATEGORIES,
  META_INBOX_SOURCE_CHANNELS,
  metaInboxVocabularyLabel,
  metaInboxVocabularyKeys,
} from "../src/lib/meta-inbox-vocabulary.ts";

const VOCABULARY_SETS = [
  META_INBOX_QUEUE_CATEGORIES,
  META_INBOX_SOURCE_CHANNELS,
  META_INBOX_CONVERSATION_STATUSES,
  META_INBOX_LEAD_QUALITY_LABELS,
  META_INBOX_LEAD_QUALITY_REASON_TAGS,
  META_INBOX_OUTCOMES,
  META_INBOX_LOST_REASONS,
  META_INBOX_CUSTOMER_CONTACT_METHODS,
] as const;

describe("Meta inbox vocabulary", () => {
  it("keeps locked queue categories in the accepted starter order", () => {
    assert.deepEqual(metaInboxVocabularyKeys(META_INBOX_QUEUE_CATEGORIES), [
      "cash_for_gold",
      "book_appointment",
      "us_product",
      "vn_product",
      "us_promotions",
      "vn_promotions",
      "custom_jewelry",
      "repair_service",
      "general_inquiry",
      "uncategorized_needs_review",
    ]);
  });

  it("keeps source channels independent from queue categories", () => {
    assert.deepEqual(metaInboxVocabularyKeys(META_INBOX_SOURCE_CHANNELS), [
      "facebook_message",
      "instagram_message",
      "facebook_public_comment",
      "instagram_public_comment",
      "private_reply_from_comment",
      "ad_referral",
      "other_unknown",
    ]);
  });

  it("keeps conversation status free of Snooze", () => {
    assert.deepEqual(metaInboxVocabularyKeys(META_INBOX_CONVERSATION_STATUSES), [
      "new_inquiry",
      "needs_reply",
      "waiting_on_customer",
      "follow_up_needed",
      "appointment_scheduled",
      "closed",
      "lost_lead",
    ]);

    const statusText = JSON.stringify(META_INBOX_CONVERSATION_STATUSES).toLowerCase();
    assert.equal(statusText.includes("snooze"), false);
  });

  it("keeps Lead Quality as one primary label plus locked reason tags", () => {
    assert.deepEqual(metaInboxVocabularyKeys(META_INBOX_LEAD_QUALITY_LABELS), [
      "high_intent",
      "medium_intent",
      "low_intent",
      "not_a_fit",
      "spam_invalid",
    ]);

    assert.deepEqual(metaInboxVocabularyKeys(META_INBOX_LEAD_QUALITY_REASON_TAGS), [
      "asked_appointment",
      "asked_price",
      "budget_shared",
      "design_details_shared",
      "custom_design",
      "diamond_inquiry",
      "repair_service",
      "price_shopping",
      "budget_mismatch",
      "timeline_mismatch",
      "wrong_product_service",
      "unresponsive",
      "duplicate",
      "spam_bot",
    ]);
  });

  it("keeps Inbox Outcomes aligned with accepted appointment/sales outcome terms", () => {
    assert.deepEqual(metaInboxVocabularyKeys(META_INBOX_OUTCOMES), [
      "no_outcome_yet",
      "booked",
      "showed_up",
      "no_show",
      "browsed",
      "sold",
      "lost",
    ]);
  });

  it("keeps lost reasons aligned with the Sales app canonical list", () => {
    assert.deepEqual(metaInboxVocabularyKeys(META_INBOX_LOST_REASONS), [
      "no_response",
      "price_concerns",
      "bought_elsewhere",
      "timeline_issue",
      "budget_not_aligned",
      "design_not_preferred",
      "cancelled_by_client",
      "duplicate_lead",
      "lost_after_no_show",
      "other",
    ]);
  });

  it("keeps customer contact methods constrained to inbox-owned matching inputs", () => {
    assert.deepEqual(metaInboxVocabularyKeys(META_INBOX_CUSTOMER_CONTACT_METHODS), [
      "phone",
      "email",
    ]);
  });

  it("does not duplicate keys inside any locked vocabulary set", () => {
    for (const set of VOCABULARY_SETS) {
      const keys = metaInboxVocabularyKeys(set);
      assert.deepEqual(new Set(keys).size, keys.length);
    }
  });

  it("resolves vocabulary labels for UI display without exposing raw keys", () => {
    assert.equal(
      metaInboxVocabularyLabel(META_INBOX_QUEUE_CATEGORIES, "cash_for_gold"),
      "Cash for Gold",
    );
    assert.equal(
      metaInboxVocabularyLabel(META_INBOX_SOURCE_CHANNELS, "instagram_public_comment"),
      "Instagram Public Comment",
    );
    assert.equal(metaInboxVocabularyLabel(META_INBOX_OUTCOMES, "missing", "Not labeled"), "Not labeled");
  });
});
