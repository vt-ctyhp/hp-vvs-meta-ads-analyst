import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { buildWebhookEventLogRow } from "../src/lib/meta-webhook-log.ts";

describe("buildWebhookEventLogRow", () => {
  it("captures the raw payload, object, and entry count", () => {
    const payload = {
      object: "page",
      entry: [
        { id: "page-1", messaging: [{ sender: { id: "c1" }, message: { text: "hi" } }] },
        { id: "page-1", messaging: [{ sender: { id: "c2" }, message: { text: "yo" } }] },
      ],
    };
    const row = buildWebhookEventLogRow({
      payload,
      signatureValid: true,
      result: { messages: 2, comments: 0, referrals: 0 },
    });
    assert.equal(row.object, "page");
    assert.equal(row.signature_valid, true);
    assert.equal(row.entry_count, 2);
    assert.equal(row.referral_count, 0);
    assert.equal(row.message_count, 2);
    assert.equal(row.comment_count, 0);
    assert.deepEqual(row.payload, payload);
    assert.equal(row.error, null);
  });

  it("counts referral-bearing events from both top-level and message.referral", () => {
    const payload = {
      object: "page",
      entry: [
        {
          id: "page-1",
          messaging: [
            { sender: { id: "c1" }, referral: { ad_id: "ad-1", source: "ADS" } },
            { sender: { id: "c2" }, message: { text: "hi", referral: { ad_id: "ad-2" } } },
            { sender: { id: "c3" }, message: { text: "no ad" } },
          ],
        },
      ],
    };
    const row = buildWebhookEventLogRow({
      payload,
      signatureValid: true,
      result: { messages: 1, comments: 0, referrals: 2 },
    });
    assert.equal(row.referral_count, 2);
  });

  it("records invalid-signature deliveries and ingest errors", () => {
    const row = buildWebhookEventLogRow({
      payload: { _unparsed: "garbage" },
      signatureValid: false,
      error: "Invalid Meta webhook signature.",
    });
    assert.equal(row.signature_valid, false);
    assert.equal(row.object, null);
    assert.equal(row.entry_count, 0);
    assert.equal(row.referral_count, 0);
    assert.equal(row.message_count, null);
    assert.equal(row.error, "Invalid Meta webhook signature.");
  });
});
