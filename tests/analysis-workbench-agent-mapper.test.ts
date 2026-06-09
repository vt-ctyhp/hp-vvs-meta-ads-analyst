import assert from "node:assert/strict";
import test from "node:test";

import { mapWorkbenchAgentResultToPipelineResult } from "../src/lib/analysis-workbench-agent-mapper.ts";
import type {
  AgentLedgerEntry,
  WorkbenchAgentResult,
} from "../src/lib/analysis-workbench-agent.ts";
import type {
  AnalysisWorkbenchBarVisualCard,
  AnalysisWorkbenchLineVisualCard,
  AnalysisWorkbenchMetricVisualCard,
  AnalysisWorkbenchTableVisualCard,
} from "../src/lib/analysis-workbench-contract.ts";

const PERF_LEDGER: AgentLedgerEntry = {
  id: "Q1",
  tool: "query_performance",
  params: {},
  summary: "spend by campaign_umbrella: 2 rows.",
  rowCount: 2,
  rows: [
    { campaign_umbrella: "Facebook US Product", spend: 1200, messaging_contacts: 30 },
    { campaign_umbrella: "Facebook VN Product", spend: 800, messaging_contacts: 18 },
  ],
};

const TREND_LEDGER: AgentLedgerEntry = {
  id: "Q1",
  tool: "query_performance",
  params: {},
  summary: "spend by week: 3 rows.",
  rowCount: 3,
  rows: [
    { week: "2026-05-04", spend: 100 },
    { week: "2026-05-11", spend: 150 },
    { week: "2026-05-18", spend: 175 },
  ],
};

const ENTITY_LEDGER: AgentLedgerEntry = {
  id: "Q1",
  tool: "query_entities",
  params: {},
  summary: "ad: 2 matched (1 live, 1 paused, 0 off).",
  rowCount: 2,
  rows: [
    { entityType: "ad", id: "us1", name: "US Evergreen", status: "live", campaignUmbrella: "Facebook US Product" },
    { entityType: "ad", id: "us2", name: "US Single", status: "paused", campaignUmbrella: "Facebook US Product" },
  ],
};

function agentResult(overrides: Partial<WorkbenchAgentResult> = {}): WorkbenchAgentResult {
  return {
    answer: "US Product spent $1,200; VN Product $800.",
    visuals: [],
    ledger: [PERF_LEDGER],
    requests: [],
    cost: { model: "gpt-5.4", inputTokens: 100, outputTokens: 50, totalTokens: 150, estimatedCostUsd: 0.001 },
    model: "gpt-5.4",
    stopReason: "submitted",
    toolCallCount: 1,
    ...overrides,
  };
}

test("maps answer, citations, source notes, and cost from the ledger", () => {
  const result = mapWorkbenchAgentResultToPipelineResult({
    prompt: "How much did each product group spend?",
    outputMode: "answer_visuals",
    agentResult: agentResult(),
  });

  assert.equal(result.status, "completed");
  assert.match(result.answer.summary, /\$1,200/);
  assert.equal(result.answer.apiCost?.estimatedCostUsd, 0.001);
  assert.equal(result.sourceNotes.length, 1);
  assert.equal(result.sourceNotes[0].id, "Q1");
  assert.ok(result.answer.citations.length >= 1);
});

test("builds a grounded bar chart with values taken from the queried rows", () => {
  const result = mapWorkbenchAgentResultToPipelineResult({
    prompt: "spend by group",
    outputMode: "answer_visuals",
    agentResult: agentResult({
      visuals: [
        { type: "bar_chart", title: "Spend by group", sourceCallId: "Q1", metric: "spend", dimension: "campaign_umbrella" },
      ],
    }),
  });

  assert.equal(result.visualCards.length, 1);
  const card = result.visualCards[0] as AnalysisWorkbenchBarVisualCard;
  assert.equal(card.type, "bar_chart");
  assert.equal(card.metric, "spend");
  assert.equal(card.dimension, "campaign_umbrella");
  assert.equal(card.bars.length, 2);
  assert.equal(card.bars[0].value, 1200);
  assert.match(card.bars[0].formattedValue, /\$1,200/);
  assert.deepEqual(card.sourceNoteIds, ["Q1"]);
});

test("builds a line chart over a time dimension", () => {
  const result = mapWorkbenchAgentResultToPipelineResult({
    prompt: "weekly spend",
    outputMode: "answer_visuals",
    agentResult: agentResult({
      ledger: [TREND_LEDGER],
      visuals: [{ type: "line_chart", title: "Weekly spend", sourceCallId: "Q1", metric: "spend", dimension: "week" }],
    }),
  });

  const card = result.visualCards[0] as AnalysisWorkbenchLineVisualCard;
  assert.equal(card.type, "line_chart");
  assert.equal(card.points.length, 3);
  assert.equal(card.points[2].value, 175);
});

test("builds a metric card that sums an additive metric across rows", () => {
  const result = mapWorkbenchAgentResultToPipelineResult({
    prompt: "total spend",
    outputMode: "answer_visuals",
    agentResult: agentResult({
      visuals: [{ type: "metric_card", title: "Total spend", sourceCallId: "Q1", metric: "spend" }],
    }),
  });

  const card = result.visualCards[0] as AnalysisWorkbenchMetricVisualCard;
  assert.equal(card.type, "metric_card");
  assert.equal(card.value, 2000);
  assert.match(card.formattedValue, /\$2,000/);
});

test("builds a roster flat table from entity rows", () => {
  const result = mapWorkbenchAgentResultToPipelineResult({
    prompt: "which US Product ads are live?",
    outputMode: "answer_visuals",
    agentResult: agentResult({
      ledger: [ENTITY_LEDGER],
      visuals: [{ type: "flat_table", title: "US Product ads", sourceCallId: "Q1" }],
    }),
  });

  const card = result.visualCards[0] as AnalysisWorkbenchTableVisualCard;
  assert.equal(card.type, "flat_table");
  assert.equal(card.rows.length, 2);
  // a status column exists and carries the raw value
  const statusColumn = card.columns.find((column) => column.key === "status");
  assert.ok(statusColumn);
  assert.equal(card.rows[0].status, "live");
});

test("drops visuals that reference a missing query or an invalid metric", () => {
  const result = mapWorkbenchAgentResultToPipelineResult({
    prompt: "x",
    outputMode: "answer_visuals",
    agentResult: agentResult({
      visuals: [
        { type: "bar_chart", title: "Bad source", sourceCallId: "Q9", metric: "spend", dimension: "campaign_umbrella" },
        { type: "bar_chart", title: "Bad metric", sourceCallId: "Q1", metric: "revenue", dimension: "campaign_umbrella" },
      ],
    }),
  });
  assert.equal(result.visualCards.length, 0);
});

test("answer_visuals mode produces no dashboard packet", () => {
  const result = mapWorkbenchAgentResultToPipelineResult({
    prompt: "x",
    outputMode: "answer_visuals",
    agentResult: agentResult(),
  });
  assert.equal(result.dashboardPacket, null);
});

test("full_dashboard mode composes a dashboard packet from the AI-chosen visuals", () => {
  const result = mapWorkbenchAgentResultToPipelineResult({
    prompt: "give me the full picture",
    outputMode: "full_dashboard",
    agentResult: agentResult({
      visuals: [
        { type: "bar_chart", title: "Spend by group", sourceCallId: "Q1", metric: "spend", dimension: "campaign_umbrella" },
        { type: "flat_table", title: "Detail", sourceCallId: "Q1" },
      ],
    }),
  });

  assert.ok(result.dashboardPacket);
  assert.equal(result.dashboardPacket?.kind, "analysis_dashboard_packet");
  assert.equal(result.dashboardPacket?.visualObjects.length, 2);
  assert.ok(result.dashboardPacket?.primaryEvidenceTable);
});

test("an untraceable figure in the answer is withheld and recorded in validation", () => {
  const result = mapWorkbenchAgentResultToPipelineResult({
    prompt: "spend and bookings",
    outputMode: "answer_visuals",
    agentResult: agentResult({
      answer: "US Product spent $1,200 and drove 47 bookings.",
    }),
  });

  assert.match(result.answer.summary, /\$1,200/);
  assert.doesNotMatch(result.answer.summary, /47 bookings/);
  const warnings = result.validation.warnings;
  assert.ok(warnings.length >= 1);
  assert.equal(warnings[0].code, "withheld_unverified_figure");
  const grounding = (result.intent as { grounding?: { status?: string } }).grounding;
  assert.equal(grounding?.status, "ungrounded");
});

test("queryPlan carries the aggregate requests the agent ran", () => {
  const result = mapWorkbenchAgentResultToPipelineResult({
    prompt: "x",
    outputMode: "answer_visuals",
    agentResult: agentResult({
      requests: [
        {
          start: "2026-05-01",
          end: "2026-05-07",
          dimensions: ["campaign_umbrella"],
          metrics: ["spend"],
          filters: [],
          sortField: "spend",
          sortDirection: "desc",
          limit: 50,
        },
      ],
    }),
  });
  assert.equal(result.queryPlan.requests.length, 1);
  assert.equal(result.queryPlan.aggregateFunction, "aggregate_meta_daily_insights");
});
