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
  assert.match(markup, /aria-checked="true"/);
  assert.match(markup, /Text answer with cited numbers, assumptions, and no charts/);
  assert.match(markup, /Text answer plus key chart and table cards for quick understanding/);
  assert.match(markup, /Saved packet with editable charts, pivot tables, exports, and source notes/);
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

test("analysis workbench composer renders inherited context as removable chips", () => {
  const { AnalysisWorkbenchClient } = loadModule("src/components/analysis-workbench-client.tsx");

  const markup = renderToStaticMarkup(
    React.createElement(AnalysisWorkbenchClient, {
      initialRuns: [
        {
          id: "run-1",
          status: "completed",
          prompt: "Show spend by campaign group for Book Appts US last week.",
          outputMode: "answer_visuals",
          title: "Show spend by campaign group",
          intent: {
            dateRange: {
              start: "2026-05-18",
              end: "2026-05-24",
              days: 7,
              label: "Last 7 days",
            },
            filters: [
              { field: "campaign_umbrella", operator: "equals", value: "Book Appts US" },
            ],
            metrics: ["spend"],
            dimensions: ["campaign_umbrella"],
            visual: null,
          },
          lineage: { parentRunId: null },
          answer: { summary: "Spend was $2,500 [F1].", citations: [] },
          sourceNotes: [],
          visualCards: [],
          facts: { status: "computed" },
          validation: { status: "ready" },
          dashboardPacket: null,
          createdAt: "2026-05-25T14:30:00.000Z",
          updatedAt: "2026-05-25T14:30:00.000Z",
        },
      ],
    }),
  );

  assert.match(markup, /Inherited Context/);
  assert.match(markup, /Last 7 days · 2026-05-18 to 2026-05-24/);
  assert.match(markup, /Campaign group = Book Appts US/);
  assert.match(markup, /Spend/);
  assert.match(markup, /Remove inherited context Metric Spend/);
});

test("run detail renders answer, source notes, and structured visual cards", () => {
  const { RunDetail } = loadModule("src/components/analysis-workbench-client.tsx");

  const markup = renderToStaticMarkup(
    React.createElement(RunDetail, {
      run: {
        id: "run-1",
        status: "completed",
        prompt: "Which groups moved?",
        outputMode: "answer_visuals",
        title: "Which groups moved?",
        answer: { summary: "Spend was $3,400 [F1].", citations: [] },
        facts: { status: "computed" },
        sourceNotes: [
          { id: "S1", label: "Data source", value: "Meta Ads daily insights" },
          { id: "S3", label: "Matched rows", value: "12 matching Meta Ads daily rows" },
        ],
        visualCards: [
          {
            id: "metric_spend",
            type: "metric_card",
            title: "Total Spend",
            metric: "spend",
            value: 3400,
            formattedValue: "$3,400",
            citationId: "F1",
            sourceNoteIds: ["S1", "S3"],
          },
          {
            id: "table_campaign_umbrella",
            type: "flat_table",
            title: "Campaign group evidence",
            columns: [
              { key: "entity", label: "Campaign group", kind: "dimension" },
              { key: "spend", label: "Spend", kind: "metric", metric: "spend" },
            ],
            rows: [
              {
                entity: "Book Appts US",
                spend: { value: 2500, formattedValue: "$2,500" },
              },
            ],
            sourceNoteIds: ["S1", "S3"],
          },
          {
            id: "bar_campaign_umbrella_spend",
            type: "bar_chart",
            title: "Spend by campaign group",
            metric: "spend",
            dimension: "campaign_umbrella",
            bars: [
              { label: "Book Appts US", value: 2500, formattedValue: "$2,500" },
              { label: "Cash for Gold US", value: 900, formattedValue: "$900" },
            ],
            sourceNoteIds: ["S1", "S3"],
          },
          {
            id: "line_date_spend",
            type: "line_chart",
            title: "Spend trend",
            metric: "spend",
            dimension: "date",
            points: [
              { label: "2026-05-18", value: 300, formattedValue: "$300" },
              { label: "2026-05-19", value: 420, formattedValue: "$420" },
            ],
            sourceNoteIds: ["S1", "S3"],
          },
          {
            id: "pivot_campaign_umbrella_week_spend",
            type: "pivot_table",
            title: "Spend by campaign group and week",
            rowDimension: "campaign_umbrella",
            columnDimension: "week",
            metric: "spend",
            columns: [
              { key: "2026-W20", label: "2026-W20" },
              { key: "2026-W21", label: "2026-W21" },
            ],
            rows: [
              {
                rowLabel: "Book Appts US",
                cells: {
                  "2026-W20": { value: 1200, formattedValue: "$1,200" },
                  "2026-W21": { value: 1300, formattedValue: "$1,300" },
                },
                total: { value: 2500, formattedValue: "$2,500" },
              },
            ],
            sourceNoteIds: ["S1", "S3"],
          },
          {
            id: "scatter_campaign_umbrella_spend_cpl",
            type: "scatter_chart",
            title: "Spend versus CPL by campaign group",
            dimension: "campaign_umbrella",
            xMetric: "spend",
            yMetric: "cpl",
            points: [
              {
                label: "Book Appts US",
                x: 2500,
                y: 20,
                formattedX: "$2,500",
                formattedY: "$20",
              },
              {
                label: "Cash for Gold US",
                x: 900,
                y: 45,
                formattedX: "$900",
                formattedY: "$45",
              },
            ],
            sourceNoteIds: ["S1", "S3"],
          },
        ],
        validation: { status: "ready" },
        lineage: { parentRunId: null },
        dashboardPacket: null,
        createdAt: "2026-05-25T14:30:00.000Z",
        updatedAt: "2026-05-25T14:30:00.000Z",
      },
    }),
  );

  assert.match(markup, /Answer/);
  assert.match(markup, /Spend was \$3,400/);
  assert.match(markup, /Source Notes/);
  assert.match(markup, /12 matching Meta Ads daily rows/);
  assert.match(markup, /Total Spend/);
  assert.match(markup, /\$3,400/);
  assert.match(markup, /Campaign group evidence/);
  assert.match(markup, /Book Appts US/);
  assert.match(markup, /Spend by campaign group/);
  assert.match(markup, /Cash for Gold US/);
  assert.match(markup, /Spend trend/);
  assert.match(markup, /2026-05-18/);
  assert.match(markup, /Pivot table/);
  assert.match(markup, /2026-W21/);
  assert.match(markup, /\$2,500/);
  assert.match(markup, /Scatter chart/);
  assert.match(markup, /Spend versus CPL by campaign group/);
  assert.match(markup, /\$900 \/ \$45/);
});

test("workbench status and visual regions render loading, empty, and error states", () => {
  const { EmptyRunDetail, StatusNotice, VisualCardGrid } = loadModule(
    "src/components/analysis-workbench-client.tsx",
  );

  const loadingMarkup = renderToStaticMarkup(
    React.createElement(StatusNotice, { loading: true, status: "", kind: "idle" }),
  );
  assert.match(loadingMarkup, /Creating governed run/);

  const errorMarkup = renderToStaticMarkup(
    React.createElement(StatusNotice, { loading: false, status: "Run failed.", kind: "error" }),
  );
  assert.match(errorMarkup, /role="alert"/);
  assert.match(errorMarkup, /Run failed/);

  const noRunMarkup = renderToStaticMarkup(React.createElement(EmptyRunDetail));
  assert.match(noRunMarkup, /No run selected/);

  const noVisualMarkup = renderToStaticMarkup(
    React.createElement(VisualCardGrid, { cards: [], runStatus: "completed" }),
  );
  assert.match(noVisualMarkup, /No visual cards saved for this run/);
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
          buildAnalysisContextChips(context: {
            dateRange?: { start: string; end: string; label: string };
            filters?: Array<{ field: string; value: string }>;
            metrics?: string[];
            dimensions?: string[];
          } | null) {
            if (!context) return [];
            return [
              ...(context.dateRange
                ? [
                    {
                      id: "dateRange",
                      label: "Date",
                      value: `${context.dateRange.label} · ${context.dateRange.start} to ${context.dateRange.end}`,
                    },
                  ]
                : []),
              ...(context.filters || []).map((filter) => ({
                id: `filter:${filter.field}:${filter.value}`,
                label: "Filter",
                value: "Campaign group = Book Appts US",
              })),
              ...(context.metrics || []).map((metric) => ({
                id: `metric:${metric}`,
                label: "Metric",
                value: metric === "spend" ? "Spend" : metric,
              })),
              ...(context.dimensions || []).map((dimension) => ({
                id: `dimension:${dimension}`,
                label: "Grouping",
                value: dimension === "campaign_umbrella" ? "Campaign group" : dimension,
              })),
            ];
          },
          normalizeAnalysisOutputMode(value: unknown) {
            if (value === "answer_only" || value === "full_dashboard") return value;
            return "answer_visuals";
          },
          resolveAnalysisRunContext(run: { intent?: unknown }) {
            return run.intent || null;
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
