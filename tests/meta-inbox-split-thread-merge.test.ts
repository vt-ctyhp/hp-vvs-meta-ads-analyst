import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { buildMetaInboxNormalizationBatch } from "../src/lib/meta-inbox-normalization.ts";

describe("Meta inbox split-thread merge", () => {
  // Regression: a customer can own two raw threads on the same page — the real
  // polled `t_…` thread (full inbound history) and a synthetic
  // `…:webhook:…` thread that only holds an outbound agent reply. Both resolve
  // to the same canonical key. Normalization must MERGE them into one
  // conversation computed from the union of their messages, instead of letting
  // the last-processed raw thread clobber the timeline (which blanked
  // latest_inbound_at and wrongly closed the reply window).
  it("merges a polled t_ thread and a synthetic webhook thread for the same participant", () => {
    const batch = buildMetaInboxNormalizationBatch({
      now: new Date("2026-05-29T18:40:00.000Z"),
      // Order matters for the regression: the polled thread is processed first,
      // then the lone-outbound webhook thread — which used to win and clobber.
      threads: [
        {
          id: "row-poll",
          platform: "facebook",
          thread_id: "t_999",
          page_id: "page-1",
          participant_id: "cust-1",
          participant_name: "Phạm Chi",
          last_message_at: "2026-05-28T20:38:17.000Z",
        },
        {
          id: "row-webhook",
          platform: "facebook",
          thread_id: "facebook:webhook:page-1:cust-1",
          page_id: "page-1",
          participant_id: "cust-1",
          last_message_at: "2026-05-29T18:34:14.000Z",
        },
      ],
      messages: [
        {
          id: "m1",
          platform: "facebook",
          thread_id: "t_999",
          message_id: "mid.in.1",
          direction: "inbound",
          sender_id: "cust-1",
          sender_name: "Phạm Chi",
          body: "Chị ơi vàng 9999 hôm nay giá bn vậy c.",
          sent_at: "2026-05-27T22:10:00.000Z",
        },
        {
          id: "m2",
          platform: "facebook",
          thread_id: "t_999",
          message_id: "mid.in.2",
          direction: "inbound",
          sender_id: "cust-1",
          sender_name: "Phạm Chi",
          body: "Vàng 9999 hôm nay bn vậy c .",
          sent_at: "2026-05-28T20:38:17.000Z",
        },
        {
          id: "m3",
          platform: "facebook",
          thread_id: "facebook:webhook:page-1:cust-1",
          message_id: "mid.out.1",
          direction: "outbound",
          sender_id: "page-1",
          recipient_id: "cust-1",
          body: "Chị Chi muốn mua hay bán ạ.(NY)",
          sent_at: "2026-05-29T18:34:14.000Z",
        },
      ],
    });

    assert.equal(batch.conversations.length, 1);
    const conv = batch.conversations[0];

    assert.equal(conv.canonicalConversationKey, "facebook:message_thread:page-1:cust-1");
    // Inbound history survives the lone outbound webhook reply.
    assert.equal(conv.firstInboundAt, "2026-05-27T22:10:00.000Z");
    assert.equal(conv.latestInboundAt, "2026-05-28T20:38:17.000Z");
    assert.equal(conv.latestOutboundAt, "2026-05-29T18:34:14.000Z");
    // Last inbound May 28 20:38 → standard window open until May 29 20:38; now is 18:40.
    assert.equal(conv.replyWindowExpiresAt, "2026-05-29T20:38:17.000Z");
    assert.equal(conv.humanAgentWindowExpiresAt, "2026-06-04T20:38:17.000Z");
    assert.equal(conv.sendEligibility, "standard_reply_allowed");
    // The richer polled thread becomes the conversation's primary thread.
    assert.equal(conv.platformThreadId, "t_999");
    assert.equal(conv.rawThreadId, "row-poll");
    // Agent already replied after the last inbound → not awaiting our reply.
    assert.equal(conv.needsReply, false);
  });
});
