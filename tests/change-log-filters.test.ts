import { test } from "node:test";
import assert from "node:assert/strict";

import { applyChangeLogFilters } from "../src/lib/change-log-filters.ts";
import type { ChangeLogEntry } from "../src/lib/change-log-types.ts";

const base = {
  metaAccountId: null, effectiveStart: null, effectiveEnd: null,
  reason: "r", beforeValue: null, afterValue: null,
  verifyEntity: "none" as const, verifyValue: "na" as const,
  citationCount: 0, createdByEmail: null, createdAt: "",
};
const entries: ChangeLogEntry[] = [
  { ...base, id: "1", brandCode: "HP", eventDate: "2026-06-05", changeType: "budget",
    title: "Raised Cash for Gold budget", entities: [{ entityKind: "ad_set", entityMetaId: "1203847", entityName: "Cash for Gold, Prospecting", matchStatus: "matched" }] },
  { ...base, id: "2", brandCode: "VVS", eventDate: "2026-06-02", changeType: "creative",
    title: "Swapped statics for UGC", entities: [{ entityKind: "ad_set", entityMetaId: "9981245", entityName: "Engagement, Broad", matchStatus: "matched" }] },
];

test("brand filter narrows to the brand", () => {
  const out = applyChangeLogFilters(entries, { rangeDays: null, brandCode: "VVS", changeType: null, query: "" }, "2026-06-08");
  assert.deepEqual(out.map((e) => e.id), ["2"]);
});

test("query matches entity name case-insensitively", () => {
  const out = applyChangeLogFilters(entries, { rangeDays: null, brandCode: null, changeType: null, query: "cash" }, "2026-06-08");
  assert.deepEqual(out.map((e) => e.id), ["1"]);
});

test("range excludes entries older than the cutoff", () => {
  const out = applyChangeLogFilters(entries, { rangeDays: 3, brandCode: null, changeType: null, query: "" }, "2026-06-08");
  // cutoff = 2026-06-05; only the Jun 5 entry qualifies
  assert.deepEqual(out.map((e) => e.id), ["1"]);
});
