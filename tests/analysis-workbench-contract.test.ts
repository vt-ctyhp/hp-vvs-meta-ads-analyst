import assert from "node:assert/strict";
import test from "node:test";

import {
  buildAnalysisContextChips,
  buildAnalysisDashboardPacket,
  buildAnalysisRunInsert,
  mapAnalysisRunRecord,
  normalizeAnalysisOutputMode,
  resolveAnalysisRunContext,
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
  assert.deepEqual(run.lineage, {
    parentRunId: null,
    inheritedContext: null,
    removedContextKeys: [],
    changedContext: {},
    finalContext: null,
  });
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

test("buildAnalysisDashboardPacket promotes a saved answer snapshot into a complete packet", () => {
  const packet = buildAnalysisDashboardPacket({
    promotedFromRunId: "run-1",
    generatedAt: "2026-05-25T14:30:00.000Z",
    answer: { summary: "Spend was $3,400 [F1].", citations: [] },
    facts: {
      status: "computed",
      items: [
        {
          id: "fact_total_primary_results",
          type: "total",
          label: "Total Primary KPI",
          metric: "primary_results",
          value: 34,
          formattedValue: "34",
          citationId: "F2",
          caveat: "Primary KPI is group-specific and can blend proxy metrics across groups.",
        },
        {
          id: "fact_campaign_umbrella_spend_vs_average",
          type: "comparison",
          label: "Campaign group Spend vs average",
          entityName: "Book Appts US",
          formattedDeltaValue: "$800",
          formattedBaselineValue: "$1,700",
          citationId: "F4",
        },
      ],
    },
    visualCards: [
      {
        id: "table_campaign_umbrella",
        type: "flat_table",
        title: "Campaign group evidence",
        columns: [
          { key: "entity", label: "Campaign group", kind: "dimension" },
          { key: "spend", label: "Spend", kind: "metric", metric: "spend" },
        ],
        rows: [
          {
            entity: "Book Appts US",
            spend: { value: 2500, formattedValue: "$2,500" },
          },
          {
            entity: "Cash for Gold US",
            spend: { value: 900, formattedValue: "$900" },
          },
        ],
        sourceNoteIds: ["S1", "S3"],
        assumptions: ["Relative date range ends at the latest complete synced Meta Ads date."],
      },
    ],
    sourceNotes: [
      { id: "S1", label: "Data source", value: "Meta Ads daily insights" },
      { id: "S3", label: "Matched rows", value: "12 matching Meta Ads daily rows" },
    ],
    validation: {
      assumptions: [
        {
          code: "relative_date_range",
          message: "Relative date range ends at the latest complete synced Meta Ads date.",
        },
      ],
    },
  });

  assert.equal(packet.kind, "analysis_dashboard_packet");
  assert.equal(packet.promotedFromRunId, "run-1");
  assert.equal(packet.generatedAt, "2026-05-25T14:30:00.000Z");
  assert.equal(packet.primaryEvidenceTable?.id, "table_campaign_umbrella");
  assert.equal(packet.insightSummary.winners[0]?.title, "Winner");
  assert.match(packet.insightSummary.winners[0]?.detail || "", /Book Appts US/);
  assert.equal(packet.insightSummary.losers[0]?.title, "Loser");
  assert.match(packet.insightSummary.losers[0]?.detail || "", /Cash for Gold US/);
  assert.match(packet.insightSummary.anomalies[0]?.detail || "", /\$800/);
  assert.ok(packet.nextActions.some((action) => /Book Appts US/.test(action.detail)));
  assert.deepEqual(packet.assumptions, [
    "Relative date range ends at the latest complete synced Meta Ads date.",
  ]);
  assert.deepEqual(packet.caveats, [
    "Primary KPI is group-specific and can blend proxy metrics across groups.",
  ]);
  assert.equal(packet.sourceNotes.length, 2);
});

test("buildAnalysisRunInsert persists full-dashboard packet snapshots", () => {
  const packet = buildAnalysisDashboardPacket({
    generatedAt: "2026-05-25T14:30:00.000Z",
    answer: { summary: "Dashboard saved [S1].", citations: [] },
    facts: { status: "computed", items: [] },
    visualCards: [],
    sourceNotes: [{ id: "S1", label: "Data source", value: "Meta Ads daily insights" }],
    validation: { assumptions: [] },
  });
  const run = buildAnalysisRunInsert({
    prompt: "Build a dashboard.",
    outputMode: "full_dashboard",
    now: "2026-05-25T14:31:00.000Z",
    pipelineResult: {
      status: "completed",
      title: "Build a dashboard.",
      intent: { status: "ready" },
      queryPlan: {
        status: "ready",
        source: "meta_ads",
        aggregateFunction: "aggregate_meta_daily_insights",
        requests: [],
      },
      facts: { status: "computed", items: [] },
      answer: { summary: "Dashboard saved [S1].", citations: [] },
      sourceNotes: [{ id: "S1", label: "Data source", value: "Meta Ads daily insights" }],
      validation: { status: "ready", blockers: [], warnings: [], assumptions: [] },
      visualCards: [],
      dashboardPacket: packet,
    },
  });

  assert.equal(run.output_mode, "full_dashboard");
  assert.deepEqual(run.dashboard_packet, packet);
});

test("buildAnalysisRunInsert persists follow-up lineage with inherited, changed, and final context", () => {
  const run = buildAnalysisRunInsert({
    prompt: "Now show CPL instead.",
    outputMode: "answer_visuals",
    parentRunId: "run-parent",
    now: "2026-05-25T14:30:00.000Z",
    inheritedContext: {
      dateRange: {
        start: "2026-05-18",
        end: "2026-05-24",
        days: 7,
        label: "Last 7 days",
      },
      filters: [{ field: "brand", operator: "equals", value: "HP" }],
      metrics: ["spend"],
      dimensions: ["campaign_umbrella"],
      visual: null,
    },
    removedContextKeys: ["metric:spend"],
    pipelineResult: {
      status: "completed",
      title: "Now show CPL instead.",
      intent: {
        status: "ready",
        rawPrompt: "Now show CPL instead.",
        outputMode: "answer_visuals",
        dateRange: {
          start: "2026-05-18",
          end: "2026-05-24",
          days: 7,
          label: "Last 7 days",
        },
        filters: [{ field: "brand", operator: "equals", value: "HP" }],
        metrics: ["cpl"],
        dimensions: ["campaign_umbrella"],
        sort: { field: "cpl", direction: "desc" },
        limit: 20,
        visual: null,
      },
      queryPlan: {
        status: "ready",
        source: "meta_ads",
        aggregateFunction: "aggregate_meta_daily_insights",
        requests: [],
      },
      facts: { status: "computed", items: [] },
      answer: { summary: "CPL was $20 [F1].", citations: [] },
      sourceNotes: [],
      validation: { status: "ready", blockers: [], warnings: [], assumptions: [] },
      visualCards: [],
      dashboardPacket: null,
    },
  });

  assert.deepEqual(run.lineage, {
    parentRunId: "run-parent",
    inheritedContext: {
      dateRange: {
        start: "2026-05-18",
        end: "2026-05-24",
        days: 7,
        label: "Last 7 days",
      },
      filters: [{ field: "brand", operator: "equals", value: "HP" }],
      metrics: ["spend"],
      dimensions: ["campaign_umbrella"],
      visual: null,
    },
    removedContextKeys: ["metric:spend"],
    changedContext: {
      metrics: ["cpl"],
    },
    finalContext: {
      dateRange: {
        start: "2026-05-18",
        end: "2026-05-24",
        days: 7,
        label: "Last 7 days",
      },
      filters: [{ field: "brand", operator: "equals", value: "HP" }],
      metrics: ["cpl"],
      dimensions: ["campaign_umbrella"],
      visual: null,
    },
  });
});

test("resolveAnalysisRunContext builds removable inherited context chips from saved runs", () => {
  const context = resolveAnalysisRunContext({
    intent: {
      dateRange: { start: "2026-05-18", end: "2026-05-24", days: 7, label: "Last 7 days" },
      filters: [{ field: "campaign_umbrella", operator: "equals", value: "Book Appts US" }],
      metrics: ["spend", "primary_results"],
      dimensions: ["campaign_umbrella"],
      visual: null,
    },
    lineage: { parentRunId: null },
  });

  assert.deepEqual(
    buildAnalysisContextChips(context).map((chip) => [chip.id, chip.label, chip.value]),
    [
      ["dateRange", "Date", "Last 7 days · 2026-05-18 to 2026-05-24"],
      ["filter:campaign_umbrella:Book Appts US", "Filter", "Campaign group = Book Appts US"],
      ["metric:spend", "Metric", "Spend"],
      ["metric:primary_results", "Metric", "Primary KPI"],
      ["dimension:campaign_umbrella", "Grouping", "Campaign group"],
    ],
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
  const packet = buildAnalysisDashboardPacket({
    promotedFromRunId: "run-1",
    generatedAt: "2026-05-25T14:35:00.000Z",
    answer: { summary: "Saved packet.", citations: [] },
    facts: { status: "computed", items: [] },
    visualCards: [],
    sourceNotes: [{ id: "S1", label: "Data source", value: "Meta Ads daily insights" }],
    validation: { assumptions: [] },
  });
  const mapped = mapAnalysisRunRecord({
    id: "run-1",
    prompt: "Show spend",
    output_mode: "full_dashboard",
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
    dashboard_packet: packet,
    created_at: "2026-05-25T14:30:00.000Z",
    updated_at: "2026-05-25T14:30:00.000Z",
  });

  assert.equal(mapped.id, "run-1");
  assert.equal(mapped.outputMode, "full_dashboard");
  assert.equal(mapped.createdAt, "2026-05-25T14:30:00.000Z");
  assert.deepEqual(mapped.sourceNotes, [{ label: "Source", value: "Pending" }]);
  assert.equal(mapped.dashboardPacket?.kind, "analysis_dashboard_packet");
  assert.equal(mapped.dashboardPacket?.promotedFromRunId, "run-1");
});
