import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import test from "node:test";
import { runInNewContext } from "node:vm";

import * as ts from "typescript";

const require = createRequire(import.meta.url);
const React = require("react");
const { renderToStaticMarkup } = require("react-dom/server");

test("analysis workbench shell defaults to Answer + visuals and avoids legacy Ask/Build buttons", () => {
  const { AnalysisWorkbenchClient } = loadModule("src/components/analysis-workbench-client.tsx");

  const markup = renderToStaticMarkup(
    React.createElement(AnalysisWorkbenchClient, {
      initialRuns: [],
    }),
  );

  assert.match(markup, /Ask AI Workbench/);
  assert.match(markup, /Answer \+ visuals/);
  assert.match(markup, /Run analysis/);
  assert.match(markup, /No runs yet/);
  assert.doesNotMatch(markup, />Ask</);
  assert.doesNotMatch(markup, /Build analysis/);
  assert.doesNotMatch(markup, /Saved Dashboards/);
});

test("analysis workbench shell lists recent runs for reopen", () => {
  const { AnalysisWorkbenchClient } = loadModule("src/components/analysis-workbench-client.tsx");

  const markup = renderToStaticMarkup(
    React.createElement(AnalysisWorkbenchClient, {
      initialRuns: [
        {
          id: "run-1",
          status: "created",
          prompt: "Which groups moved?",
          outputMode: "answer_visuals",
          title: "Which groups moved?",
          answer: { summary: "Run created.", citations: [] },
          sourceNotes: [],
          visualCards: [],
          createdAt: "2026-05-25T14:30:00.000Z",
          updatedAt: "2026-05-25T14:30:00.000Z",
        },
      ],
    }),
  );

  assert.match(markup, /Recent Runs/);
  assert.match(markup, /Which groups moved/);
  assert.match(markup, /Answer \+ visuals/);
});

function loadModule(filePath: string) {
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
          normalizeAnalysisOutputMode(value: unknown) {
            if (value === "answer_only" || value === "full_dashboard") return value;
            return "answer_visuals";
          },
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
