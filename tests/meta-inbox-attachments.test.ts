import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";

import {
  attachmentCapabilityForConversation,
  normalizeMetaInboxAttachment,
  normalizeMetaInboxAttachments,
} from "../src/lib/meta-inbox-attachments.ts";
import {
  buildMetaInboxSendAttemptDraft,
  type MetaInboxReplyConversationInput,
} from "../src/lib/meta-inbox-reply-reliability.ts";

const REPO_ROOT = fileURLToPath(new URL("..", import.meta.url));
const MIGRATION = join(
  REPO_ROOT,
  "supabase/migrations/20260524110000_meta_inbox_attachments.sql",
);
const migration = readFileSync(MIGRATION, "utf8");

const NOW = "2026-05-24T12:00:00.000Z";
const ACTOR_ID = "11111111-1111-4111-8111-111111111111";
const ATTACHMENT_ID = "22222222-2222-4222-8222-222222222222";
const OTHER_ATTACHMENT_ID = "55555555-5555-4555-8555-555555555555";

describe("Meta inbox attachment foundation", () => {
  it("creates normalized attachment storage with capability and lookup fields", () => {
    assert.match(migration, /create table if not exists public\.meta_inbox_attachments/);
    for (const column of [
      "conversation_id",
      "message_id",
      "send_attempt_id",
      "direction",
      "attachment_type",
      "meta_attachment_id",
      "mime_type",
      "media_url",
      "preview_url",
      "is_sendable",
      "send_capability",
      "raw_json",
    ]) {
      assert.match(migration, new RegExp(column));
    }
    assert.match(migration, /meta_inbox_attachments_conversation_idx/);
    assert.match(migration, /meta_inbox_attachments_send_attempt_idx/);
    assert.match(migration, /ads_analyst_environment_matches\(environment\)/);
  });

  it("normalizes Graph API image/file attachments into a UI-safe shape", () => {
    const image = normalizeMetaInboxAttachment({
      id: "att-1",
      mime_type: "image/jpeg",
      name: "ring.jpg",
      size: 2048,
      image_data: {
        url: "https://cdn.example/image.jpg",
        preview_url: "https://cdn.example/preview.jpg",
      },
    });

    assert.equal(image.attachmentType, "image");
    assert.equal(image.label, "ring.jpg");
    assert.equal(image.metaAttachmentId, "att-1");
    assert.equal(image.mediaUrl, "https://cdn.example/image.jpg");
    assert.equal(image.previewUrl, "https://cdn.example/preview.jpg");
    assert.equal(image.sizeBytes, 2048);

    const file = normalizeMetaInboxAttachment({
      mime_type: "application/pdf",
      file_url: "https://cdn.example/certificate.pdf",
    });
    assert.equal(file.attachmentType, "file");
    assert.equal(file.label, "File attachment");
  });

  it("normalizes webhook sticker/share attachments and preserves unsupported placeholders", () => {
    const attachments = normalizeMetaInboxAttachments([
      {
        type: "sticker",
        payload: {
          sticker_id: "sticker-1",
          sticker_url: "https://cdn.example/sticker.png",
        },
      },
      {
        payload: {
          url: "https://example.com/product",
        },
      },
      {
        type: "unsupported",
        payload: {},
      },
    ]);

    assert.equal(attachments[0].attachmentType, "sticker");
    assert.equal(attachments[0].previewUrl, "https://cdn.example/sticker.png");
    assert.equal(attachments[1].attachmentType, "share");
    assert.equal(attachments[2].attachmentType, "unknown");
    assert.equal(attachments[2].label, "Unsupported attachment");
  });

  it("stores approved send-attempt attachment IDs without requiring text", () => {
    const draft = buildMetaInboxSendAttemptDraft(
      conversationFixture(),
      {
        replyText: "",
        idempotencyKey: "attachments-only",
        attachmentIds: [ATTACHMENT_ID, ATTACHMENT_ID],
      },
      { actorUserId: ACTOR_ID, now: NOW, humanAgentEnabled: true },
    );

    assert.deepEqual(draft.row.attachment_ids, [ATTACHMENT_ID]);
    assert.equal(draft.row.reply_text, "");
    assert.equal(draft.event.newValue.attachmentCount, 1);

    assert.throws(
      () =>
        buildMetaInboxSendAttemptDraft(
          conversationFixture(),
          { replyText: "", attachmentIds: ["not-a-uuid"] },
          { actorUserId: ACTOR_ID, now: NOW, humanAgentEnabled: true },
        ),
      /valid UUID/i,
    );
  });

  it("includes attachment identity in send-attempt idempotency fallback keys", () => {
    const first = buildMetaInboxSendAttemptDraft(
      conversationFixture(),
      {
        replyText: "Here is the photo.",
        attachmentIds: [ATTACHMENT_ID],
      },
      { actorUserId: ACTOR_ID, now: NOW, humanAgentEnabled: true },
    );
    const samePayload = buildMetaInboxSendAttemptDraft(
      conversationFixture(),
      {
        replyText: "Here is the photo.",
        attachmentIds: [ATTACHMENT_ID],
      },
      { actorUserId: ACTOR_ID, now: "2026-05-24T12:05:00.000Z", humanAgentEnabled: true },
    );
    const changedAttachment = buildMetaInboxSendAttemptDraft(
      conversationFixture(),
      {
        replyText: "Here is the photo.",
        attachmentIds: [OTHER_ATTACHMENT_ID],
      },
      { actorUserId: ACTOR_ID, now: NOW, humanAgentEnabled: true },
    );

    assert.equal(first.row.idempotency_key, samePayload.row.idempotency_key);
    assert.notEqual(first.row.idempotency_key, changedAttachment.row.idempotency_key);
  });

  it("capability-gates outbound attachment sends by conversation surface", () => {
    const messageImage = attachmentCapabilityForConversation(
      "facebook",
      "message_thread",
      "image",
    );
    assert.equal(messageImage.canReceive, true);
    assert.equal(messageImage.canSend, true);

    const commentImage = attachmentCapabilityForConversation(
      "facebook",
      "public_comment",
      "image",
    );
    assert.equal(commentImage.canReceive, true);
    assert.equal(commentImage.canSend, false);

    const sticker = attachmentCapabilityForConversation("instagram", "message_thread", "sticker");
    assert.equal(sticker.canSend, false);
  });
});

function conversationFixture(
  overrides: Partial<MetaInboxReplyConversationInput> = {},
): MetaInboxReplyConversationInput {
  return {
    id: "33333333-3333-4333-8333-333333333333",
    send_eligibility: "standard_reply_allowed",
    reply_window_expires_at: "2026-05-24T13:00:00.000Z",
    human_agent_window_expires_at: "2026-05-30T12:00:00.000Z",
    ...overrides,
  };
}
