import { test } from "node:test";
import assert from "node:assert/strict";

import { entryIntersectsWindow } from "../src/lib/change-log-window.ts";
import type { ChangeLogEntry } from "../src/lib/change-log-types.ts";

function entry(partial: Partial<ChangeLogEntry>): ChangeLogEntry {
  return {
    id: "x", brandCode: "HP", metaAccountId: null,
    eventDate: "2026-06-05", effectiveStart: null, effectiveEnd: null,
    changeType: "budget", title: "t", reason: "r",
    beforeValue: null, afterValue: null,
    verifyEntity: "none", verifyValue: "na",
    entities: [], citationCount: 0, createdByEmail: null, createdAt: "",
    ...partial,
  };
}

test("point event matches only when eventDate is inside the window", () => {
  const e = entry({ eventDate: "2026-06-05" });
  assert.equal(entryIntersectsWindow(e, { start: "2026-06-01", end: "2026-06-10" }), true);
  assert.equal(entryIntersectsWindow(e, { start: "2026-06-06", end: "2026-06-10" }), false);
});

test("closed window overlaps when ranges touch", () => {
  const e = entry({ effectiveStart: "2026-06-06", effectiveEnd: "2026-06-15" });
  assert.equal(entryIntersectsWindow(e, { start: "2026-06-01", end: "2026-06-06" }), true);
  assert.equal(entryIntersectsWindow(e, { start: "2026-05-01", end: "2026-06-05" }), false);
});

test("ongoing window has no end and matches any later window", () => {
  const e = entry({ effectiveStart: "2026-05-28", effectiveEnd: null });
  assert.equal(entryIntersectsWindow(e, { start: "2026-06-01", end: "2026-06-10" }), true);
  assert.equal(entryIntersectsWindow(e, { start: "2026-05-01", end: "2026-05-27" }), false);
});
