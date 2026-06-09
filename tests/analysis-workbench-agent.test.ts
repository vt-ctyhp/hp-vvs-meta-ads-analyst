import assert from "node:assert/strict";
import test from "node:test";

import {
  WORKBENCH_AGENT_COST_CEILING_USD,
  analysisWorkbenchAgentEnabled,
  buildWorkbenchAgentSystemPrompt,
  normalizeOpenAIChatResponse,
  runWorkbenchAgent,
  toOpenAIChatRequest,
  type AgentCompletion,
  type AgentCompletionResponse,
} from "../src/lib/analysis-workbench-agent.ts";
import type {
  QueryEntitiesParams,
  QueryEntitiesResult,
  QueryPerformanceParams,
  QueryPerformanceResult,
} from "../src/lib/analysis-workbench-query-tools.ts";
import type { AnalysisWorkbenchPipelineAggregateRequest } from "../src/lib/analysis-workbench-pipeline.ts";

/** A completion stub that replays a queued list of scripted responses. */
function scriptedCompletion(responses: AgentCompletionResponse[]): AgentCompletion {
  let index = 0;
  return async () => {
    if (index >= responses.length) {
      throw new Error(`scriptedCompletion exhausted after ${responses.length} responses`);
    }
    return responses[index++];
  };
}

function toolCallResponse(
  name: string,
  args: unknown,
  usage = { inputTokens: 100, outputTokens: 50 },
): AgentCompletionResponse {
  return {
    model: "gpt-5.4",
    usage,
    message: {
      content: null,
      toolCalls: [{ id: `call_${name}_${Math.random().toString(36).slice(2, 6)}`, name, arguments: JSON.stringify(args) }],
    },
  };
}

const PERF_RESULT: QueryPerformanceResult = {
  rows: [
    { campaign_umbrella: "Facebook US Product", spend: 1200, messaging_contacts: 30 },
    { campaign_umbrella: "Facebook VN Product", spend: 800, messaging_contacts: 18 },
  ],
  rowCount: 2,
  metrics: ["spend", "messaging_contacts"],
  dimensions: ["campaign_umbrella"],
  request: {
    start: "2026-05-01",
    end: "2026-05-07",
    dimensions: ["campaign_umbrella"],
    metrics: ["spend", "messaging_contacts"],
    filters: [],
    sortField: "spend",
    sortDirection: "desc",
    limit: 50,
  } as AnalysisWorkbenchPipelineAggregateRequest,
  summary: "query_performance spend, messaging_contacts by campaign_umbrella: 2 rows.",
};

const ENTITIES_RESULT: QueryEntitiesResult = {
  rows: [
    {
      entityType: "ad",
      id: "us1",
      name: "US Evergreen",
      status: "live",
      statusRaw: "ACTIVE",
      campaignUmbrella: "Facebook US Product",
      brand: "HP",
      dailyBudget: null,
      lifetimeBudget: null,
      thumbnailUrl: null,
      campaignName: "Master Product US Evergreen",
      adSetName: null,
    },
  ],
  rowCount: 1,
  totalBeforeLimit: 1,
  appliedLimit: 500,
  statusBreakdown: { live: 1, paused: 0, off: 0 },
  summary: "query_entities ad: 1 matched (1 live, 0 paused, 0 off).",
};

function deps(overrides: Partial<Parameters<typeof runWorkbenchAgent>[0]> = {}) {
  const perfCalls: QueryPerformanceParams[] = [];
  const entityCalls: QueryEntitiesParams[] = [];
  return {
    perfCalls,
    entityCalls,
    input: {
      prompt: "test prompt",
      outputMode: "answer_visuals" as const,
      latestSyncedInsightDate: "2026-05-07",
      completion: scriptedCompletion([]),
      executePerformance: async (params: QueryPerformanceParams) => {
        perfCalls.push(params);
        return PERF_RESULT;
      },
      executeEntities: async (params: QueryEntitiesParams) => {
        entityCalls.push(params);
        return ENTITIES_RESULT;
      },
      ...overrides,
    },
  };
}

// ----- Unit 4: system prompt -----

test("system prompt carries the schema, grounding rules, tools, and a mode breadth hint", () => {
  const prompt = buildWorkbenchAgentSystemPrompt("full_dashboard");
  assert.match(prompt, /query_performance/);
  assert.match(prompt, /query_entities/);
  assert.match(prompt, /submit_answer/);
  assert.match(prompt, /aggregate_meta_daily_insights/);
  // grounding rule
  assert.match(prompt, /tool result|query result|do not (invent|fabricate)/i);
  // visual selection is the model's choice
  assert.match(prompt, /visual/i);
  // mode breadth hint reflects the requested mode
  assert.match(prompt, /dashboard/i);
});

// ----- Unit 5: agent loop -----

test("agent runs a tool then submits, recording the evidence ledger and aggregate request", async () => {
  const harness = deps({
    completion: scriptedCompletion([
      toolCallResponse("query_performance", {
        start: "2026-05-01",
        end: "2026-05-07",
        metrics: ["spend", "messaging_contacts"],
        dimensions: ["campaign_umbrella"],
      }),
      toolCallResponse("submit_answer", {
        answer: "US Product spent $1,200; VN Product $800.",
        visuals: [{ type: "bar_chart", title: "Spend by group", sourceCallId: "Q1", metric: "spend", dimension: "campaign_umbrella" }],
      }),
    ]),
  });

  const result = await runWorkbenchAgent(harness.input);

  assert.equal(result.stopReason, "submitted");
  assert.match(result.answer, /\$1,200/);
  assert.equal(result.ledger.length, 1);
  assert.equal(result.ledger[0].tool, "query_performance");
  assert.equal(result.ledger[0].id, "Q1");
  assert.equal(result.requests.length, 1);
  assert.equal(result.visuals.length, 1);
  assert.equal(harness.perfCalls.length, 1);
  // the model's args reach the executor
  assert.deepEqual(harness.perfCalls[0].metrics, ["spend", "messaging_contacts"]);
  assert.ok(result.cost.estimatedCostUsd >= 0);
});

test("agent forwards a tool error back to the model and recovers", async () => {
  let calls = 0;
  const harness = deps({
    executePerformance: async () => {
      calls += 1;
      throw new Error("Metric \"revenue\" is not available.");
    },
    completion: scriptedCompletion([
      toolCallResponse("query_performance", { start: "2026-05-01", end: "2026-05-07", metrics: ["revenue"] }),
      toolCallResponse("submit_answer", { answer: "I could not find revenue; it is not tracked.", visuals: [] }),
    ]),
  });

  const result = await runWorkbenchAgent(harness.input);
  assert.equal(calls, 1);
  assert.equal(result.stopReason, "submitted");
  assert.match(result.answer, /revenue/i);
  // the failed call is not recorded as evidence
  assert.equal(result.ledger.length, 0);
});

test("agent stops at the $0.05 cost ceiling and still returns an answer", async () => {
  // Each completion bills ~0.075 USD (5000 output tokens at gpt-5.4 rate), exceeding the ceiling after one call.
  const expensive = { inputTokens: 100, outputTokens: 5000 };
  const harness = deps({
    completion: scriptedCompletion([
      toolCallResponse("query_entities", { entityType: "ad" }, expensive),
      toolCallResponse("query_entities", { entityType: "campaign" }, expensive),
      toolCallResponse("query_entities", { entityType: "ad_set" }, expensive),
    ]),
  });

  const result = await runWorkbenchAgent(harness.input);
  assert.equal(result.stopReason, "cost_ceiling");
  assert.ok(result.cost.estimatedCostUsd >= WORKBENCH_AGENT_COST_CEILING_USD * 0.5);
  assert.ok(result.answer.trim().length > 0);
  assert.ok(result.ledger.length >= 1);
});

test("agent forces a submit after the max tool-call budget is exhausted", async () => {
  const harness = deps({
    maxToolCalls: 2,
    completion: scriptedCompletion([
      toolCallResponse("query_entities", { entityType: "ad" }),
      toolCallResponse("query_entities", { entityType: "campaign" }),
      // third response is produced under a forced submit_answer tool choice
      toolCallResponse("submit_answer", { answer: "Roster summarized.", visuals: [] }),
    ]),
  });

  const result = await runWorkbenchAgent(harness.input);
  assert.equal(result.stopReason, "max_tool_calls");
  assert.equal(result.ledger.length, 2);
  assert.match(result.answer, /Roster/);
});

// ----- rollout flag -----

test("the agent path is enabled by default and can be killed with an env switch", () => {
  const original = process.env.ANALYSIS_WORKBENCH_AGENT;
  try {
    delete process.env.ANALYSIS_WORKBENCH_AGENT;
    assert.equal(analysisWorkbenchAgentEnabled(), true);

    process.env.ANALYSIS_WORKBENCH_AGENT = "off";
    assert.equal(analysisWorkbenchAgentEnabled(), false);

    process.env.ANALYSIS_WORKBENCH_AGENT = "true";
    assert.equal(analysisWorkbenchAgentEnabled(), true);
  } finally {
    if (original === undefined) delete process.env.ANALYSIS_WORKBENCH_AGENT;
    else process.env.ANALYSIS_WORKBENCH_AGENT = original;
  }
});

// ----- OpenAI transport translation -----

test("toOpenAIChatRequest maps tools, tool messages, and a forced tool choice", () => {
  const mapped = toOpenAIChatRequest({
    model: "gpt-5.4",
    messages: [
      { role: "system", content: "sys" },
      { role: "assistant", content: null, toolCalls: [{ id: "c1", name: "query_entities", arguments: "{}" }] },
      { role: "tool", toolCallId: "c1", content: "{\"rowCount\":1}" },
    ],
    tools: [{ name: "query_entities", description: "d", parameters: { type: "object" } }],
    toolChoice: { name: "submit_answer" },
  });

  assert.deepEqual(mapped.tool_choice, { type: "function", function: { name: "submit_answer" } });
  const messages = mapped.messages as Array<Record<string, unknown>>;
  assert.equal((messages[1].tool_calls as unknown[]).length, 1);
  assert.equal(messages[2].role, "tool");
  assert.equal(messages[2].tool_call_id, "c1");
  assert.equal((mapped.tools as Array<{ type: string }>)[0].type, "function");
});

test("normalizeOpenAIChatResponse extracts content, tool calls, and usage", () => {
  const normalized = normalizeOpenAIChatResponse({
    model: "gpt-5.4-2026",
    usage: { prompt_tokens: 120, completion_tokens: 40 },
    choices: [
      {
        message: {
          content: null,
          tool_calls: [{ id: "c9", type: "function", function: { name: "query_performance", arguments: "{\"metrics\":[\"spend\"]}" } }],
        },
      },
    ],
  });

  assert.equal(normalized.model, "gpt-5.4-2026");
  assert.equal(normalized.usage.inputTokens, 120);
  assert.equal(normalized.usage.outputTokens, 40);
  assert.equal(normalized.message.toolCalls?.[0].name, "query_performance");
});
