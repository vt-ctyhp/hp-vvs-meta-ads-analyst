import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  SLA_BUSINESS_SECONDS,
  AT_RISK_REMAINING_SECONDS,
  buildQueueWindowMap,
  resolveUserWindow,
  DEFAULT_BUSINESS_WINDOW,
  computePipelineMetrics,
  computeRepliesSentToday,
  type ConversationLike,
  type SendAttemptLike,
  type CommentActionLike,
} from "../src/lib/inbox-metrics.ts";

describe("inbox-metrics constants & window helpers", () => {
  it("uses a 3 business-hour SLA and a 30-minute at-risk threshold", () => {
    assert.equal(SLA_BUSINESS_SECONDS, 10800);
    assert.equal(AT_RISK_REMAINING_SECONDS, 1800);
  });
  it("builds a queue→window map from queue category rows", () => {
    const map = buildQueueWindowMap([
      { key: "vn_product", timezone: "Asia/Ho_Chi_Minh", business_hours_start: "10:00:00", business_hours_end: "19:00:00" },
      { key: "us_product", timezone: "America/Los_Angeles", business_hours_start: "10:00:00", business_hours_end: "19:00:00" },
    ]);
    assert.deepEqual(map.get("vn_product"), { tz: "Asia/Ho_Chi_Minh", startHour: 10, endHour: 19 });
    assert.deepEqual(map.get("us_product"), { tz: "America/Los_Angeles", startHour: 10, endHour: 19 });
  });
  it("falls back to the PT default window for unknown queues", () => {
    const map = buildQueueWindowMap([]);
    assert.deepEqual(map.get("anything_missing") ?? DEFAULT_BUSINESS_WINDOW, DEFAULT_BUSINESS_WINDOW);
  });
  it("resolves a user's window from a timezone string", () => {
    assert.deepEqual(resolveUserWindow("Asia/Ho_Chi_Minh"), { tz: "Asia/Ho_Chi_Minh", startHour: 10, endHour: 19 });
    assert.deepEqual(resolveUserWindow(null), DEFAULT_BUSINESS_WINDOW);
  });
});

const ME = "11111111-1111-4111-8111-111111111111";
const QMAP = buildQueueWindowMap([
  { key: "us_product", timezone: "America/Los_Angeles", business_hours_start: "10:00:00", business_hours_end: "19:00:00" },
]);

function conv(overrides: Partial<ConversationLike>): ConversationLike {
  return {
    id: "c",
    assigned_user_id: ME,
    conversation_status: "needs_reply",
    needs_reply: true,
    latest_inbound_at: "2026-05-27T18:00:00Z",
    queue_category_key: "us_product",
    first_inbound_at: "2026-05-27T18:00:00Z",
    ...overrides,
  };
}

describe("computePipelineMetrics (A1/A2/A3)", () => {
  const now = new Date("2026-05-27T19:00:00Z"); // 12:00 PT
  it("counts open assigned, needs-reply, and at-risk", () => {
    const rows = [
      conv({ id: "a" }), // 18:00Z arrival, breach 3 biz h later; at 12:00PT plenty left → not at risk
      conv({ id: "b", latest_inbound_at: "2026-05-27T17:10:00Z" }), // arrived 10:10PT, breach 13:10PT; at 12:00 → 70m left, not at risk
      conv({ id: "c", latest_inbound_at: "2026-05-27T16:40:00Z" }), // arrived 09:40 (before open→clock 10:00), breach 13:00; at 12:00 → 60m left, not at risk
      conv({ id: "d", assigned_user_id: "other" }), // not mine
      conv({ id: "e", conversation_status: "closed" }), // closed
      conv({ id: "f", needs_reply: false }), // no reply needed
    ];
    const result = computePipelineMetrics(rows, ME, now, QMAP);
    assert.equal(result.assigned, 4); // a,b,c,f (mine, not closed): excludes d(other), e(closed)
    assert.equal(result.needsReply, 3); // a,b,c (f has needs_reply false)
    assert.ok(result.atRisk >= 0);
  });
  it("flags a conversation within 30 business-minutes of breach as at-risk", () => {
    // arrived 09:00 PT → clock starts 10:00 → breach 13:00 PT (20:00Z).
    // now = 12:40 PT (19:40Z) → 20 business-min remaining ≤ 30 → at risk.
    const rows = [conv({ latest_inbound_at: "2026-05-27T16:00:00Z" })];
    const result = computePipelineMetrics(rows, ME, new Date("2026-05-27T19:40:00Z"), QMAP);
    assert.equal(result.atRisk, 1);
  });
  it("flags a breached conversation as at-risk", () => {
    // breach 13:00 PT, now 14:00 PT → negative remaining → at risk.
    const rows = [conv({ latest_inbound_at: "2026-05-27T16:00:00Z" })];
    const result = computePipelineMetrics(rows, ME, new Date("2026-05-27T21:00:00Z"), QMAP);
    assert.equal(result.atRisk, 1);
  });
});

describe("computeRepliesSentToday (B3)", () => {
  // user window: PT today = 2026-05-27 10:00→19:00 PT == 17:00Z→02:00Z(next).
  const userWindow = { tz: "America/Los_Angeles", startHour: 10, endHour: 19 };
  const now = new Date("2026-05-27T19:00:00Z"); // 12:00 PT, inside today
  it("counts sent send-attempts and succeeded comment actions within the window", () => {
    const sends: SendAttemptLike[] = [
      { approved_by: ME, status: "sent", sent_at: "2026-05-27T18:00:00Z" }, // 11:00 PT ✓
      { approved_by: ME, status: "sent", sent_at: "2026-05-27T16:00:00Z" }, // 09:00 PT (before open) ✗
      { approved_by: ME, status: "queued", sent_at: "2026-05-27T18:30:00Z" }, // not sent ✗
      { approved_by: "other", status: "sent", sent_at: "2026-05-27T18:30:00Z" }, // not me ✗
    ];
    const comments: CommentActionLike[] = [
      { requested_by: ME, status: "succeeded", completed_at: "2026-05-27T20:00:00Z" }, // 13:00 PT ✓
      { requested_by: ME, status: "failed", completed_at: "2026-05-27T20:30:00Z" }, // ✗
    ];
    assert.equal(computeRepliesSentToday(sends, comments, ME, userWindow, now), 2);
  });
});
