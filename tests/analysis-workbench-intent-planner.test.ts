import assert from "node:assert/strict";
import test from "node:test";

import {
  analysisWorkbenchIntentResponseFormat,
  parseAnalysisWorkbenchIntentWithAI,
  parseAnalysisWorkbenchPlannerOutput,
  type PlannerCreateCompletion,
} from "../src/lib/analysis-workbench-intent-planner.ts";

test("AI intent parser maps messy weekly full-year phrasing into governed intent", async () => {
  const calls: Parameters<PlannerCreateCompletion>[0][] = [];
  const result = await parseAnalysisWorkbenchIntentWithAI({
    prompt: "week by week ad spend for the entire of 2026",
    latestSyncedInsightDate: "2026-05-25",
    createCompletion: async (request) => {
      calls.push(request);
      return {
        model: request.model,
        usage: { prompt_tokens: 1200, completion_tokens: 220 },
        choices: [{ message: { content: JSON.stringify(weekly2026Intent()) } }],
      };
    },
  });

  assert.equal(result.source, "ai");
  assert.equal(result.intent?.questionType, "trend");
  assert.deepEqual(result.intent?.metrics, ["spend"]);
  assert.deepEqual(result.intent?.dimensions, ["week"]);
  assert.deepEqual(result.intent?.dateIntent, {
    kind: "calendar_year",
    year: 2026,
    month: null,
    quarter: null,
    unit: null,
    count: null,
    start: null,
    end: null,
    grain: "week",
  });
  assert.deepEqual(result.intent?.sort, { field: "week", direction: "asc" });
  assert.equal(result.apiCost.inputTokens, 1200);
  assert.equal(result.apiCost.outputTokens, 220);

  assert.equal(
    analysisWorkbenchIntentResponseFormat.json_schema.schema.additionalProperties,
    false,
  );
  assert.ok(calls[0]?.messages.some((message) => /entire of 2026/.test(message.content)));
  assert.ok(!calls[0]?.messages.some((message) => /source_rows|rawRows|aggregateRows/.test(message.content)));
});

test("planner output parser rejects schema drift and extra keys", () => {
  assert.equal(
    parseAnalysisWorkbenchPlannerOutput({ ...weekly2026Intent(), sql: "select * from ads" }),
    null,
  );
  assert.equal(
    parseAnalysisWorkbenchPlannerOutput({
      ...weekly2026Intent(),
      dateIntent: { ...weekly2026Intent().dateIntent, extra: "bad" },
    }),
    null,
  );
});

test("AI parser carries unsupported requests without inventing ungoverned metrics", async () => {
  const result = await parseAnalysisWorkbenchIntentWithAI({
    prompt: "show ROAS by campaign",
    latestSyncedInsightDate: "2026-05-25",
    createCompletion: async (request) => ({
      model: request.model,
      usage: { prompt_tokens: 900, completion_tokens: 180 },
      choices: [
        {
          message: {
            content: JSON.stringify({
              ...weekly2026Intent(),
              questionType: "leaderboard",
              metrics: ["spend"],
              dimensions: ["campaign"],
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
              sort: { field: "spend", direction: "desc" },
              visualIntent: null,
              unsupported: [
                {
                  code: "unsupported_roas",
                  message: "ROAS is not governed because revenue is outside the Meta Ads catalog.",
                  suggestedRewrite: "Show spend and primary results by campaign.",
                },
              ],
            }),
          },
        },
      ],
    }),
  });

  assert.equal(result.source, "ai");
  assert.deepEqual(result.intent?.metrics, ["spend"]);
  assert.deepEqual(result.intent?.unsupported.map((item) => item.code), ["unsupported_roas"]);
});

test("AI parser falls back when disabled, missing, or malformed", async () => {
  const previousFlag = process.env.ANALYSIS_WORKBENCH_AI_PARSER;
  const previousNodeEnv = process.env.NODE_ENV;
  delete process.env.ANALYSIS_WORKBENCH_AI_PARSER;
  Reflect.set(process.env, "NODE_ENV", "development");
  try {
    const disabled = await parseAnalysisWorkbenchIntentWithAI({
      prompt: "show spend by week",
    });
    assert.equal(disabled.source, "fallback");
    assert.equal(disabled.fallbackReason, "ai_parser_disabled");
  } finally {
    if (previousNodeEnv === undefined) {
      Reflect.deleteProperty(process.env, "NODE_ENV");
    } else {
      Reflect.set(process.env, "NODE_ENV", previousNodeEnv);
    }
    if (previousFlag === undefined) {
      delete process.env.ANALYSIS_WORKBENCH_AI_PARSER;
    } else {
      process.env.ANALYSIS_WORKBENCH_AI_PARSER = previousFlag;
    }
  }

  const malformed = await parseAnalysisWorkbenchIntentWithAI({
    prompt: "show spend by week",
    createCompletion: async (request) => ({
      model: request.model,
      choices: [{ message: { content: JSON.stringify({ nope: true }) } }],
    }),
  });
  assert.equal(malformed.source, "fallback");
  assert.equal(malformed.fallbackReason, "malformed_model_output");
});

function weekly2026Intent() {
  return {
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
  };
}
