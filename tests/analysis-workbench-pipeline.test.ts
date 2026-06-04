import assert from "node:assert/strict";
import test from "node:test";

import {
  runAnalysisWorkbenchFactsPipeline,
  validateAnalysisWorkbenchNarrativeGrounding,
  type AnalysisWorkbenchCitation,
  type AnalysisWorkbenchPipelineAggregateRequest,
  type AnalysisWorkbenchPipelineIntent,
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
  assert.deepEqual(result.answer.apiCost, {
    model: "governed-local",
    inputTokens: 0,
    outputTokens: 0,
    totalTokens: 0,
    estimatedCostUsd: 0,
  });
  assert.ok(result.sourceNotes.some((note) => note.label === "Date range"));
  assert.ok(result.sourceNotes.some((note) => note.value === "12 matching Meta Ads daily rows"));
  assert.deepEqual(result.validation.blockers, []);
  assert.deepEqual(validateAnalysisWorkbenchNarrativeGrounding(result.answer.summary, result.answer.citations), []);
});

test("daily budget prompts use daily_budget instead of monthly budget or spend", async () => {
  const requests: AnalysisWorkbenchPipelineAggregateRequest[] = [];
  const result = await runAnalysisWorkbenchFactsPipeline({
    prompt: "What is the daily budget by campaign group?",
    outputMode: "answer_only",
    latestSyncedInsightDate: "2026-05-24",
    executeAggregate: async (request) => {
      requests.push(request);
      return request.dimensions.length
        ? [
            aggregateRow({
              campaign_umbrella: "Book Appts US",
              daily_budget: 100,
              monthly_budget: 3100,
              spend: 700,
              source_rows: 8,
            }),
          ]
        : [
            aggregateRow({
              daily_budget: 100,
              monthly_budget: 3100,
              spend: 700,
              source_rows: 8,
            }),
          ];
    },
  });

  assert.equal(result.status, "completed");
  assert.deepEqual(result.intent.metrics, ["daily_budget"]);
  assert.deepEqual(requests.map((request) => request.metrics), [["daily_budget"], ["daily_budget"]]);
  assert.deepEqual(requests.map((request) => request.sortField), ["daily_budget", "daily_budget"]);
  assert.match(result.answer.summary, /daily budget/i);
  assert.match(result.answer.summary, /\$100/);
  assert.doesNotMatch(result.answer.summary, /\$3,100/);
  assert.doesNotMatch(result.answer.summary, /\$700/);
});

test("answer plus visuals creates structured metric, table, bar, and line visual cards", async () => {
  const requests: AnalysisWorkbenchPipelineAggregateRequest[] = [];
  const result = await runAnalysisWorkbenchFactsPipeline({
    prompt: "Show spend and primary KPI by campaign group for the last 7 days.",
    outputMode: "answer_visuals",
    latestSyncedInsightDate: "2026-05-24",
    executeAggregate: async (request) => {
      requests.push(request);
      if (request.dimensions.includes("date")) {
        return [
          aggregateRow({ date: "2026-05-18", spend: 300, primary_results: 3, source_rows: 2 }),
          aggregateRow({ date: "2026-05-19", spend: 420, primary_results: 4, source_rows: 2 }),
          aggregateRow({ date: "2026-05-20", spend: 510, primary_results: 5, source_rows: 2 }),
        ];
      }

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
  assert.deepEqual(
    requests.map((request) => request.dimensions),
    [["campaign_umbrella"], [], ["date"]],
  );
  assert.match(result.answer.summary, /Answer \+ visuals mode/);
  assert.deepEqual(
    result.visualCards.map((card) => card.type),
    ["metric_card", "metric_card", "flat_table", "bar_chart", "line_chart"],
  );
  assert.deepEqual(result.visualCards.map((card) => card.sourceNoteIds), [
    ["S1", "S2", "S3"],
    ["S1", "S2", "S3"],
    ["S1", "S2", "S3", "S4"],
    ["S1", "S2", "S3", "S4"],
    ["S1", "S2", "S3"],
  ]);

  const table = result.visualCards.find((card) => card.type === "flat_table");
  assert.ok(table && table.type === "flat_table");
  assert.equal(table.title, "Campaign group evidence");
  const entityCell = table.rows[0]?.entity;
  assert.equal(
    entityCell && typeof entityCell === "object" && "formattedValue" in entityCell
      ? entityCell.formattedValue
      : entityCell,
    "Book Appts US",
  );
  const spendCell = table.rows[0]?.spend;
  assert.equal(
    spendCell && typeof spendCell === "object" && "formattedValue" in spendCell
      ? spendCell.formattedValue
      : null,
    "$2,500",
  );

  const line = result.visualCards.find((card) => card.type === "line_chart");
  assert.ok(line && line.type === "line_chart");
  assert.equal(line.title, "Spend trend");
  assert.equal(line.points[0]?.label, "2026-05-18");
  assert.equal(line.points[2]?.formattedValue, "$510");
});

test("this week prompts resolve to the current ISO week-to-date instead of the default 30 days", async () => {
  const requests: AnalysisWorkbenchPipelineAggregateRequest[] = [];
  const result = await runAnalysisWorkbenchFactsPipeline({
    prompt: "Which campaign groups changed the most this week?",
    outputMode: "answer_visuals",
    latestSyncedInsightDate: "2026-05-25",
    executeAggregate: async (request) => {
      requests.push(request);
      return request.dimensions.length
        ? [
            aggregateRow({
              campaign_umbrella: "Book Appts US",
              spend: 1200,
              primary_results: 12,
              source_rows: 1,
            }),
          ]
        : [
            aggregateRow({
              spend: 1200,
              primary_results: 12,
              source_rows: 1,
            }),
          ];
    },
  });

  assert.equal(result.status, "completed");
  const intent = result.intent as AnalysisWorkbenchPipelineIntent;
  assert.deepEqual(
    requests.map((request) => ({ start: request.start, end: request.end })),
    [
      { start: "2026-05-25", end: "2026-05-25" },
      { start: "2026-05-25", end: "2026-05-25" },
      { start: "2026-05-25", end: "2026-05-25" },
    ],
  );
  assert.equal(intent.dateRange.days, 1);
  assert.equal(intent.dateRange.label, "This week");
});

test("which ad creative prompts group by creative while book appointment ads stay a filter", async () => {
  const requests: AnalysisWorkbenchPipelineAggregateRequest[] = [];
  const result = await runAnalysisWorkbenchFactsPipeline({
    prompt: "Which ad creative in book appointment ads is doing best the past 7 days?",
    outputMode: "answer_visuals",
    latestSyncedInsightDate: "2026-05-25",
    executeAggregate: async (request) => {
      requests.push(request);
      return request.dimensions.length
        ? [
            aggregateRow({
              creative: "Diamond consultation video",
              creative_id: "creative-1",
              campaign_umbrella: "Book Appts US",
              spend: 700,
              primary_results: 14,
              source_rows: 4,
            }),
            aggregateRow({
              creative: "Appointment offer static",
              creative_id: "creative-2",
              campaign_umbrella: "Book Appts US",
              spend: 450,
              primary_results: 9,
              source_rows: 3,
            }),
          ]
        : [
            aggregateRow({
              spend: 1150,
              primary_results: 23,
              source_rows: 7,
            }),
          ];
    },
  });

  assert.equal(result.status, "completed");
  const intent = result.intent as AnalysisWorkbenchPipelineIntent;
  assert.deepEqual(intent.metrics, ["bookings"]);
  assert.deepEqual(intent.dimensions, ["creative"]);
  assert.deepEqual(intent.filters, [
    { field: "campaign_umbrella", operator: "equals", value: "Book Appts US" },
  ]);
  assert.deepEqual(requests[0]?.dimensions, ["creative"]);
  assert.equal(requests[0]?.sortField, "bookings");
  assert.deepEqual(requests[0]?.filters, [
    { field: "campaign_umbrella", operator: "equals", value: "Book Appts US" },
  ]);
  assert.equal(intent.dateRange.start, "2026-05-19");
  assert.equal(intent.dateRange.end, "2026-05-25");
});

test("top ranked creatives across multiple campaign groups use primary KPI and scoped filters", async () => {
  const requests: AnalysisWorkbenchPipelineAggregateRequest[] = [];
  const result = await runAnalysisWorkbenchFactsPipeline({
    prompt: "What's the top 3 ranked ad creatives across cash for gold and book appointment ads in terms of primary KPI?",
    outputMode: "answer_visuals",
    latestSyncedInsightDate: "2026-05-25",
    executeAggregate: async (request) => {
      requests.push(request);
      const umbrellaFilter = request.filters.find((filter) => filter.field === "campaign_umbrella");
      if (request.dimensions.includes("creative")) {
        if (umbrellaFilter?.value === "Cash for Gold US") {
          return [
            aggregateRow({
              creative: "Gold test static",
              creative_id: "cash-creative-1",
              campaign_umbrella: "Cash for Gold US",
              primary_results: 18,
              messaging_contacts: 18,
              spend: 500,
              source_rows: 4,
            }),
            aggregateRow({
              creative: "Gold testimonial reel",
              creative_id: "cash-creative-2",
              campaign_umbrella: "Cash for Gold US",
              primary_results: 6,
              messaging_contacts: 6,
              spend: 250,
              source_rows: 2,
            }),
          ];
        }
        if (umbrellaFilter?.value === "Book Appts US") {
          return [
            aggregateRow({
              creative: "Appointment offer video",
              creative_id: "book-creative-1",
              campaign_umbrella: "Book Appts US",
              primary_results: 24,
              website_bookings: 24,
              bookings: 24,
              spend: 700,
              source_rows: 5,
            }),
            aggregateRow({
              creative: "Appointment reminder static",
              creative_id: "book-creative-2",
              campaign_umbrella: "Book Appts US",
              primary_results: 11,
              website_bookings: 11,
              bookings: 11,
              spend: 300,
              source_rows: 3,
            }),
          ];
        }
      }

      if (umbrellaFilter?.value === "Cash for Gold US") {
        return [aggregateRow({ primary_results: 24, messaging_contacts: 24, spend: 750, source_rows: 6 })];
      }
      if (umbrellaFilter?.value === "Book Appts US") {
        return [
          aggregateRow({
            primary_results: 35,
            website_bookings: 35,
            bookings: 35,
            spend: 1000,
            source_rows: 8,
          }),
        ];
      }
      return [];
    },
  });

  assert.equal(result.status, "completed");
  const intent = result.intent as AnalysisWorkbenchPipelineIntent;
  assert.deepEqual(intent.metrics, ["primary_results"]);
  assert.deepEqual(intent.dimensions, ["creative"]);
  assert.equal(intent.sort.field, "primary_results");
  assert.equal(intent.sort.direction, "desc");
  assert.equal(intent.limit, 3);

  const groupedRequests = requests.filter((request) => request.dimensions.includes("creative"));
  assert.equal(groupedRequests.length, 2);
  assert.deepEqual(
    groupedRequests.map((request) => request.filters),
    [
      [{ field: "campaign_umbrella", operator: "equals", value: "Cash for Gold US" }],
      [{ field: "campaign_umbrella", operator: "equals", value: "Book Appts US" }],
    ],
  );
  assert.ok(
    result.visualCards.some(
      (card) =>
        card.type === "bar_chart" &&
        card.metric === "primary_results" &&
        card.bars?.[0]?.label === "Appointment offer video",
    ),
  );
});

test("creative week-over-week output uses enriched creative names and hides raw numeric IDs", async () => {
  const result = await runAnalysisWorkbenchFactsPipeline({
    prompt:
      "Which ad creative in Book Appts performed best week-over-week? Organize by week and specific ad creative name for the past four weeks.",
    outputMode: "answer_visuals",
    latestSyncedInsightDate: "2026-05-25",
    loadEntityDisplays: async () => [
      {
        id: "1653854429202572",
        label: "Consultation Offer Video 2026-05-13-475869bd640bc284442b8db196ae4052",
        subtitle: "Book Appts US - Prospecting 1653854429202572",
        thumbnailUrl: "https://example.test/creative.jpg",
        sourceType: "creative",
        hiddenId: "1653854429202572",
      },
      {
        id: "1147749040845625",
        label: "Appointment Reminder Static",
        subtitle: "Book Appts US - Retargeting",
        sourceType: "creative",
        hiddenId: "1147749040845625",
      },
    ],
    executeAggregate: async (request) => {
      if (request.dimensions.length) {
        return [
          aggregateRow({
            week: "2026-W20",
            creative: "1653854429202572",
            creative_id: "1653854429202572",
            campaign_umbrella: "Book Appts US",
            website_bookings: 8,
            spend: 400,
            source_rows: 2,
          }),
          aggregateRow({
            week: "2026-W21",
            creative: "1147749040845625",
            creative_id: "1147749040845625",
            campaign_umbrella: "Book Appts US",
            website_bookings: 4,
            spend: 300,
            source_rows: 2,
          }),
        ];
      }
      return [aggregateRow({ website_bookings: 12, spend: 700, source_rows: 4 })];
    },
  });

  assert.equal(result.status, "completed");
  assert.equal((result.intent as AnalysisWorkbenchPipelineIntent).analysisShape, "entity_week_over_week");
  assert.match(result.answer.summary, /Consultation Offer Video/);
  assert.doesNotMatch(result.answer.summary, /\b1653854429202572\b/);
  const table = result.visualCards.find((card) => card.type === "flat_table");
  assert.ok(table && table.type === "flat_table");
  const entityCell = table.rows[0]?.entity;
  assert.equal(
    entityCell && typeof entityCell === "object" && "formattedValue" in entityCell
      ? entityCell.formattedValue
      : null,
    "Consultation Offer Video",
  );
  assert.doesNotMatch(result.answer.summary, /475869bd640bc284442b8db196ae4052/);
  assert.equal(
    entityCell && typeof entityCell === "object" && "hiddenId" in entityCell
      ? entityCell.hiddenId
      : null,
    "1653854429202572",
  );
});

test("AI narrative with uncited numbers falls back to grounded deterministic answer", async () => {
  const result = await runAnalysisWorkbenchFactsPipeline({
    prompt: "Show spend by campaign group for the last 7 days.",
    outputMode: "answer_visuals",
    latestSyncedInsightDate: "2026-05-25",
    composeNarrative: async () => ({ summary: "Spend was $999,999 [F1]." }),
    executeAggregate: async (request) =>
      request.dimensions.length
        ? [aggregateRow({ campaign_umbrella: "Book Appts US", spend: 700, source_rows: 2 })]
        : [aggregateRow({ spend: 700, source_rows: 2 })],
  });

  assert.equal(result.status, "completed");
  assert.doesNotMatch(result.answer.summary, /\$999,999/);
  assert.match(result.answer.summary, /\$700/);
});

test("AI narrative title becomes the sanitized run title", async () => {
  const result = await runAnalysisWorkbenchFactsPipeline({
    prompt: "Show spend by campaign group for the last 7 days.",
    outputMode: "answer_visuals",
    latestSyncedInsightDate: "2026-05-25",
    composeNarrative: async (input) => ({
      summary: input.fallbackSummary,
      title: '"Spend by Campaign Group [F1]."',
    }),
    executeAggregate: async (request) =>
      request.dimensions.length
        ? [aggregateRow({ campaign_umbrella: "Book Appts US", spend: 700, source_rows: 2 })]
        : [aggregateRow({ spend: 700, source_rows: 2 })],
  });

  assert.equal(result.status, "completed");
  assert.equal(result.title, "Spend by Campaign Group");
});

test("run title falls back to the prompt when the narrative supplies no title", async () => {
  const result = await runAnalysisWorkbenchFactsPipeline({
    prompt: "Show spend by campaign group for the last 7 days.",
    outputMode: "answer_visuals",
    latestSyncedInsightDate: "2026-05-25",
    composeNarrative: async (input) => ({ summary: input.fallbackSummary }),
    executeAggregate: async (request) =>
      request.dimensions.length
        ? [aggregateRow({ campaign_umbrella: "Book Appts US", spend: 700, source_rows: 2 })]
        : [aggregateRow({ spend: 700, source_rows: 2 })],
  });

  assert.equal(result.title, "Show spend by campaign group for the last 7 days.");
});

test("date range is shrunk to the latest synced data with a clamp assumption", async () => {
  const requests: AnalysisWorkbenchPipelineAggregateRequest[] = [];
  const result = await runAnalysisWorkbenchFactsPipeline({
    prompt: "Break out spend by month for the entire year 2026.",
    outputMode: "answer_visuals",
    latestSyncedInsightDate: "2026-06-04",
    executeAggregate: async (request) => {
      requests.push(request);
      return request.dimensions.length
        ? [
            aggregateRow({ month: "2026-01", spend: 1000, source_rows: 5 }),
            aggregateRow({ month: "2026-02", spend: 1200, source_rows: 6 }),
          ]
        : [aggregateRow({ spend: 2200, source_rows: 11 })];
    },
  });

  const intent = result.intent as AnalysisWorkbenchPipelineIntent;
  assert.equal(intent.dateRange.start, "2026-01-01");
  assert.equal(intent.dateRange.end, "2026-06-04");
  assert.ok(requests.length > 0);
  assert.ok(requests.every((request) => request.end === "2026-06-04"));
  assert.ok(
    result.validation.assumptions.some((assumption) => assumption.code === "synced_data_clamp"),
  );
});

test("recommendation shapes repair one-dimension pivot parser output to a table", async () => {
  const result = await runAnalysisWorkbenchFactsPipeline({
    prompt:
      "Which campaign groups should we move budget toward or away from this month? Show spend, monthly budget, primary KPI, and CPM by campaign group.",
    outputMode: "full_dashboard",
    latestSyncedInsightDate: "2026-05-25",
    parseIntent: async () => ({
      source: "ai",
      model: "test-model",
      apiCost: {
        model: "test-model",
        inputTokens: 0,
        outputTokens: 0,
        totalTokens: 0,
        estimatedCostUsd: 0,
      },
      intent: {
        questionType: "recommendation",
        metrics: ["spend", "monthly_budget", "primary_results", "cpm"],
        dimensions: ["campaign_umbrella"],
        filters: [],
        dateIntent: { kind: "month_to_date", grain: "day" },
        comparison: { mode: "none" },
        visualIntent: {
          type: "pivot_table",
          metrics: ["spend", "monthly_budget", "primary_results", "cpm"],
          dimensions: ["campaign_umbrella"],
          rowDimension: "campaign_umbrella",
        },
        sort: { field: "spend", direction: "desc" },
        limit: 20,
        confidence: "high",
        assumptions: [],
        unsupported: [],
      },
    }),
    executeAggregate: async (request) =>
      request.dimensions.length
        ? [
            aggregateRow({
              campaign_umbrella: "Cash for Gold US",
              spend: 900,
              monthly_budget: 1000,
              primary_results: 9,
              cpm: 12,
              source_rows: 3,
            }),
          ]
        : [
            aggregateRow({
              spend: 900,
              monthly_budget: 1000,
              primary_results: 9,
              cpm: 12,
              source_rows: 3,
            }),
          ],
  });

  assert.equal(result.status, "completed");
  assert.equal(result.intent.analysisShape, "budget_recommendation");
  assert.equal((result.intent as AnalysisWorkbenchPipelineIntent).visual?.type, "flat_table");
  assert.deepEqual(result.validation.blockers, []);
});

test("natural language prompt grammar resolves governed query intent across common structures", async () => {
  const cases: Array<{
    name: string;
    prompt: string;
    expected: {
      metrics?: string[];
      dimensions?: string[];
      filters?: Array<{ field: string; operator: string; value: string }>;
      start?: string;
      end?: string;
      days?: number;
      label?: string;
      sortField?: string;
      sortDirection?: "asc" | "desc";
      visualType?: string | null;
    };
  }> = [
    {
      name: "subject-form campaign question with brand filter and number-word weeks",
      prompt: "Which campaign had the highest spend in VVS over the last two weeks?",
      expected: {
        metrics: ["spend"],
        dimensions: ["campaign"],
        filters: [{ field: "brand", operator: "equals", value: "VVS" }],
        start: "2026-05-12",
        end: "2026-05-25",
        days: 14,
        sortField: "spend",
        sortDirection: "desc",
      },
    },
    {
      name: "break-down phrasing with ad-set grouping and previous-week date",
      prompt: "Can you break down messages by ad set for cash for gold during the previous week?",
      expected: {
        metrics: ["messaging_contacts"],
        dimensions: ["ad_set"],
        filters: [{ field: "campaign_umbrella", operator: "equals", value: "Cash for Gold US" }],
        start: "2026-05-19",
        end: "2026-05-25",
        days: 7,
      },
    },
    {
      name: "this-week booking trend keeps appointment ads as a filter",
      prompt: "Show bookings by day for book appointment ads this week.",
      expected: {
        metrics: ["bookings"],
        dimensions: ["date"],
        filters: [{ field: "campaign_umbrella", operator: "equals", value: "Book Appts US" }],
        start: "2026-05-25",
        end: "2026-05-25",
        days: 1,
        label: "This week",
      },
    },
    {
      name: "top ads phrasing maps subject to ad grain",
      prompt: "What are the top ads for Facebook US Product by CTR in the last 14 days?",
      expected: {
        metrics: ["ctr"],
        dimensions: ["ad"],
        filters: [{ field: "campaign_umbrella", operator: "equals", value: "Facebook US Product" }],
        start: "2026-05-12",
        end: "2026-05-25",
        days: 14,
        sortField: "ctr",
      },
    },
    {
      name: "across-campaign phrasing and implicit last-month date",
      prompt: "Compare CPC across campaigns for VVS last month.",
      expected: {
        metrics: ["cpc"],
        dimensions: ["campaign"],
        filters: [{ field: "brand", operator: "equals", value: "VVS" }],
        start: "2026-04-26",
        end: "2026-05-25",
        days: 30,
      },
    },
    {
      name: "per-brand phrasing and month-to-date date",
      prompt: "Show spend per brand month to date.",
      expected: {
        metrics: ["spend"],
        dimensions: ["brand"],
        start: "2026-05-01",
        end: "2026-05-25",
        days: 25,
        label: "This month",
      },
    },
    {
      name: "daily trend phrasing sets date grain, line visual, and brand filter",
      prompt: "Daily trend of leads for HP, past week.",
      expected: {
        metrics: ["leads"],
        dimensions: ["date"],
        filters: [{ field: "brand", operator: "equals", value: "HP" }],
        start: "2026-05-19",
        end: "2026-05-25",
        days: 7,
        visualType: "line_chart",
      },
    },
    {
      name: "lowest phrasing sorts ascending for cost metrics",
      prompt: "Give me lowest CPL ad sets in Cash for Gold over past fourteen days.",
      expected: {
        metrics: ["cpl"],
        dimensions: ["ad_set"],
        filters: [{ field: "campaign_umbrella", operator: "equals", value: "Cash for Gold US" }],
        start: "2026-05-12",
        end: "2026-05-25",
        days: 14,
        sortField: "cpl",
        sortDirection: "asc",
      },
    },
    {
      name: "week-to-date phrase works without explicit this-week words",
      prompt: "Which campaigns changed most week to date?",
      expected: {
        metrics: ["primary_results", "spend", "ctr"],
        dimensions: ["campaign"],
        start: "2026-05-25",
        end: "2026-05-25",
        days: 1,
        label: "This week",
      },
    },
    {
      name: "pivot phrasing keeps campaign group and week dimensions",
      prompt: "Pivot spend by campaign group and week for past 4 weeks.",
      expected: {
        metrics: ["spend"],
        dimensions: ["week", "campaign_umbrella"],
        start: "2026-04-28",
        end: "2026-05-25",
        days: 28,
        visualType: "pivot_table",
      },
    },
    {
      name: "scatter phrasing recognizes spend versus CPL",
      prompt: "Scatter spend vs CPL by campaign group last seven days.",
      expected: {
        metrics: ["spend", "cpl"],
        dimensions: ["campaign_umbrella"],
        start: "2026-05-19",
        end: "2026-05-25",
        days: 7,
        visualType: "scatter_chart",
      },
    },
    {
      name: "trailing days and new-message phrase prefer new messaging contacts",
      prompt: "How are new messages performing by creative for Facebook US product over trailing 10 days?",
      expected: {
        metrics: ["new_messaging_contacts"],
        dimensions: ["creative"],
        filters: [{ field: "campaign_umbrella", operator: "equals", value: "Facebook US Product" }],
        start: "2026-05-16",
        end: "2026-05-25",
        days: 10,
      },
    },
    {
      name: "recent-month phrase maps to the 30 day default month window",
      prompt: "Compare brands by impressions for the recent month.",
      expected: {
        metrics: ["impressions"],
        dimensions: ["brand"],
        start: "2026-04-26",
        end: "2026-05-25",
        days: 30,
      },
    },
    {
      name: "per-ad every-day phrasing sets both entity and date grains",
      prompt: "Show click volume per ad every day for cash for gold for the last 7 days.",
      expected: {
        metrics: ["clicks"],
        dimensions: ["date", "ad"],
        filters: [{ field: "campaign_umbrella", operator: "equals", value: "Cash for Gold US" }],
        start: "2026-05-19",
        end: "2026-05-25",
        days: 7,
      },
    },
  ];

  for (const testCase of cases) {
    const requests: AnalysisWorkbenchPipelineAggregateRequest[] = [];
    const result = await runAnalysisWorkbenchFactsPipeline({
      prompt: testCase.prompt,
      outputMode: "answer_visuals",
      latestSyncedInsightDate: "2026-05-25",
      executeAggregate: async (request) => {
        requests.push(request);
        return request.dimensions.length
          ? [
              aggregateRow({
                date: "2026-05-25",
                week: "2026-W22",
                month: "2026-05",
                quarter: "2026-Q2",
                brand: "HP",
                campaign_umbrella: "Book Appts US",
                campaign: "Campaign A",
                campaign_id: "campaign-a",
                ad_set: "Ad Set A",
                ad_set_id: "ad-set-a",
                ad: "Ad A",
                ad_id: "ad-a",
                creative: "Creative A",
                creative_id: "creative-a",
                spend: 1000,
                clicks: 50,
                leads: 10,
                bookings: 5,
                messaging_contacts: 12,
                new_messaging_contacts: 7,
                primary_results: 5,
                ctr: 2.5,
                cpc: 20,
                cpl: 100,
                source_rows: 4,
              }),
              aggregateRow({
                date: "2026-05-24",
                week: "2026-W21",
                month: "2026-05",
                quarter: "2026-Q2",
                brand: "VVS",
                campaign_umbrella: "Cash for Gold US",
                campaign: "Campaign B",
                campaign_id: "campaign-b",
                ad_set: "Ad Set B",
                ad_set_id: "ad-set-b",
                ad: "Ad B",
                ad_id: "ad-b",
                creative: "Creative B",
                creative_id: "creative-b",
                spend: 500,
                clicks: 20,
                leads: 8,
                bookings: 2,
                messaging_contacts: 9,
                new_messaging_contacts: 4,
                primary_results: 2,
                ctr: 1.5,
                cpc: 25,
                cpl: 62.5,
                source_rows: 3,
              }),
            ]
          : [
              aggregateRow({
                spend: 1500,
                clicks: 70,
                leads: 18,
                bookings: 7,
                messaging_contacts: 21,
                new_messaging_contacts: 11,
                primary_results: 7,
                ctr: 2,
                cpc: 21.43,
                cpl: 83.33,
                source_rows: 7,
              }),
            ];
      },
    });

    assert.equal(result.status, "completed", testCase.name);
    const intent = result.intent as AnalysisWorkbenchPipelineIntent;
    const groupedRequest = requests[0];
    assert.ok(groupedRequest, testCase.name);
    if (testCase.expected.metrics) {
      assert.deepEqual(intent.metrics, testCase.expected.metrics, `${testCase.name}: metrics`);
      assert.deepEqual(groupedRequest.metrics, testCase.expected.metrics, `${testCase.name}: query metrics`);
    }
    if (testCase.expected.dimensions) {
      assert.deepEqual(intent.dimensions, testCase.expected.dimensions, `${testCase.name}: dimensions`);
      assert.deepEqual(
        groupedRequest.dimensions,
        testCase.expected.dimensions,
        `${testCase.name}: query dimensions`,
      );
    }
    if (testCase.expected.filters) {
      assert.deepEqual(intent.filters, testCase.expected.filters, `${testCase.name}: filters`);
      assert.deepEqual(groupedRequest.filters, testCase.expected.filters, `${testCase.name}: query filters`);
    }
    if (testCase.expected.start) {
      assert.equal(intent.dateRange.start, testCase.expected.start, `${testCase.name}: start`);
      assert.equal(groupedRequest.start, testCase.expected.start, `${testCase.name}: query start`);
    }
    if (testCase.expected.end) {
      assert.equal(intent.dateRange.end, testCase.expected.end, `${testCase.name}: end`);
      assert.equal(groupedRequest.end, testCase.expected.end, `${testCase.name}: query end`);
    }
    if (testCase.expected.days) {
      assert.equal(intent.dateRange.days, testCase.expected.days, `${testCase.name}: days`);
    }
    if (testCase.expected.label) {
      assert.equal(intent.dateRange.label, testCase.expected.label, `${testCase.name}: label`);
    }
    if (testCase.expected.sortField) {
      assert.equal(intent.sort.field, testCase.expected.sortField, `${testCase.name}: sort field`);
      assert.equal(groupedRequest.sortField, testCase.expected.sortField, `${testCase.name}: query sort field`);
    }
    if (testCase.expected.sortDirection) {
      assert.equal(intent.sort.direction, testCase.expected.sortDirection, `${testCase.name}: sort direction`);
      assert.equal(
        groupedRequest.sortDirection,
        testCase.expected.sortDirection,
        `${testCase.name}: query sort direction`,
      );
    }
    if (testCase.expected.visualType !== undefined) {
      assert.equal(intent.visual?.type || null, testCase.expected.visualType, `${testCase.name}: visual`);
    }
  }
});

test("AI parser full-year weekly spend trend is shrunk to the latest synced date", async () => {
  const requests: AnalysisWorkbenchPipelineAggregateRequest[] = [];
  const result = await runAnalysisWorkbenchFactsPipeline({
    prompt: "week by week ad spend for the entire of 2026",
    outputMode: "answer_visuals",
    latestSyncedInsightDate: "2026-05-25",
    parseIntent: async () => ({
      source: "ai",
      model: "gpt-5.4",
      apiCost: {
        model: "gpt-5.4",
        inputTokens: 1000,
        outputTokens: 200,
        totalTokens: 1200,
        estimatedCostUsd: 0.01,
      },
      intent: {
        questionType: "trend",
        metrics: ["spend"],
        dimensions: ["week"],
        filters: [],
        dateIntent: {
          kind: "calendar_year",
          year: 2026,
          month: null,
          quarter: null,
          unit: null,
          count: null,
          start: null,
          end: null,
          grain: "week",
        },
        comparison: { mode: "none" },
        visualIntent: {
          type: "line_chart",
          metrics: ["spend"],
          dimensions: ["week"],
          rowDimension: null,
          columnDimension: null,
          x: "week",
          y: "spend",
        },
        sort: { field: "week", direction: "asc" },
        limit: null,
        confidence: "high",
        assumptions: [],
        unsupported: [],
      },
    }),
    executeAggregate: async (request) => {
      requests.push(request);
      if (request.dimensions.includes("week")) {
        return [
          aggregateRow({ week: "2025-12-29", spend: 100, source_rows: 7 }),
          aggregateRow({ week: "2026-01-05", spend: 200, source_rows: 7 }),
          aggregateRow({ week: "2026-12-28", spend: 300, source_rows: 4 }),
        ];
      }
      return [aggregateRow({ spend: 600, source_rows: 18 })];
    },
  });

  assert.equal(result.status, "completed");
  const intent = result.intent as AnalysisWorkbenchPipelineIntent;
  assert.equal(intent.status, "ready");
  assert.equal(intent.questionType, "trend");
  assert.equal(intent.parser?.source, "ai");
  assert.equal(intent.dateRange.start, "2026-01-01");
  assert.equal(intent.dateRange.end, "2026-05-25");
  assert.equal(intent.dateRange.days, 145);
  assert.equal(intent.dateGrain, "week");
  assert.deepEqual(intent.metrics, ["spend"]);
  assert.deepEqual(intent.dimensions, ["week"]);
  assert.equal(intent.limit >= 22, true);
  assert.ok(
    result.validation.assumptions.some((assumption) => assumption.code === "synced_data_clamp"),
  );
  assert.deepEqual(
    requests.map((request) => ({
      start: request.start,
      end: request.end,
      dimensions: request.dimensions,
      sortField: request.sortField,
      sortDirection: request.sortDirection,
      limit: request.limit,
    })),
    [
      {
        start: "2026-01-01",
        end: "2026-05-25",
        dimensions: ["week"],
        sortField: "week",
        sortDirection: "asc",
        limit: 22,
      },
      {
        start: "2026-01-01",
        end: "2026-05-25",
        dimensions: [],
        sortField: "week",
        sortDirection: "asc",
        limit: 1,
      },
      {
        start: "2026-01-01",
        end: "2026-05-25",
        dimensions: ["week"],
        sortField: "week",
        sortDirection: "asc",
        limit: 22,
      },
    ],
  );

  const line = result.visualCards.find((card) => card.type === "line_chart");
  assert.ok(line && line.type === "line_chart");
  assert.equal(line.dimension, "week");
  assert.deepEqual(
    line.points.map((point) => point.label),
    ["2025-12-29", "2026-01-05", "2026-12-28"],
  );
  assert.ok(result.sourceNotes.some((note) => note.label === "Intent parser"));
  assert.deepEqual(result.answer.apiCost, {
    model: "gpt-5.4",
    inputTokens: 1000,
    outputTokens: 200,
    totalTokens: 1200,
    estimatedCostUsd: 0.01,
  });
});

test("AI parser aliases Book Appts campaign text to the governed campaign group filter", async () => {
  const requests: AnalysisWorkbenchPipelineAggregateRequest[] = [];
  const result = await runAnalysisWorkbenchFactsPipeline({
    prompt:
      "Which ad creative in the Book Appts campaign performed the best? Organize this week by week. I want to see the results week by week.",
    outputMode: "answer_visuals",
    latestSyncedInsightDate: "2026-05-27",
    parseIntent: async () => ({
      source: "ai",
      model: "gpt-5.4",
      apiCost: {
        model: "gpt-5.4",
        inputTokens: 1000,
        outputTokens: 200,
        totalTokens: 1200,
        estimatedCostUsd: 0.01,
      },
      intent: {
        questionType: "leaderboard",
        metrics: ["primary_results"],
        dimensions: ["creative", "week"],
        filters: [
          { field: "campaign", operator: "contains", value: "Book Appts" },
        ],
        dateIntent: {
          kind: "rolling",
          year: null,
          month: null,
          quarter: null,
          unit: "day",
          count: 30,
          start: null,
          end: null,
          grain: "week",
        },
        comparison: { mode: "none" },
        visualIntent: null,
        sort: { field: "primary_results", direction: "desc" },
        limit: null,
        confidence: "medium",
        assumptions: [
          {
            code: "best_defined_by_primary_results",
            message:
              "User asked which creative performed best; interpreted best using primary_results.",
          },
        ],
        unsupported: [],
      },
    }),
    executeAggregate: async (request) => {
      requests.push(request);
      assert.equal(
        request.filters.some((filter) => filter.field === "campaign"),
        false,
        "campaign text alias should not be ANDed with the campaign group filter",
      );

      if (request.dimensions.includes("creative")) {
        return [
          aggregateRow({
            creative: "Appointment video",
            week: "2026-05-25",
            primary_results: 12,
            source_rows: 3,
          }),
          aggregateRow({
            creative: "Appointment static",
            week: "2026-05-25",
            primary_results: 5,
            source_rows: 2,
          }),
        ];
      }
      if (request.dimensions.includes("week")) {
        return [
          aggregateRow({
            week: "2026-05-25",
            primary_results: 17,
            source_rows: 5,
          }),
        ];
      }
      return [aggregateRow({ primary_results: 17, source_rows: 5 })];
    },
  });

  assert.equal(result.status, "completed");
  const intent = result.intent as AnalysisWorkbenchPipelineIntent;
  assert.equal(intent.parser?.source, "ai");
  assert.equal(intent.dateRange.start, "2026-05-25");
  assert.equal(intent.dateRange.end, "2026-05-27");
  assert.equal(intent.dateGrain, "week");
  assert.deepEqual(intent.dimensions, ["creative", "week"]);
  assert.deepEqual(intent.filters, [
    { field: "campaign_umbrella", operator: "equals", value: "Book Appts US" },
  ]);
  assert.deepEqual(
    requests.map((request) => request.filters),
    [
      [{ field: "campaign_umbrella", operator: "equals", value: "Book Appts US" }],
      [{ field: "campaign_umbrella", operator: "equals", value: "Book Appts US" }],
      [{ field: "campaign_umbrella", operator: "equals", value: "Book Appts US" }],
    ],
  );
  assert.ok(result.visualCards.some((card) => card.type === "bar_chart"));
  const line = result.visualCards.find((card) => card.type === "line_chart");
  assert.ok(line && line.type === "line_chart");
  assert.equal(line.dimension, "week");
  assert.doesNotMatch(result.answer.summary, /No matching Meta Ads rows/);
});

test("full dashboard mode creates a durable dashboard packet snapshot", async () => {
  const result = await runAnalysisWorkbenchFactsPipeline({
    prompt: "Build a full dashboard for spend and primary KPI by campaign group for the last 7 days.",
    outputMode: "full_dashboard",
    latestSyncedInsightDate: "2026-05-24",
    executeAggregate: async (request) => {
      if (request.dimensions.includes("date")) {
        return [
          aggregateRow({ date: "2026-05-18", spend: 300, primary_results: 3, source_rows: 2 }),
          aggregateRow({ date: "2026-05-19", spend: 420, primary_results: 4, source_rows: 2 }),
        ];
      }

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
        : [aggregateRow({ spend: 3400, primary_results: 34, source_rows: 12 })];
    },
  });

  assert.equal(result.status, "completed");
  assert.ok(result.dashboardPacket);
  assert.equal(result.dashboardPacket.kind, "analysis_dashboard_packet");
  assert.equal(result.dashboardPacket.directAnswer.summary, result.answer.summary);
  assert.equal(result.dashboardPacket.primaryEvidenceTable?.type, "flat_table");
  assert.deepEqual(
    result.dashboardPacket.visualObjects.map((card) => card.id),
    result.visualCards.map((card) => card.id),
  );
  assert.ok(
    result.dashboardPacket.insightSummary.winners.some((insight) =>
      /Book Appts US/.test(insight.detail),
    ),
  );
  assert.ok(
    result.dashboardPacket.insightSummary.losers.some((insight) =>
      /Cash for Gold US/.test(insight.detail),
    ),
  );
  assert.ok(result.dashboardPacket.insightSummary.anomalies.length >= 1);
  assert.ok(result.dashboardPacket.nextActions.length >= 3);
  assert.ok(
    result.dashboardPacket.assumptions.some((assumption) =>
      /Relative date range/.test(assumption),
    ),
  );
  assert.ok(result.dashboardPacket.caveats.some((caveat) => /Primary KPI/.test(caveat)));
  assert.deepEqual(
    result.dashboardPacket.sourceNotes.map((note) =>
      typeof note === "object" && note && "id" in note ? note.id : null,
    ),
    ["S1", "S2", "S3", "S4", "S5"],
  );
});

test("visual planner builds pivot table cards for row-by-column comparisons", async () => {
  const requests: AnalysisWorkbenchPipelineAggregateRequest[] = [];
  const result = await runAnalysisWorkbenchFactsPipeline({
    prompt: "Make a pivot table of spend by campaign group by week for the last 14 days.",
    outputMode: "answer_visuals",
    latestSyncedInsightDate: "2026-05-24",
    executeAggregate: async (request) => {
      requests.push(request);
      if (request.dimensions.includes("date")) return [];
      if (request.dimensions.length) {
        return [
          aggregateRow({
            campaign_umbrella: "Book Appts US",
            week: "2026-W20",
            spend: 1200,
            source_rows: 3,
          }),
          aggregateRow({
            campaign_umbrella: "Book Appts US",
            week: "2026-W21",
            spend: 1300,
            source_rows: 4,
          }),
          aggregateRow({
            campaign_umbrella: "Cash for Gold US",
            week: "2026-W20",
            spend: 600,
            source_rows: 2,
          }),
        ];
      }

      return [aggregateRow({ spend: 3100, source_rows: 9 })];
    },
  });

  assert.equal(result.status, "completed");
  assert.deepEqual(requests[0]?.dimensions, ["week", "campaign_umbrella"]);
  const pivot = result.visualCards.find((card) => card.type === "pivot_table");
  assert.ok(pivot && pivot.type === "pivot_table");
  assert.equal(pivot.rowDimension, "campaign_umbrella");
  assert.equal(pivot.columnDimension, "week");
  assert.equal(pivot.metric, "spend");
  assert.deepEqual(
    pivot.columns.map((column) => column.label),
    ["2026-W20", "2026-W21"],
  );
  assert.equal(pivot.rows[0]?.rowLabel, "Book Appts US");
  const pivotTotal = pivot.rows[0]?.total;
  assert.equal(
    pivotTotal && typeof pivotTotal === "object" && "formattedValue" in pivotTotal
      ? pivotTotal.formattedValue
      : null,
    "$2,500",
  );
  assert.deepEqual(pivot.sourceNoteIds, ["S1", "S2", "S3", "S4"]);
  assert.ok(pivot.assumptions?.some((assumption) => /Relative date range/.test(assumption)));
});

test("visual planner builds scatter cards when two metrics and one entity grain exist", async () => {
  const result = await runAnalysisWorkbenchFactsPipeline({
    prompt: "Show a scatter chart of spend versus CPL by campaign group for the last 7 days.",
    outputMode: "answer_visuals",
    latestSyncedInsightDate: "2026-05-24",
    executeAggregate: async (request) => {
      if (request.dimensions.includes("date")) return [];
      if (request.dimensions.length) {
        return [
          aggregateRow({
            campaign_umbrella: "Book Appts US",
            spend: 2500,
            cpl: 20,
            source_rows: 8,
          }),
          aggregateRow({
            campaign_umbrella: "Cash for Gold US",
            spend: 900,
            cpl: 45,
            source_rows: 4,
          }),
        ];
      }

      return [aggregateRow({ spend: 3400, cpl: 25, source_rows: 12 })];
    },
  });

  assert.equal(result.status, "completed");
  const scatter = result.visualCards.find((card) => card.type === "scatter_chart");
  assert.ok(scatter && scatter.type === "scatter_chart");
  assert.equal(scatter.dimension, "campaign_umbrella");
  assert.equal(scatter.xMetric, "spend");
  assert.equal(scatter.yMetric, "cpl");
  assert.deepEqual(
    scatter.points.map((point) => [point.label, point.formattedX, point.formattedY]),
    [
      ["Book Appts US", "$2,500", "$20"],
      ["Cash for Gold US", "$900", "$45"],
    ],
  );
  assert.deepEqual(scatter.sourceNoteIds, ["S1", "S2", "S3", "S4"]);
});

test("incompatible scatter requests repair to compatible bar charts when obvious", async () => {
  const result = await runAnalysisWorkbenchFactsPipeline({
    prompt: "Show a scatter chart of spend by campaign group.",
    outputMode: "answer_visuals",
    latestSyncedInsightDate: "2026-05-24",
    executeAggregate: async (request) =>
      request.dimensions.length
        ? [
            aggregateRow({ campaign_umbrella: "Book Appts US", spend: 1000, source_rows: 3 }),
          ]
        : [aggregateRow({ spend: 1000, source_rows: 3 })],
  });

  assert.equal(result.status, "completed");
  assert.ok(result.visualCards.some((card) => card.type === "bar_chart"));
  assert.ok(!result.visualCards.some((card) => card.type === "scatter_chart"));
  assert.deepEqual(
    result.validation.assumptions.map((assumption) => assumption.code),
    ["relative_date_range", "repaired_visual_type"],
  );
});

test("follow-up prompts inherit visible date, filters, metrics, and grouping context", async () => {
  const requests: AnalysisWorkbenchPipelineAggregateRequest[] = [];
  const result = await runAnalysisWorkbenchFactsPipeline({
    prompt: "What changed?",
    outputMode: "answer_visuals",
    latestSyncedInsightDate: "2026-05-24",
    inheritedContext: {
      dateRange: {
        start: "2026-05-18",
        end: "2026-05-24",
        days: 7,
        label: "Last 7 days",
      },
      filters: [{ field: "campaign_umbrella", operator: "equals", value: "Book Appts US" }],
      metrics: ["spend", "primary_results"],
      dimensions: ["campaign_umbrella"],
      visual: null,
    },
    executeAggregate: async (request) => {
      requests.push(request);
      if (request.dimensions.includes("date")) {
        return [aggregateRow({ date: "2026-05-24", spend: 700, primary_results: 7, source_rows: 2 })];
      }

      return request.dimensions.length
        ? [
            aggregateRow({
              campaign_umbrella: "Book Appts US",
              spend: 2500,
              website_bookings: 25,
              primary_results: 25,
              ctr: 2.4,
              source_rows: 8,
            }),
          ]
        : [aggregateRow({ spend: 2500, website_bookings: 25, primary_results: 25, ctr: 2.4, source_rows: 8 })];
    },
  });

  assert.equal(result.status, "completed");
  assert.deepEqual(result.intent, {
    status: "ready",
    rawPrompt: "What changed?",
    outputMode: "answer_visuals",
    analysisShape: "performance_diagnosis",
    questionType: "diagnosis",
    metrics: ["website_bookings", "spend", "cpl", "ctr"],
    dimensions: ["campaign_umbrella"],
    filters: [{ field: "campaign_umbrella", operator: "equals", value: "Book Appts US" }],
    dateRange: {
      start: "2026-05-18",
      end: "2026-05-24",
      days: 7,
      label: "Last 7 days",
    },
    dateGrain: null,
    sort: { field: "website_bookings", direction: "desc" },
    limit: 20,
    visual: null,
  });
  assert.deepEqual(
    requests.map((request) => ({
      start: request.start,
      end: request.end,
      dimensions: request.dimensions,
      metrics: request.metrics,
      filters: request.filters,
    })),
    [
      {
        start: "2026-05-18",
        end: "2026-05-24",
        dimensions: ["campaign_umbrella"],
        metrics: ["website_bookings", "spend", "cpl", "ctr"],
        filters: [{ field: "campaign_umbrella", operator: "equals", value: "Book Appts US" }],
      },
      {
        start: "2026-05-18",
        end: "2026-05-24",
        dimensions: [],
        metrics: ["website_bookings", "spend", "cpl", "ctr"],
        filters: [{ field: "campaign_umbrella", operator: "equals", value: "Book Appts US" }],
      },
      {
        start: "2026-05-18",
        end: "2026-05-24",
        dimensions: ["date"],
        metrics: ["website_bookings", "spend", "cpl", "ctr"],
        filters: [{ field: "campaign_umbrella", operator: "equals", value: "Book Appts US" }],
      },
    ],
  );
  assert.match(result.answer.summary, /Book Appts US/);
});

test("controlled rerun edits override governed context and add source-note provenance", async () => {
  const requests: AnalysisWorkbenchPipelineAggregateRequest[] = [];
  const result = await runAnalysisWorkbenchFactsPipeline({
    prompt: "Show spend by campaign group for the last 7 days.",
    outputMode: "full_dashboard",
    latestSyncedInsightDate: "2026-05-24",
    controlledEdit: {
      dateRange: {
        start: "2026-05-01",
        end: "2026-05-24",
        days: 24,
        label: "2026-05-01 to 2026-05-24",
      },
      filters: [{ field: "brand", operator: "equals", value: "HP" }],
      metrics: ["cpl"],
      dimensions: ["campaign"],
      sort: { field: "cpl", direction: "asc" },
      limit: 3,
      visual: { type: "bar_chart", metrics: ["cpl"], dimensions: ["campaign"] },
      objectTitles: { bar_campaign_cpl: "Edited CPL by campaign" },
      insightVisibility: { winner_primary: { pinned: true } },
    },
    executeAggregate: async (request) => {
      requests.push(request);
      if (request.dimensions.includes("date")) return [];
      return request.dimensions.length
        ? [
            aggregateRow({
              campaign: "Campaign A",
              cpl: 20,
              source_rows: 3,
            }),
            aggregateRow({
              campaign: "Campaign B",
              cpl: 45,
              source_rows: 2,
            }),
          ]
        : [aggregateRow({ cpl: 25, source_rows: 5 })];
    },
  });

  assert.equal(result.status, "completed");
  assert.deepEqual(result.intent.metrics, ["cpl"]);
  assert.deepEqual(result.intent.dimensions, ["campaign"]);
  assert.deepEqual(result.intent.filters, [{ field: "brand", operator: "equals", value: "HP" }]);
  assert.deepEqual(result.intent.sort, { field: "cpl", direction: "asc" });
  assert.equal(result.intent.limit, 3);
  assert.deepEqual(
    requests.map((request) => ({
      start: request.start,
      end: request.end,
      dimensions: request.dimensions,
      metrics: request.metrics,
      filters: request.filters,
      sortField: request.sortField,
      sortDirection: request.sortDirection,
      limit: request.limit,
    })),
    [
      {
        start: "2026-05-01",
        end: "2026-05-24",
        dimensions: ["campaign"],
        metrics: ["cpl"],
        filters: [{ field: "brand", operator: "equals", value: "HP" }],
        sortField: "cpl",
        sortDirection: "asc",
        limit: 3,
      },
      {
        start: "2026-05-01",
        end: "2026-05-24",
        dimensions: [],
        metrics: ["cpl"],
        filters: [{ field: "brand", operator: "equals", value: "HP" }],
        sortField: "cpl",
        sortDirection: "asc",
        limit: 1,
      },
      {
        start: "2026-05-01",
        end: "2026-05-24",
        dimensions: ["date"],
        metrics: ["cpl"],
        filters: [{ field: "brand", operator: "equals", value: "HP" }],
        sortField: "date",
        sortDirection: "asc",
        limit: 24,
      },
    ],
  );
  assert.ok(result.sourceNotes.some((note) => note.label === "Controlled edits"));
  assert.equal(
    result.visualCards.find((card) => card.id === "bar_campaign_cpl")?.title,
    "Edited CPL by campaign",
  );
  assert.equal(result.dashboardPacket?.insightSummary.winners[0]?.pinned, true);
});

test("removed follow-up context chips are not applied to the next run", async () => {
  const requests: AnalysisWorkbenchPipelineAggregateRequest[] = [];
  const result = await runAnalysisWorkbenchFactsPipeline({
    prompt: "Show CPL instead.",
    outputMode: "answer_only",
    latestSyncedInsightDate: "2026-05-24",
    inheritedContext: {
      dateRange: {
        start: "2026-05-18",
        end: "2026-05-24",
        days: 7,
        label: "Last 7 days",
      },
      filters: [],
      metrics: [],
      dimensions: ["campaign_umbrella"],
      visual: null,
    },
    executeAggregate: async (request) => {
      requests.push(request);
      return request.dimensions.length
        ? [aggregateRow({ campaign_umbrella: "Book Appts US", cpl: 20, source_rows: 8 })]
        : [aggregateRow({ cpl: 20, source_rows: 8 })];
    },
  });

  assert.equal(result.status, "completed");
  assert.deepEqual(result.intent.metrics, ["cpl"]);
  assert.deepEqual(requests.map((request) => request.metrics), [["cpl"], ["cpl"]]);
});

test("impossible scatter requests block before aggregate queries run", async () => {
  let queryCount = 0;
  const result = await runAnalysisWorkbenchFactsPipeline({
    prompt: "Show a scatter chart of spend versus CPL by day.",
    outputMode: "answer_visuals",
    latestSyncedInsightDate: "2026-05-24",
    executeAggregate: async () => {
      queryCount += 1;
      return [];
    },
  });

  assert.equal(queryCount, 0);
  assert.equal(result.status, "failed");
  assert.equal(result.validation.blockers[0]?.code, "incompatible_chart");
  assert.match(result.validation.blockers[0]?.suggestedRequest || "", /by campaign group/i);
});

test("answer-only mode keeps visual objects out of the saved run", async () => {
  const result = await runAnalysisWorkbenchFactsPipeline({
    prompt: "Show spend by campaign group.",
    outputMode: "answer_only",
    latestSyncedInsightDate: "2026-05-24",
    executeAggregate: async (request) =>
      request.dimensions.length
        ? [aggregateRow({ campaign_umbrella: "Book Appts US", spend: 1000, source_rows: 3 })]
        : [aggregateRow({ spend: 1000, source_rows: 3 })],
  });

  assert.deepEqual(result.visualCards, []);
  assert.match(result.answer.summary, /Answer only mode/);
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

test("daily budget requests repair stale parser unsupported entries and do not fall back to monthly budget", async () => {
  let queryCount = 0;
  const result = await runAnalysisWorkbenchFactsPipeline({
    prompt: "What is the daily budget per campaign group currently?",
    outputMode: "answer_visuals",
    latestSyncedInsightDate: "2026-05-28",
    parseIntent: async () => ({
      source: "ai",
      model: "test-model",
      apiCost: {
        model: "test-model",
        inputTokens: 0,
        outputTokens: 0,
        totalTokens: 0,
        estimatedCostUsd: 0,
      },
      intent: {
        questionType: "leaderboard",
        metrics: ["monthly_budget"],
        dimensions: ["campaign_umbrella"],
        filters: [],
        dateIntent: {
          kind: "inherit_or_default",
          year: null,
          month: null,
          quarter: null,
          unit: null,
          count: null,
          start: null,
          end: null,
          grain: null,
        },
        comparison: { mode: "none" },
        visualIntent: null,
        sort: { field: "monthly_budget", direction: "desc" },
        limit: null,
        confidence: "high",
        assumptions: [],
        unsupported: [
          {
            code: "unsupported_daily_budget",
            message:
              "Daily budget is not available in Ask AI yet. Available budget metric is Monthly Budget.",
            suggestedRewrite: "Show monthly budget by campaign group.",
          },
        ],
      },
    }),
    executeAggregate: async () => {
      queryCount += 1;
      return [aggregateRow({ campaign_umbrella: "Book Appts US", daily_budget: 100, monthly_budget: 3100 })];
    },
  });

  assert.equal(queryCount, 3);
  assert.equal(result.status, "completed");
  assert.equal(result.queryPlan.status, "ready");
  assert.deepEqual(result.intent.metrics, ["daily_budget"]);
  assert.deepEqual(result.validation.blockers, []);
  assert.match(result.answer.summary, /daily budget/i);
  assert.match(result.answer.summary, /\$100/);
  assert.doesNotMatch(result.answer.summary, /\$3,100/);
});

test("AI parser unsupported entries block even when metrics are governed", async () => {
  let queryCount = 0;
  const result = await runAnalysisWorkbenchFactsPipeline({
    prompt: "Show budget pacing by campaign group.",
    outputMode: "answer_only",
    latestSyncedInsightDate: "2026-05-28",
    parseIntent: async () => ({
      source: "ai",
      model: "test-model",
      apiCost: {
        model: "test-model",
        inputTokens: 0,
        outputTokens: 0,
        totalTokens: 0,
        estimatedCostUsd: 0,
      },
      intent: {
        questionType: "leaderboard",
        metrics: ["spend"],
        dimensions: ["campaign_umbrella"],
        filters: [],
        dateIntent: {
          kind: "inherit_or_default",
          year: null,
          month: null,
          quarter: null,
          unit: null,
          count: null,
          start: null,
          end: null,
          grain: null,
        },
        comparison: { mode: "none" },
        visualIntent: null,
        sort: { field: "spend", direction: "desc" },
        limit: null,
        confidence: "medium",
        assumptions: [],
        unsupported: [
          {
            code: "unsupported_budget_pacing",
            message: "Budget pacing is not governed by the Meta Ads semantic catalog yet.",
            suggestedRewrite: "Show spend and monthly budget by campaign group.",
          },
        ],
      },
    }),
    executeAggregate: async () => {
      queryCount += 1;
      return [];
    },
  });

  assert.equal(queryCount, 0);
  assert.equal(result.status, "failed");
  assert.deepEqual(
    result.validation.blockers.map((blocker) => blocker.code),
    ["unsupported_budget_pacing"],
  );
  assert.match(result.answer.summary, /Show spend and monthly budget by campaign group/);
});

test("monthly budget prompts still run through the aggregate RPC", async () => {
  const requests: AnalysisWorkbenchPipelineAggregateRequest[] = [];
  const result = await runAnalysisWorkbenchFactsPipeline({
    prompt: "Show monthly budget by campaign group.",
    outputMode: "answer_only",
    latestSyncedInsightDate: "2026-05-28",
    executeAggregate: async (request) => {
      requests.push(request);
      return request.dimensions.length
        ? [
            aggregateRow({
              campaign_umbrella: "Book Appts US",
              monthly_budget: 3100,
              source_rows: 10,
            }),
          ]
        : [aggregateRow({ monthly_budget: 3100, source_rows: 10 })];
    },
  });

  assert.equal(result.status, "completed");
  assert.equal(result.queryPlan.status, "ready");
  assert.ok(requests.length > 0);
  assert.ok(requests.every((request) => request.metrics.includes("monthly_budget")));
  assert.match(result.answer.summary, /\$3,100/);
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
  assert.deepEqual(
    validateAnalysisWorkbenchNarrativeGrounding(
      "Top creative was 1505461404539090 at 1 [F2].",
      [
        ...citations,
        {
          id: "F2",
          kind: "fact",
          label: "Top creative",
          value: 1,
          formattedValue: "1",
          entityName: "1505461404539090",
        },
      ],
    ),
    [],
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
    daily_budget: 0,
    monthly_budget: 0,
    lifetime_budget: 0,
    budget_remaining: 0,
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
