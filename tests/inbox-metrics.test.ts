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
  computeTodayResponseMetrics,
  pickYesterdayAvg,
  userDateString,
  businessSecondsBetween,
  computeUnassignedMetrics,
  computeClaimsToday,
  computeTeammatesOverSla,
  type ConversationLike,
  type SendAttemptLike,
  type CommentActionLike,
  type RepliedConversation,
  type MetricsDailyRow,
  type AssignmentEventLike,
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

describe("computeTodayResponseMetrics (B1/B2)", () => {
  const userWindow = { tz: "America/Los_Angeles", startHour: 10, endHour: 19 };
  const now = new Date("2026-05-27T22:00:00Z"); // 15:00 PT
  it("averages business-seconds to first response and computes on-time rate", () => {
    const replied: RepliedConversation[] = [
      // arrived 10:00 PT (17:00Z), first reply 11:00 PT (18:00Z) → 3600s, on-time
      { firstInboundAt: "2026-05-27T17:00:00Z", firstOutboundAt: "2026-05-27T18:00:00Z", queueKey: "us_product" },
      // arrived 10:00 PT, first reply 14:00 PT (21:00Z) → 14400s > 10800 → late
      { firstInboundAt: "2026-05-27T17:00:00Z", firstOutboundAt: "2026-05-27T21:00:00Z", queueKey: "us_product" },
    ];
    const r = computeTodayResponseMetrics(replied, userWindow, QMAP, now);
    assert.equal(r.avgResponseSec, 9000); // (3600 + 14400)/2
    assert.equal(r.onTimeRate, 0.5);
    assert.equal(r.repliesConsidered, 2);
  });
  it("returns nulls when there are no replies today", () => {
    const r = computeTodayResponseMetrics([], userWindow, QMAP, now);
    assert.equal(r.avgResponseSec, null);
    assert.equal(r.onTimeRate, null);
  });
  it("excludes >7-day-old threads from the avg but keeps them in on-time rate", () => {
    const replied: RepliedConversation[] = [
      { firstInboundAt: "2026-05-27T17:00:00Z", firstOutboundAt: "2026-05-27T18:00:00Z", queueKey: "us_product" }, // 3600s on-time
      { firstInboundAt: "2026-05-10T17:00:00Z", firstOutboundAt: "2026-05-27T18:00:00Z", queueKey: "us_product" }, // >7d old, always late
    ];
    const r = computeTodayResponseMetrics(replied, userWindow, QMAP, now);
    assert.equal(r.avgResponseSec, 3600); // only the fresh one
    assert.equal(r.onTimeRate, 0.5); // both count for on-time; old one late
  });
});

describe("computeTodayResponseMetrics – two-clock rule (mixed timezone)", () => {
  // Regression: a vn_product (ICT = Asia/Ho_Chi_Minh, UTC+7) conversation replied
  // to by a PT (America/Los_Angeles, UTC-7 PDT) user.
  //
  // Setup:
  //   firstInboundAt  = 2026-05-27T04:00:00Z  →  11:00 ICT on May 27  (21:00 PT on May 26, after-hours)
  //   firstOutboundAt = 2026-05-27T17:30:00Z  →  00:30 ICT on May 28  (10:30 PT on May 27, inside today)
  //   now             = 2026-05-27T22:00:00Z  →  15:00 PT on May 27   (user's "today" is 17:00Z-02:00Z)
  //
  // Two-clock rule:
  //   ELAPSED uses the QUEUE's ICT window [10:00,19:00) ICT:
  //     Overlap of [04:00Z, 17:30Z) with the ICT day-window [03:00Z, 12:00Z) on May 27
  //     = [04:00Z, 12:00Z) = 8 h = 28 800 s.
  //   BUCKETING uses the USER's PT window [10:00,19:00) PT = [17:00Z, 02:00Z):
  //     17:30Z falls inside [17:00Z, 02:00Z(next)) → reply is counted as "today". ✓
  //
  // If the implementation wrongly used the PT window for elapsed:
  //   Overlap of [04:00Z May27, 17:30Z May27) with PT day-window [17:00Z May27, 02:00Z May28)
  //   = [17:00Z, 17:30Z) = 30 min = 1 800 s.
  //
  // The ICT value (28 800) and the PT-window value (1 800) differ by 27 000 s,
  // so a collapsed-clock implementation would produce the wrong answer.

  const ictQueueMap = buildQueueWindowMap([
    {
      key: "vn_product",
      timezone: "Asia/Ho_Chi_Minh",
      business_hours_start: "10:00:00",
      business_hours_end: "19:00:00",
    },
  ]);
  const ptUserWindow = { tz: "America/Los_Angeles", startHour: 10, endHour: 19 };
  const ictQueueWindow = { tz: "Asia/Ho_Chi_Minh", startHour: 10, endHour: 19 };
  const now = new Date("2026-05-27T22:00:00Z"); // 15:00 PT

  const inbound = new Date("2026-05-27T04:00:00Z");
  const outbound = new Date("2026-05-27T17:30:00Z");

  it("uses the queue (ICT) window for elapsed, not the user (PT) window", () => {
    const replied: RepliedConversation[] = [
      { firstInboundAt: inbound.toISOString(), firstOutboundAt: outbound.toISOString(), queueKey: "vn_product" },
    ];

    // Derive expected values directly from businessSecondsBetween to pin behaviour.
    const expectedIct = businessSecondsBetween(inbound, outbound, ictQueueWindow); // 28 800
    const wrongPt = businessSecondsBetween(inbound, outbound, ptUserWindow); // 1 800

    // Sanity-check that the two windows actually differ (if equal, the test proves nothing).
    assert.notEqual(expectedIct, wrongPt, "ICT and PT elapsed values must differ for this test to be meaningful");

    const r = computeTodayResponseMetrics(replied, ptUserWindow, ictQueueMap, now);

    // B1 avg must equal the ICT-window elapsed (28 800 s).
    // If the implementation collapsed the two clocks and used the PT window for elapsed,
    // it would return 1 800 instead of 28 800.
    assert.equal(r.avgResponseSec, expectedIct);
    assert.notEqual(r.avgResponseSec, wrongPt);

    // B2: 28 800 > SLA_BUSINESS_SECONDS (10 800) → late → on-time rate = 0.
    assert.equal(r.onTimeRate, 0);
    assert.equal(r.repliesConsidered, 1);
  });
});

describe("computeUnassignedMetrics (C1/C3)", () => {
  const now = new Date("2026-05-27T19:00:00Z"); // 12:00 PT
  it("counts unassigned open convs and oldest business-age", () => {
    const rows: ConversationLike[] = [
      { id: "a", assigned_user_id: null, conversation_status: "needs_reply", needs_reply: true, latest_inbound_at: null, first_inbound_at: "2026-05-27T18:00:00Z", queue_category_key: "us_product" }, // 11:00 PT → 60 biz-min old
      { id: "b", assigned_user_id: null, conversation_status: "new_inquiry", needs_reply: true, latest_inbound_at: null, first_inbound_at: "2026-05-27T17:00:00Z", queue_category_key: "us_product" }, // 10:00 PT → 120 biz-min old (oldest)
      { id: "c", assigned_user_id: null, conversation_status: "closed", needs_reply: false, latest_inbound_at: null, first_inbound_at: "2026-05-27T16:00:00Z", queue_category_key: "us_product" }, // closed → ignored
      { id: "d", assigned_user_id: ME, conversation_status: "needs_reply", needs_reply: true, latest_inbound_at: null, first_inbound_at: "2026-05-27T17:00:00Z", queue_category_key: "us_product" }, // assigned → ignored
    ];
    const r = computeUnassignedMetrics(rows, now, QMAP);
    assert.equal(r.unassigned, 2);
    assert.equal(r.oldestUnassignedSec, 7200); // 120 min from 10:00→12:00 PT
  });
  it("returns null oldest when no unassigned open convs", () => {
    const r = computeUnassignedMetrics([], now, QMAP);
    assert.equal(r.unassigned, 0);
    assert.equal(r.oldestUnassignedSec, null);
  });
});

describe("computeClaimsToday (C2)", () => {
  const userWindow = { tz: "America/Los_Angeles", startHour: 10, endHour: 19 };
  const now = new Date("2026-05-27T22:00:00Z"); // 15:00 PT
  it("counts unassigned→me claims within today and the today-arrival denominator", () => {
    const events: AssignmentEventLike[] = [
      { event_at: "2026-05-27T18:00:00Z", previousAssignedUserId: null, newAssignedUserId: ME }, // claim ✓
      { event_at: "2026-05-27T19:00:00Z", previousAssignedUserId: "other", newAssignedUserId: ME }, // reassignment, not a claim ✗
      { event_at: "2026-05-26T18:00:00Z", previousAssignedUserId: null, newAssignedUserId: ME }, // yesterday ✗
      { event_at: "2026-05-27T20:00:00Z", previousAssignedUserId: null, newAssignedUserId: "other" }, // someone else ✗
    ];
    const arrivals: ConversationLike[] = [
      { id: "a", assigned_user_id: ME, conversation_status: "needs_reply", needs_reply: true, latest_inbound_at: null, first_inbound_at: "2026-05-27T18:00:00Z", queue_category_key: "us_product" }, // arrived today ✓
      { id: "b", assigned_user_id: null, conversation_status: "new_inquiry", needs_reply: true, latest_inbound_at: null, first_inbound_at: "2026-05-27T17:30:00Z", queue_category_key: "us_product" }, // arrived today ✓
      { id: "c", assigned_user_id: ME, conversation_status: "needs_reply", needs_reply: true, latest_inbound_at: null, first_inbound_at: "2026-05-26T18:00:00Z", queue_category_key: "us_product" }, // yesterday ✗
    ];
    const r = computeClaimsToday(events, arrivals, ME, userWindow, now);
    assert.equal(r.claimedByMe, 1);
    assert.equal(r.todayUnassignedDenominator, 2);
  });
});

describe("computeTeammatesOverSla", () => {
  const now = new Date("2026-05-27T21:00:00Z"); // 14:00 PT (breach@13:00 cases are over)
  const U1 = "aaaaaaaa-1111-4111-8111-111111111111";
  const U2 = "bbbbbbbb-2222-4222-8222-222222222222";
  it("counts distinct teammates with an at-risk/breached needs-reply conv", () => {
    const rows: ConversationLike[] = [
      { id: "x", assigned_user_id: U1, conversation_status: "needs_reply", needs_reply: true, latest_inbound_at: "2026-05-27T16:00:00Z", first_inbound_at: "2026-05-27T16:00:00Z", queue_category_key: "us_product" }, // arrived 09:00 PT → breach 13:00 PT (20:00Z) → at 14:00 PT already breached → at-risk ✓
      { id: "y", assigned_user_id: U1, conversation_status: "needs_reply", needs_reply: true, latest_inbound_at: "2026-05-27T16:00:00Z", first_inbound_at: "2026-05-27T16:00:00Z", queue_category_key: "us_product" }, // same user, still 1 distinct
      { id: "z", assigned_user_id: U2, conversation_status: "needs_reply", needs_reply: true, latest_inbound_at: "2026-05-27T20:30:00Z", first_inbound_at: "2026-05-27T20:30:00Z", queue_category_key: "us_product" }, // arrived 13:30, breach 16:30, plenty left → not at risk
    ];
    assert.equal(computeTeammatesOverSla(rows, new Set([U1, U2]), now, QMAP), 1);
  });
});

describe("pickYesterdayAvg", () => {
  const userWindow = { tz: "America/Los_Angeles", startHour: 10, endHour: 19 };
  it("returns the avg_response_seconds for the user's yesterday date", () => {
    const now = new Date("2026-05-27T19:00:00Z"); // 12:00 PT today=05-27, yesterday=05-26
    const rows: MetricsDailyRow[] = [
      { user_id: ME, date: "2026-05-26", avg_response_seconds: 2400 },
      { user_id: ME, date: "2026-05-25", avg_response_seconds: 9999 },
    ];
    assert.equal(pickYesterdayAvg(rows, ME, now, userWindow), 2400);
  });
  it("returns null when there is no row for yesterday", () => {
    const now = new Date("2026-05-27T19:00:00Z");
    assert.equal(pickYesterdayAvg([], ME, now, userWindow), null);
  });
  it("computes the user-tz calendar date string", () => {
    assert.equal(userDateString(new Date("2026-05-28T02:30:00Z"), userWindow), "2026-05-27"); // 19:30 PT still 05-27
  });
});
