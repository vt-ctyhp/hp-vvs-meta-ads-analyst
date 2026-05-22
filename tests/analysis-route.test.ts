import assert from "node:assert/strict";
import test from "node:test";

import { resolveAnalysisRouteDateRange } from "../src/lib/analysis-route.ts";

test("resolveAnalysisRouteDateRange defaults to 30 days", () => {
  assert.deepEqual(resolveAnalysisRouteDateRange({}), {
    days: 30,
    startDate: null,
    endDate: null,
  });
});

test("resolveAnalysisRouteDateRange preserves redirected optimize days", () => {
  assert.deepEqual(resolveAnalysisRouteDateRange({ days: "7" }), {
    days: 7,
    startDate: null,
    endDate: null,
  });
});

test("resolveAnalysisRouteDateRange accepts legacy and direct date params", () => {
  assert.deepEqual(
    resolveAnalysisRouteDateRange({
      days: "14",
      start: "2026-05-01",
      end: "2026-05-14",
    }),
    {
      days: 14,
      startDate: "2026-05-01",
      endDate: "2026-05-14",
    },
  );

  assert.deepEqual(
    resolveAnalysisRouteDateRange({
      startDate: "2026-04-01",
      endDate: "2026-04-30",
    }),
    {
      days: 30,
      startDate: "2026-04-01",
      endDate: "2026-04-30",
    },
  );
});
