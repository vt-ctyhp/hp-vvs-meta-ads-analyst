import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { messageAttachmentsFromRow } from "../src/lib/social-inbox.ts";

describe("messageAttachmentsFromRow recovers shares from raw_json when the column is empty", () => {
  it("folds a top-level Graph `shares` field into a share attachment", () => {
    const result = messageAttachmentsFromRow({
      attachments: [],
      raw_json: {
        id: "m_1",
        message: "",
        shares: { data: [{ id: "m_1", link: "https://youtube.com/shorts/TFbNICIlCLE" }] },
      },
    });

    assert.equal(result.length, 1);
    assert.equal(result[0].attachmentType, "share");
    assert.equal(result[0].mediaUrl, "https://youtube.com/shorts/TFbNICIlCLE");
  });

  it("folds a webhook-shaped `shares` nested under message", () => {
    const result = messageAttachmentsFromRow({
      attachments: [],
      raw_json: {
        message: { mid: "mid.1", shares: { data: [{ link: "https://example.com/reel" }] } },
      },
    });

    assert.equal(result.length, 1);
    assert.equal(result[0].attachmentType, "share");
    assert.equal(result[0].mediaUrl, "https://example.com/reel");
  });

  it("prefers the stored attachments column when it already has content", () => {
    const result = messageAttachmentsFromRow({
      attachments: [{ attachmentType: "image", mediaUrl: "https://cdn.example/a.jpg" }],
      raw_json: { shares: { data: [{ link: "https://example.com/ignored" }] } },
    });

    assert.equal(result.length, 1);
    assert.equal(result[0].attachmentType, "image");
  });
});
