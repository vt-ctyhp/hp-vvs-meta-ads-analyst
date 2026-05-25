import assert from "node:assert/strict";
import test from "node:test";

import {
  runAnalysisWorkbenchFactsPipeline,
  validateAnalysisWorkbenchNarrativeGrounding,
  type AnalysisWorkbenchCitation,
  type AnalysisWorkbenchPipelineAggregateRequest,
} from "../src/lib/analysis-workbench-pipeline.ts";
import type { MetaInsightAggregateRow } from "../src/lib/meta-insight-aggregates.ts";

test("answer-only requests run through governed intent, query, facts, and cited answer pipeline", async () => {
  const requests: AnalysisWorkbenchPipelineAggregateRequest[] = [];
  const result = await runAnalysisWorkbenchFactsPipeline({
    prompt: "Show spend and primary KPI by campaign group for the last 7 days.",
    outputMode: "answer_only",
    latestSyncedInsightDate: "2026-05-24",
    executeAggregate: async (request) => {
      requests.push(request);
      return request.dimensions.length
        ? [
            aggregateRow({
              campaign_umbrella: "Book Appts US",
              spend: 2500,
              primary_results: 25,
              source_rows: 8,
            }),
            aggregateRow({
              campaign_umbrella: "Cash for Gold US",
              spend: 900,
              primary_results: 9,
              source_rows: 4,
            }),
          ]
        : [
            aggregateRow({
              spend: 3400,
              primary_results: 34,
              source_rows: 12,
            }),
          ];
    },
  });

  assert.equal(result.status, "completed");
  assert.equal(result.intent.status, "ready");
  assert.deepEqual(result.intent.metrics, ["spend", "primary_results"]);
  assert.deepEqual(result.intent.dimensions, ["campaign_umbrella"]);
  assert.deepEqual(
    requests.map((request) => ({
      start: request.start,
      end: request.end,
      dimensions: request.dimensions,
      metrics: request.metrics,
      sortField: request.sortField,
      limit: request.limit,
    })),
    [
      {
        start: "2026-05-18",
        end: "2026-05-24",
        dimensions: ["campaign_umbrella"],
        metrics: ["spend", "primary_results"],
        sortField: "spend",
        limit: 20,
      },
      {
        start: "2026-05-18",
        end: "2026-05-24",
        dimensions: [],
        metrics: ["spend", "primary_results"],
        sortField: "spend",
        limit: 1,
      },
    ],
  );

  assert.equal(result.facts.status, "computed");
  assert.deepEqual(
    result.facts.items.map((fact) => fact.type),
    ["total", "total", "rank", "comparison", "source_note"],
  );
  assert.match(result.answer.summary, /\$3,400/);
  assert.match(result.answer.summary, /34 Primary KPI/);
  assert.match(result.answer.summary, /Book Appts US/);
  assert.match(result.answer.summary, /average group/);
  assert.ok(result.answer.citations.length >= 5);
  assert.ok(result.sourceNotes.some((note) => note.label === "Date range"));
  assert.ok(result.sourceNotes.some((note) => note.value === "12 matching Meta Ads daily rows"));
  assert.deepEqual(result.validation.blockers, []);
  assert.deepEqual(validateAnalysisWorkbenchNarrativeGrounding(result.answer.summary, result.answer.citations), []);
});

test("unsupported requests are blocked before any aggregate query runs", async () => {
  let queryCount = 0;
  const result = await runAnalysisWorkbenchFactsPipeline({
    prompt: "Show revenue and ROAS by campaign.",
    outputMode: "answer_only",
    latestSyncedInsightDate: "2026-05-24",
    executeAggregate: async () => {
      queryCount += 1;
      return [];
    },
  });

  assert.equal(queryCount, 0);
  assert.equal(result.status, "failed");
  assert.deepEqual(
    result.validation.blockers.map((blocker) => blocker.code),
    ["unsupported_revenue", "unsupported_roas"],
  );
  assert.match(result.answer.summary, /outside the governed Meta Ads catalog/);
});

test("zero-row answers keep source notes and avoid invented numbers", async () => {
  const result = await runAnalysisWorkbenchFactsPipeline({
    prompt: "Show spend by campaign for the last 7 days.",
    outputMode: "answer_only",
    latestSyncedInsightDate: "2026-05-24",
    executeAggregate: async () => [],
  });

  assert.equal(result.status, "completed");
  assert.equal(result.facts.status, "empty");
  assert.match(result.answer.summary, /No matching Meta Ads rows/);
  assert.deepEqual(result.answer.citations.map((citation) => citation.id), ["S1"]);
  assert.ok(
    result.validation.warnings.some((warning) => warning.code === "zero_matching_rows"),
  );
  assert.ok(result.sourceNotes.some((note) => note.value === "0 matching Meta Ads daily rows"));
});

test("numeric narrative grounding rejects numbers missing from citations", () => {
  const citations: AnalysisWorkbenchCitation[] = [
    {
      id: "F1",
      kind: "fact",
      label: "Spend",
      value: 3400,
      formattedValue: "$3,400",
    },
  ];

  assert.deepEqual(
    validateAnalysisWorkbenchNarrativeGrounding("Spend was $3,400 [F1].", citations),
    [],
  );
  assert.deepEqual(
    validateAnalysisWorkbenchNarrativeGrounding("Spend was $3,400 and leads were 99 [F1].", citations).map(
      (issue) => issue.code,
    ),
    ["uncited_numeric_claim"],
  );
});

function aggregateRow(overrides: Partial<MetaInsightAggregateRow> = {}): MetaInsightAggregateRow {
  return {
    date: null,
    week: null,
    month: null,
    quarter: null,
    brand: null,
    campaign_umbrella: null,
    campaign: null,
    campaign_id: null,
    ad_set: null,
    ad_set_id: null,
    ad: null,
    ad_id: null,
    creative: null,
    creative_id: null,
    spend: 0,
    monthly_budget: 0,
    impressions: 0,
    reach: 0,
    clicks: 0,
    leads: 0,
    bookings: 0,
    conversions: 0,
    website_bookings: 0,
    messaging_contacts: 0,
    new_messaging_contacts: 0,
    primary_results: 0,
    secondary_results: 0,
    ctr: 0,
    cpm: 0,
    cpc: 0,
    cpl: null,
    frequency: 0,
    source_rows: 0,
    ...overrides,
  };
}
