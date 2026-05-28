import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  SLA_BUSINESS_SECONDS,
  AT_RISK_REMAINING_SECONDS,
  buildQueueWindowMap,
  resolveUserWindow,
  DEFAULT_BUSINESS_WINDOW,
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
