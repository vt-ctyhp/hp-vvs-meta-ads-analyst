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
  assert.equal(table.rows[0]?.entity, "Book Appts US");
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
        ? [aggregateRow({ campaign_umbrella: "Book Appts US", spend: 2500, primary_results: 25, source_rows: 8 })]
        : [aggregateRow({ spend: 2500, primary_results: 25, source_rows: 8 })];
    },
  });

  assert.equal(result.status, "completed");
  assert.deepEqual(result.intent, {
    status: "ready",
    rawPrompt: "What changed?",
    outputMode: "answer_visuals",
    metrics: ["spend", "primary_results"],
    dimensions: ["campaign_umbrella"],
    filters: [{ field: "campaign_umbrella", operator: "equals", value: "Book Appts US" }],
    dateRange: {
      start: "2026-05-18",
      end: "2026-05-24",
      days: 7,
      label: "Last 7 days",
    },
    sort: { field: "spend", direction: "desc" },
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
        metrics: ["spend", "primary_results"],
        filters: [{ field: "campaign_umbrella", operator: "equals", value: "Book Appts US" }],
      },
      {
        start: "2026-05-18",
        end: "2026-05-24",
        dimensions: [],
        metrics: ["spend", "primary_results"],
        filters: [{ field: "campaign_umbrella", operator: "equals", value: "Book Appts US" }],
      },
      {
        start: "2026-05-18",
        end: "2026-05-24",
        dimensions: ["date"],
        metrics: ["spend", "primary_results"],
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
