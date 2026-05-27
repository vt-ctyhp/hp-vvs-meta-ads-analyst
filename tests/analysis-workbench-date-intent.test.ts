import assert from "node:assert/strict";
import test from "node:test";

import {
  inferAnalysisWorkbenchDateIntentFromPrompt,
  resolveAnalysisWorkbenchDateIntent,
} from "../src/lib/analysis-workbench-date-intent.ts";

test("full-year weekly phrasing resolves to full calendar year with week grain", () => {
  const intent = inferAnalysisWorkbenchDateIntentFromPrompt(
    "week by week ad spend for the entire of 2026",
  );

  assert.deepEqual(intent, {
    kind: "calendar_year",
    year: 2026,
    grain: "week",
  });

  const resolved = resolveAnalysisWorkbenchDateIntent({
    dateIntent: intent,
    latestSyncedInsightDate: "2026-05-25",
  });

  assert.deepEqual(resolved.dateRange, {
    start: "2026-01-01",
    end: "2026-12-31",
    days: 365,
    label: "2026",
  });
  assert.equal(resolved.dateGrain, "week");
  assert.deepEqual(resolved.assumptions, []);
});

test("common yearly phrasing variants infer calendar-year intent", () => {
  const prompts = [
    "show spend each week in 2026",
    "how much did we spend weekly during all of 2026?",
    "2026 weekly spend trend",
    "break down our 2026 ad spend by week",
  ];

  for (const prompt of prompts) {
    const intent = inferAnalysisWorkbenchDateIntentFromPrompt(prompt);
    assert.equal(intent?.kind, "calendar_year", prompt);
    assert.equal(intent?.year, 2026, prompt);
    assert.equal(intent?.grain, "week", prompt);
  }
});

test("calendar month and quarter phrases resolve exact date ranges", () => {
  const may = resolveAnalysisWorkbenchDateIntent({
    dateIntent: inferAnalysisWorkbenchDateIntentFromPrompt("show spend by day in May 2026"),
    latestSyncedInsightDate: "2026-05-25",
  });
  assert.deepEqual(may.dateRange, {
    start: "2026-05-01",
    end: "2026-05-31",
    days: 31,
    label: "May 2026",
  });
  assert.equal(may.dateGrain, "day");

  const q2 = resolveAnalysisWorkbenchDateIntent({
    dateIntent: inferAnalysisWorkbenchDateIntentFromPrompt("show spend by month for Q2 2026"),
    latestSyncedInsightDate: "2026-05-25",
  });
  assert.deepEqual(q2.dateRange, {
    start: "2026-04-01",
    end: "2026-06-30",
    days: 91,
    label: "Q2 2026",
  });
  assert.equal(q2.dateGrain, "month");
});

test("since phrasing uses latest synced date as the open range end", () => {
  const resolved = resolveAnalysisWorkbenchDateIntent({
    dateIntent: inferAnalysisWorkbenchDateIntentFromPrompt(
      "show spend by day since 2026-04-15",
    ),
    latestSyncedInsightDate: "2026-05-25",
  });

  assert.deepEqual(resolved.dateRange, {
    start: "2026-04-15",
    end: "2026-05-25",
    days: 41,
    label: "2026-04-15 to 2026-05-25",
  });
  assert.equal(resolved.dateGrain, "day");
  assert.deepEqual(resolved.assumptions.map((assumption) => assumption.code), [
    "relative_date_range",
  ]);
});
