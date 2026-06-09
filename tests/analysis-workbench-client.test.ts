import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import test from "node:test";
import { runInNewContext } from "node:vm";

import * as ts from "typescript";

import * as answerFormatModule from "../src/lib/analysis-workbench-answer-format.ts";

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
  assert.doesNotMatch(markup, />Ask</);
  assert.doesNotMatch(markup, /Build analysis/);
  assert.doesNotMatch(markup, /Saved Dashboards/);
  assert.doesNotMatch(markup, /Recent Runs/);
});

test("analysis workbench shell auto-selects the latest run without a recent-runs rail", () => {
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

  // The recent-runs rail was removed; the latest run opens directly in the detail panel.
  assert.doesNotMatch(markup, /Recent Runs/);
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
        answer: {
          summary: "Spend was $3,400 [F1].",
          citations: [],
          apiCost: {
            model: "gpt-5.4",
            inputTokens: 1200,
            outputTokens: 300,
            totalTokens: 1500,
            estimatedCostUsd: 0.003,
          },
        },
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
  assert.match(markup, /Est\. API cost/);
  assert.match(markup, /\$0\.00300/);
  assert.match(markup, /gpt-5\.4 · 1,500 tokens/);
  assert.doesNotMatch(markup, /Run ID/);
  assert.match(markup, /Source Notes/);
  assert.match(markup, /12 matching Meta Ads daily rows/);
  assert.match(markup, /Total Spend/);
  assert.match(markup, /\$3,400/);
  assert.match(markup, /Campaign group evidence/);
  assert.match(markup, /Book Appts US/);
  assert.match(markup, /Spend by campaign group/);
  assert.match(markup, /Cash for Gold US/);
  assert.match(markup, /Export CSV/);
  assert.match(markup, /Export PNG/);
  assert.match(markup, /Spend trend/);
  assert.match(markup, /2026-05-18/);
  assert.match(markup, /Pivot table/);
  assert.match(markup, /2026-W21/);
  assert.match(markup, /\$2,500/);
  assert.match(markup, /Scatter chart/);
  assert.match(markup, /Spend versus CPL by campaign group/);
  assert.match(markup, /\$900 \/ \$45/);
});

test("run detail formats long answer summaries into readable sections", () => {
  const { RunDetail } = loadModule("src/components/analysis-workbench-client.tsx");

  const markup = renderToStaticMarkup(
    React.createElement(RunDetail, {
      run: {
        id: "run-1",
        status: "completed",
        prompt: "Which creative won?",
        outputMode: "answer_visuals",
        title: "Which creative won?",
        answer: {
          summary:
            "Answer + visuals mode used governed Meta Ads facts. Totals: 465 Primary KPI [F1]. Top creative was 842430645584684 at 115 [F2]. Assumption: relative range ends at latest synced Meta Ads day [S1]. Caveat: Primary KPI is group-specific [F1]. Source notes: Meta Ads daily insights [S1].",
          citations: [],
        },
        facts: { status: "computed" },
        sourceNotes: [{ id: "S1", label: "Data source", value: "Meta Ads daily insights" }],
        visualCards: [],
        validation: { status: "ready" },
        lineage: { parentRunId: null },
        dashboardPacket: null,
        createdAt: "2026-05-25T14:30:00.000Z",
        updatedAt: "2026-05-25T14:30:00.000Z",
      },
    }),
  );

  assert.match(markup, /Est\. API cost/);
  assert.match(markup, /No model call/);
  assert.match(markup, /Findings/);
  assert.match(markup, /<ol class=/);
  assert.match(markup, /Totals/);
  assert.match(markup, /Top creative was 842430645584684/);
  assert.match(markup, /Caveats/);
  assert.match(markup, /Primary KPI is group-specific/);
  // Source notes live in the collapsed details section, not inline in the answer.
  assert.match(markup, /Source Notes/);
  // The casual reader view drops the technical context preamble and inline citation chips.
  assert.doesNotMatch(markup, /Context/);
  assert.doesNotMatch(markup, /\[F1\]/);
  assert.doesNotMatch(markup, /\[S1\]/);
});

test("run detail exposes promotion and renders saved dashboard packet sections", () => {
  const { RunDetail } = loadModule("src/components/analysis-workbench-client.tsx");

  const promoteMarkup = renderToStaticMarkup(
    React.createElement(RunDetail, {
      run: {
        id: "run-1",
        status: "completed",
        prompt: "Which groups moved?",
        outputMode: "answer_visuals",
        title: "Which groups moved?",
        answer: { summary: "Spend was $3,400 [F1].", citations: [] },
        facts: { status: "computed" },
        sourceNotes: [],
        visualCards: [],
        validation: { status: "ready" },
        lineage: { parentRunId: null },
        dashboardPacket: null,
        createdAt: "2026-05-25T14:30:00.000Z",
        updatedAt: "2026-05-25T14:30:00.000Z",
      },
      onPromote: () => undefined,
      promoting: false,
    }),
  );

  assert.match(promoteMarkup, /Promote to dashboard/);

  const packetMarkup = renderToStaticMarkup(
    React.createElement(RunDetail, {
      run: {
        id: "run-2",
        status: "completed",
        prompt: "Build dashboard",
        outputMode: "full_dashboard",
        title: "Build dashboard",
        answer: { summary: "Dashboard saved [S1].", citations: [] },
        facts: { status: "computed" },
        sourceNotes: [{ id: "S1", label: "Data source", value: "Meta Ads daily insights" }],
        visualCards: [],
        validation: { status: "ready" },
        lineage: { parentRunId: null },
        dashboardPacket: {
          kind: "analysis_dashboard_packet",
          version: 1,
          generatedAt: "2026-05-25T14:35:00.000Z",
          promotedFromRunId: "run-1",
          directAnswer: { summary: "Dashboard saved [S1].", citations: [] },
          primaryEvidenceTable: {
            id: "table_campaign_umbrella",
            type: "flat_table",
            title: "Campaign group evidence",
            columns: [{ key: "entity", label: "Campaign group", kind: "dimension" }],
            rows: [{ entity: "Book Appts US" }],
            sourceNoteIds: ["S1"],
          },
          visualObjects: [],
          insightSummary: {
            winners: [
              {
                id: "winner_primary",
                title: "Winner",
                detail: "Book Appts US leads with $2,500 Spend.",
                sourceNoteIds: ["S1"],
              },
            ],
            losers: [
              {
                id: "loser_primary",
                title: "Loser",
                detail: "Cash for Gold US trails at $900 Spend.",
                sourceNoteIds: ["S1"],
              },
            ],
            anomalies: [
              {
                id: "anomaly_primary",
                title: "Anomaly",
                detail: "Book Appts US is $800 above average.",
                sourceNoteIds: ["S1"],
              },
            ],
          },
          nextActions: [
            {
              id: "action_winner",
              title: "Scale review",
              detail: "Inspect Book Appts US before changing budgets.",
              sourceNoteIds: ["S1"],
            },
          ],
          assumptions: ["Relative date range ends at latest synced day."],
          caveats: ["Primary KPI is group-specific and can blend proxy metrics across groups."],
          sourceNotes: [{ id: "S1", label: "Data source", value: "Meta Ads daily insights" }],
        },
        createdAt: "2026-05-25T14:30:00.000Z",
        updatedAt: "2026-05-25T14:35:00.000Z",
      },
    }),
  );

  assert.match(packetMarkup, /Dashboard Packet/);
  assert.match(packetMarkup, /Export PDF/);
  assert.match(packetMarkup, /Campaign group evidence/);
  assert.match(packetMarkup, /Winner/);
  assert.match(packetMarkup, /Cash for Gold US trails/);
  assert.match(packetMarkup, /Scale review/);
  assert.match(packetMarkup, /Primary KPI is group-specific/);
  assert.doesNotMatch(packetMarkup, /Promote to dashboard/);
});

test("run detail exposes rerun and controlled edit controls without SQL or formula fields", () => {
  const { RunDetail } = loadModule("src/components/analysis-workbench-client.tsx");

  const markup = renderToStaticMarkup(
    React.createElement(RunDetail, {
      run: {
        id: "run-1",
        status: "completed",
        prompt: "Show spend by campaign group.",
        outputMode: "full_dashboard",
        title: "Show spend by campaign group.",
        answer: { summary: "Spend was $3,400 [F1].", citations: [] },
        facts: { status: "computed" },
        sourceNotes: [],
        visualCards: [
          {
            id: "bar_campaign_umbrella_spend",
            type: "bar_chart",
            title: "Spend by campaign group",
            metric: "spend",
            dimension: "campaign_umbrella",
            bars: [{ label: "Book Appts US", value: 2500, formattedValue: "$2,500" }],
            sourceNoteIds: ["S1"],
          },
        ],
        validation: { status: "ready" },
        lineage: { parentRunId: null },
        dashboardPacket: null,
        createdAt: "2026-05-25T14:30:00.000Z",
        updatedAt: "2026-05-25T14:30:00.000Z",
      },
      onRerun: () => undefined,
      onApplyEdits: () => undefined,
      rerunning: false,
    }),
  );

  assert.match(markup, /Rerun latest data/);
  assert.match(markup, /Controlled Edits/);
  assert.match(markup, /Date range/);
  assert.match(markup, /<option value="brand">Brand<\/option>/);
  assert.match(markup, /<option value="delivery_status">Delivery Status<\/option>/);
  assert.match(markup, /<option value="Book Appts US">Book Appts US<\/option>/);
  assert.match(markup, /Metric/);
  assert.match(markup, /Chart type/);
  assert.match(markup, /Apply edits/);
  assert.doesNotMatch(markup, /placeholder="Book Appts US"/);
  assert.doesNotMatch(markup, /SQL/i);
  assert.doesNotMatch(markup, /formula/i);
});

test("controlled edit filter value dropdown uses governed brand and delivery options", () => {
  const { RunDetail } = loadModule("src/components/analysis-workbench-client.tsx");

  function renderFilterMarkup(filter: { field: string; value: string }) {
    return renderToStaticMarkup(
      React.createElement(RunDetail, {
        run: {
          id: `run-${filter.field}`,
          status: "completed",
          prompt: "Show spend.",
          outputMode: "full_dashboard",
          title: "Show spend.",
          intent: {
            filters: [filter],
            metrics: ["spend"],
            dimensions: ["campaign_umbrella"],
            visual: null,
          },
          answer: { summary: "Spend was $3,400 [F1].", citations: [] },
          facts: { status: "computed" },
          sourceNotes: [],
          visualCards: [],
          validation: { status: "ready" },
          lineage: { parentRunId: null },
          dashboardPacket: null,
          createdAt: "2026-05-25T14:30:00.000Z",
          updatedAt: "2026-05-25T14:30:00.000Z",
        },
        onApplyEdits: () => undefined,
      }),
    );
  }

  const brandMarkup = renderFilterMarkup({ field: "brand", value: "HP" });
  assert.match(brandMarkup, /<option value="HP" selected="">HP<\/option>/);
  assert.match(brandMarkup, /<option value="VVS">VVS<\/option>/);

  const deliveryMarkup = renderFilterMarkup({ field: "delivery_status", value: "paused" });
  assert.match(deliveryMarkup, /<option value="live">Live<\/option>/);
  assert.match(deliveryMarkup, /<option value="paused" selected="">Paused<\/option>/);
});

test("dashboard packet insight controls render pinned insights and hide hidden insights", () => {
  const { RunDetail } = loadModule("src/components/analysis-workbench-client.tsx");

  const markup = renderToStaticMarkup(
    React.createElement(RunDetail, {
      run: {
        id: "run-2",
        status: "completed",
        prompt: "Build dashboard",
        outputMode: "full_dashboard",
        title: "Build dashboard",
        answer: { summary: "Dashboard saved [S1].", citations: [] },
        facts: { status: "computed" },
        sourceNotes: [{ id: "S1", label: "Data source", value: "Meta Ads daily insights" }],
        visualCards: [],
        validation: { status: "ready" },
        lineage: { parentRunId: null },
        dashboardPacket: {
          kind: "analysis_dashboard_packet",
          version: 1,
          generatedAt: "2026-05-25T14:35:00.000Z",
          promotedFromRunId: "run-1",
          directAnswer: { summary: "Dashboard saved [S1].", citations: [] },
          primaryEvidenceTable: null,
          visualObjects: [],
          insightSummary: {
            winners: [
              {
                id: "winner_primary",
                title: "Winner",
                detail: "Book Appts US leads with $2,500 Spend.",
                sourceNoteIds: ["S1"],
                pinned: true,
              },
            ],
            losers: [
              {
                id: "loser_primary",
                title: "Loser",
                detail: "Cash for Gold US trails at $900 Spend.",
                sourceNoteIds: ["S1"],
                hidden: true,
              },
            ],
            anomalies: [],
          },
          nextActions: [],
          assumptions: [],
          caveats: [],
          sourceNotes: [{ id: "S1", label: "Data source", value: "Meta Ads daily insights" }],
        },
        createdAt: "2026-05-25T14:30:00.000Z",
        updatedAt: "2026-05-25T14:35:00.000Z",
      },
      onApplyEdits: () => undefined,
    }),
  );

  assert.match(markup, /Pinned/);
  assert.match(markup, /Hide insight/);
  assert.match(markup, /Pin insight/);
  assert.doesNotMatch(markup, /Cash for Gold US trails/);
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

test("bar, scatter, and pivot cards assign unique React keys when entity labels collide", () => {
  // renderToStaticMarkup never drops duplicate-keyed siblings and emits no key warning,
  // so we assert on the keys themselves: wrap the (shared, cached) JSX runtime that the
  // compiled component uses and record every key it creates per element type.
  const { VisualCardGrid } = loadModule("src/components/analysis-workbench-client.tsx");
  const jsxRuntime = require("react/jsx-runtime");

  function captureRender(card: Record<string, unknown>) {
    const originalJsx = jsxRuntime.jsx;
    const originalJsxs = jsxRuntime.jsxs;
    const keysByType: Record<string, string[]> = {};
    const record = (type: unknown, key: unknown) => {
      if (typeof type === "string" && key !== undefined && key !== null) {
        (keysByType[type] ||= []).push(String(key));
      }
    };
    jsxRuntime.jsx = (type: unknown, props: unknown, key: unknown) => {
      record(type, key);
      return originalJsx(type, props, key);
    };
    jsxRuntime.jsxs = (type: unknown, props: unknown, key: unknown) => {
      record(type, key);
      return originalJsxs(type, props, key);
    };

    let markup = "";
    try {
      markup = renderToStaticMarkup(
        React.createElement(VisualCardGrid, {
          runStatus: "completed",
          runId: "run-dupe",
          sourceNotes: [{ id: "S1", label: "Data source", value: "Meta Ads daily insights" }],
          cards: [card],
        }),
      );
    } finally {
      jsxRuntime.jsx = originalJsx;
      jsxRuntime.jsxs = originalJsxs;
    }
    return { markup, keysByType };
  }

  const assertUniqueKeys = (keysByType: Record<string, string[]>, type: string) => {
    const keys = keysByType[type] || [];
    assert.ok(keys.length >= 2, `expected at least two keyed <${type}> rows, saw ${keys.length}`);
    assert.equal(
      new Set(keys).size,
      keys.length,
      `Duplicate <${type}> React keys: ${keys.join(", ")}`,
    );
  };

  const bar = captureRender({
    id: "bar_creative_contacts",
    type: "bar_chart",
    title: "Messaging Contacts by creative",
    metric: "messaging_contacts",
    dimension: "creative",
    bars: [
      { label: "Gold Is at an All-Time High", value: 30, formattedValue: "30 contacts" },
      { label: "Gold Is at an All-Time High", value: 12, formattedValue: "12 contacts" },
    ],
    sourceNoteIds: ["S1"],
  });
  assert.match(bar.markup, /30 contacts/);
  assert.match(bar.markup, /12 contacts/);
  assertUniqueKeys(bar.keysByType, "div");

  const scatter = captureRender({
    id: "scatter_creative_spend_cpl",
    type: "scatter_chart",
    title: "Spend versus CPL by creative",
    dimension: "creative",
    xMetric: "spend",
    yMetric: "cpl",
    points: [
      { label: "Gold Is at an All-Time High", x: 100, y: 5, formattedX: "$100", formattedY: "$5" },
      { label: "Gold Is at an All-Time High", x: 250, y: 9, formattedX: "$250", formattedY: "$9" },
    ],
    sourceNoteIds: ["S1"],
  });
  assert.match(scatter.markup, /\$100/);
  assert.match(scatter.markup, /\$250/);
  assertUniqueKeys(scatter.keysByType, "circle");
  assertUniqueKeys(scatter.keysByType, "div");

  const pivot = captureRender({
    id: "pivot_creative_week_contacts",
    type: "pivot_table",
    title: "Contacts by creative and week",
    rowDimension: "creative",
    columnDimension: "week",
    metric: "messaging_contacts",
    columns: [{ key: "2026-W20", label: "2026-W20" }],
    rows: [
      {
        rowLabel: "Gold Is at an All-Time High",
        cells: { "2026-W20": { value: 30, formattedValue: "30" } },
        total: { value: 30, formattedValue: "row-total-A" },
      },
      {
        rowLabel: "Gold Is at an All-Time High",
        cells: { "2026-W20": { value: 12, formattedValue: "12" } },
        total: { value: 12, formattedValue: "row-total-B" },
      },
    ],
    sourceNoteIds: ["S1"],
  });
  assert.match(pivot.markup, /row-total-A/);
  assert.match(pivot.markup, /row-total-B/);
  assertUniqueKeys(pivot.keysByType, "tr");
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
