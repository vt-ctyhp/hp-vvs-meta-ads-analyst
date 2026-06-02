import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { enrichBlankMessages, metaMessageIsBlank } from "../src/lib/social-inbox.ts";

describe("metaMessageIsBlank", () => {
  it("is false when the message has text", () => {
    assert.equal(metaMessageIsBlank({ id: "m", message: "hello" }), false);
  });

  it("is false when the message has a shared link", () => {
    assert.equal(
      metaMessageIsBlank({ id: "m", message: "", shares: { data: [{ link: "https://x.com/a" }] } }),
      false,
    );
  });

  it("is true when the message has no text and no displayable content", () => {
    assert.equal(metaMessageIsBlank({ id: "m", message: "" }), true);
  });
});

describe("enrichBlankMessages re-fetches blank message nodes", () => {
  it("replaces a blank message with the richer re-fetched node", async () => {
    const result = await enrichBlankMessages(
      [{ id: "m_1", message: "" }],
      async () => ({ id: "m_1", message: "", attachments: { data: [{ image_data: { url: "https://cdn/x.jpg" } }] } }),
      10,
    );
    assert.equal(result.length, 1);
    assert.ok(result[0].attachments, "expected attachments folded in from the re-fetched node");
  });

  it("does not re-fetch messages that already have content", async () => {
    let calls = 0;
    const result = await enrichBlankMessages(
      [{ id: "m_1", message: "already here" }],
      async () => {
        calls += 1;
        return { id: "m_1", message: "" };
      },
      10,
    );
    assert.equal(calls, 0);
    assert.equal(result[0].message, "already here");
  });

  it("honours the re-fetch budget", async () => {
    let calls = 0;
    await enrichBlankMessages(
      [
        { id: "m_1", message: "" },
        { id: "m_2", message: "" },
        { id: "m_3", message: "" },
      ],
      async (id) => {
        calls += 1;
        return { id, message: "" };
      },
      2,
    );
    assert.equal(calls, 2);
  });

  it("keeps the original message when the re-fetch fails (best effort)", async () => {
    const result = await enrichBlankMessages(
      [{ id: "m_1", message: "" }],
      async () => {
        throw new Error("graph 500");
      },
      10,
    );
    assert.equal(result.length, 1);
    assert.equal(result[0].id, "m_1");
  });
});
