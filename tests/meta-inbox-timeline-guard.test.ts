import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { preserveConversationTimeline } from "../src/lib/meta-inbox-normalization.ts";

describe("preserveConversationTimeline (durable upsert guard)", () => {
  // The incremental webhook path normalizes a single synthetic-thread message —
  // here a lone outbound reply — producing a row with no inbound. Without the
  // guard this upsert blanked latest_inbound_at and closed the reply window.
  it("does not let a partial (no-inbound) pass regress the stored inbound timeline", () => {
    const incoming = {
      canonical_conversation_key: "facebook:message_thread:page-1:cust-1",
      first_inbound_at: null,
      latest_inbound_at: null,
      latest_outbound_at: "2026-05-29T18:34:14.000Z",
      last_activity_at: "2026-05-29T18:34:14.000Z",
      reply_window_expires_at: null,
      human_agent_window_expires_at: null,
      send_eligibility: "unknown",
      needs_reply: false,
    };
    const existing = {
      first_inbound_at: "2026-05-27T22:10:00.000Z",
      latest_inbound_at: "2026-05-28T20:38:17.000Z",
      latest_outbound_at: "2026-05-28T20:40:00.000Z",
      last_activity_at: "2026-05-28T20:40:00.000Z",
    };

    const merged = preserveConversationTimeline(incoming, existing, new Date("2026-05-29T18:40:00.000Z"));

    assert.equal(merged.first_inbound_at, "2026-05-27T22:10:00.000Z");
    assert.equal(merged.latest_inbound_at, "2026-05-28T20:38:17.000Z");
    // The new outbound is later than the stored one and is kept.
    assert.equal(merged.latest_outbound_at, "2026-05-29T18:34:14.000Z");
    assert.equal(merged.last_activity_at, "2026-05-29T18:34:14.000Z");
    // Window recomputed from the preserved inbound → still open (24h until 20:38).
    assert.equal(merged.reply_window_expires_at, "2026-05-29T20:38:17.000Z");
    assert.equal(merged.human_agent_window_expires_at, "2026-06-04T20:38:17.000Z");
    assert.equal(merged.send_eligibility, "standard_reply_allowed");
    // Agent already replied after the last inbound → not awaiting our reply.
    assert.equal(merged.needs_reply, false);
    // Non-timeline fields pass through untouched.
    assert.equal(merged.canonical_conversation_key, "facebook:message_thread:page-1:cust-1");
  });

  // Stored rows come back from Postgres as `2026-05-28 20:38:17+00` (space +
  // `+00`); the incoming row is canonical `…T…Z`. Comparison/output must be by
  // instant, not lexicographic, or the formats would mis-sort.
  it("handles Postgres timestamptz format and falls back to the human-agent window", () => {
    const incoming = {
      first_inbound_at: null,
      latest_inbound_at: null,
      latest_outbound_at: "2026-05-29T18:34:14.000Z",
      last_activity_at: "2026-05-29T18:34:14.000Z",
      send_eligibility: "unknown",
      needs_reply: false,
    };
    const existing = {
      first_inbound_at: "2026-05-20 01:00:00+00",
      latest_inbound_at: "2026-05-28 20:38:17+00",
      latest_outbound_at: "2026-05-28 21:00:00+00",
      last_activity_at: "2026-05-28 21:00:00+00",
    };

    // now is > 24h after the inbound but < 7d → human-agent window.
    const merged = preserveConversationTimeline(incoming, existing, new Date("2026-05-30T10:00:00.000Z"));

    assert.equal(merged.first_inbound_at, "2026-05-20T01:00:00.000Z");
    assert.equal(merged.latest_inbound_at, "2026-05-28T20:38:17.000Z");
    assert.equal(merged.send_eligibility, "human_agent_allowed");
    assert.equal(merged.reply_window_expires_at, "2026-05-29T20:38:17.000Z");
    assert.equal(merged.human_agent_window_expires_at, "2026-06-04T20:38:17.000Z");
  });

  // A genuine newer inbound (full re-sync) must win, and a fresh customer
  // message after our last reply flips needs_reply back on.
  it("advances the timeline forward and recomputes needs_reply when the customer replies again", () => {
    const incoming = {
      first_inbound_at: "2026-05-27T22:10:00.000Z",
      latest_inbound_at: "2026-05-29T19:00:00.000Z",
      latest_outbound_at: "2026-05-29T18:34:14.000Z",
      last_activity_at: "2026-05-29T19:00:00.000Z",
      send_eligibility: "standard_reply_allowed",
      needs_reply: true,
    };
    const existing = {
      first_inbound_at: "2026-05-27T22:10:00.000Z",
      latest_inbound_at: "2026-05-28T20:38:17.000Z",
      latest_outbound_at: "2026-05-29T18:34:14.000Z",
      last_activity_at: "2026-05-29T18:34:14.000Z",
    };

    const merged = preserveConversationTimeline(incoming, existing, new Date("2026-05-29T19:05:00.000Z"));

    assert.equal(merged.latest_inbound_at, "2026-05-29T19:00:00.000Z");
    assert.equal(merged.latest_outbound_at, "2026-05-29T18:34:14.000Z");
    assert.equal(merged.send_eligibility, "standard_reply_allowed");
    // Newest message is inbound → awaiting our reply.
    assert.equal(merged.needs_reply, true);
  });

  // Truly outbound-only customer (never messaged) stays unknown — the guard
  // must not fabricate a window where there is no inbound anywhere.
  it("keeps eligibility unknown when neither row has any inbound", () => {
    const incoming = {
      first_inbound_at: null,
      latest_inbound_at: null,
      latest_outbound_at: "2026-05-29T18:34:14.000Z",
      last_activity_at: "2026-05-29T18:34:14.000Z",
      send_eligibility: "unknown",
      needs_reply: false,
    };
    const existing = {
      first_inbound_at: null,
      latest_inbound_at: null,
      latest_outbound_at: "2026-05-20T00:00:00.000Z",
      last_activity_at: "2026-05-20T00:00:00.000Z",
    };

    const merged = preserveConversationTimeline(incoming, existing, new Date("2026-05-29T18:40:00.000Z"));

    assert.equal(merged.latest_inbound_at, null);
    assert.equal(merged.send_eligibility, "unknown");
    assert.equal(merged.reply_window_expires_at, null);
    assert.equal(merged.needs_reply, false);
  });
});
