import assert from "node:assert/strict";
import test from "node:test";

import { classifyCopilotRequest } from "../src/lib/ai-request-router.ts";

test("classifier routes creative scaling questions to deep analysis by default", () => {
  assert.deepEqual(classifyCopilotRequest("Which ad creative should I scale?"), {
    intent: "deep_analysis",
    mode: "deep",
    reason: "Decision or diagnosis request.",
  });
});

test("classifier preserves an explicit fast mode request", () => {
  assert.deepEqual(classifyCopilotRequest("Which ad creative should I scale?", "fast"), {
    intent: "deep_analysis",
    mode: "fast",
    reason: "Decision or diagnosis request.",
  });
});

test("classifier identifies dashboard build requests", () => {
  assert.deepEqual(classifyCopilotRequest("Build a pivot table by campaign and month"), {
    intent: "dashboard_build",
    mode: "fast",
    reason: "Dashboard, chart, table, or pivot request.",
  });
});
