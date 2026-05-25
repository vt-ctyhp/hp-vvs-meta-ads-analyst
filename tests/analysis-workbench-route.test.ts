import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import test from "node:test";
import { runInNewContext } from "node:vm";

import * as ts from "typescript";

const require = createRequire(import.meta.url);

test("analysis-runs POST creates a workbench run behind the AI analysis permission", async () => {
  const calls: Array<{ name: string; args: unknown[] }> = [];
  const route = loadRoute(calls);

  const response = await route.POST(
    jsonRequest("http://localhost/api/analysis-runs", {
      prompt: "Show spend by group",
      outputMode: "answer_only",
    }),
  );

  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), {
    run: { id: "run-1", prompt: "Show spend by group", outputMode: "answer_only" },
  });
  assert.deepEqual(serializable(calls), [
    { name: "requirePermissionFromRequest", args: ["view_ai_analysis"] },
    {
      name: "createAnalysisWorkbenchRun",
      args: [{ prompt: "Show spend by group", outputMode: "answer_only" }],
    },
  ]);
});

test("analysis-runs POST rejects an empty prompt before repository work", async () => {
  const calls: Array<{ name: string; args: unknown[] }> = [];
  const route = loadRoute(calls);

  const response = await route.POST(
    jsonRequest("http://localhost/api/analysis-runs", { prompt: "   " }),
  );

  assert.equal(response.status, 400);
  assert.deepEqual(await response.json(), { error: "Prompt is required" });
  assert.deepEqual(calls, [
    { name: "requirePermissionFromRequest", args: ["view_ai_analysis"] },
  ]);
});

test("analysis-runs GET lists recent runs or reopens one saved run", async () => {
  const calls: Array<{ name: string; args: unknown[] }> = [];
  const route = loadRoute(calls);

  const listResponse = await route.GET(new Request("http://localhost/api/analysis-runs"));
  assert.deepEqual(await listResponse.json(), {
    runs: [{ id: "run-1", prompt: "Recent", outputMode: "answer_visuals" }],
  });

  const reopenResponse = await route.GET(
    new Request("http://localhost/api/analysis-runs?runId=run-7"),
  );
  assert.deepEqual(await reopenResponse.json(), {
    run: { id: "run-7", prompt: "Saved", outputMode: "full_dashboard" },
  });

  assert.deepEqual(calls, [
    { name: "requirePermissionFromRequest", args: ["view_ai_analysis"] },
    { name: "listAnalysisWorkbenchRuns", args: [] },
    { name: "requirePermissionFromRequest", args: ["view_ai_analysis"] },
    { name: "getAnalysisWorkbenchRun", args: ["run-7"] },
  ]);
});

function loadRoute(calls: Array<{ name: string; args: unknown[] }>) {
  return loadModule("src/app/api/analysis-runs/route.ts", {
    "@/lib/analysis-workbench-contract": {
      normalizeAnalysisOutputMode(value: unknown) {
        if (value === "answer_only" || value === "full_dashboard") return value;
        return "answer_visuals";
      },
    },
    "@/lib/analysis-workbench-runs": {
      async createAnalysisWorkbenchRun(...args: unknown[]) {
        calls.push({ name: "createAnalysisWorkbenchRun", args });
        return { id: "run-1", prompt: "Show spend by group", outputMode: "answer_only" };
      },
      async getAnalysisWorkbenchRun(...args: unknown[]) {
        calls.push({ name: "getAnalysisWorkbenchRun", args });
        return { id: args[0], prompt: "Saved", outputMode: "full_dashboard" };
      },
      async listAnalysisWorkbenchRuns(...args: unknown[]) {
        calls.push({ name: "listAnalysisWorkbenchRuns", args });
        return [{ id: "run-1", prompt: "Recent", outputMode: "answer_visuals" }];
      },
    },
    "@/lib/app-auth": {
      async requirePermissionFromRequest(_request: Request, permission: string) {
        calls.push({ name: "requirePermissionFromRequest", args: [permission] });
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
  }) as {
    GET(request: Request): Promise<Response>;
    POST(request: Request): Promise<Response>;
  };
}

function jsonRequest(url: string, body: unknown) {
  return new Request(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

function serializable(value: unknown) {
  return JSON.parse(JSON.stringify(value));
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
    URL,
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
