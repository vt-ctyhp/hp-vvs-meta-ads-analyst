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

export type AnalysisWorkbenchDashboardInsight = {
  id: string;
  title: "Winner" | "Loser" | "Anomaly";
  detail: string;
  citationId?: string;
  sourceNoteIds: string[];
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
        entity: String(
          (dimensionColumn ? row[dimensionColumn.key] : row.entity) || "Unspecified",
        ),
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
