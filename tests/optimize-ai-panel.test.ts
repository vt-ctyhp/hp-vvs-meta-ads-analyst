import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import test from "node:test";
import { runInNewContext } from "node:vm";

import * as ts from "typescript";

const require = createRequire(import.meta.url);
const React = require("react");
const { renderToStaticMarkup } = require("react-dom/server");

test("Optimize AI panel renders one copilot surface without reports or legacy analysis", () => {
  const { OptimizeAiPanel } = loadModule("src/components/v2/optimize/ai-panel.tsx", {
    "@/components/analysis-client": {
      AnalysisOutput: function AnalysisOutput() {
        return React.createElement("section", null, "Analysis output");
      },
    },
    "@/lib/glossary": {
      translateError(error: unknown) {
        return error instanceof Error ? error.message : "Something went wrong.";
      },
    },
  });

  const markup = renderToStaticMarkup(
    React.createElement(OptimizeAiPanel, {
      initialSaved: [
        {
          id: "dashboard-1",
          title: "Saved dashboard",
          prompt: "Show spend",
          mode: "fast",
          createdAt: "2026-05-01T00:00:00.000Z",
          updatedAt: "2026-05-02T00:00:00.000Z",
        },
      ],
      canUseAdHocAnalysis: true,
      dateRange: { days: 30, startDate: null, endDate: null },
    }),
  );

  assert.match(markup, /Decision copilot/);
  assert.match(markup, />Ask</);
  assert.match(markup, /Build analysis/);
  assert.match(markup, /Selected data range:.*Last 30 days/);
  assert.doesNotMatch(markup, /Generate report/);
  assert.doesNotMatch(markup, /Ad-Hoc AI Analysis/);
  assert.doesNotMatch(markup, /Edit with GPT/);
});

test("Optimize AI saved analyses drawer is collapsed by default", () => {
  const { OptimizeAiPanel } = loadModule("src/components/v2/optimize/ai-panel.tsx", {
    "@/components/analysis-client": { AnalysisOutput: () => null },
    "@/lib/glossary": { translateError: () => "Something went wrong." },
  });

  const markup = renderToStaticMarkup(
    React.createElement(OptimizeAiPanel, {
      initialSaved: [],
      canUseAdHocAnalysis: true,
      dateRange: { days: 7, startDate: null, endDate: null },
    }),
  );
  const detailsTag = markup.match(/<details\b[^>]*>/)?.[0];

  assert.match(markup, /Saved analyses/);
  assert.ok(detailsTag);
  assert.doesNotMatch(detailsTag, /\sopen(?:[=>\s]|$)/);
});

test("Optimize AI chat formats markdown answers for readability", () => {
  const { FormattedChatContent } = loadModule("src/components/v2/optimize/ai-panel.tsx", {
    "@/components/analysis-client": { AnalysisOutput: () => null },
    "@/lib/glossary": { translateError: () => "Something went wrong." },
  });

  const markup = renderToStaticMarkup(
    React.createElement(FormattedChatContent, {
      content: [
        "For **Book Appts US**, prioritize cautious scale.",
        "",
        "### Scale candidates",
        "| Priority | Ad / Creative | Spend | Notes |",
        "|---|---|---:|---|",
        "| 1 | **Creative A** / Ad set: Testing \\| Broad \\| New | $570.93 | Best volume |",
        "| 2 | **Ad:** `DM_IG_HeyBeyArea | May 13` | $95.15 | Pipe inside code |",
        "",
        "- Watch fatigue",
      ].join("\n"),
    }),
  );

  assert.match(markup, /<strong[^>]*>Book Appts US<\/strong>/);
  assert.match(markup, /<h4[^>]*>Scale candidates<\/h4>/);
  assert.match(markup, /<table/);
  assert.match(markup, /Testing \| Broad \| New/);
  assert.match(markup, /<code[^>]*>DM_IG_HeyBeyArea \| May 13<\/code>/);
  assert.match(markup, /<li[^>]*>Watch fatigue<\/li>/);
  assert.doesNotMatch(markup, /\| Priority \|/);
});

test("analysis output shows API cost even when diagnostics are hidden", () => {
  const { AnalysisOutput } = loadModule("src/components/analysis-client.tsx", {
    "@/lib/glossary": {
      translateError(error: unknown) {
        return error instanceof Error ? error.message : "Something went wrong.";
      },
    },
  });

  const markup = renderToStaticMarkup(
    React.createElement(AnalysisOutput, {
      result: minimalAnalysisResult(),
      hideDiagnostics: true,
    }),
  );

  assert.match(markup, /Est\. API cost/);
  assert.match(markup, /\$0\.01235/);
  assert.match(markup, /2,500 tokens/);
  assert.doesNotMatch(markup, /Analyst Debug/);
  assert.doesNotMatch(markup, /Plan Model/);
});

test("analysis POST applies Optimize defaults only to new dashboard builds", async () => {
  const calls: Array<{ name: string; args: unknown[] }> = [];
  const route = loadAnalysisRoute(calls);

  const savedResponse = await route.POST(
    jsonRequest({
      dashboardId: "dashboard-1",
      defaultDateRange: { days: 14 },
    }),
  );
  assert.deepEqual(await savedResponse.json(), { kind: "saved", dashboardId: "dashboard-1" });
  assert.deepEqual(calls.at(-1), { name: "runSavedAdHocAnalysis", args: ["dashboard-1"] });

  const createResponse = await route.POST(
    jsonRequest({
      prompt: "Show spend by campaign umbrella.",
      mode: "deep",
      defaultDateRange: { days: 14 },
    }),
  );
  assert.deepEqual(await createResponse.json(), { kind: "created" });
  assert.deepEqual(serializable(calls.at(-1)), {
    name: "createAdHocAnalysis",
    args: [
      {
        prompt: "Show spend by campaign umbrella.",
        mode: "deep",
        defaultDateRange: { days: 14 },
      },
    ],
  });
});

test("chat POST forwards selected analysis mode", async () => {
  const calls: Array<{ name: string; args: unknown[] }> = [];
  const route = loadChatRoute(calls);

  const response = await route.POST(
    jsonRequest({
      sessionId: "session-1",
      message: "Which ad creative should I scale?",
      mode: "deep",
      days: 30,
    }),
  );

  assert.deepEqual(await response.json(), { kind: "chat" });
  assert.deepEqual(serializable(calls.at(-1)), {
    name: "answerExecutiveChat",
    args: [
      {
        sessionId: "session-1",
        message: "Which ad creative should I scale?",
        mode: "deep",
        days: 30,
      },
    ],
  });
});

function serializable(value: unknown) {
  return JSON.parse(JSON.stringify(value));
}

function loadAnalysisRoute(calls: Array<{ name: string; args: unknown[] }>) {
  return loadModule("src/app/api/analysis/route.ts", {
    "@/lib/ad-hoc-analytics": {
      async createAdHocAnalysis(...args: unknown[]) {
        calls.push({ name: "createAdHocAnalysis", args });
        return { kind: "created" };
      },
      async deleteSavedAnalysisDashboard(...args: unknown[]) {
        calls.push({ name: "deleteSavedAnalysisDashboard", args });
        return { kind: "deleted" };
      },
      async editAdHocAnalysis(...args: unknown[]) {
        calls.push({ name: "editAdHocAnalysis", args });
        return { kind: "edited" };
      },
      async fetchSavedAnalysisDashboards(...args: unknown[]) {
        calls.push({ name: "fetchSavedAnalysisDashboards", args });
        return [];
      },
      async renameSavedAnalysisDashboard(...args: unknown[]) {
        calls.push({ name: "renameSavedAnalysisDashboard", args });
        return { kind: "renamed" };
      },
      async runSavedAdHocAnalysis(...args: unknown[]) {
        calls.push({ name: "runSavedAdHocAnalysis", args });
        return { kind: "saved", dashboardId: args[0] };
      },
    },
    "@/lib/app-auth": {
      async requirePermissionFromRequest() {
        return {};
      },
    },
    "@/lib/http": {
      jsonError(error: unknown) {
        return Response.json(
          { error: error instanceof Error ? error.message : "Unexpected error" },
          { status: 500 },
        );
      },
    },
  }) as { POST(request: Request): Promise<Response> };
}

function loadChatRoute(calls: Array<{ name: string; args: unknown[] }>) {
  return loadModule("src/app/api/chat/route.ts", {
    "@/lib/ai": {
      async answerExecutiveChat(...args: unknown[]) {
        calls.push({ name: "answerExecutiveChat", args });
        return { kind: "chat" };
      },
    },
    "@/lib/app-auth": {
      async requirePermissionFromRequest() {
        return {};
      },
    },
    "@/lib/http": {
      jsonError(error: unknown) {
        return Response.json(
          { error: error instanceof Error ? error.message : "Unexpected error" },
          { status: 500 },
        );
      },
    },
  }) as { POST(request: Request): Promise<Response> };
}

function jsonRequest(body: unknown) {
  return new Request("http://localhost/api/analysis", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

function minimalAnalysisResult() {
  const spec = {
    title: "API Cost Check",
    dateRange: { preset: "last_30_days" },
    grain: "summary",
    dimensions: ["campaign_umbrella"],
    filters: [],
    metrics: ["spend"],
    sort: null,
    limit: 10,
    tableLayout: null,
    widgets: [],
  };

  return {
    status: "ready",
    validationStatus: "ready",
    dashboardId: "dashboard-1",
    prompt: "Show spend",
    mode: "deep",
    title: "API Cost Check",
    answer: "Built.",
    spec,
    resolvedSpec: spec,
    table: { columns: [], rows: [] },
    totals: {},
    widgets: [],
    sourceTransparency: {
      timeRange: { start: "2026-04-23", end: "2026-05-22", days: 30 },
      adAccountsAnalyzed: [],
      recordCounts: {},
    },
    analystDebug: {
      validationStatus: "ready",
      dataSource: "meta_ads",
      sourceTable: "meta_daily_insights",
      sourceFunction: null,
      resolvedDateRange: { start: "2026-04-23", end: "2026-05-22", days: 30 },
      latestSyncedInsightDate: "2026-05-22",
      filters: [],
      metrics: ["spend"],
      dimensions: ["campaign_umbrella"],
      assumptions: [],
      warnings: [],
      unsupportedReasons: [],
      recordCounts: {},
      repairedSpec: false,
    },
    warnings: [],
    unsupportedReasons: [],
    clarificationQuestions: [],
    modelUsed: { plan: "gpt-5.4", analysis: "gpt-5.5" },
    tokenEstimate: {
      planInputTokens: 1000,
      planOutputTokens: 500,
      analysisInputTokens: 700,
      analysisOutputTokens: 300,
      estimatedCostUsd: 0.01235,
    },
  };
}

function loadModule(filePath: string, stubs: Record<string, unknown>) {
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
    Request,
    Response,
    clearTimeout,
    console,
    exports: commonJsModule.exports,
    module: commonJsModule,
    process,
    require(id: string) {
      if (Object.hasOwn(stubs, id)) return stubs[id];
      if (id.startsWith("@/")) throw new Error(`Unstubbed module import: ${id}`);
      return require(id);
    },
    setTimeout,
  });

  return commonJsModule.exports;
}
