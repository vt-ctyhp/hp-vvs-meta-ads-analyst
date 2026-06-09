import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import test from "node:test";
import { runInNewContext } from "node:vm";

import * as ts from "typescript";

import {
  ANALYSIS_WORKBENCH_AGENT_QA_CASES,
  ANALYSIS_WORKBENCH_QA_CASES,
  evaluateAnalysisWorkbenchAgentQaCase,
  evaluateAnalysisWorkbenchQaCase,
  formatAnalysisWorkbenchQaReport,
} from "../src/lib/analysis-workbench-qa-gate.ts";
import { runAnalysisWorkbenchFactsPipeline } from "../src/lib/analysis-workbench-pipeline.ts";
import type {
  AnalysisWorkbenchPipelineAggregateRequest,
  AnalysisWorkbenchPipelineResult,
} from "../src/lib/analysis-workbench-pipeline.ts";
import type { AnalysisWorkbenchRun } from "../src/lib/analysis-workbench-contract.ts";
import type {
  MetaInsightAggregateRow,
  MetaInsightDimension,
  MetaInsightFilter,
} from "../src/lib/meta-insight-aggregates.ts";
import {
  runWorkbenchAgent,
  type AgentCompletion,
  type AgentCompletionResponse,
} from "../src/lib/analysis-workbench-agent.ts";
import {
  queryEntities,
  queryPerformance,
  type RawEntityRow,
} from "../src/lib/analysis-workbench-query-tools.ts";
import { mapWorkbenchAgentResultToPipelineResult } from "../src/lib/analysis-workbench-agent-mapper.ts";
import * as answerFormatModule from "../src/lib/analysis-workbench-answer-format.ts";

const require = createRequire(import.meta.url);
const React = require("react");
const { renderToStaticMarkup } = require("react-dom/server");

test("analysis workbench no-slop QA gate passes persona suite against API pipeline and page surface", async () => {
  const { RunDetail } = loadClientModule("src/components/analysis-workbench-client.tsx");
  const evaluations = [];

  for (const qaCase of ANALYSIS_WORKBENCH_QA_CASES) {
    const result = await runAnalysisWorkbenchFactsPipeline({
      prompt: qaCase.prompt,
      outputMode: qaCase.mode,
      latestSyncedInsightDate: "2026-05-24",
      executeAggregate: fixtureAggregateMetaInsights,
    });
    const markup = renderToStaticMarkup(
      React.createElement(RunDetail, {
        run: runFromResult(`qa-${qaCase.id}`, qaCase.prompt, qaCase.mode, result),
      }),
    );

    evaluations.push(
      evaluateAnalysisWorkbenchQaCase(qaCase, result, {
        renderedPageText: stripMarkup(markup),
      }),
    );
  }

  const report = formatAnalysisWorkbenchQaReport(evaluations, {
    filesChanged: ["tests/analysis-workbench-qa-gate.test.ts"],
    commands: ["npm run qa:analysis-workbench", "npm run test", "npm run typecheck"],
  });
  assert.equal(evaluations.every((evaluation) => evaluation.passed), true, report);
});

function runFromResult(
  id: string,
  prompt: string,
  outputMode: AnalysisWorkbenchRun["outputMode"],
  result: AnalysisWorkbenchPipelineResult,
): AnalysisWorkbenchRun {
  return {
    id,
    status: result.status,
    prompt,
    outputMode,
    title: result.title,
    intent: result.intent as unknown as AnalysisWorkbenchRun["intent"],
    queryPlan: result.queryPlan as unknown as AnalysisWorkbenchRun["queryPlan"],
    facts: result.facts as unknown as AnalysisWorkbenchRun["facts"],
    visualCards: result.visualCards,
    sourceNotes: result.sourceNotes as unknown as AnalysisWorkbenchRun["sourceNotes"],
    validation: result.validation as unknown as AnalysisWorkbenchRun["validation"],
    lineage: { parentRunId: null },
    answer: result.answer,
    dashboardPacket: result.dashboardPacket,
    createdAt: "2026-05-25T14:30:00.000Z",
    updatedAt: "2026-05-25T14:30:00.000Z",
  };
}

async function fixtureAggregateMetaInsights(request: AnalysisWorkbenchPipelineAggregateRequest) {
  const filtered = fixtureRows().filter((row) => matchesFilters(row, request.filters));
  const rows = groupRows(filtered, request.dimensions);
  const sorted = rows.sort((a, b) => {
    const left = sortableValue(a, request.sortField);
    const right = sortableValue(b, request.sortField);
    return request.sortDirection === "asc" ? left - right : right - left;
  });

  return sorted.slice(0, request.limit);
}

function matchesFilters(row: MetaInsightAggregateRow, filters: MetaInsightFilter[]) {
  return filters.every((filter) => {
    const value = String(rowValue(row, filter.field) || "").toLowerCase();
    const expected = filter.value.toLowerCase();
    return filter.operator === "equals" ? value === expected : value.includes(expected);
  });
}

function groupRows(rows: MetaInsightAggregateRow[], dimensions: MetaInsightDimension[]) {
  if (!dimensions.length) return [sumRows(rows, [])];

  const groups = new Map<string, MetaInsightAggregateRow[]>();
  rows.forEach((row) => {
    const key = dimensions.map((dimension) => row[dimension] || "").join("\0");
    groups.set(key, [...(groups.get(key) || []), row]);
  });

  return Array.from(groups.values()).map((group) => sumRows(group, dimensions));
}

function sumRows(rows: MetaInsightAggregateRow[], dimensions: MetaInsightDimension[]) {
  const first = rows[0] || aggregateRow();
  const summed = rows.reduce(
    (total, row) => ({
      spend: total.spend + row.spend,
      daily_budget: total.daily_budget + row.daily_budget,
      monthly_budget: total.monthly_budget + row.monthly_budget,
      lifetime_budget: total.lifetime_budget + row.lifetime_budget,
      budget_remaining: total.budget_remaining + row.budget_remaining,
      impressions: total.impressions + row.impressions,
      reach: total.reach + row.reach,
      clicks: total.clicks + row.clicks,
      leads: total.leads + row.leads,
      bookings: total.bookings + row.bookings,
      conversions: total.conversions + row.conversions,
      website_bookings: total.website_bookings + row.website_bookings,
      messaging_contacts: total.messaging_contacts + row.messaging_contacts,
      new_messaging_contacts: total.new_messaging_contacts + row.new_messaging_contacts,
      primary_results: total.primary_results + row.primary_results,
      secondary_results: total.secondary_results + row.secondary_results,
      source_rows: total.source_rows + row.source_rows,
    }),
    {
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
      source_rows: 0,
    },
  );
  const row = aggregateRow({
    ...Object.fromEntries(dimensions.map((dimension) => [dimension, first[dimension]])),
    ...summed,
  });

  return {
    ...row,
    ctr: summed.impressions ? (summed.clicks / summed.impressions) * 100 : 0,
    cpm: summed.impressions ? (summed.spend / summed.impressions) * 1000 : 0,
    cpc: summed.clicks ? summed.spend / summed.clicks : 0,
    cpl: summed.leads ? summed.spend / summed.leads : null,
    frequency: summed.reach ? summed.impressions / summed.reach : 0,
  };
}

function sortableValue(
  row: MetaInsightAggregateRow,
  key: AnalysisWorkbenchPipelineAggregateRequest["sortField"],
) {
  const value = rowValue(row, key);
  if (typeof value === "number") return value;
  if (typeof value === "string") return value.charCodeAt(0);
  return 0;
}

function rowValue(row: MetaInsightAggregateRow, key: string) {
  if (key === "search") {
    return [row.campaign_umbrella, row.campaign, row.ad_set, row.ad, row.creative]
      .filter(Boolean)
      .join(" ");
  }

  return (row as unknown as Record<string, unknown>)[key];
}

function fixtureRows(): MetaInsightAggregateRow[] {
  return [
    aggregateRow({
      date: "2026-05-03",
      week: "2026-W18",
      month: "2026-05",
      brand: "HP",
      campaign_umbrella: "Book Appts US",
      campaign: "Book Appts US - Prospecting",
      creative: "Consultation Offer A",
      creative_id: "creative-book-a",
      spend: 2600,
      monthly_budget: 12000,
      impressions: 52000,
      reach: 43000,
      clicks: 1300,
      bookings: 96,
      website_bookings: 96,
      messaging_contacts: 42,
      primary_results: 96,
      source_rows: 8,
    }),
    aggregateRow({
      date: "2026-05-10",
      week: "2026-W19",
      month: "2026-05",
      brand: "HP",
      campaign_umbrella: "Book Appts US",
      campaign: "Book Appts US - Prospecting",
      creative: "Consultation Offer B",
      creative_id: "creative-book-b",
      spend: 2100,
      monthly_budget: 12000,
      impressions: 47000,
      reach: 39000,
      clicks: 1180,
      bookings: 82,
      website_bookings: 82,
      messaging_contacts: 37,
      primary_results: 82,
      source_rows: 7,
    }),
    aggregateRow({
      date: "2026-05-10",
      week: "2026-W19",
      month: "2026-05",
      brand: "HP",
      campaign_umbrella: "Cash for Gold US",
      campaign: "Cash for Gold US - Local",
      creative: "Gold Story A",
      creative_id: "creative-gold-a",
      spend: 1800,
      monthly_budget: 9000,
      impressions: 60000,
      reach: 47000,
      clicks: 1500,
      messaging_contacts: 240,
      primary_results: 240,
      source_rows: 7,
    }),
    aggregateRow({
      date: "2026-05-17",
      week: "2026-W20",
      month: "2026-05",
      brand: "HP",
      campaign_umbrella: "Cash for Gold US",
      campaign: "Cash for Gold US - Retargeting",
      creative: "Offer Test B",
      creative_id: "creative-gold-b",
      spend: 900,
      monthly_budget: 9000,
      impressions: 28000,
      reach: 22000,
      clicks: 560,
      messaging_contacts: 72,
      primary_results: 72,
      source_rows: 5,
    }),
    aggregateRow({
      date: "2026-05-24",
      week: "2026-W21",
      month: "2026-05",
      brand: "VVS",
      campaign_umbrella: "Facebook US Product",
      campaign: "Facebook US Product - Catalog",
      creative: "Diamond Stack C",
      creative_id: "creative-product-c",
      spend: 1300,
      monthly_budget: 7000,
      impressions: 40000,
      reach: 31000,
      clicks: 720,
      messaging_contacts: 110,
      primary_results: 110,
      source_rows: 6,
    }),
  ];
}

function aggregateRow(overrides: Partial<MetaInsightAggregateRow> = {}): MetaInsightAggregateRow {
  const row = {
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

  return {
    ...row,
    ctr: row.impressions ? (row.clicks / row.impressions) * 100 : row.ctr,
    cpm: row.impressions ? (row.spend / row.impressions) * 1000 : row.cpm,
    cpc: row.clicks ? row.spend / row.clicks : row.cpc,
    cpl: row.leads ? row.spend / row.leads : row.cpl,
    frequency: row.reach ? row.impressions / row.reach : row.frequency,
  };
}

function stripMarkup(markup: string) {
  return markup.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");
}

// ---------------------------------------------------------------------------
// Agent path QA gate — grounded, agentic answers (Phase 4)
// ---------------------------------------------------------------------------

test("agent QA gate: grounded agentic answers pass the persona/free-form/dashboard suite", async () => {
  const { RunDetail } = loadClientModule("src/components/analysis-workbench-client.tsx");
  const evaluations = [];

  for (const qaCase of ANALYSIS_WORKBENCH_AGENT_QA_CASES) {
    const agentRun = await runWorkbenchAgent({
      prompt: qaCase.prompt,
      outputMode: qaCase.mode,
      latestSyncedInsightDate: "2026-05-24",
      completion: agentScriptCompletion(qaCase.script),
      executePerformance: (params) =>
        queryPerformance(params, { executeAggregate: fixtureAggregateMetaInsights }),
      executeEntities: (params) => queryEntities(params, { fetchEntities: fixtureFetchEntities }),
    });
    const result = mapWorkbenchAgentResultToPipelineResult({
      prompt: qaCase.prompt,
      outputMode: qaCase.mode,
      agentResult: agentRun,
    });

    // The distilled answer view still renders for AI-composed output.
    const markup = renderToStaticMarkup(
      React.createElement(RunDetail, {
        run: runFromResult(`agent-${qaCase.id}`, qaCase.prompt, qaCase.mode, result),
      }),
    );
    assert.ok(stripMarkup(markup).trim().length > 0, `${qaCase.id} rendered empty markup`);

    evaluations.push(
      evaluateAnalysisWorkbenchAgentQaCase(qaCase, result, {
        ledger: agentRun.ledger,
        renderedPageText: stripMarkup(markup),
      }),
    );
  }

  const report = formatAnalysisWorkbenchQaReport(evaluations);
  assert.equal(
    evaluations.every((evaluation) => evaluation.passed),
    true,
    report,
  );
});

test("agent QA gate: the US/VN Product status prompt yields a grounded roster, not a zero chart", async () => {
  const statusCase = ANALYSIS_WORKBENCH_AGENT_QA_CASES.find(
    (qaCase) => qaCase.id === "status-us-vn-product-active",
  );
  assert.ok(statusCase, "status case present in the agent eval set");

  const agentRun = await runWorkbenchAgent({
    prompt: statusCase!.prompt,
    outputMode: statusCase!.mode,
    latestSyncedInsightDate: "2026-05-24",
    completion: agentScriptCompletion(statusCase!.script),
    executePerformance: (params) =>
      queryPerformance(params, { executeAggregate: fixtureAggregateMetaInsights }),
    executeEntities: (params) => queryEntities(params, { fetchEntities: fixtureFetchEntities }),
  });
  const result = mapWorkbenchAgentResultToPipelineResult({
    prompt: statusCase!.prompt,
    outputMode: statusCase!.mode,
    agentResult: agentRun,
  });

  // Sensible roster: live vs paused/off, grounded, and no forced zero chart.
  assert.match(result.answer.summary.toLowerCase(), /live/);
  assert.match(result.answer.summary.toLowerCase(), /paused|turned off/);
  assert.equal(result.visualCards.length, 0);
  assert.doesNotMatch(result.answer.summary, /\(unverified\)/);
  const grounding = (result.intent as { grounding?: { status?: string } }).grounding;
  assert.equal(grounding?.status, "grounded");
});

type AgentQaScript = (typeof ANALYSIS_WORKBENCH_AGENT_QA_CASES)[number]["script"];

let agentToolCallSeq = 0;

function agentScriptCompletion(script: AgentQaScript): AgentCompletion {
  const responses: AgentCompletionResponse[] = [
    ...script.calls.map((call) => agentToolCallResponse(call.name, call.args)),
    agentToolCallResponse("submit_answer", { answer: script.answer, visuals: script.visuals }),
  ];
  let index = 0;
  return async () => {
    if (index >= responses.length) {
      throw new Error(`agent script exhausted after ${responses.length} responses`);
    }
    return responses[index++];
  };
}

function agentToolCallResponse(name: string, args: unknown): AgentCompletionResponse {
  agentToolCallSeq += 1;
  return {
    model: "gpt-5.4",
    usage: { inputTokens: 80, outputTokens: 40 },
    message: {
      content: null,
      toolCalls: [{ id: `call_${name}_${agentToolCallSeq}`, name, arguments: JSON.stringify(args) }],
    },
  };
}

function fixtureFetchEntities(_input: { entityType: RawEntityRow["entityType"] }): Promise<RawEntityRow[]> {
  return Promise.resolve(fixtureEntityRows());
}

function fixtureEntityRows(): RawEntityRow[] {
  return [
    rawAd("us-1", "US Evergreen Carousel", "ACTIVE", "Master Product US Evergreen"),
    rawAd("us-2", "US Evergreen Single", "ACTIVE", "Master Product US Evergreen"),
    rawAd("us-3", "US Evergreen Story", "PAUSED", "Master Product US Evergreen"),
    rawAd("vn-1", "VN Evergreen Carousel", "ACTIVE", "Master Product VN Evergreen"),
    rawAd("vn-2", "VN Evergreen Single", "ARCHIVED", "Master Product VN Evergreen"),
    rawAd("vn-3", "VN Evergreen Story", "CAMPAIGN_PAUSED", "Master Product VN Evergreen"),
  ];
}

function rawAd(
  id: string,
  name: string,
  effectiveStatus: string,
  campaignName: string,
): RawEntityRow {
  return {
    entityType: "ad",
    id,
    name,
    status: effectiveStatus,
    effectiveStatus,
    campaignName,
    adSetName: null,
    brandCode: "HP",
    dailyBudget: null,
    lifetimeBudget: null,
    thumbnailUrl: null,
  };
}

function loadClientModule(filePath: string) {
  const output = ts.transpileModule(readFileSync(filePath, "utf8"), {
    compilerOptions: {
      esModuleInterop: true,
      jsx: ts.JsxEmit.ReactJSX,
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
    fileName: filePath,
  }).outputText;
  const commonJsModule = { exports: {} as Record<string, unknown> };

  runInNewContext(output, {
    console,
    exports: commonJsModule.exports,
    module: commonJsModule,
    process,
    require(id: string) {
      if (id === "react") return React;
      if (id === "@/lib/analysis-workbench-contract") {
        return {
          buildAnalysisContextChips() {
            return [];
          },
          normalizeAnalysisOutputMode(value: unknown) {
            if (value === "answer_only" || value === "full_dashboard") return value;
            return "answer_visuals";
          },
          resolveAnalysisRunContext() {
            return null;
          },
        };
      }
      if (id === "@/lib/analysis-workbench-answer-format") {
        return answerFormatModule;
      }
      if (id === "@/lib/analysis-workbench-export") {
        return {
          buildAnalysisWorkbenchChartPngExportSource() {
            return {
              fileName: "chart.png",
              mimeType: "image/png",
              svg: "<svg />",
              width: 960,
              height: 540,
            };
          },
          buildAnalysisWorkbenchPdfReportExport() {
            return { fileName: "packet.pdf", mimeType: "application/pdf", content: "%PDF-1.4" };
          },
          buildAnalysisWorkbenchTableCsvExport() {
            return { fileName: "table.csv", mimeType: "text/csv;charset=utf-8", content: "Table" };
          },
          isAnalysisWorkbenchChartCard(card: { type?: string }) {
            return (
              card.type === "bar_chart" ||
              card.type === "line_chart" ||
              card.type === "scatter_chart"
            );
          },
          isAnalysisWorkbenchTableCard(card: { type?: string }) {
            return card.type === "flat_table" || card.type === "pivot_table";
          },
        };
      }
      if (id === "@/lib/campaign-umbrellas") {
        return {
          CAMPAIGN_UMBRELLAS: [
            "Facebook US Product",
            "Book Appts US",
            "US Promotions (WKDS / OOAK)",
            "Cash for Gold US",
            "Facebook VN Product",
            "VN Promotions (WKDS / OOAK)",
            "Excluded / Non-umbrella",
            "Needs review",
          ],
        };
      }
      if (id === "@/lib/glossary") {
        return {
          translateError(error: unknown) {
            return error instanceof Error ? error.message : "Something went wrong.";
          },
        };
      }
      if (id === "lucide-react") {
        return new Proxy(
          {},
          {
            get(_target, prop) {
              return function Icon() {
                return React.createElement("svg", { "data-icon": String(prop) });
              };
            },
          },
        );
      }
      return require(id);
    },
  });

  return commonJsModule.exports;
}
