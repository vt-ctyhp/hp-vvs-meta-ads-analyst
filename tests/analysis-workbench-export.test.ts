import assert from "node:assert/strict";
import test from "node:test";

import {
  buildAnalysisWorkbenchChartPngExportSource,
  buildAnalysisWorkbenchPdfReportExport,
  buildAnalysisWorkbenchTableCsvExport,
} from "../src/lib/analysis-workbench-export.ts";
import type {
  AnalysisWorkbenchDashboardPacket,
  AnalysisWorkbenchVisualCard,
} from "../src/lib/analysis-workbench-contract.ts";

const sourceNotes = [
  { id: "S1", label: "Data source", value: "Meta Ads daily insights" },
  { id: "S3", label: "Matched rows", value: "12 matching Meta Ads daily rows" },
];

test("table CSV export uses displayed labels, displayed values, and source notes", () => {
  const table: Extract<AnalysisWorkbenchVisualCard, { type: "flat_table" }> = {
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
  };

  const csv = buildAnalysisWorkbenchTableCsvExport({ card: table, runId: "run-1", sourceNotes });

  assert.equal(csv.mimeType, "text/csv;charset=utf-8");
  assert.match(csv.fileName, /campaign-group-evidence\.csv$/);
  assert.doesNotMatch(csv.content, /Run ID/);
  assert.match(
    csv.content,
    /"Source notes","S1 Data source: Meta Ads daily insights; S3 Matched rows: 12 matching Meta Ads daily rows"/,
  );
  assert.match(csv.content, /"Campaign group","Spend"/);
  assert.match(csv.content, /"Book Appts US","\$2,500"/);
});

test("pivot CSV export uses displayed columns and totals", () => {
  const pivot: Extract<AnalysisWorkbenchVisualCard, { type: "pivot_table" }> = {
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
    sourceNoteIds: ["S1"],
  };

  const csv = buildAnalysisWorkbenchTableCsvExport({ card: pivot, runId: "run-1", sourceNotes });

  assert.match(csv.content, /"Row","2026-W20","2026-W21","Total"/);
  assert.match(csv.content, /"Book Appts US","\$1,200","\$1,300","\$2,500"/);
});

test("chart PNG export source renders readable chart SVG without app chrome", () => {
  const chart: Extract<AnalysisWorkbenchVisualCard, { type: "bar_chart" }> = {
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
  };

  const png = buildAnalysisWorkbenchChartPngExportSource({
    card: chart,
    runId: "run-1",
    sourceNotes,
  });

  assert.equal(png.mimeType, "image/png");
  assert.match(png.fileName, /spend-by-campaign-group\.png$/);
  assert.match(png.svg, /<svg/);
  assert.match(png.svg, /Spend by campaign group/);
  assert.match(png.svg, /Book Appts US/);
  assert.match(png.svg, /\$2,500/);
  assert.doesNotMatch(png.svg, /Run ID/);
  assert.match(png.svg, /S1 Data source: Meta Ads daily insights/);
  assert.doesNotMatch(png.svg, /Export PNG/);
  assert.doesNotMatch(png.svg, /<button/);
});

test("dashboard packet PDF export contains answer, visuals, notes, assumptions, and caveats", () => {
  const table: Extract<AnalysisWorkbenchVisualCard, { type: "flat_table" }> = {
    id: "table_campaign_umbrella",
    type: "flat_table",
    title: "Campaign group evidence",
    columns: [
      { key: "entity", label: "Campaign group", kind: "dimension" },
      { key: "spend", label: "Spend", kind: "metric", metric: "spend" },
    ],
    rows: [{ entity: "Book Appts US", spend: { value: 2500, formattedValue: "$2,500" } }],
    sourceNoteIds: ["S1"],
  };
  const packet: AnalysisWorkbenchDashboardPacket = {
    kind: "analysis_dashboard_packet",
    version: 1,
    generatedAt: "2026-05-25T14:35:00.000Z",
    promotedFromRunId: "run-parent",
    directAnswer: { summary: "Dashboard saved [S1].", citations: [] },
    primaryEvidenceTable: table,
    visualObjects: [table],
    insightSummary: { winners: [], losers: [], anomalies: [] },
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
    sourceNotes,
  };

  const pdf = buildAnalysisWorkbenchPdfReportExport({ packet, runId: "run-1" });

  assert.equal(pdf.mimeType, "application/pdf");
  assert.match(pdf.fileName, /2026-05-25t14-35-00-000z-dashboard-packet\.pdf$/);
  assert.match(pdf.content, /^%PDF-1\.4/);
  assert.match(pdf.content, /HP\/VVS Meta Ads Analysis Report/);
  assert.doesNotMatch(pdf.content, /Run ID/);
  assert.doesNotMatch(pdf.content, /Promoted from run/);
  assert.match(pdf.content, /Dashboard saved \[S1\]/);
  assert.match(pdf.content, /Campaign group evidence/);
  assert.match(pdf.content, /Scale review: Inspect Book Appts US before changing budgets/);
  assert.match(pdf.content, /Data source: Meta Ads daily insights/);
  assert.match(pdf.content, /Relative date range ends at latest synced day/);
  assert.match(pdf.content, /Primary KPI is group-specific/);
});
