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

describe("DST spring-forward (2026-03-08, PT clocks spring forward to PDT = UTC-7)", () => {
  // US DST 2026: second Sunday of March = Mar 8.
  // Mid-day on Mar 8 is already PDT (clocks spring forward at 2:00 AM).
  // 10:00 PDT = 17:00Z; 19:00 PDT = 02:00Z next day.
  const now = new Date("2026-03-08T20:00:00Z"); // 13:00 PDT — well inside the day

  it("start reflects PDT offset (UTC-7): 10:00 PDT = 17:00Z", () => {
    const w = todaysWindow(now, PT);
    assert.equal(w.start.toISOString(), "2026-03-08T17:00:00.000Z");
  });

  it("end reflects PDT offset (UTC-7): 19:00 PDT = 02:00Z next day", () => {
    const w = todaysWindow(now, PT);
    assert.equal(w.end.toISOString(), "2026-03-09T02:00:00.000Z");
  });

  it("state is 'open' at mid-day on spring-forward day", () => {
    const w = todaysWindow(now, PT);
    assert.equal(w.state, "open");
  });
});

describe("DST fall-back (2026-11-01, PT clocks fall back to PST = UTC-8)", () => {
  // US DST fall-back 2026: first Sunday of November = Nov 1.
  // Mid-day on Nov 1 is already PST (clocks fall back at 2:00 AM).
  // 10:00 PST = 18:00Z; 19:00 PST = 03:00Z next day.
  const now = new Date("2026-11-01T20:00:00Z"); // 12:00 PST — well inside the day

  it("start reflects PST offset (UTC-8): 10:00 PST = 18:00Z", () => {
    const w = todaysWindow(now, PT);
    assert.equal(w.start.toISOString(), "2026-11-01T18:00:00.000Z");
  });

  it("end reflects PST offset (UTC-8): 19:00 PST = 03:00Z next day", () => {
    const w = todaysWindow(now, PT);
    assert.equal(w.end.toISOString(), "2026-11-02T03:00:00.000Z");
  });

  it("state is 'open' at mid-day on fall-back day", () => {
    const w = todaysWindow(now, PT);
    assert.equal(w.state, "open");
  });
});

describe("open/close boundary inclusivity — half-open [start, end)", () => {
  // Use a stable PDT day: 2026-06-15. PDT = UTC-7.
  // 10:00 PDT = 17:00:00.000Z; 19:00 PDT = 02:00:00.000Z next day.

  it("exactly at open (10:00:00.000 PDT = 17:00:00.000Z) → 'open'", () => {
    const now = new Date("2026-06-15T17:00:00.000Z");
    assert.equal(todaysWindow(now, PT).state, "open");
  });

  it("one ms before open (09:59:59.999 PDT = 16:59:59.999Z) → 'before'", () => {
    const now = new Date("2026-06-15T16:59:59.999Z");
    assert.equal(todaysWindow(now, PT).state, "before");
  });

  it("exactly at close (19:00:00.000 PDT = 02:00:00.000Z next day) → 'after'", () => {
    const now = new Date("2026-06-16T02:00:00.000Z");
    assert.equal(todaysWindow(now, PT).state, "after");
  });

  it("one ms before close (18:59:59.999 PDT = 01:59:59.999Z next day) → 'open'", () => {
    const now = new Date("2026-06-16T01:59:59.999Z");
    assert.equal(todaysWindow(now, PT).state, "open");
  });
});

describe("yesterdaysWindow across a DST seam (spring-forward)", () => {
  // now = 2026-03-09 (day after spring-forward), mid-day in PDT.
  // yesterdaysWindow should resolve 2026-03-08, which is already PDT.
  // 10:00 PDT (Mar 8) = 17:00Z; 19:00 PDT = 02:00Z on Mar 9.
  const nowAfterSpring = new Date("2026-03-09T20:00:00Z"); // 13:00 PDT on Mar 9

  it("start of Mar 8 window is 17:00Z (PDT offset, not PST)", () => {
    const w = yesterdaysWindow(nowAfterSpring, PT);
    assert.equal(w.start.toISOString(), "2026-03-08T17:00:00.000Z");
  });

  it("end of Mar 8 window is 02:00Z on Mar 9 (PDT offset)", () => {
    const w = yesterdaysWindow(nowAfterSpring, PT);
    assert.equal(w.end.toISOString(), "2026-03-09T02:00:00.000Z");
  });
});
