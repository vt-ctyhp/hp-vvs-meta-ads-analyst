import { test } from "node:test";
import assert from "node:assert/strict";

import { formatTimeToBook } from "../src/lib/time-to-book.ts";

test("returns dash for null delta", () => {
  assert.deepEqual(formatTimeToBook(null), { value: "—", unit: null });
});

test("returns dash for non-finite delta", () => {
  assert.deepEqual(formatTimeToBook(Number.NaN), { value: "—", unit: null });
  assert.deepEqual(formatTimeToBook(-1), { value: "—", unit: null });
});

test("renders seconds when delta is under 60s", () => {
  assert.deepEqual(formatTimeToBook(45_000), { value: "45", unit: "sec" });
  assert.deepEqual(formatTimeToBook(1_000), { value: "1", unit: "sec" });
});

test("renders minutes when delta is under 60min", () => {
  assert.deepEqual(formatTimeToBook(32 * 60_000), { value: "32", unit: "min" });
  assert.deepEqual(formatTimeToBook(60_000), { value: "1", unit: "min" });
});

test("renders hours when delta is under 24h", () => {
  assert.deepEqual(formatTimeToBook(5 * 3_600_000), { value: "5", unit: "hr" });
  assert.deepEqual(formatTimeToBook(3_600_000), { value: "1", unit: "hr" });
});

test("renders day(s) at 24h+ with singular on 1", () => {
  assert.deepEqual(formatTimeToBook(24 * 3_600_000), { value: "1", unit: "day" });
  assert.deepEqual(formatTimeToBook(10 * 24 * 3_600_000), { value: "10", unit: "days" });
});

test("computes delta from two ISO strings", () => {
  const start = "2026-05-12T14:08:00.000Z";
  const end = "2026-05-22T09:14:00.000Z";
  const result = formatTimeToBook(Date.parse(end) - Date.parse(start));
  assert.equal(result.value, "9");
  assert.equal(result.unit, "days");
});
