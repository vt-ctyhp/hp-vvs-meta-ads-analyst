import { test } from "node:test";
import assert from "node:assert/strict";

import { resolveRelativeDate, compareVerifyValue } from "../src/lib/change-log-draft.ts";

test("resolves 'last friday' relative to a Monday", () => {
  // 2026-06-08 is a Monday; the previous Friday is 2026-06-05.
  const r = resolveRelativeDate("last friday", "2026-06-08");
  assert.equal(r.date, "2026-06-05");
  assert.match(r.note ?? "", /last friday/i);
});

test("passes an explicit ISO date through unchanged", () => {
  const r = resolveRelativeDate("2026-05-30", "2026-06-08");
  assert.equal(r.date, "2026-05-30");
  assert.equal(r.note, null);
});

test("compareVerifyValue confirms a matching number", () => {
  assert.equal(compareVerifyValue("$120/day", "120"), "confirmed");
  assert.equal(compareVerifyValue("$120/day", "80"), "mismatch");
  assert.equal(compareVerifyValue(null, "120"), "na");
});
