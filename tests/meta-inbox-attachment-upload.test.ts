import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  buildMetaInboxAttachmentUploadRow,
  MAX_META_INBOX_ATTACHMENT_BYTES,
  META_INBOX_ATTACHMENT_BUCKET,
  planMetaInboxAttachmentUpload,
  storagePathForMetaInboxAttachment,
} from "../src/lib/meta-inbox-attachment-upload.ts";

const CONVERSATION_ID = "33333333-3333-4333-8333-333333333333";
const ACTOR_ID = "11111111-1111-4111-8111-111111111111";
const NOW = "2026-05-27T20:00:00.000Z";

describe("Meta inbox attachment uploads", () => {
  it("plans sendable message attachments and builds draft rows", () => {
    const conversation = conversationFixture();
    const plan = planMetaInboxAttachmentUpload(conversation, {
      fileName: "Ring Photo.JPG",
      contentType: "image/jpeg",
      sizeBytes: 2048,
    });

    assert.equal(plan.attachmentType, "image");
    assert.equal(plan.mimeType, "image/jpeg");
    assert.equal(plan.safeFileName, "ring-photo.jpg");
    assert.equal(plan.capability.canSend, true);

    const row = buildMetaInboxAttachmentUploadRow(conversation, plan, {
      actorUserId: ACTOR_ID,
      now: NOW,
      publicUrl: "https://storage.example/ring-photo.jpg",
      storagePath: "staging/conv/object/ring-photo.jpg",
    });

    assert.equal(row.conversation_id, CONVERSATION_ID);
    assert.equal(row.direction, "draft");
    assert.equal(row.attachment_type, "image");
    assert.equal(row.media_url, "https://storage.example/ring-photo.jpg");
    assert.equal(row.preview_url, "https://storage.example/ring-photo.jpg");
    assert.equal(row.is_sendable, true);
    assert.equal(row.created_by, ACTOR_ID);
    assert.equal(
      (row.raw_json as Record<string, unknown>).storage_bucket,
      META_INBOX_ATTACHMENT_BUCKET,
    );
  });

  it("keeps storage paths scoped and slash-safe", () => {
    const path = storagePathForMetaInboxAttachment(
      "staging",
      CONVERSATION_ID,
      "object-1",
      "../Certificate 2026.PDF",
    );

    assert.equal(path, `staging/${CONVERSATION_ID}/object-1/certificate-2026.pdf`);
  });

  it("rejects unsupported upload surfaces and invalid file sizes", () => {
    assert.throws(
      () =>
        planMetaInboxAttachmentUpload(
          conversationFixture({ source_type: "public_comment" }),
          {
            fileName: "ring.jpg",
            contentType: "image/jpeg",
            sizeBytes: 512,
          },
        ),
      /Comment attachment sending/i,
    );

    assert.throws(
      () =>
        planMetaInboxAttachmentUpload(conversationFixture(), {
          fileName: "empty.jpg",
          contentType: "image/jpeg",
          sizeBytes: 0,
        }),
      /empty/i,
    );

    assert.throws(
      () =>
        planMetaInboxAttachmentUpload(conversationFixture(), {
          fileName: "huge.mp4",
          contentType: "video/mp4",
          sizeBytes: MAX_META_INBOX_ATTACHMENT_BYTES + 1,
        }),
      /too large/i,
    );
  });
});

function conversationFixture(
  overrides: Partial<{
    id: string;
    platform: "facebook" | "instagram";
    source_type: "message_thread" | "public_comment" | "private_reply" | "ad_referral" | "other";
  }> = {},
) {
  return {
    ...conversationFixtureBase(),
    ...overrides,
  };
}

function conversationFixtureBase() {
  return {
    id: CONVERSATION_ID,
    platform: "instagram" as const,
    source_type: "message_thread" as const,
  };
}
