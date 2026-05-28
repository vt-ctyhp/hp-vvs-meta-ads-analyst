import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  CALIFORNIA_BUSINESS_WINDOW,
  VN_BUSINESS_WINDOW,
  todaysWindow,
  yesterdaysWindow,
  type BusinessWindow,
} from "../src/lib/business-hours.ts";

const PT: BusinessWindow = CALIFORNIA_BUSINESS_WINDOW; // 10–19 America/Los_Angeles
const ICT: BusinessWindow = VN_BUSINESS_WINDOW;        // 10–19 Asia/Ho_Chi_Minh

describe("todaysWindow", () => {
  it("reports 'before' prior to business start in tz", () => {
    // 2026-05-27 16:00Z == 09:00 PT (PDT, UTC-7) → before 10:00 open
    const w = todaysWindow(new Date("2026-05-27T16:00:00Z"), PT);
    assert.equal(w.state, "before");
    assert.equal(w.start.toISOString(), "2026-05-27T17:00:00.000Z"); // 10:00 PDT
    assert.equal(w.end.toISOString(), "2026-05-28T02:00:00.000Z");   // 19:00 PDT
  });
  it("reports 'open' during hours", () => {
    const w = todaysWindow(new Date("2026-05-27T19:00:00Z"), PT); // 12:00 PT
    assert.equal(w.state, "open");
  });
  it("reports 'after' past business end in tz", () => {
    const w = todaysWindow(new Date("2026-05-28T03:00:00Z"), PT); // 20:00 PT
    assert.equal(w.state, "after");
  });
  it("computes today's window in ICT independently of PT", () => {
    // 2026-05-27 04:00Z == 11:00 ICT (UTC+7) → open
    const w = todaysWindow(new Date("2026-05-27T04:00:00Z"), ICT);
    assert.equal(w.state, "open");
    assert.equal(w.start.toISOString(), "2026-05-27T03:00:00.000Z"); // 10:00 ICT
    assert.equal(w.end.toISOString(), "2026-05-27T12:00:00.000Z");   // 19:00 ICT
  });
});

describe("yesterdaysWindow", () => {
  it("returns the prior calendar day's full window in tz", () => {
    const w = yesterdaysWindow(new Date("2026-05-27T19:00:00Z"), PT);
    assert.equal(w.start.toISOString(), "2026-05-26T17:00:00.000Z");
    assert.equal(w.end.toISOString(), "2026-05-27T02:00:00.000Z");
  });
});
