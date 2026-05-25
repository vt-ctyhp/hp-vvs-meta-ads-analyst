import assert from "node:assert/strict";
import test from "node:test";

import {
  buildAnalysisRunInsert,
  mapAnalysisRunRecord,
  normalizeAnalysisOutputMode,
} from "../src/lib/analysis-workbench-contract.ts";

test("buildAnalysisRunInsert creates the AIW-001 foundation run shape", () => {
  const run = buildAnalysisRunInsert({
    prompt: "  Which campaign groups moved this week?  ",
    outputMode: "answer_visuals",
    now: "2026-05-25T14:30:00.000Z",
  });

  assert.equal(run.prompt, "Which campaign groups moved this week?");
  assert.equal(run.output_mode, "answer_visuals");
  assert.equal(run.status, "created");
  assert.equal(run.created_at, "2026-05-25T14:30:00.000Z");
  assert.equal(run.updated_at, "2026-05-25T14:30:00.000Z");
  assert.equal(run.title, "Which campaign groups moved this week?");
  assert.deepEqual(run.visual_cards, []);
  assert.deepEqual(run.lineage, { parentRunId: null });
  assert.deepEqual(run.intent, {
    rawPrompt: "Which campaign groups moved this week?",
    outputMode: "answer_visuals",
    status: "pending",
  });
  assert.deepEqual(run.query_plan, { status: "pending", steps: [] });
  assert.deepEqual(run.facts, { status: "pending", items: [] });
  assert.equal((run.validation as { status: string }).status, "not_run");
  assert.match((run.answer as { summary: string }).summary, /Run created/);
});

test("normalizeAnalysisOutputMode defaults invalid values to Answer + visuals", () => {
  assert.equal(normalizeAnalysisOutputMode("answer_only"), "answer_only");
  assert.equal(normalizeAnalysisOutputMode("full_dashboard"), "full_dashboard");
  assert.equal(normalizeAnalysisOutputMode("legacy-build"), "answer_visuals");
  assert.equal(normalizeAnalysisOutputMode(null), "answer_visuals");
});

test("buildAnalysisRunInsert persists governed answer text, source notes, and visual cards", () => {
  const run = buildAnalysisRunInsert({
    prompt: "Show spend by campaign group.",
    outputMode: "answer_visuals",
    now: "2026-05-25T14:30:00.000Z",
    pipelineResult: {
      status: "completed",
      title: "Show spend by campaign group.",
      intent: { status: "ready" },
      queryPlan: {
        status: "ready",
        source: "meta_ads",
        aggregateFunction: "aggregate_meta_daily_insights",
        requests: [],
      },
      facts: { status: "computed", items: [] },
      answer: { summary: "Spend was $3,400 [F1].", citations: [] },
      sourceNotes: [{ id: "S1", label: "Data source", value: "Meta Ads daily insights" }],
      validation: { status: "ready", blockers: [], warnings: [], assumptions: [] },
      visualCards: [
        {
          id: "metric_spend",
          type: "metric_card",
          title: "Total Spend",
          metric: "spend",
          value: 3400,
          formattedValue: "$3,400",
          citationId: "F1",
          sourceNoteIds: ["S1"],
        },
      ],
      dashboardPacket: null,
    },
  });

  assert.equal(run.status, "completed");
  assert.equal((run.answer as { summary: string }).summary, "Spend was $3,400 [F1].");
  assert.deepEqual(run.source_notes, [
    { id: "S1", label: "Data source", value: "Meta Ads daily insights" },
  ]);
  assert.equal(
    (run.visual_cards as unknown as Array<{ type: string }>)[0]?.type,
    "metric_card",
  );
});

test("buildAnalysisRunInsert blocks unsupported source prompts before an answer", () => {
  const run = buildAnalysisRunInsert({
    prompt: "Show revenue and ROAS by campaign.",
    outputMode: "answer_only",
    now: "2026-05-25T14:30:00.000Z",
  });

  assert.equal(run.status, "failed");
  assert.deepEqual(
    (run.validation as { blockers: Array<{ code: string }> }).blockers.map(
      (blocker) => blocker.code,
    ),
    ["unsupported_revenue", "unsupported_roas"],
  );
  assert.match((run.answer as { summary: string }).summary, /Request blocked/);
});

test("mapAnalysisRunRecord exposes persisted runs in client-ready shape", () => {
  const mapped = mapAnalysisRunRecord({
    id: "run-1",
    prompt: "Show spend",
    output_mode: "answer_only",
    status: "created",
    title: "Show spend",
    intent: { rawPrompt: "Show spend" },
    query_plan: { status: "pending" },
    facts: { status: "pending" },
    visual_cards: [],
    source_notes: [{ label: "Source", value: "Pending" }],
    validation: { status: "not_run" },
    lineage: { parentRunId: null },
    answer: { summary: "Created.", citations: [] },
    dashboard_packet: null,
    created_at: "2026-05-25T14:30:00.000Z",
    updated_at: "2026-05-25T14:30:00.000Z",
  });

  assert.equal(mapped.id, "run-1");
  assert.equal(mapped.outputMode, "answer_only");
  assert.equal(mapped.createdAt, "2026-05-25T14:30:00.000Z");
  assert.deepEqual(mapped.sourceNotes, [{ label: "Source", value: "Pending" }]);
});
