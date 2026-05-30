import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { buildMetaInboxNormalizationBatch } from "../src/lib/meta-inbox-normalization.ts";

describe("Meta inbox canonical key from synthetic webhook threads", () => {
  // Regression: when a webhook thread is normalized before its participant/page
  // identity is resolved on the row, canonicalThreadKey used to fall back to the
  // raw thread id and embed it — producing a malformed key like
  // `facebook:message_thread:facebook:webhook:<page>:<participant>` and a
  // duplicate conversation. The synthetic id reliably encodes page+participant,
  // so the key must be derived from it, not the raw fallback.
  it("derives the clean canonical key from the synthetic id when identity is unresolved", () => {
    const batch = buildMetaInboxNormalizationBatch({
      now: new Date("2026-05-29T18:05:00.000Z"),
      threads: [
        {
          id: "row-webhook",
          platform: "facebook",
          // No page_id / participant_id on the row — only the synthetic id carries them.
          thread_id: "facebook:webhook:100615618793615:27198347296469292",
          last_message_at: "2026-05-29T18:00:00.000Z",
        },
      ],
      messages: [
        {
          id: "m1",
          platform: "facebook",
          thread_id: "facebook:webhook:100615618793615:27198347296469292",
          message_id: "mid.out.1",
          direction: "outbound",
          sender_id: "100615618793615",
          recipient_id: "27198347296469292",
          body: "Chị muốn mua hay bán ạ?",
          sent_at: "2026-05-29T18:00:00.000Z",
        },
      ],
    });

    assert.equal(batch.conversations.length, 1);
    assert.equal(
      batch.conversations[0].canonicalConversationKey,
      "facebook:message_thread:100615618793615:27198347296469292",
    );
    // The malformed shape must never be produced.
    assert.ok(!batch.conversations[0].canonicalConversationKey.includes(":webhook:"));
  });

  // The whole point of the canonical key is to keep the synthetic webhook thread
  // and the real polled `t_…` thread on ONE conversation. With the unresolved
  // webhook thread keyed correctly, it must merge with the polled thread instead
  // of producing a second (duplicate) conversation row.
  it("merges an unresolved webhook thread with the polled thread for the same participant", () => {
    const batch = buildMetaInboxNormalizationBatch({
      now: new Date("2026-05-29T18:05:00.000Z"),
      threads: [
        {
          id: "row-webhook",
          platform: "facebook",
          thread_id: "facebook:webhook:100615618793615:27198347296469292",
          last_message_at: "2026-05-29T18:00:00.000Z",
        },
        {
          id: "row-poll",
          platform: "facebook",
          thread_id: "t_555",
          page_id: "100615618793615",
          participant_id: "27198347296469292",
          participant_name: "Test Customer",
          last_message_at: "2026-05-29T17:00:00.000Z",
        },
      ],
      messages: [
        {
          id: "m-out",
          platform: "facebook",
          thread_id: "facebook:webhook:100615618793615:27198347296469292",
          message_id: "mid.out.1",
          direction: "outbound",
          sender_id: "100615618793615",
          recipient_id: "27198347296469292",
          body: "reply",
          sent_at: "2026-05-29T18:00:00.000Z",
        },
        {
          id: "m-in",
          platform: "facebook",
          thread_id: "t_555",
          message_id: "mid.in.1",
          direction: "inbound",
          sender_id: "27198347296469292",
          sender_name: "Test Customer",
          body: "hello",
          sent_at: "2026-05-29T17:00:00.000Z",
        },
      ],
    });

    assert.equal(batch.conversations.length, 1);
    const conv = batch.conversations[0];
    assert.equal(conv.canonicalConversationKey, "facebook:message_thread:100615618793615:27198347296469292");
    assert.equal(conv.participantId, "27198347296469292");
    // Inbound from the polled thread is preserved in the merged conversation.
    assert.equal(conv.latestInboundAt, "2026-05-29T17:00:00.000Z");
  });
});
