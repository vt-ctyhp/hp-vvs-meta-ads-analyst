import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { webhookMessageRow } from "../src/lib/meta-webhook-shape.ts";

describe("webhookMessageRow name extraction", () => {
  it("pulls participant_name and sender_name from the payload when present", () => {
    const row = webhookMessageRow(
      "page",
      { id: "page-1" },
      {
        sender: { id: "customer-1", name: "Darlene C." },
        recipient: { id: "page-1" },
        message: { mid: "mid.1", text: "hi" },
        timestamp: 1748246280000,
      },
    );

    assert.ok(row);
    assert.equal(row.thread.participant_name, "Darlene C.");
    assert.equal(row.message.sender_name, "Darlene C.");
    assert.equal(row.message.recipient_name, null);
  });

  it("preserves null when the payload omits names entirely", () => {
    const row = webhookMessageRow(
      "page",
      { id: "page-1" },
      {
        sender: { id: "customer-1" },
        recipient: { id: "page-1" },
        message: { mid: "mid.1", text: "hi" },
        timestamp: 1748246280000,
      },
    );

    assert.ok(row);
    assert.equal(row.thread.participant_name, null);
    assert.equal(row.message.sender_name, null);
    assert.equal(row.message.recipient_name, null);
  });

  it("uses recipient_name for the participant when the event is an echo", () => {
    const row = webhookMessageRow(
      "page",
      { id: "page-1" },
      {
        sender: { id: "page-1" },
        recipient: { id: "customer-1", name: "Darlene C." },
        message: { mid: "mid.echo", text: "auto-reply", is_echo: true },
        timestamp: 1748246280000,
      },
    );

    assert.ok(row);
    assert.equal(row.thread.participant_name, "Darlene C.");
    assert.equal(row.message.recipient_name, "Darlene C.");
    assert.equal(row.message.direction, "outbound");
  });
});
