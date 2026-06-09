/**
 * Maps a {@link WorkbenchAgentResult} onto the existing
 * {@link AnalysisWorkbenchPipelineResult} contract (Phase 2, Units 6 & 6b).
 *
 * The agent chose the answer prose and a set of visual *specs*; this mapper
 * builds the strict visual cards from the rows the agent actually queried (the
 * evidence ledger) — numbers never come from the model's free text. The same
 * mapper serves every mode; full_dashboard additionally composes a dashboard
 * packet from the AI-chosen visuals, retiring the templated packet builder.
 */
import { buildAnalysisDashboardPacket } from "./analysis-workbench-contract.ts";
import type {
  AnalysisOutputMode,
  AnalysisWorkbenchBarVisualCard,
  AnalysisWorkbenchLineVisualCard,
  AnalysisWorkbenchMetricVisualCard,
  AnalysisWorkbenchPivotVisualCard,
  AnalysisWorkbenchScatterVisualCard,
  AnalysisWorkbenchTableVisualCard,
  AnalysisWorkbenchVisualCard,
  AnalysisWorkbenchVisualCell,
  AnalysisWorkbenchVisualColumn,
} from "./analysis-workbench-contract.ts";
import {
  WORKBENCH_DIMENSIONS,
  WORKBENCH_METRICS,
  getAnalysisWorkbenchSemanticCatalog,
  type WorkbenchDimension,
  type WorkbenchMetric,
} from "./analysis-workbench-semantic-catalog.ts";
import type {
  AnalysisWorkbenchCitation,
  AnalysisWorkbenchPipelineResult,
  AnalysisWorkbenchSourceNote,
} from "./analysis-workbench-pipeline.ts";
import type { AgentLedgerEntry, AgentVisualSpec, WorkbenchAgentResult } from "./analysis-workbench-agent.ts";
import { groundAgentAnswer } from "./analysis-workbench-grounding.ts";

const TIME_DIMENSIONS = new Set<WorkbenchDimension>(["date", "week", "month", "quarter"]);
const ADDITIVE_VALUE_TYPES = new Set(["money", "count"]);

export type MapWorkbenchAgentResultInput = {
  prompt: string;
  outputMode: AnalysisOutputMode;
  agentResult: WorkbenchAgentResult;
};

export function mapWorkbenchAgentResultToPipelineResult(
  input: MapWorkbenchAgentResultInput,
): AnalysisWorkbenchPipelineResult {
  const { agentResult } = input;
  const ledgerById = new Map(agentResult.ledger.map((entry) => [entry.id, entry] as const));

  const sourceNotes = agentResult.ledger.map(toSourceNote);
  const citations = agentResult.ledger.map(toCitation);
  const visualCards = agentResult.visuals
    .map((spec) => buildVisualCard(spec, ledgerById))
    .filter((card): card is AnalysisWorkbenchVisualCard => card !== null);

  // Strict grounding: withhold any figure that cannot be traced to a query result.
  const grounded = groundAgentAnswer(agentResult.answer, agentResult.ledger);
  const answer = {
    summary: grounded.answer,
    citations,
    ...(agentResult.cost ? { apiCost: agentResult.cost } : {}),
  };

  const dashboardPacket =
    input.outputMode === "full_dashboard"
      ? buildAnalysisDashboardPacket({
          promotedFromRunId: null,
          answer,
          facts: { items: [] },
          visualCards,
          sourceNotes: sourceNotes as unknown as Parameters<typeof buildAnalysisDashboardPacket>[0]["sourceNotes"],
          validation: { assumptions: [] },
        })
      : null;

  return {
    status: "completed",
    title: titleFromPrompt(input.prompt),
    intent: {
      rawPrompt: input.prompt,
      outputMode: input.outputMode,
      status: "ready",
      engine: "agent",
      stopReason: agentResult.stopReason,
      toolCalls: agentResult.ledger.map((entry) => ({ id: entry.id, tool: entry.tool, summary: entry.summary })),
      grounding: {
        status: grounded.grounding.status,
        numbersChecked: grounded.grounding.numbersChecked,
        untraceable: grounded.grounding.untraceable,
        evidenceEmpty: grounded.grounding.evidenceEmpty,
      },
    },
    queryPlan: {
      status: "ready",
      source: "meta_ads",
      aggregateFunction: "aggregate_meta_daily_insights",
      requests: agentResult.requests,
    },
    facts: { status: "empty", items: [] },
    answer,
    sourceNotes,
    validation: {
      status: "ready",
      blockers: [],
      warnings: grounded.warnings.map((message) => ({ code: "withheld_unverified_figure", message })),
      assumptions: [],
    },
    visualCards,
    dashboardPacket,
  };
}

// ---------------------------------------------------------------------------
// Source notes & citations
// ---------------------------------------------------------------------------

function toSourceNote(entry: AgentLedgerEntry): AnalysisWorkbenchSourceNote {
  return {
    id: entry.id,
    label: `${entry.tool} (${entry.rowCount} row${entry.rowCount === 1 ? "" : "s"})`,
    value: entry.summary,
  };
}

function toCitation(entry: AgentLedgerEntry): AnalysisWorkbenchCitation {
  return { id: entry.id, kind: "source_note", label: entry.summary };
}

// ---------------------------------------------------------------------------
// Visual card builders — every value comes from ledger rows
// ---------------------------------------------------------------------------

function buildVisualCard(
  spec: AgentVisualSpec,
  ledgerById: Map<string, AgentLedgerEntry>,
): AnalysisWorkbenchVisualCard | null {
  const type = stringField(spec.type);
  const sourceCallId = stringField(spec.sourceCallId);
  const entry = sourceCallId ? ledgerById.get(sourceCallId) : undefined;
  if (!entry || !entry.rows.length) return null;
  const id = `v_${entry.id}_${type}`;
  const title = stringField(spec.title) || defaultTitle(type);

  switch (type) {
    case "bar_chart":
      return buildBarCard(spec, entry, id, title);
    case "line_chart":
      return buildLineCard(spec, entry, id, title);
    case "metric_card":
      return buildMetricCard(spec, entry, id, title);
    case "flat_table":
      return buildTableCard(entry, id, title);
    case "pivot_table":
      return buildPivotCard(spec, entry, id, title);
    case "scatter_chart":
      return buildScatterCard(spec, entry, id, title);
    default:
      return null;
  }
}

function buildBarCard(
  spec: AgentVisualSpec,
  entry: AgentLedgerEntry,
  id: string,
  title: string,
): AnalysisWorkbenchBarVisualCard | null {
  const metric = asMetric(spec.metric);
  const dimension = asDimension(spec.dimension);
  if (!metric || !dimension) return null;

  const bars = entry.rows
    .map((row) => {
      const value = numberField(row[metric]);
      const label = stringField(row[dimension]);
      if (value === null || !label) return null;
      return { label, value, formattedValue: formatMetric(metric, value), citationId: entry.id };
    })
    .filter((bar): bar is NonNullable<typeof bar> => bar !== null);
  if (!bars.length) return null;

  return { id, type: "bar_chart", title, metric, dimension, bars, sourceNoteIds: [entry.id] };
}

function buildLineCard(
  spec: AgentVisualSpec,
  entry: AgentLedgerEntry,
  id: string,
  title: string,
): AnalysisWorkbenchLineVisualCard | null {
  const metric = asMetric(spec.metric);
  const dimension = asDimension(spec.dimension);
  if (!metric || !dimension || !TIME_DIMENSIONS.has(dimension)) return null;

  const points = entry.rows
    .map((row) => {
      const value = numberField(row[metric]);
      const label = stringField(row[dimension]);
      if (value === null || !label) return null;
      return { label, value, formattedValue: formatMetric(metric, value), citationId: entry.id };
    })
    .filter((point): point is NonNullable<typeof point> => point !== null);
  if (!points.length) return null;

  return {
    id,
    type: "line_chart",
    title,
    metric,
    dimension: dimension as AnalysisWorkbenchLineVisualCard["dimension"],
    points,
    sourceNoteIds: [entry.id],
  };
}

function buildMetricCard(
  spec: AgentVisualSpec,
  entry: AgentLedgerEntry,
  id: string,
  title: string,
): AnalysisWorkbenchMetricVisualCard | null {
  const metric = asMetric(spec.metric);
  if (!metric) return null;

  const values = entry.rows
    .map((row) => numberField(row[metric]))
    .filter((value): value is number => value !== null);
  if (!values.length) return null;

  const additive = ADDITIVE_VALUE_TYPES.has(metricValueType(metric));
  const value = additive
    ? values.reduce((sum, current) => sum + current, 0)
    : values.reduce((sum, current) => sum + current, 0) / values.length;

  return {
    id,
    type: "metric_card",
    title,
    metric,
    value,
    formattedValue: formatMetric(metric, value),
    citationId: entry.id,
    sourceNoteIds: [entry.id],
  };
}

function buildTableCard(
  entry: AgentLedgerEntry,
  id: string,
  title: string,
): AnalysisWorkbenchTableVisualCard | null {
  const keys = Array.from(new Set(entry.rows.flatMap((row) => Object.keys(row))));
  if (!keys.length) return null;

  const columns: AnalysisWorkbenchVisualColumn[] = keys.map((key) => {
    const metric = asMetric(key);
    return metric
      ? { key, label: metricLabel(metric), kind: "metric", metric }
      : { key, label: humanize(key), kind: "dimension" };
  });

  const rows = entry.rows.map((row) => {
    const cells: Record<string, AnalysisWorkbenchVisualCell> = {};
    for (const column of columns) {
      const raw = row[column.key];
      if (column.kind === "metric" && column.metric) {
        const value = numberField(raw);
        cells[column.key] =
          value === null
            ? null
            : { value, formattedValue: formatMetric(column.metric, value), metric: column.metric, citationId: entry.id };
      } else {
        cells[column.key] = scalarCell(raw);
      }
    }
    return cells;
  });

  return { id, type: "flat_table", title, columns, rows, sourceNoteIds: [entry.id] };
}

function buildPivotCard(
  spec: AgentVisualSpec,
  entry: AgentLedgerEntry,
  id: string,
  title: string,
): AnalysisWorkbenchPivotVisualCard | null {
  const metric = asMetric(spec.metric);
  const rowDimension = asDimension(spec.rowDimension);
  const columnDimension = asDimension(spec.columnDimension);
  if (!metric || !rowDimension || !columnDimension || rowDimension === columnDimension) return null;

  const columnKeys: string[] = [];
  const rowGroups = new Map<string, Map<string, number>>();
  for (const row of entry.rows) {
    const rowLabel = stringField(row[rowDimension]);
    const columnLabel = stringField(row[columnDimension]);
    const value = numberField(row[metric]);
    if (!rowLabel || !columnLabel || value === null) continue;
    if (!columnKeys.includes(columnLabel)) columnKeys.push(columnLabel);
    if (!rowGroups.has(rowLabel)) rowGroups.set(rowLabel, new Map());
    const group = rowGroups.get(rowLabel)!;
    group.set(columnLabel, (group.get(columnLabel) || 0) + value);
  }
  if (!columnKeys.length || !rowGroups.size) return null;

  const columns = columnKeys.map((key) => ({ key, label: key }));
  const rows = Array.from(rowGroups.entries()).map(([rowLabel, group]) => {
    const cells: Record<string, AnalysisWorkbenchVisualCell> = {};
    let total = 0;
    for (const key of columnKeys) {
      const value = group.get(key) ?? null;
      if (value !== null) total += value;
      cells[key] =
        value === null
          ? null
          : { value, formattedValue: formatMetric(metric, value), metric, citationId: entry.id };
    }
    return {
      rowLabel,
      cells,
      total: { value: total, formattedValue: formatMetric(metric, total), metric, citationId: entry.id },
    };
  });

  return { id, type: "pivot_table", title, rowDimension, columnDimension, metric, columns, rows, sourceNoteIds: [entry.id] };
}

function buildScatterCard(
  spec: AgentVisualSpec,
  entry: AgentLedgerEntry,
  id: string,
  title: string,
): AnalysisWorkbenchScatterVisualCard | null {
  const xMetric = asMetric(spec.xMetric);
  const yMetric = asMetric(spec.yMetric);
  const dimension = asDimension(spec.dimension);
  if (!xMetric || !yMetric || !dimension) return null;

  const points = entry.rows
    .map((row) => {
      const x = numberField(row[xMetric]);
      const y = numberField(row[yMetric]);
      const label = stringField(row[dimension]);
      if (x === null || y === null || !label) return null;
      return {
        label,
        x,
        y,
        formattedX: formatMetric(xMetric, x),
        formattedY: formatMetric(yMetric, y),
        citationId: entry.id,
      };
    })
    .filter((point): point is NonNullable<typeof point> => point !== null);
  if (!points.length) return null;

  return { id, type: "scatter_chart", title, dimension, xMetric, yMetric, points, sourceNoteIds: [entry.id] };
}

// ---------------------------------------------------------------------------
// Formatting & coercion helpers
// ---------------------------------------------------------------------------

function metricValueType(metric: WorkbenchMetric): string {
  return getAnalysisWorkbenchSemanticCatalog().metrics.find((definition) => definition.key === metric)?.valueType || "count";
}

function metricLabel(metric: WorkbenchMetric): string {
  return getAnalysisWorkbenchSemanticCatalog().metrics.find((definition) => definition.key === metric)?.label || humanize(metric);
}

function formatMetric(metric: WorkbenchMetric, value: number): string {
  const valueType = metricValueType(metric);
  if (valueType === "money") {
    return `$${value.toLocaleString("en-US", { maximumFractionDigits: 2 })}`;
  }
  if (valueType === "rate") {
    return `${value.toLocaleString("en-US", { maximumFractionDigits: 2 })}%`;
  }
  if (valueType === "ratio") {
    return value.toLocaleString("en-US", { maximumFractionDigits: 2 });
  }
  return value.toLocaleString("en-US", { maximumFractionDigits: 0 });
}

function asMetric(value: unknown): WorkbenchMetric | null {
  return typeof value === "string" && WORKBENCH_METRICS.includes(value as WorkbenchMetric)
    ? (value as WorkbenchMetric)
    : null;
}

function asDimension(value: unknown): WorkbenchDimension | null {
  return typeof value === "string" && WORKBENCH_DIMENSIONS.includes(value as WorkbenchDimension)
    ? (value as WorkbenchDimension)
    : null;
}

function numberField(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function stringField(value: unknown): string {
  return typeof value === "string" && value.length ? value : typeof value === "number" ? String(value) : "";
}

function scalarCell(value: unknown): AnalysisWorkbenchVisualCell {
  if (typeof value === "string" || typeof value === "number" || value === null) return value;
  if (value === undefined) return null;
  return String(value);
}

function humanize(key: string): string {
  return key.replace(/_/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function defaultTitle(type: string): string {
  return humanize(type || "visual");
}

function titleFromPrompt(prompt: string): string {
  const normalized = prompt.trim().replace(/\s+/g, " ");
  return normalized.length > 90 ? `${normalized.slice(0, 87)}...` : normalized;
}
