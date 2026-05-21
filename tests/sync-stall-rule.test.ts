import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  consecutiveFailureCount,
  evaluateSyncStall,
  stallSummary,
  stallTitle,
} from "../src/lib/sync-stall-rule.ts";

// Anchor every fixture against a known "now" so the rule's hour math is
// deterministic. NOW is 2026-05-21T12:00:00Z; deltas below subtract from it.
const NOW = new Date("2026-05-21T12:00:00Z");

function hoursAgo(hours: number): string {
  return new Date(NOW.getTime() - hours * 60 * 60 * 1000).toISOString();
}

describe("consecutiveFailureCount", () => {
  it("returns 0 for an empty window", () => {
    assert.equal(consecutiveFailureCount([]), 0);
  });

  it("counts a single failure at the head", () => {
    assert.equal(
      consecutiveFailureCount([{ status: "failed", started_at: hoursAgo(1) }]),
      1,
    );
  });

  it("counts a streak and stops at the first success", () => {
    assert.equal(
      consecutiveFailureCount([
        { status: "failed", started_at: hoursAgo(1) },
        { status: "failed", started_at: hoursAgo(2) },
        { status: "partial", started_at: hoursAgo(3) },
        { status: "success", started_at: hoursAgo(4) }, // resets the streak
        { status: "failed", started_at: hoursAgo(5) }, // pre-success failure ignored
      ]),
      3,
    );
  });

  it("treats running / unknown rows as inconclusive (skips, does not break)", () => {
    assert.equal(
      consecutiveFailureCount([
        { status: "running", started_at: hoursAgo(0.5) },
        { status: "failed", started_at: hoursAgo(1) },
        { status: "failed", started_at: hoursAgo(2) },
      ]),
      2,
    );
  });

  it("ignores rows without a status string", () => {
    assert.equal(
      consecutiveFailureCount([
        { started_at: hoursAgo(1) },
        { status: "failed", started_at: hoursAgo(2) },
      ]),
      1,
    );
  });
});

describe("evaluateSyncStall", () => {
  it("returns null on an empty window (no signal to fire)", () => {
    assert.equal(evaluateSyncStall([], NOW), null);
  });

  it("returns null when the newest run succeeded recently", () => {
    const result = evaluateSyncStall(
      [{ status: "success", started_at: hoursAgo(1) }],
      NOW,
    );
    assert.equal(result, null);
  });

  it("fires no_recent_attempt when newest run is ≥30h old, regardless of status", () => {
    const result = evaluateSyncStall(
      [{ status: "success", started_at: hoursAgo(40) }],
      NOW,
    );
    assert.ok(result);
    assert.equal(result.kind, "no_recent_attempt");
    if (result.kind === "no_recent_attempt") {
      assert.ok(result.ageHours >= 30);
    }
  });

  it("fires consecutive_failures when 3 recent runs failed in a row", () => {
    // This is the case that was previously invisible — every attempt is
    // recent (newestAgeHours < 30) but every attempt failed.
    const result = evaluateSyncStall(
      [
        { status: "failed", started_at: hoursAgo(1) },
        { status: "failed", started_at: hoursAgo(2) },
        { status: "failed", started_at: hoursAgo(3) },
        { status: "success", started_at: hoursAgo(48) }, // success is stale
      ],
      NOW,
    );
    assert.ok(result);
    assert.equal(result.kind, "consecutive_failures");
    if (result.kind === "consecutive_failures") {
      assert.equal(result.count, 3);
      assert.ok(result.lastSuccessAgeHours >= 48);
    }
  });

  it("does NOT fire consecutive_failures at only 2 failures (avoids flake spam)", () => {
    const result = evaluateSyncStall(
      [
        { status: "failed", started_at: hoursAgo(1) },
        { status: "failed", started_at: hoursAgo(2) },
        { status: "success", started_at: hoursAgo(3) },
      ],
      NOW,
    );
    assert.equal(result, null);
  });

  it("fires last_success_old when newest run failed and last success >12h ago", () => {
    // 1 failure isn't enough for consecutive_failures, but if it follows a
    // long success gap we still want to alert.
    const result = evaluateSyncStall(
      [
        { status: "failed", started_at: hoursAgo(1) },
        { status: "running", started_at: hoursAgo(3) },
        { status: "success", started_at: hoursAgo(15) },
      ],
      NOW,
    );
    assert.ok(result);
    assert.equal(result.kind, "last_success_old");
    if (result.kind === "last_success_old") {
      assert.equal(result.newestStatus, "failed");
      assert.ok(result.lastSuccessAgeHours >= 12);
    }
  });

  it("does NOT fire last_success_old when last success is fresh", () => {
    const result = evaluateSyncStall(
      [
        { status: "failed", started_at: hoursAgo(1) },
        { status: "success", started_at: hoursAgo(3) },
      ],
      NOW,
    );
    assert.equal(result, null);
  });

  it("prefers no_recent_attempt over consecutive_failures when both could match", () => {
    const result = evaluateSyncStall(
      [
        { status: "failed", started_at: hoursAgo(35) },
        { status: "failed", started_at: hoursAgo(36) },
        { status: "failed", started_at: hoursAgo(37) },
      ],
      NOW,
    );
    assert.ok(result);
    assert.equal(result.kind, "no_recent_attempt");
  });

  it("returns null when newest row has no started_at (defensive)", () => {
    const result = evaluateSyncStall(
      [{ status: "failed" } as { status: string; started_at?: string }],
      NOW,
    );
    assert.equal(result, null);
  });
});

describe("stallTitle + stallSummary", () => {
  it("titles each kind with its own headline", () => {
    assert.match(
      stallTitle({ kind: "no_recent_attempt", ageHours: 36 }),
      /No Meta sync attempt/i,
    );
    assert.match(
      stallTitle({
        kind: "consecutive_failures",
        count: 4,
        lastSuccessAgeHours: 50,
      }),
      /4 runs in a row/i,
    );
    assert.match(
      stallTitle({
        kind: "last_success_old",
        lastSuccessAgeHours: 18,
        newestStatus: "failed",
      }),
      /trying but not landing/i,
    );
  });

  it("summary includes the newest trigger + status context", () => {
    const out = stallSummary(
      { kind: "consecutive_failures", count: 3, lastSuccessAgeHours: 14 },
      { trigger: "manual", status: "failed" },
    );
    assert.match(out, /Trigger: manual/i);
    assert.match(out, /Status: failed/i);
    assert.match(out, /Last success 14h ago/i);
  });

  it("summary handles a missing newest row gracefully", () => {
    const out = stallSummary(
      { kind: "no_recent_attempt", ageHours: 36 },
      null,
    );
    assert.match(out, /Trigger: unknown/i);
    assert.match(out, /Status: unknown/i);
  });
});
