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
  WorkbenchSemanticIssue,
  WorkbenchSemanticVisualIntent,
} from "./analysis-workbench-semantic-catalog.ts";
import type { AnalysisWorkbenchPipelineResult } from "./analysis-workbench-pipeline.ts";
import type { OpenAICostBreakdown } from "./openai-cost.ts";

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

export const ANALYSIS_WORKBENCH_SHAPES = [
  "week_over_week_performance",
  "entity_leaderboard",
  "entity_week_over_week",
  "performance_diagnosis",
  "budget_recommendation",
  "generic_trend",
  "generic_breakdown",
] as const;

export type AnalysisOutputMode = (typeof ANALYSIS_OUTPUT_MODES)[number];
export type AnalysisWorkbenchShape = (typeof ANALYSIS_WORKBENCH_SHAPES)[number];
export type AnalysisRunStatus = "created" | "running" | "completed" | "failed";

export type AnalysisRunAnswer = {
  summary: string;
  citations: JsonValue[];
  apiCost?: OpenAICostBreakdown;
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

export type AnalysisWorkbenchControlledEdit = {
  dateRange?: AnalysisWorkbenchContextDateRange;
  filters?: AnalysisWorkbenchContextFilter[];
  metrics?: WorkbenchMetric[];
  dimensions?: WorkbenchDimension[];
  sort?: {
    field: WorkbenchMetric | WorkbenchDimension;
    direction: "asc" | "desc";
  };
  limit?: number;
  visual?: WorkbenchSemanticVisualIntent | null;
  objectTitles?: Record<string, string>;
  insightVisibility?: Record<string, { pinned?: boolean; hidden?: boolean }>;
};

export type AnalysisWorkbenchControlledEditValidation = {
  status: "ready" | "blocked";
  edit: AnalysisWorkbenchControlledEdit | null;
  blockers: WorkbenchSemanticIssue[];
  warnings: WorkbenchSemanticIssue[];
  assumptions: Array<{ code: string; message: string }>;
};

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
      entity?: AnalysisWorkbenchEntityDisplay;
      hiddenId?: string | null;
    };

export type AnalysisWorkbenchEntityDisplay = {
  id: string;
  label: string;
  subtitle?: string | null;
  thumbnailUrl?: string | null;
  imageUrl?: string | null;
  previewHtml?: string | null;
  previewUrl?: string | null;
  sourceType: "brand" | "campaign_umbrella" | "campaign" | "ad_set" | "ad" | "creative" | "fallback";
  hiddenId?: string | null;
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
    entity?: AnalysisWorkbenchEntityDisplay;
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
  dimension: Extract<WorkbenchDimension, "date" | "week" | "month" | "quarter">;
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
    entity?: AnalysisWorkbenchEntityDisplay;
  }>;
  rows: Array<{
    rowLabel: string;
    rowEntity?: AnalysisWorkbenchEntityDisplay;
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
    entity?: AnalysisWorkbenchEntityDisplay;
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

export type AnalysisWorkbenchDashboardInsight = {
  id: string;
  title: "Winner" | "Loser" | "Anomaly";
  detail: string;
  citationId?: string;
  sourceNoteIds: string[];
  pinned?: boolean;
  hidden?: boolean;
};

export type AnalysisWorkbenchDashboardAction = {
  id: string;
  title: string;
  detail: string;
  sourceNoteIds: string[];
};

export type AnalysisWorkbenchDashboardPacket = {
  kind: "analysis_dashboard_packet";
  version: 1;
  generatedAt: string;
  promotedFromRunId: string | null;
  directAnswer: AnalysisRunAnswer;
  primaryEvidenceTable: AnalysisWorkbenchTableVisualCard | null;
  visualObjects: AnalysisWorkbenchVisualCard[];
  insightSummary: {
    winners: AnalysisWorkbenchDashboardInsight[];
    losers: AnalysisWorkbenchDashboardInsight[];
    anomalies: AnalysisWorkbenchDashboardInsight[];
  };
  nextActions: AnalysisWorkbenchDashboardAction[];
  assumptions: string[];
  caveats: string[];
  sourceNotes: JsonValue[];
};

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
  dashboardPacket: AnalysisWorkbenchDashboardPacket | null;
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
      dashboard_packet: input.pipelineResult.dashboardPacket as unknown as JsonValue,
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

export function buildAnalysisDashboardPacket(input: {
  promotedFromRunId?: string | null;
  generatedAt?: string;
  answer: unknown;
  facts?: unknown;
  visualCards?: AnalysisWorkbenchVisualCard[];
  sourceNotes?: JsonValue[];
  validation?: unknown;
}): AnalysisWorkbenchDashboardPacket {
  const visualObjects = input.visualCards || [];
  const primaryEvidenceTable =
    visualObjects.find((card): card is AnalysisWorkbenchTableVisualCard => card.type === "flat_table") ||
    null;
  const sourceNotes = Array.isArray(input.sourceNotes) ? input.sourceNotes : [];
  const sourceNoteIds = normalizedSourceNoteIds(sourceNotes);
  const facts = factItems(input.facts);
  const tableInsights = primaryEvidenceTable
    ? insightsFromEvidenceTable(primaryEvidenceTable, sourceNoteIds)
    : { winners: [], losers: [] };
  const anomalies = anomalyInsightsFromFacts(facts, sourceNoteIds);
  const assumptions = uniqueStrings([
    ...assumptionMessages(input.validation),
    ...visualObjects.flatMap((card) => card.assumptions || []),
  ]);
  const caveats = uniqueStrings([
    ...facts.map((fact) => stringField(fact.caveat)).filter(Boolean),
    ...visualObjects.flatMap((card) => card.caveats || []),
  ]);
  const insightSummary = {
    winners: tableInsights.winners,
    losers: tableInsights.losers,
    anomalies,
  };

  return {
    kind: "analysis_dashboard_packet",
    version: 1,
    generatedAt: input.generatedAt || new Date().toISOString(),
    promotedFromRunId: input.promotedFromRunId || null,
    directAnswer: normalizeAnswer(input.answer as JsonValue),
    primaryEvidenceTable,
    visualObjects,
    insightSummary,
    nextActions: nextActionsForInsights(insightSummary, sourceNoteIds),
    assumptions,
    caveats: caveats.length
      ? caveats
      : ["This packet is limited to governed Meta Ads data and excludes revenue, ROAS, CRM, website, social inbox, and staff facts."],
    sourceNotes,
  };
}

export function normalizeAnalysisWorkbenchControlledEdits(
  value: unknown,
): AnalysisWorkbenchControlledEditValidation {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {
      status: "ready",
      edit: {},
      blockers: [],
      warnings: [],
      assumptions: [],
    };
  }

  const candidate = value as Record<string, unknown>;
  const blockers: WorkbenchSemanticIssue[] = unsupportedControlledEditIssues(candidate);
  const dateRange = hasOwn(candidate, "dateRange")
    ? normalizeControlledEditDateRange(candidate.dateRange, blockers)
    : undefined;
  const rawFilters = hasOwn(candidate, "filters")
    ? normalizeControlledEditFilters(candidate.filters, blockers)
    : undefined;
  const rawMetrics = hasOwn(candidate, "metrics")
    ? uniqueStrings(arrayStrings(candidate.metrics)).slice(0, 4)
    : undefined;
  const rawDimensions = hasOwn(candidate, "dimensions")
    ? uniqueStrings(arrayStrings(candidate.dimensions)).slice(0, 3)
    : undefined;
  const visual = hasOwn(candidate, "visual")
    ? normalizeControlledEditVisual(candidate.visual, blockers)
    : undefined;
  const sort = hasOwn(candidate, "sort") ? normalizeControlledEditSort(candidate.sort, blockers) : undefined;
  const limit = hasOwn(candidate, "limit") ? normalizeControlledEditLimit(candidate.limit, blockers) : undefined;
  const objectTitles = hasOwn(candidate, "objectTitles")
    ? normalizeControlledEditTitles(candidate.objectTitles)
    : undefined;
  const insightVisibility = hasOwn(candidate, "insightVisibility")
    ? normalizeControlledEditInsightVisibility(candidate.insightVisibility)
    : undefined;
  const semanticValidation = validateAnalysisWorkbenchSemanticIntent({
    metrics: rawMetrics,
    dimensions: rawDimensions,
    filters: rawFilters,
    ...(visual !== undefined && visual !== null ? { visual } : {}),
    dateGrain: dateGrainForControlledDimensions(rawDimensions) || null,
  });
  blockers.push(...semanticValidation.blockers);

  if (blockers.length) {
    return {
      status: "blocked",
      edit: null,
      blockers,
      warnings: semanticValidation.warnings,
      assumptions: semanticValidation.assumptions.map((assumption) => ({
        code: assumption.code,
        message: assumption.message,
      })),
    };
  }

  const edit: AnalysisWorkbenchControlledEdit = {
    ...(dateRange ? { dateRange } : {}),
    ...(rawFilters !== undefined
      ? { filters: normalizeContextFilters(semanticValidation.repairedIntent.filters) }
      : {}),
    ...(rawMetrics !== undefined
      ? { metrics: uniqueStrings(rawMetrics).filter(isWorkbenchMetric) }
      : {}),
    ...(rawDimensions !== undefined
      ? { dimensions: uniqueStrings(rawDimensions).filter(isWorkbenchDimension) }
      : {}),
    ...(sort ? { sort } : {}),
    ...(limit !== undefined ? { limit } : {}),
    ...(visual !== undefined ? { visual: semanticValidation.repairedIntent.visual } : {}),
    ...(objectTitles && Object.keys(objectTitles).length ? { objectTitles } : {}),
    ...(insightVisibility && Object.keys(insightVisibility).length ? { insightVisibility } : {}),
  };

  return {
    status: "ready",
    edit,
    blockers: [],
    warnings: semanticValidation.warnings,
    assumptions: semanticValidation.assumptions.map((assumption) => ({
      code: assumption.code,
      message: assumption.message,
    })),
  };
}

export function applyAnalysisWorkbenchControlledEditsToContext(
  context: AnalysisWorkbenchContextSnapshot | null,
  edit: AnalysisWorkbenchControlledEdit | null | undefined,
): AnalysisWorkbenchContextSnapshot | null {
  if (!edit) return context;

  return normalizeAnalysisContextSnapshot({
    ...(context || { filters: [], metrics: [], dimensions: [], visual: null }),
    ...(hasOwn(edit, "dateRange") ? { dateRange: edit.dateRange } : {}),
    ...(hasOwn(edit, "filters") ? { filters: edit.filters || [] } : {}),
    ...(hasOwn(edit, "metrics") ? { metrics: edit.metrics || [] } : {}),
    ...(hasOwn(edit, "dimensions") ? { dimensions: edit.dimensions || [] } : {}),
    ...(hasOwn(edit, "visual") ? { visual: edit.visual || null } : {}),
  });
}

export function applyAnalysisWorkbenchControlledEditsToVisualCards(
  cards: AnalysisWorkbenchVisualCard[],
  edit: AnalysisWorkbenchControlledEdit | null | undefined,
): AnalysisWorkbenchVisualCard[] {
  if (!edit?.objectTitles) return cards;

  return cards.map((card) => {
    const title = edit.objectTitles?.[card.id] || edit.objectTitles?.[card.type];
    return title ? ({ ...card, title } as AnalysisWorkbenchVisualCard) : card;
  });
}

export function applyAnalysisWorkbenchControlledEditsToDashboardPacket(
  packet: AnalysisWorkbenchDashboardPacket | null,
  edit: AnalysisWorkbenchControlledEdit | null | undefined,
): AnalysisWorkbenchDashboardPacket | null {
  if (!packet || !edit) return packet;
  const visualObjects = applyAnalysisWorkbenchControlledEditsToVisualCards(
    packet.visualObjects,
    edit,
  );
  const primaryEvidenceTable =
    packet.primaryEvidenceTable &&
    (visualObjects.find(
      (card): card is AnalysisWorkbenchTableVisualCard =>
        card.type === "flat_table" && card.id === packet.primaryEvidenceTable?.id,
    ) ||
      packet.primaryEvidenceTable);

  return {
    ...packet,
    primaryEvidenceTable: primaryEvidenceTable || null,
    visualObjects,
    insightSummary: {
      winners: applyControlledInsightVisibility(packet.insightSummary.winners, edit),
      losers: applyControlledInsightVisibility(packet.insightSummary.losers, edit),
      anomalies: applyControlledInsightVisibility(packet.insightSummary.anomalies, edit),
    },
    nextActions: filterControlledInsightActions(packet.nextActions, edit),
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
    dashboardPacket: normalizeDashboardPacket(record.dashboard_packet),
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
    const candidate = answer as { summary?: JsonValue; citations?: JsonValue; apiCost?: unknown };
    const apiCost = normalizeAnswerApiCost(candidate.apiCost);
    return {
      summary:
        typeof candidate.summary === "string"
          ? candidate.summary
          : "Run created. Governed facts, citations, and visuals have not run yet.",
      citations: Array.isArray(candidate.citations) ? candidate.citations : [],
      ...(apiCost ? { apiCost } : {}),
    };
  }

  return {
    summary: "Run created. Governed facts, citations, and visuals have not run yet.",
    citations: [],
  };
}

function normalizeAnswerApiCost(value: unknown): OpenAICostBreakdown | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const candidate = value as {
    model?: unknown;
    inputTokens?: unknown;
    outputTokens?: unknown;
    totalTokens?: unknown;
    estimatedCostUsd?: unknown;
  };
  const model = typeof candidate.model === "string" && candidate.model.trim()
    ? candidate.model
    : "unknown";
  const inputTokens = positiveInteger(candidate.inputTokens);
  const outputTokens = positiveInteger(candidate.outputTokens);
  const totalTokens = positiveInteger(candidate.totalTokens) || inputTokens + outputTokens;
  const estimatedCostUsd =
    typeof candidate.estimatedCostUsd === "number" && Number.isFinite(candidate.estimatedCostUsd)
      ? Math.max(0, candidate.estimatedCostUsd)
      : 0;

  return {
    model,
    inputTokens,
    outputTokens,
    totalTokens,
    estimatedCostUsd,
  };
}

function positiveInteger(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) && value > 0
    ? Math.floor(value)
    : 0;
}

function normalizeDashboardPacket(value: JsonValue | null): AnalysisWorkbenchDashboardPacket | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const candidate = value as Partial<AnalysisWorkbenchDashboardPacket>;
  if (candidate.kind !== "analysis_dashboard_packet") return null;

  return {
    kind: "analysis_dashboard_packet",
    version: 1,
    generatedAt:
      typeof candidate.generatedAt === "string" ? candidate.generatedAt : new Date(0).toISOString(),
    promotedFromRunId:
      typeof candidate.promotedFromRunId === "string" ? candidate.promotedFromRunId : null,
    directAnswer: normalizeAnswer(candidate.directAnswer as unknown as JsonValue),
    primaryEvidenceTable:
      candidate.primaryEvidenceTable && candidate.primaryEvidenceTable.type === "flat_table"
        ? candidate.primaryEvidenceTable
        : null,
    visualObjects: Array.isArray(candidate.visualObjects)
      ? (candidate.visualObjects as AnalysisWorkbenchVisualCard[])
      : [],
    insightSummary: normalizeDashboardInsightSummary(candidate.insightSummary),
    nextActions: Array.isArray(candidate.nextActions)
      ? candidate.nextActions.filter(isDashboardAction)
      : [],
    assumptions: uniqueStrings(Array.isArray(candidate.assumptions) ? candidate.assumptions : []),
    caveats: uniqueStrings(Array.isArray(candidate.caveats) ? candidate.caveats : []),
    sourceNotes: Array.isArray(candidate.sourceNotes)
      ? (candidate.sourceNotes as unknown as JsonValue[])
      : [],
  };
}

function normalizeDashboardInsightSummary(
  value: unknown,
): AnalysisWorkbenchDashboardPacket["insightSummary"] {
  const candidate =
    value && typeof value === "object" && !Array.isArray(value)
      ? (value as Partial<AnalysisWorkbenchDashboardPacket["insightSummary"]>)
      : {};

  return {
    winners: normalizeDashboardInsights(candidate.winners, "Winner"),
    losers: normalizeDashboardInsights(candidate.losers, "Loser"),
    anomalies: normalizeDashboardInsights(candidate.anomalies, "Anomaly"),
  };
}

function normalizeDashboardInsights(
  value: unknown,
  title: AnalysisWorkbenchDashboardInsight["title"],
) {
  if (!Array.isArray(value)) return [];

  return value.flatMap((insight) => {
    if (!insight || typeof insight !== "object" || Array.isArray(insight)) return [];
    const candidate = insight as Partial<AnalysisWorkbenchDashboardInsight>;
    if (typeof candidate.id !== "string" || typeof candidate.detail !== "string") return [];
    return [
      {
        id: candidate.id,
        title,
        detail: candidate.detail,
        ...(typeof candidate.citationId === "string" ? { citationId: candidate.citationId } : {}),
        sourceNoteIds: uniqueStrings(
          Array.isArray(candidate.sourceNoteIds) ? candidate.sourceNoteIds : [],
        ),
        ...(candidate.pinned === true ? { pinned: true } : {}),
        ...(candidate.hidden === true ? { hidden: true } : {}),
      },
    ];
  });
}

function isDashboardAction(value: unknown): value is AnalysisWorkbenchDashboardAction {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const candidate = value as Partial<AnalysisWorkbenchDashboardAction>;
  return (
    typeof candidate.id === "string" &&
    typeof candidate.title === "string" &&
    typeof candidate.detail === "string" &&
    Array.isArray(candidate.sourceNoteIds)
  );
}

function normalizedSourceNoteIds(sourceNotes: JsonValue[]) {
  const ids = sourceNotes.flatMap((note) => {
    if (!note || typeof note !== "object" || Array.isArray(note)) return [];
    const id = (note as { id?: unknown }).id;
    return typeof id === "string" && id ? [id] : [];
  });

  return uniqueStrings(ids).length ? uniqueStrings(ids) : ["S1"];
}

function factItems(facts: unknown): Array<Record<string, unknown>> {
  if (!facts || typeof facts !== "object" || Array.isArray(facts)) return [];
  const items = (facts as { items?: unknown }).items;
  if (!Array.isArray(items)) return [];
  return items.filter(
    (item): item is Record<string, unknown> =>
      Boolean(item) && typeof item === "object" && !Array.isArray(item),
  );
}

function insightsFromEvidenceTable(
  table: AnalysisWorkbenchTableVisualCard,
  fallbackSourceNoteIds: string[],
) {
  const metricColumn = table.columns.find((column) => column.kind === "metric");
  if (!metricColumn) return { winners: [], losers: [] };
  const dimensionColumn = table.columns.find((column) => column.kind === "dimension");
  const sourceNoteIds = table.sourceNoteIds.length ? table.sourceNoteIds : fallbackSourceNoteIds;
  const rows = table.rows
    .map((row) => {
      const cell = row[metricColumn.key];
      return {
        entity: formattedVisualCell(dimensionColumn ? row[dimensionColumn.key] : row.entity),
        value: numberFromVisualCell(cell),
        formattedValue: formattedVisualCell(cell),
        citationId: citationFromVisualCell(cell),
      };
    })
    .filter((row) => row.value !== null)
    .sort((left, right) => (right.value || 0) - (left.value || 0));

  if (!rows.length) return { winners: [], losers: [] };

  const winner = rows[0];
  const loser = rows.length > 1 ? rows[rows.length - 1] : null;
  return {
    winners: [
      {
        id: "winner_primary",
        title: "Winner" as const,
        detail: `${winner.entity} leads with ${winner.formattedValue} ${metricColumn.label}.`,
        ...(winner.citationId ? { citationId: winner.citationId } : {}),
        sourceNoteIds,
      },
    ],
    losers: loser
      ? [
          {
            id: "loser_primary",
            title: "Loser" as const,
            detail: `${loser.entity} trails at ${loser.formattedValue} ${metricColumn.label}.`,
            ...(loser.citationId ? { citationId: loser.citationId } : {}),
            sourceNoteIds,
          },
        ]
      : [],
  };
}

function anomalyInsightsFromFacts(
  facts: Array<Record<string, unknown>>,
  sourceNoteIds: string[],
): AnalysisWorkbenchDashboardInsight[] {
  return facts
    .filter((fact) => fact.type === "comparison")
    .slice(0, 3)
    .map((fact, index) => {
      const entity = stringField(fact.entityName) || stringField(fact.label) || "Top row";
      const delta = stringField(fact.formattedDeltaValue) || stringField(fact.formattedValue);
      const baselineLabel = stringField(fact.baselineLabel) || "baseline";
      const baseline = stringField(fact.formattedBaselineValue);

      return {
        id: `anomaly_${index + 1}`,
        title: "Anomaly",
        detail: `${entity} is ${delta || "above baseline"} versus ${baselineLabel}${
          baseline ? ` of ${baseline}` : ""
        }.`,
        ...(stringField(fact.citationId) ? { citationId: stringField(fact.citationId) } : {}),
        sourceNoteIds,
      };
    });
}

function assumptionMessages(validation: unknown) {
  if (!validation || typeof validation !== "object" || Array.isArray(validation)) return [];
  const assumptions = (validation as { assumptions?: unknown }).assumptions;
  if (!Array.isArray(assumptions)) return [];

  return assumptions.flatMap((assumption) => {
    if (typeof assumption === "string" && assumption) return [assumption];
    if (!assumption || typeof assumption !== "object" || Array.isArray(assumption)) return [];
    const message = (assumption as { message?: unknown }).message;
    return typeof message === "string" && message ? [message] : [];
  });
}

function nextActionsForInsights(
  insightSummary: AnalysisWorkbenchDashboardPacket["insightSummary"],
  sourceNoteIds: string[],
): AnalysisWorkbenchDashboardAction[] {
  const actions: AnalysisWorkbenchDashboardAction[] = [];
  const winner = insightSummary.winners[0];
  const loser = insightSummary.losers[0];
  const anomaly = insightSummary.anomalies[0];

  if (winner) {
    actions.push({
      id: "action_winner",
      title: "Scale review",
      detail: `Inspect ${entityFromInsight(winner)} for budget or creative patterns before scaling.`,
      sourceNoteIds: winner.sourceNoteIds.length ? winner.sourceNoteIds : sourceNoteIds,
    });
  }
  if (loser) {
    actions.push({
      id: "action_loser",
      title: "Efficiency review",
      detail: `Review ${entityFromInsight(loser)} before keeping spend at the same level.`,
      sourceNoteIds: loser.sourceNoteIds.length ? loser.sourceNoteIds : sourceNoteIds,
    });
  }
  if (anomaly) {
    actions.push({
      id: "action_anomaly",
      title: "Anomaly check",
      detail: `Check ${entityFromInsight(anomaly)} against recent changes and source coverage.`,
      sourceNoteIds: anomaly.sourceNoteIds.length ? anomaly.sourceNoteIds : sourceNoteIds,
    });
  }

  [
    {
      id: "action_source_notes",
      title: "Source check",
      detail: "Confirm date range, filters, and matched rows before sharing.",
    },
    {
      id: "action_follow_up",
      title: "Follow-up prompt",
      detail: "Ask a follow-up with the same context if the decision needs more detail.",
    },
  ].forEach((fallback) => {
    if (actions.length < 3) actions.push({ ...fallback, sourceNoteIds });
  });

  return actions;
}

function entityFromInsight(insight: AnalysisWorkbenchDashboardInsight) {
  return insight.detail
    .replace(/\s+(?:leads|trails|is)\b.*$/i, "")
    .trim() || "this row";
}

function numberFromVisualCell(cell: AnalysisWorkbenchVisualCell | undefined) {
  if (typeof cell === "number") return cell;
  if (cell && typeof cell === "object" && !Array.isArray(cell)) {
    return typeof cell.value === "number" ? cell.value : null;
  }
  return null;
}

function formattedVisualCell(cell: AnalysisWorkbenchVisualCell | undefined) {
  if (cell && typeof cell === "object" && !Array.isArray(cell)) {
    return cell.formattedValue || String(cell.value ?? "n/a");
  }
  return cell === null || cell === undefined ? "n/a" : String(cell);
}

function citationFromVisualCell(cell: AnalysisWorkbenchVisualCell | undefined) {
  if (cell && typeof cell === "object" && !Array.isArray(cell)) {
    return typeof cell.citationId === "string" ? cell.citationId : "";
  }
  return "";
}

function stringField(value: unknown) {
  return typeof value === "string" && value ? value : "";
}

function unsupportedControlledEditIssues(candidate: Record<string, unknown>) {
  const unsupportedFields = [
    "customSql",
    "customSQL",
    "sql",
    "query",
    "formula",
    "formulas",
    "customFormula",
    "calculatedField",
    "calculatedFields",
  ];

  return unsupportedFields.flatMap((field) =>
    hasOwn(candidate, field)
      ? [
          {
            code: "unsupported_custom_logic",
            field,
            message:
              "Custom SQL, formulas, and calculated fields are not supported in governed dashboard edits.",
          },
        ]
      : [],
  );
}

function normalizeControlledEditDateRange(
  value: unknown,
  blockers: WorkbenchSemanticIssue[],
): AnalysisWorkbenchContextDateRange | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    blockers.push({
      code: "invalid_date_range",
      field: "dateRange",
      message: "Controlled date edits require start and end dates.",
    });
    return undefined;
  }

  const candidate = value as { start?: unknown; end?: unknown; label?: unknown };
  if (!isDateString(candidate.start) || !isDateString(candidate.end)) {
    blockers.push({
      code: "invalid_date_range",
      field: "dateRange",
      message: "Controlled date edits require YYYY-MM-DD start and end dates.",
    });
    return undefined;
  }

  const days = inclusiveDateDays(candidate.start, candidate.end);
  if (days < 1) {
    blockers.push({
      code: "invalid_date_range",
      field: "dateRange",
      message: "Controlled date edits require an end date on or after the start date.",
    });
    return undefined;
  }

  return {
    start: candidate.start,
    end: candidate.end,
    days,
    label:
      typeof candidate.label === "string" && candidate.label.trim()
        ? sanitizeControlledTitle(candidate.label)
        : `${candidate.start} to ${candidate.end}`,
  };
}

function normalizeControlledEditFilters(
  value: unknown,
  blockers: WorkbenchSemanticIssue[],
): Array<{ field: string; operator: string; value: string }> {
  if (!Array.isArray(value)) {
    blockers.push({
      code: "invalid_filters",
      field: "filters",
      message: "Controlled filter edits must be an array of governed filters.",
    });
    return [];
  }

  return value.flatMap((filter) => {
    if (!filter || typeof filter !== "object" || Array.isArray(filter)) return [];
    const candidate = filter as { field?: unknown; operator?: unknown; value?: unknown };
    if (typeof candidate.field !== "string" || typeof candidate.value !== "string") {
      blockers.push({
        code: "invalid_filter",
        field: "filters",
        message: "Controlled filter edits require string field and value.",
      });
      return [];
    }
    return [
      {
        field: candidate.field,
        operator: candidate.operator === "contains" ? "contains" : "equals",
        value: candidate.value,
      },
    ];
  });
}

function normalizeControlledEditVisual(
  value: unknown,
  blockers: WorkbenchSemanticIssue[],
): WorkbenchSemanticVisualIntent | null {
  if (value === null) return null;
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    blockers.push({
      code: "invalid_visual",
      field: "visual",
      message: "Controlled visual edits require a governed visual object.",
    });
    return null;
  }

  const candidate = value as Record<string, unknown>;
  if (typeof candidate.type !== "string") {
    blockers.push({
      code: "invalid_visual",
      field: "visual.type",
      message: "Controlled visual edits require a governed visual type.",
    });
    return null;
  }

  return {
    type: candidate.type,
    metrics: arrayStrings(candidate.metrics),
    dimensions: arrayStrings(candidate.dimensions),
    ...(typeof candidate.rowDimension === "string"
      ? { rowDimension: candidate.rowDimension }
      : {}),
    ...(typeof candidate.columnDimension === "string"
      ? { columnDimension: candidate.columnDimension }
      : {}),
    ...(typeof candidate.x === "string" ? { x: candidate.x } : {}),
    ...(typeof candidate.y === "string" ? { y: candidate.y } : {}),
  };
}

function normalizeControlledEditSort(
  value: unknown,
  blockers: WorkbenchSemanticIssue[],
): AnalysisWorkbenchControlledEdit["sort"] | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    blockers.push({
      code: "invalid_sort",
      field: "sort",
      message: "Controlled sort edits require a field and direction.",
    });
    return undefined;
  }

  const candidate = value as { field?: unknown; direction?: unknown };
  const field = typeof candidate.field === "string" ? candidate.field : "";
  if (!isWorkbenchMetric(field) && !isWorkbenchDimension(field)) {
    blockers.push({
      code: "invalid_sort_field",
      field: "sort.field",
      value: field,
      message: `Sort field "${field}" is not approved for Meta Ads workbench analysis.`,
    });
    return undefined;
  }

  return {
    field,
    direction: candidate.direction === "asc" ? "asc" : "desc",
  };
}

function normalizeControlledEditLimit(
  value: unknown,
  blockers: WorkbenchSemanticIssue[],
): number | undefined {
  const limit = typeof value === "number" ? Math.trunc(value) : Number(value);
  if (!Number.isFinite(limit) || limit < 1 || limit > 100) {
    blockers.push({
      code: "invalid_limit",
      field: "limit",
      message: "Controlled limit edits must be a number from 1 to 100.",
    });
    return undefined;
  }

  return Math.trunc(limit);
}

function normalizeControlledEditTitles(value: unknown): Record<string, string> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};

  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).flatMap(([key, title]) => {
      if (typeof title !== "string") return [];
      const cleanKey = key.trim();
      const cleanTitle = sanitizeControlledTitle(title);
      return cleanKey && cleanTitle ? [[cleanKey, cleanTitle]] : [];
    }),
  );
}

function normalizeControlledEditInsightVisibility(
  value: unknown,
): NonNullable<AnalysisWorkbenchControlledEdit["insightVisibility"]> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};

  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).flatMap(([key, visibility]) => {
      if (!visibility || typeof visibility !== "object" || Array.isArray(visibility)) return [];
      const candidate = visibility as { pinned?: unknown; hidden?: unknown };
      const cleanKey = key.trim();
      if (!cleanKey) return [];
      return [
        [
          cleanKey,
          {
            ...(candidate.pinned === true ? { pinned: true } : {}),
            ...(candidate.hidden === true ? { hidden: true } : {}),
          },
        ],
      ];
    }),
  );
}

function applyControlledInsightVisibility<
  T extends AnalysisWorkbenchDashboardInsight,
>(insights: T[], edit: AnalysisWorkbenchControlledEdit): T[] {
  if (!edit.insightVisibility) return insights;

  return insights.map((insight) => {
    const visibility = edit.insightVisibility?.[insight.id];
    return visibility ? ({ ...insight, ...visibility } as T) : insight;
  });
}

function filterControlledInsightActions(
  actions: AnalysisWorkbenchDashboardAction[],
  edit: AnalysisWorkbenchControlledEdit,
) {
  const hiddenInsightIds = Object.entries(edit.insightVisibility || {})
    .filter(([, visibility]) => visibility.hidden)
    .map(([id]) => id);
  if (!hiddenInsightIds.length) return actions;

  const hiddenActionIds = new Set(
    hiddenInsightIds.flatMap((id) => {
      if (id.startsWith("winner")) return ["action_winner"];
      if (id.startsWith("loser")) return ["action_loser"];
      if (id.startsWith("anomaly")) return ["action_anomaly"];
      return [];
    }),
  );

  return actions.filter((action) => !hiddenActionIds.has(action.id));
}

function dateGrainForControlledDimensions(dimensions: string[] | undefined) {
  if (!dimensions) return null;
  if (dimensions.includes("date")) return "day";
  if (dimensions.includes("week")) return "week";
  if (dimensions.includes("month")) return "month";
  if (dimensions.includes("quarter")) return "quarter";
  return null;
}

function arrayStrings(value: unknown) {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

function sanitizeControlledTitle(value: string) {
  return value.trim().replace(/\s+/g, " ").slice(0, 90);
}

function inclusiveDateDays(start: string, end: string) {
  const startTime = Date.parse(`${start}T00:00:00.000Z`);
  const endTime = Date.parse(`${end}T00:00:00.000Z`);
  if (!Number.isFinite(startTime) || !Number.isFinite(endTime)) return 0;
  return Math.floor((endTime - startTime) / 86_400_000) + 1;
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

function hasOwn(object: object, key: string) {
  return Object.prototype.hasOwnProperty.call(object, key);
}
