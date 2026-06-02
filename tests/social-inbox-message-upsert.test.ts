import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { nonDestructiveMessageRows } from "../src/lib/social-inbox.ts";

describe("nonDestructiveMessageRows protects captured content from blank re-syncs", () => {
  const existing = new Map([
    ["m_text", { body: "I want to sell my ring", attachments: [] }],
    ["m_photo", { body: null, attachments: [{ attachmentType: "image", mediaUrl: "https://cdn/x.jpg" }] }],
    ["m_blank", { body: null, attachments: [] }],
  ]);

  it("keeps the existing body when an incoming row arrives blank", () => {
    const [row] = nonDestructiveMessageRows(
      [{ message_id: "m_text", body: null, attachments: [] }],
      existing,
    );
    assert.equal(row.body, "I want to sell my ring");
  });

  it("keeps the existing attachments when an incoming row arrives blank", () => {
    const [row] = nonDestructiveMessageRows(
      [{ message_id: "m_photo", body: null, attachments: [] }],
      existing,
    );
    assert.equal((row.attachments as unknown[]).length, 1);
  });

  it("lets fresh incoming content win over what was stored", () => {
    const [row] = nonDestructiveMessageRows(
      [{ message_id: "m_text", body: "updated text", attachments: [] }],
      existing,
    );
    assert.equal(row.body, "updated text");
  });

  it("leaves a blank incoming row blank when there is nothing to preserve", () => {
    const [row] = nonDestructiveMessageRows(
      [{ message_id: "m_new", body: null, attachments: [] }],
      existing,
    );
    assert.equal(row.body, null);
    assert.deepEqual(row.attachments, []);
  });
});
