import assert from "node:assert/strict";
import test from "node:test";

import { runAnalysisWorkbenchAnswer } from "../src/lib/analysis-workbench-engine.ts";
import type {
  AnalysisWorkbenchPipelineAggregateRequest,
  AnalysisWorkbenchPipelineResult,
} from "../src/lib/analysis-workbench-pipeline.ts";
import type { WorkbenchAgentResult } from "../src/lib/analysis-workbench-agent.ts";
import type {
  QueryEntitiesParams,
  QueryEntitiesResult,
  QueryPerformanceParams,
  QueryPerformanceResult,
  RawEntityRow,
} from "../src/lib/analysis-workbench-query-tools.ts";
import type { MetaInsightAggregateRow } from "../src/lib/meta-insight-aggregates.ts";

function agentResult(overrides: Partial<WorkbenchAgentResult> = {}): WorkbenchAgentResult {
  return {
    answer: "US Product spent $1,200.",
    visuals: [],
    ledger: [
      {
        id: "Q1",
        tool: "query_performance",
        params: {},
        summary: "spend by campaign_umbrella: 1 row.",
        rowCount: 1,
        rows: [{ campaign_umbrella: "Facebook US Product", spend: 1200 }],
      },
    ],
    requests: [],
    cost: { model: "gpt-5.4", inputTokens: 10, outputTokens: 5, totalTokens: 15, estimatedCostUsd: 0.0001 },
    model: "gpt-5.4",
    stopReason: "submitted",
    toolCallCount: 1,
    ...overrides,
  };
}

const NEVER_CALLED = "this engine branch must not run for this case";

function baseInput() {
  return {
    prompt: "How much did US Product spend?",
    outputMode: "answer_visuals" as const,
    latestSyncedInsightDate: "2026-05-24",
    executeAggregate: async (_request: AnalysisWorkbenchPipelineAggregateRequest) =>
      [] as MetaInsightAggregateRow[],
    loadEntityDisplays: async () => [],
  };
}

test("uses the agent engine when enabled and an API key is present", async () => {
  let agentCalls = 0;
  const result = await runAnalysisWorkbenchAnswer({
    ...baseInput(),
    agentEnabled: true,
    openAiApiKey: "sk-test",
    createCompletion: () => async () => {
      throw new Error(NEVER_CALLED);
    },
    fetchEntities: async () => [] as RawEntityRow[],
    runAgent: async () => {
      agentCalls += 1;
      return agentResult();
    },
    runDeterministic: async () => {
      throw new Error(NEVER_CALLED);
    },
  });

  assert.equal(agentCalls, 1);
  assert.equal(result.status, "completed");
  assert.equal((result.intent as { engine?: string }).engine, "agent");
  assert.match(result.answer.summary, /\$1,200/);
});

test("falls back to the deterministic pipeline when the agent flag is off", async () => {
  const sentinel = { status: "completed" } as AnalysisWorkbenchPipelineResult;
  const result = await runAnalysisWorkbenchAnswer({
    ...baseInput(),
    agentEnabled: false,
    openAiApiKey: "sk-test",
    runAgent: async () => {
      throw new Error(NEVER_CALLED);
    },
    runDeterministic: async () => sentinel,
  });

  assert.equal(result, sentinel);
});

test("falls back to the deterministic pipeline when no API key is present", async () => {
  const sentinel = { status: "completed" } as AnalysisWorkbenchPipelineResult;
  const result = await runAnalysisWorkbenchAnswer({
    ...baseInput(),
    agentEnabled: true,
    openAiApiKey: null,
    runAgent: async () => {
      throw new Error(NEVER_CALLED);
    },
    runDeterministic: async () => sentinel,
  });

  assert.equal(result, sentinel);
});

test("forwards inheritedContext and controlledEdit to the deterministic pipeline", async () => {
  let captured: { inheritedContext?: unknown; controlledEdit?: unknown } | null = null;
  const sentinel = { status: "completed" } as AnalysisWorkbenchPipelineResult;
  await runAnalysisWorkbenchAnswer({
    ...baseInput(),
    agentEnabled: false,
    openAiApiKey: null,
    inheritedContext: { marker: "ctx" } as never,
    controlledEdit: { marker: "edit" } as never,
    runDeterministic: async (pipelineInput) => {
      captured = {
        inheritedContext: pipelineInput.inheritedContext,
        controlledEdit: pipelineInput.controlledEdit,
      };
      return sentinel;
    },
  });

  assert.deepEqual(captured, {
    inheritedContext: { marker: "ctx" },
    controlledEdit: { marker: "edit" },
  });
});

test("agent engine wires the read-only query tools to the injected data access", async () => {
  const perfRow: MetaInsightAggregateRow = {
    campaign_umbrella: "Facebook US Product",
    spend: 1200,
  } as unknown as MetaInsightAggregateRow;
  const rawAd: RawEntityRow = {
    entityType: "ad",
    id: "us-1",
    name: "US Evergreen",
    status: "ACTIVE",
    effectiveStatus: "ACTIVE",
    campaignName: "Master Product US Evergreen",
    adSetName: null,
    brandCode: "HP",
    dailyBudget: null,
    lifetimeBudget: null,
    thumbnailUrl: null,
  };

  const captured: { perf?: QueryPerformanceResult; entities?: QueryEntitiesResult } = {};

  await runAnalysisWorkbenchAnswer({
    ...baseInput(),
    agentEnabled: true,
    openAiApiKey: "sk-test",
    createCompletion: () => async () => {
      throw new Error(NEVER_CALLED);
    },
    executeAggregate: async () => [perfRow],
    fetchEntities: async () => [rawAd],
    runAgent: async (agentInput) => {
      captured.perf = await agentInput.executePerformance({
        start: "2026-05-01",
        end: "2026-05-07",
        metrics: ["spend"],
      } as QueryPerformanceParams);
      captured.entities = await agentInput.executeEntities({ entityType: "ad" } as QueryEntitiesParams);
      return agentResult();
    },
    runDeterministic: async () => {
      throw new Error(NEVER_CALLED);
    },
  });

  assert.ok(captured.perf);
  assert.equal(captured.perf.rowCount, 1);
  assert.equal(captured.perf.rows[0].spend, 1200);
  assert.ok(captured.entities);
  assert.equal(captured.entities.rowCount, 1);
  assert.equal(captured.entities.rows[0].status, "live");
  assert.equal(captured.entities.rows[0].campaignUmbrella, "Facebook US Product");
});
