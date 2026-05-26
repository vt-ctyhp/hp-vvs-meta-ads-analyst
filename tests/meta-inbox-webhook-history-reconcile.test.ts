import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  buildMetaInboxNormalizationBatchWithThreadHistory,
  type MetaInboxThreadHistoryLoader,
} from "../src/lib/meta-inbox-normalization.ts";

describe("Meta inbox webhook history reconcile", () => {
  it("normalizes an outbound-echo webhook from full thread history, not just the echo", async () => {
    const inbound = {
      platform: "facebook",
      thread_id: "facebook:webhook:page-1:customer-1",
      message_id: "mid.inbound.1",
      direction: "inbound",
      sender_id: "customer-1",
      sent_at: "2026-05-26T06:18:00.000Z",
      raw_json: {},
    };
    const outboundEcho = {
      platform: "facebook",
      thread_id: "facebook:webhook:page-1:customer-1",
      message_id: "mid.outbound.echo",
      direction: "outbound",
      sender_id: "page-1",
      sent_at: "2026-05-26T06:18:30.000Z",
      raw_json: {},
    };

    const loader: MetaInboxThreadHistoryLoader = async (platform, threadId) => {
      assert.equal(platform, "facebook");
      assert.equal(threadId, "facebook:webhook:page-1:customer-1");
      return [inbound, outboundEcho];
    };

    const batch = await buildMetaInboxNormalizationBatchWithThreadHistory(
      {
        now: new Date("2026-05-26T06:40:00.000Z"),
        threads: [
          {
            platform: "facebook",
            thread_id: "facebook:webhook:page-1:customer-1",
            page_id: "page-1",
            participant_id: "customer-1",
            last_message_at: "2026-05-26T06:18:30.000Z",
          },
        ],
        messages: [outboundEcho],
      },
      loader,
    );

    assert.equal(batch.conversations.length, 1);
    const conv = batch.conversations[0];
    assert.equal(conv.sendEligibility, "standard_reply_allowed");
    assert.equal(conv.replyWindowExpiresAt, "2026-05-27T06:18:00.000Z");
    assert.equal(conv.latestInboundAt, "2026-05-26T06:18:00.000Z");
    assert.equal(conv.latestOutboundAt, "2026-05-26T06:18:30.000Z");
    assert.equal(conv.needsReply, false);
  });

  it("dedupes by (platform, message_id) when an incoming message overlaps with loaded history", async () => {
    const inboundV1Loaded = {
      platform: "facebook",
      thread_id: "facebook:webhook:page-1:customer-1",
      message_id: "mid.inbound.1",
      direction: "inbound",
      sender_id: "customer-1",
      sent_at: "2026-05-26T06:18:00.000Z",
      raw_json: { sender: { id: "customer-1" } },
    };
    const inboundV1Incoming = {
      platform: "facebook",
      thread_id: "facebook:webhook:page-1:customer-1",
      message_id: "mid.inbound.1",
      direction: "inbound",
      sender_id: "customer-1",
      sender_name: "Darlene C.",
      sent_at: "2026-05-26T06:18:00.000Z",
      raw_json: { sender: { id: "customer-1", name: "Darlene C." } },
    };

    const loader: MetaInboxThreadHistoryLoader = async () => [inboundV1Loaded];

    const batch = await buildMetaInboxNormalizationBatchWithThreadHistory(
      {
        now: new Date("2026-05-26T06:40:00.000Z"),
        threads: [
          {
            platform: "facebook",
            thread_id: "facebook:webhook:page-1:customer-1",
            page_id: "page-1",
            participant_id: "customer-1",
            participant_name: "Darlene C.",
            last_message_at: "2026-05-26T06:18:00.000Z",
          },
        ],
        messages: [inboundV1Incoming],
      },
      loader,
    );

    assert.equal(batch.conversations.length, 1);
    assert.equal(batch.customerProfiles.length, 1);
    assert.equal(batch.customerProfiles[0].displayName, "Darlene C.");
  });

  it("falls back to incoming messages when the loader returns nothing", async () => {
    const inbound = {
      platform: "facebook",
      thread_id: "facebook:webhook:page-1:customer-2",
      message_id: "mid.first",
      direction: "inbound",
      sender_id: "customer-2",
      sent_at: "2026-05-26T06:18:00.000Z",
      raw_json: {},
    };

    const loader: MetaInboxThreadHistoryLoader = async () => [];

    const batch = await buildMetaInboxNormalizationBatchWithThreadHistory(
      {
        now: new Date("2026-05-26T06:40:00.000Z"),
        threads: [
          {
            platform: "facebook",
            thread_id: "facebook:webhook:page-1:customer-2",
            page_id: "page-1",
            participant_id: "customer-2",
            last_message_at: "2026-05-26T06:18:00.000Z",
          },
        ],
        messages: [inbound],
      },
      loader,
    );

    assert.equal(batch.conversations.length, 1);
    assert.equal(batch.conversations[0].sendEligibility, "standard_reply_allowed");
    assert.equal(batch.conversations[0].latestInboundAt, "2026-05-26T06:18:00.000Z");
  });
});
