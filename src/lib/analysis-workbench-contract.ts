import {
  WORKBENCH_DIMENSIONS,
  WORKBENCH_FILTERS,
  WORKBENCH_METRICS,
  getAnalysisWorkbenchSemanticCatalog,
  validateAnalysisWorkbenchSemanticIntent,
} from "./analysis-workbench-semantic-catalog.ts";
import type {
  WorkbenchDimension,
  WorkbenchFilterField,
  WorkbenchMetric,
  WorkbenchSemanticVisualIntent,
} from "./analysis-workbench-semantic-catalog.ts";
import type { AnalysisWorkbenchPipelineResult } from "./analysis-workbench-pipeline.ts";

export type JsonValue =
  | string
  | number
  | boolean
  | null
  | { [key: string]: JsonValue | undefined }
  | JsonValue[];

export const ANALYSIS_OUTPUT_MODES = [
  "answer_only",
  "answer_visuals",
  "full_dashboard",
] as const;

export type AnalysisOutputMode = (typeof ANALYSIS_OUTPUT_MODES)[number];
export type AnalysisRunStatus = "created" | "running" | "completed" | "failed";

export type AnalysisRunAnswer = {
  summary: string;
  citations: JsonValue[];
};

export type AnalysisWorkbenchContextDateRange = {
  start: string;
  end: string;
  days: number;
  label: string;
};

export type AnalysisWorkbenchContextFilter = {
  field: WorkbenchFilterField;
  operator: "contains" | "equals";
  value: string;
};

export type AnalysisWorkbenchContextSnapshot = {
  dateRange?: AnalysisWorkbenchContextDateRange;
  filters: AnalysisWorkbenchContextFilter[];
  metrics: WorkbenchMetric[];
  dimensions: WorkbenchDimension[];
  visual: WorkbenchSemanticVisualIntent | null;
};

export type AnalysisWorkbenchContextChanges = Partial<AnalysisWorkbenchContextSnapshot>;

export type AnalysisWorkbenchLineage = {
  parentRunId: string | null;
  inheritedContext: AnalysisWorkbenchContextSnapshot | null;
  removedContextKeys: string[];
  changedContext: AnalysisWorkbenchContextChanges;
  finalContext: AnalysisWorkbenchContextSnapshot | null;
};

export type AnalysisWorkbenchContextChip = {
  id: string;
  label: "Date" | "Filter" | "Metric" | "Grouping" | "Visual";
  value: string;
};

export type AnalysisWorkbenchVisualCell =
  | string
  | number
  | null
  | {
      value: string | number | null;
      formattedValue: string;
      metric?: WorkbenchMetric;
      citationId?: string;
    };

export type AnalysisWorkbenchVisualColumn = {
  key: string;
  label: string;
  kind: "dimension" | "metric";
  metric?: WorkbenchMetric;
};

export type AnalysisWorkbenchMetricVisualCard = {
  id: string;
  type: "metric_card";
  title: string;
  metric: WorkbenchMetric;
  value: number | null;
  formattedValue: string;
  citationId: string;
  sourceNoteIds: string[];
  caveats?: string[];
  assumptions?: string[];
};

export type AnalysisWorkbenchTableVisualCard = {
  id: string;
  type: "flat_table";
  title: string;
  columns: AnalysisWorkbenchVisualColumn[];
  rows: Array<Record<string, AnalysisWorkbenchVisualCell>>;
  sourceNoteIds: string[];
  caveats?: string[];
  assumptions?: string[];
};

export type AnalysisWorkbenchBarVisualCard = {
  id: string;
  type: "bar_chart";
  title: string;
  metric: WorkbenchMetric;
  dimension: WorkbenchDimension;
  bars: Array<{
    label: string;
    value: number;
    formattedValue: string;
    citationId?: string;
  }>;
  sourceNoteIds: string[];
  caveats?: string[];
  assumptions?: string[];
};

export type AnalysisWorkbenchLineVisualCard = {
  id: string;
  type: "line_chart";
  title: string;
  metric: WorkbenchMetric;
  dimension: "date";
  points: Array<{
    label: string;
    value: number;
    formattedValue: string;
    citationId?: string;
  }>;
  sourceNoteIds: string[];
  caveats?: string[];
  assumptions?: string[];
};

export type AnalysisWorkbenchPivotVisualCard = {
  id: string;
  type: "pivot_table";
  title: string;
  rowDimension: WorkbenchDimension;
  columnDimension: WorkbenchDimension;
  metric: WorkbenchMetric;
  columns: Array<{
    key: string;
    label: string;
  }>;
  rows: Array<{
    rowLabel: string;
    cells: Record<string, AnalysisWorkbenchVisualCell>;
    total: AnalysisWorkbenchVisualCell;
  }>;
  sourceNoteIds: string[];
  caveats?: string[];
  assumptions?: string[];
};

export type AnalysisWorkbenchScatterVisualCard = {
  id: string;
  type: "scatter_chart";
  title: string;
  dimension: WorkbenchDimension;
  xMetric: WorkbenchMetric;
  yMetric: WorkbenchMetric;
  points: Array<{
    label: string;
    x: number;
    y: number;
    formattedX: string;
    formattedY: string;
    citationId?: string;
  }>;
  sourceNoteIds: string[];
  caveats?: string[];
  assumptions?: string[];
};

export type AnalysisWorkbenchVisualCard =
  | AnalysisWorkbenchMetricVisualCard
  | AnalysisWorkbenchTableVisualCard
  | AnalysisWorkbenchBarVisualCard
  | AnalysisWorkbenchLineVisualCard
  | AnalysisWorkbenchPivotVisualCard
  | AnalysisWorkbenchScatterVisualCard;

export type AnalysisWorkbenchRun = {
  id: string;
  status: AnalysisRunStatus;
  prompt: string;
  outputMode: AnalysisOutputMode;
  title: string;
  intent: JsonValue;
  queryPlan: JsonValue;
  facts: JsonValue;
  visualCards: AnalysisWorkbenchVisualCard[];
  sourceNotes: JsonValue[];
  validation: JsonValue;
  lineage: JsonValue;
  answer: AnalysisRunAnswer;
  dashboardPacket: JsonValue | null;
  createdAt: string;
  updatedAt: string;
};

export type AnalysisRunRecord = {
  id: string;
  status: string;
  prompt: string;
  output_mode: string;
  title: string;
  intent: JsonValue;
  query_plan: JsonValue;
  facts: JsonValue;
  visual_cards: JsonValue;
  source_notes: JsonValue;
  validation: JsonValue;
  lineage: JsonValue;
  answer: JsonValue;
  dashboard_packet: JsonValue | null;
  created_at: string;
  updated_at: string;
};

export type AnalysisRunInsert = Omit<AnalysisRunRecord, "id">;

export function normalizeAnalysisOutputMode(value: unknown): AnalysisOutputMode {
  return ANALYSIS_OUTPUT_MODES.includes(value as AnalysisOutputMode)
    ? (value as AnalysisOutputMode)
    : "answer_visuals";
}

export function buildAnalysisRunInsert(input: {
  prompt: string;
  outputMode?: unknown;
  parentRunId?: string | null;
  inheritedContext?: AnalysisWorkbenchContextSnapshot | null;
  removedContextKeys?: string[];
  now?: string;
  pipelineResult?: AnalysisWorkbenchPipelineResult;
}): AnalysisRunInsert {
  const prompt = normalizePrompt(input.prompt);
  if (!prompt) {
    throw new Error("Analysis prompt is required.");
  }

  const outputMode = normalizeAnalysisOutputMode(input.outputMode);
  const now = input.now || new Date().toISOString();
  if (input.pipelineResult) {
    return {
      status: input.pipelineResult.status,
      prompt,
      output_mode: outputMode,
      title: input.pipelineResult.title || titleFromPrompt(prompt),
      intent: input.pipelineResult.intent as JsonValue,
      query_plan: input.pipelineResult.queryPlan as JsonValue,
      facts: input.pipelineResult.facts as JsonValue,
      visual_cards: input.pipelineResult.visualCards as unknown as JsonValue[],
      source_notes: input.pipelineResult.sourceNotes as unknown as JsonValue[],
      validation: input.pipelineResult.validation as JsonValue,
      lineage: buildAnalysisRunLineage({
        parentRunId: input.parentRunId || null,
        inheritedContext: input.inheritedContext || null,
        removedContextKeys: input.removedContextKeys || [],
        finalContext: resolveAnalysisRunContext({
          intent: input.pipelineResult.intent as JsonValue,
          lineage: null,
        }),
      }) as unknown as JsonValue,
      answer: input.pipelineResult.answer as unknown as JsonValue,
      dashboard_packet: input.pipelineResult.dashboardPacket,
      created_at: now,
      updated_at: now,
    };
  }

  const semanticValidation = validateAnalysisWorkbenchSemanticIntent({ prompt });
  const blocked = semanticValidation.status === "blocked";

  return {
    status: blocked ? "failed" : "created",
    prompt,
    output_mode: outputMode,
    title: titleFromPrompt(prompt),
    intent: {
      rawPrompt: prompt,
      outputMode,
      status: "pending",
    },
    query_plan: {
      status: "pending",
      steps: [],
    },
    facts: {
      status: "pending",
      items: [],
    },
    visual_cards: [],
    source_notes: [
      {
        label: blocked ? "Governed semantic validation" : "Foundation run",
        value: blocked
          ? "Request blocked before analysis because it asks for unsupported or ungoverned data."
          : "Saved prompt and run identity. Governed facts arrive in the next slice.",
      },
    ],
    validation: blocked
      ? semanticValidation
      : {
          status: "not_run",
          blockers: [],
          warnings: [
            "Foundation run created before governed planner and fact engine are connected.",
          ],
        },
    lineage: {
      parentRunId: input.parentRunId || null,
      inheritedContext: null,
      removedContextKeys: [],
      changedContext: {},
      finalContext: null,
    },
    answer: {
      summary: blocked
        ? "Request blocked. This analysis asks for data outside the governed Meta Ads catalog."
        : "Run created. Governed facts, citations, and visuals have not run yet.",
      citations: [],
    },
    dashboard_packet: null,
    created_at: now,
    updated_at: now,
  };
}

export function buildAnalysisRunLineage(input: {
  parentRunId?: string | null;
  inheritedContext?: unknown;
  removedContextKeys?: string[];
  finalContext?: unknown;
}): AnalysisWorkbenchLineage {
  const inheritedContext = normalizeAnalysisContextSnapshot(input.inheritedContext);
  const finalContext = normalizeAnalysisContextSnapshot(input.finalContext);

  return {
    parentRunId: input.parentRunId || null,
    inheritedContext,
    removedContextKeys: uniqueStrings(input.removedContextKeys || []),
    changedContext: changedAnalysisContext(inheritedContext, finalContext),
    finalContext,
  };
}

export function resolveAnalysisRunContext(input: {
  intent?: unknown;
  lineage?: unknown;
}): AnalysisWorkbenchContextSnapshot | null {
  const lineage =
    input.lineage && typeof input.lineage === "object" && !Array.isArray(input.lineage)
      ? (input.lineage as { finalContext?: unknown })
      : null;
  const lineageContext = normalizeAnalysisContextSnapshot(lineage?.finalContext);
  if (lineageContext) return lineageContext;

  return normalizeAnalysisContextSnapshot(input.intent);
}

export function buildAnalysisContextChips(
  context: AnalysisWorkbenchContextSnapshot | null,
): AnalysisWorkbenchContextChip[] {
  if (!context) return [];

  return [
    ...(context.dateRange
      ? [
          {
            id: "dateRange",
            label: "Date" as const,
            value: `${context.dateRange.label} · ${context.dateRange.start} to ${context.dateRange.end}`,
          },
        ]
      : []),
    ...context.filters.map((filter) => ({
      id: `filter:${filter.field}:${filter.value}`,
      label: "Filter" as const,
      value: `${contextLabel(filter.field)} = ${filter.value}`,
    })),
    ...context.metrics.map((metric) => ({
      id: `metric:${metric}`,
      label: "Metric" as const,
      value: contextLabel(metric),
    })),
    ...context.dimensions.map((dimension) => ({
      id: `dimension:${dimension}`,
      label: "Grouping" as const,
      value: contextLabel(dimension),
    })),
    ...(context.visual
      ? [
          {
            id: "visual",
            label: "Visual" as const,
            value: contextLabel(context.visual.type),
          },
        ]
      : []),
  ];
}

export function removeAnalysisContextChips(
  context: AnalysisWorkbenchContextSnapshot | null,
  removedContextKeys: string[],
): AnalysisWorkbenchContextSnapshot | null {
  if (!context) return null;

  const removed = new Set(removedContextKeys);
  return normalizeAnalysisContextSnapshot({
    ...context,
    dateRange: removed.has("dateRange") ? undefined : context.dateRange,
    filters: context.filters.filter(
      (filter) => !removed.has(`filter:${filter.field}:${filter.value}`),
    ),
    metrics: context.metrics.filter((metric) => !removed.has(`metric:${metric}`)),
    dimensions: context.dimensions.filter(
      (dimension) => !removed.has(`dimension:${dimension}`),
    ),
    visual: removed.has("visual") ? null : context.visual,
  });
}

export function mapAnalysisRunRecord(record: AnalysisRunRecord): AnalysisWorkbenchRun {
  return {
    id: String(record.id),
    status: normalizeRunStatus(record.status),
    prompt: String(record.prompt),
    outputMode: normalizeAnalysisOutputMode(record.output_mode),
    title: String(record.title),
    intent: record.intent || {},
    queryPlan: record.query_plan || {},
    facts: record.facts || {},
    visualCards: Array.isArray(record.visual_cards)
      ? (record.visual_cards as unknown as AnalysisWorkbenchVisualCard[])
      : [],
    sourceNotes: Array.isArray(record.source_notes) ? record.source_notes : [],
    validation: record.validation || {},
    lineage: record.lineage || { parentRunId: null },
    answer: normalizeAnswer(record.answer),
    dashboardPacket: record.dashboard_packet ?? null,
    createdAt: String(record.created_at),
    updatedAt: String(record.updated_at),
  };
}

function normalizePrompt(prompt: string) {
  return prompt.trim().replace(/\s+/g, " ");
}

function titleFromPrompt(prompt: string) {
  return prompt.length > 90 ? `${prompt.slice(0, 87)}...` : prompt;
}

function normalizeRunStatus(status: string): AnalysisRunStatus {
  if (status === "running" || status === "completed" || status === "failed") return status;
  return "created";
}

function normalizeAnswer(answer: JsonValue): AnalysisRunAnswer {
  if (answer && typeof answer === "object" && !Array.isArray(answer)) {
    const candidate = answer as { summary?: JsonValue; citations?: JsonValue };
    return {
      summary:
        typeof candidate.summary === "string"
          ? candidate.summary
          : "Run created. Governed facts, citations, and visuals have not run yet.",
      citations: Array.isArray(candidate.citations) ? candidate.citations : [],
    };
  }

  return {
    summary: "Run created. Governed facts, citations, and visuals have not run yet.",
    citations: [],
  };
}

function normalizeAnalysisContextSnapshot(value: unknown): AnalysisWorkbenchContextSnapshot | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const candidate = value as {
    dateRange?: unknown;
    filters?: unknown;
    metrics?: unknown;
    dimensions?: unknown;
    visual?: unknown;
  };
  const metrics = uniqueStrings(Array.isArray(candidate.metrics) ? candidate.metrics : []).filter(
    isWorkbenchMetric,
  );
  const dimensions = uniqueStrings(
    Array.isArray(candidate.dimensions) ? candidate.dimensions : [],
  ).filter(isWorkbenchDimension);
  const filters = normalizeContextFilters(candidate.filters);
  const dateRange = normalizeContextDateRange(candidate.dateRange);
  const visual = normalizeContextVisual(candidate.visual);

  if (!dateRange && !filters.length && !metrics.length && !dimensions.length && !visual) {
    return null;
  }

  return {
    ...(dateRange ? { dateRange } : {}),
    filters,
    metrics,
    dimensions,
    visual,
  };
}

function normalizeContextDateRange(value: unknown): AnalysisWorkbenchContextDateRange | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const candidate = value as { start?: unknown; end?: unknown; days?: unknown; label?: unknown };
  if (!isDateString(candidate.start) || !isDateString(candidate.end)) return undefined;
  const days = typeof candidate.days === "number" && candidate.days > 0 ? candidate.days : 0;
  if (!days) return undefined;

  return {
    start: candidate.start,
    end: candidate.end,
    days,
    label: typeof candidate.label === "string" && candidate.label ? candidate.label : `Last ${days} days`,
  };
}

function normalizeContextFilters(value: unknown): AnalysisWorkbenchContextFilter[] {
  if (!Array.isArray(value)) return [];
  const filters = value.flatMap((filter) => {
    if (!filter || typeof filter !== "object" || Array.isArray(filter)) return [];
    const candidate = filter as { field?: unknown; operator?: unknown; value?: unknown };
    if (!isWorkbenchFilterField(candidate.field) || typeof candidate.value !== "string") return [];
    const operator: AnalysisWorkbenchContextFilter["operator"] =
      candidate.operator === "contains" ? "contains" : "equals";
    return [{ field: candidate.field, operator, value: candidate.value }];
  });

  const seen = new Set<string>();
  return filters.filter((filter) => {
    const key = `${filter.field}\0${filter.operator}\0${filter.value}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function normalizeContextVisual(value: unknown): WorkbenchSemanticVisualIntent | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const candidate = value as WorkbenchSemanticVisualIntent;
  return typeof candidate.type === "string" && candidate.type ? candidate : null;
}

function changedAnalysisContext(
  inheritedContext: AnalysisWorkbenchContextSnapshot | null,
  finalContext: AnalysisWorkbenchContextSnapshot | null,
): AnalysisWorkbenchContextChanges {
  if (!finalContext) return {};
  if (!inheritedContext) return finalContext;

  return {
    ...(!sameJson(inheritedContext.dateRange || null, finalContext.dateRange || null)
      ? { dateRange: finalContext.dateRange }
      : {}),
    ...(!sameJson(inheritedContext.filters, finalContext.filters)
      ? { filters: finalContext.filters }
      : {}),
    ...(!sameJson(inheritedContext.metrics, finalContext.metrics)
      ? { metrics: finalContext.metrics }
      : {}),
    ...(!sameJson(inheritedContext.dimensions, finalContext.dimensions)
      ? { dimensions: finalContext.dimensions }
      : {}),
    ...(!sameJson(inheritedContext.visual || null, finalContext.visual || null)
      ? { visual: finalContext.visual }
      : {}),
  };
}

function contextLabel(value: string) {
  if (value === "campaign_umbrella") return "Campaign group";
  const catalog = getAnalysisWorkbenchSemanticCatalog();
  const label =
    catalog.metrics.find((definition) => definition.key === value)?.label ||
    catalog.dimensions.find((definition) => definition.key === value)?.label ||
    catalog.filters.find((definition) => definition.key === value)?.label;
  if (label) return label;

  return value
    .replace(/_/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function uniqueStrings(values: unknown[]) {
  return Array.from(new Set(values.filter((value): value is string => typeof value === "string")));
}

function isWorkbenchMetric(value: string): value is WorkbenchMetric {
  return WORKBENCH_METRICS.includes(value as WorkbenchMetric);
}

function isWorkbenchDimension(value: string): value is WorkbenchDimension {
  return WORKBENCH_DIMENSIONS.includes(value as WorkbenchDimension);
}

function isWorkbenchFilterField(value: unknown): value is WorkbenchFilterField {
  return (
    typeof value === "string" &&
    WORKBENCH_FILTERS.includes(value as WorkbenchFilterField)
  );
}

function isDateString(value: unknown): value is string {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function sameJson(left: unknown, right: unknown) {
  return JSON.stringify(left) === JSON.stringify(right);
}
