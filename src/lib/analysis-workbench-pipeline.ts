import {
  getAnalysisWorkbenchSemanticCatalog,
  validateAnalysisWorkbenchSemanticIntent,
  type WorkbenchDateGrain,
  type WorkbenchDimension,
  type WorkbenchMetric,
  type WorkbenchSemanticFilter,
  type WorkbenchSemanticIssue,
  type WorkbenchSemanticVisualIntent,
} from "./analysis-workbench-semantic-catalog.ts";
import {
  applyAnalysisWorkbenchControlledEditsToDashboardPacket,
  applyAnalysisWorkbenchControlledEditsToVisualCards,
  buildAnalysisDashboardPacket,
} from "./analysis-workbench-contract.ts";
import type {
  AnalysisOutputMode,
  AnalysisRunStatus,
  AnalysisWorkbenchControlledEdit,
  AnalysisWorkbenchContextSnapshot,
  AnalysisWorkbenchDashboardPacket,
  AnalysisWorkbenchVisualCard,
  JsonValue,
} from "./analysis-workbench-contract.ts";
import {
  dateBucketLimit,
  dateGrainForDimensions,
  dateGrainToDimension,
  inferAnalysisWorkbenchDateIntentFromPrompt,
  resolveAnalysisWorkbenchDateIntent,
} from "./analysis-workbench-date-intent.ts";
import {
  parseAnalysisWorkbenchIntentWithAI,
  type AnalysisWorkbenchIntentPlannerResult,
  type WorkbenchPlannerIntent,
  type WorkbenchQuestionType,
} from "./analysis-workbench-intent-planner.ts";
import type {
  MetaInsightAggregateRow,
  MetaInsightDimension,
  MetaInsightFilter,
} from "./meta-insight-aggregates.ts";
import type { OpenAICostBreakdown } from "./openai-cost.ts";

export type AnalysisWorkbenchCitation = {
  id: string;
  kind: "fact" | "source_note";
  label: string;
  value?: number | string | null;
  formattedValue?: string;
  values?: Array<number | string | null>;
  formattedValues?: string[];
  metric?: WorkbenchMetric;
  entityName?: string;
};

export type AnalysisWorkbenchPipelineAggregateRequest = {
  start: string;
  end: string;
  dimensions: MetaInsightDimension[];
  metrics: WorkbenchMetric[];
  filters: MetaInsightFilter[];
  sortField: WorkbenchMetric | WorkbenchDimension;
  sortDirection: "asc" | "desc";
  limit: number;
};

export type AnalysisWorkbenchSourceNote = {
  id: string;
  label: string;
  value: string;
};

export type AnalysisWorkbenchComputedFact = {
  id: string;
  type: "total" | "rank" | "comparison" | "source_note";
  label: string;
  metric?: WorkbenchMetric;
  dimension?: WorkbenchDimension;
  entityName?: string;
  value?: number | string | null;
  formattedValue?: string;
  baselineLabel?: string;
  baselineValue?: number;
  formattedBaselineValue?: string;
  deltaValue?: number;
  formattedDeltaValue?: string;
  citationId: string;
  caveat?: string;
};

export type AnalysisWorkbenchPipelineIntent = {
  status: "ready" | "blocked";
  rawPrompt: string;
  outputMode: AnalysisOutputMode;
  questionType?: WorkbenchQuestionType;
  metrics: WorkbenchMetric[];
  dimensions: WorkbenchDimension[];
  filters: MetaInsightFilter[];
  dateRange: {
    start: string;
    end: string;
    days: number;
    label: string;
  };
  dateGrain?: WorkbenchDateGrain | null;
  sort: {
    field: WorkbenchMetric | WorkbenchDimension;
    direction: "asc" | "desc";
  };
  limit: number;
  visual: WorkbenchSemanticVisualIntent | null;
  parser?: {
    source: "ai";
    model: string;
    confidence: WorkbenchPlannerIntent["confidence"];
    apiCost: OpenAICostBreakdown;
    assumptions: Array<{ code: string; message: string }>;
    unsupported: WorkbenchPlannerIntent["unsupported"];
  };
};

export type AnalysisWorkbenchPipelineResult = {
  status: AnalysisRunStatus;
  title: string;
  intent: AnalysisWorkbenchPipelineIntent | Record<string, unknown>;
  queryPlan: {
    status: "ready" | "blocked" | "not_run";
    source: "meta_ads";
    aggregateFunction: "aggregate_meta_daily_insights";
    requests: AnalysisWorkbenchPipelineAggregateRequest[];
  };
  facts: {
    status: "computed" | "empty" | "blocked";
    items: AnalysisWorkbenchComputedFact[];
  };
  answer: {
    summary: string;
    citations: AnalysisWorkbenchCitation[];
    apiCost?: OpenAICostBreakdown;
  };
  sourceNotes: AnalysisWorkbenchSourceNote[];
  validation: {
    status: "ready" | "blocked";
    blockers: WorkbenchSemanticIssue[];
    warnings: WorkbenchSemanticIssue[];
    assumptions: Array<{ code: string; message: string }>;
  };
  visualCards: AnalysisWorkbenchVisualCard[];
  dashboardPacket: AnalysisWorkbenchDashboardPacket | null;
};

type PipelineInput = {
  prompt: string;
  outputMode: AnalysisOutputMode;
  latestSyncedInsightDate?: string | null;
  inheritedContext?: AnalysisWorkbenchContextSnapshot | null;
  controlledEdit?: AnalysisWorkbenchControlledEdit | null;
  parseIntent?: typeof parseAnalysisWorkbenchIntentWithAI;
  executeAggregate: (
    request: AnalysisWorkbenchPipelineAggregateRequest,
  ) => Promise<MetaInsightAggregateRow[]>;
};

type PlannedIntent = AnalysisWorkbenchPipelineIntent & {
  semanticValidation: ReturnType<typeof validateAnalysisWorkbenchSemanticIntent>;
  filterScopes: MetaInsightFilter[][];
  questionType: WorkbenchQuestionType;
  dateGrain: WorkbenchDateGrain | null;
  dateAssumptions: Array<{ code: string; message: string }>;
};

const DEFAULT_METRICS: WorkbenchMetric[] = ["spend", "primary_results"];
const DEFAULT_DIMENSIONS: WorkbenchDimension[] = ["campaign_umbrella"];
const MAX_GROUP_ROWS = 20;
const NUMBER_PATTERN =
  "\\d+|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty|thirty|ninety";
const MONEY_METRICS = new Set<WorkbenchMetric>([
  "spend",
  "monthly_budget",
  "cpm",
  "cpc",
  "cpl",
]);
const RATE_METRICS = new Set<WorkbenchMetric>(["ctr"]);
const RATIO_METRICS = new Set<WorkbenchMetric>(["frequency"]);
const ENTITY_DIMENSIONS = new Set<WorkbenchDimension>([
  "brand",
  "campaign_umbrella",
  "campaign",
  "ad_set",
  "ad",
  "creative",
]);
const PRIMARY_KPI_PROXY_METRICS = new Set<WorkbenchMetric>([
  "bookings",
  "website_bookings",
  "messaging_contacts",
  "new_messaging_contacts",
]);
type WorkbenchTimeDimension = Extract<WorkbenchDimension, "date" | "week" | "month" | "quarter">;

export async function runAnalysisWorkbenchFactsPipeline(
  input: PipelineInput,
): Promise<AnalysisWorkbenchPipelineResult> {
  const prompt = normalizePrompt(input.prompt);
  const title = titleFromPrompt(prompt);
  const plannerResult = await (input.parseIntent || parseAnalysisWorkbenchIntentWithAI)({
    prompt,
    latestSyncedInsightDate: input.latestSyncedInsightDate,
    inheritedContext: input.inheritedContext || null,
  });
  const planned = planAnalysisWorkbenchIntent({
    prompt,
    outputMode: input.outputMode,
    latestSyncedInsightDate: input.latestSyncedInsightDate,
    inheritedContext: input.inheritedContext || null,
    controlledEdit: input.controlledEdit || null,
    plannerResult,
  });

  if (planned.semanticValidation.status === "blocked") {
    return blockedResult({ prompt, title, outputMode: input.outputMode, planned });
  }

  const groupedRequests = aggregateRequests(planned, planned.dimensions, planned.limit);
  const totalRequests = aggregateRequests(planned, [], 1);
  const trendRequests = shouldBuildVisualCards(planned.outputMode)
    ? trendAggregateRequests(planned)
    : [];
  const groupedRows = await executeAggregateRequests({
    executeAggregate: input.executeAggregate,
    requests: groupedRequests,
    dimensions: planned.dimensions,
    sortField: planned.sort.field,
    sortDirection: planned.sort.direction,
    limit: planned.limit,
  });
  const totalRows = await executeAggregateRequests({
    executeAggregate: input.executeAggregate,
    requests: totalRequests,
    dimensions: [],
    sortField: planned.sort.field,
    sortDirection: planned.sort.direction,
    limit: 1,
  });
  const trendDimension = trendDimensionFor(planned);
  const trendRows = await executeAggregateRequests({
    executeAggregate: input.executeAggregate,
    requests: trendRequests,
    dimensions: trendDimension ? [trendDimension] : ["date"],
    sortField: trendDimension || "date",
    sortDirection: "asc",
    limit: trendLimit(planned),
  });
  const sourceNotes = sourceNotesFor(
    planned,
    groupedRows,
    totalRows,
    input.controlledEdit || null,
  );
  const facts = computeFacts(planned, groupedRows, totalRows, sourceNotes);
  const answer = withWorkbenchAnswerApiCost(composeAnswer(planned, facts.items, sourceNotes), planned);
  const visualCards = applyAnalysisWorkbenchControlledEditsToVisualCards(
    buildVisualCards(planned, facts.items, groupedRows, trendRows),
    input.controlledEdit,
  );
  const groundingIssues = validateAnalysisWorkbenchNarrativeGrounding(
    answer.summary,
    answer.citations,
  );
  const warnings = [
    ...planned.semanticValidation.warnings,
    ...(facts.status === "empty"
      ? [
          {
            code: "zero_matching_rows",
            message: "No matching Meta Ads aggregate rows were returned for this governed request.",
          },
        ]
      : []),
  ];
  const validation = {
    status: groundingIssues.length ? ("blocked" as const) : ("ready" as const),
    blockers: groundingIssues,
    warnings,
    assumptions: [
      ...planned.dateAssumptions,
      ...(planned.parser?.assumptions || []),
      ...planned.semanticValidation.assumptions.map((assumption) => ({
        code: assumption.code,
        message: assumption.message,
      })),
    ],
  };
  const dashboardPacket =
    planned.outputMode === "full_dashboard" && !groundingIssues.length
      ? applyAnalysisWorkbenchControlledEditsToDashboardPacket(
          buildAnalysisDashboardPacket({
            answer,
            facts,
            visualCards,
            sourceNotes: sourceNotes as unknown as JsonValue[],
            validation,
          }),
          input.controlledEdit,
        )
      : null;

  return {
    status: groundingIssues.length ? "failed" : "completed",
    title,
    intent: stripSemanticValidation(planned),
    queryPlan: {
      status: "ready",
      source: "meta_ads",
      aggregateFunction: "aggregate_meta_daily_insights",
      requests: [...groupedRequests, ...totalRequests, ...trendRequests],
    },
    facts,
    answer,
    sourceNotes,
    validation,
    visualCards,
    dashboardPacket,
  };
}

export function validateAnalysisWorkbenchNarrativeGrounding(
  summary: string,
  citations: AnalysisWorkbenchCitation[],
): WorkbenchSemanticIssue[] {
  const allowed = new Set<string>();
  citations.forEach((citation) => {
    [
      citation.value,
      citation.formattedValue,
      citation.entityName,
      ...(citation.values || []),
      ...(citation.formattedValues || []),
    ].forEach((value) => {
      const normalized = normalizeNumericClaim(value);
      if (normalized) allowed.add(normalized);
    });
  });

  const scrubbed = summary
    .replace(/\[[A-Z]\d+\]/g, "")
    .replace(/\b\d{4}-W\d{1,2}\b/g, "")
    .replace(/\b\d{4}-\d{2}-\d{2}\b/g, "");
  const claims = Array.from(scrubbed.matchAll(/[$]?\d[\d,]*(?:\.\d+)?%?/g)).map(
    (match) => match[0],
  );

  return unique(claims.map(normalizeNumericClaim).filter(Boolean) as string[])
    .filter((claim) => !allowed.has(claim))
    .map((claim) => ({
      code: "uncited_numeric_claim",
      value: claim,
      message: `Numeric claim "${claim}" is not present in computed facts or source-note citations.`,
    }));
}

function planAnalysisWorkbenchIntent(input: {
  prompt: string;
  outputMode: AnalysisOutputMode;
  latestSyncedInsightDate?: string | null;
  inheritedContext?: AnalysisWorkbenchContextSnapshot | null;
  controlledEdit?: AnalysisWorkbenchControlledEdit | null;
  plannerResult?: AnalysisWorkbenchIntentPlannerResult;
}): PlannedIntent {
  const inheritedContext = input.inheritedContext || null;
  const controlledEdit = input.controlledEdit || null;
  const plannerIntent = input.plannerResult?.intent || null;
  const questionType = plannerIntent?.questionType || inferQuestionType(input.prompt);
  const explicitMetrics = detectMetrics(input.prompt, false);
  const explicitDimensions = detectDimensions(input.prompt, false);
  const metrics = controlledEdit?.metrics?.length
    ? controlledEdit.metrics
    : plannerIntent?.metrics.length
    ? plannerIntent.metrics
    : explicitMetrics.length
    ? explicitMetrics
    : inheritedContext?.metrics.length
      ? inheritedContext.metrics
      : DEFAULT_METRICS;
  const baseDimensions = controlledEdit?.dimensions?.length
    ? controlledEdit.dimensions
    : plannerIntent?.dimensions.length
    ? plannerIntent.dimensions
    : explicitDimensions.length
    ? explicitDimensions
    : inheritedContext?.dimensions.length
      ? inheritedContext.dimensions
      : DEFAULT_DIMENSIONS;
  const filters = controlledEdit && Object.hasOwn(controlledEdit, "filters")
    ? controlledEdit.filters || []
    : normalizeSemanticFilters([
        ...(inheritedContext?.filters || []),
        ...(plannerIntent ? plannerIntent.filters : detectFilters(input.prompt)),
      ]);
  const visual = controlledEdit && Object.hasOwn(controlledEdit, "visual")
    ? controlledEdit.visual || null
    : plannerIntent?.visualIntent || detectVisualIntent(input.prompt, metrics, baseDimensions);
  const inferredDateIntent = inferAnalysisWorkbenchDateIntentFromPrompt(input.prompt);
  const dateResolution = controlledEdit?.dateRange
    ? {
        dateRange: controlledEdit.dateRange,
        dateGrain: dateGrainForDimensions(controlledEdit.dimensions || baseDimensions),
        assumptions: [] as Array<{ code: string; message: string }>,
      }
    : resolveAnalysisWorkbenchDateIntent({
        dateIntent: preferredDateIntent(inferredDateIntent, plannerIntent?.dateIntent || null),
        latestSyncedInsightDate: input.latestSyncedInsightDate,
        inheritedDateRange: inheritedContext?.dateRange || null,
      });
  const dimensions = dimensionsForDateIntent(
    baseDimensions,
    dateResolution.dateGrain,
    questionType,
    visual,
  );
  const dateRange = dateResolution.dateRange;
  const dateGrain = dateResolution.dateGrain || dateGrainForDimensions(dimensions);
  const semanticValidation = validateAnalysisWorkbenchSemanticIntent({
    prompt: input.prompt,
    metrics,
    dimensions,
    filters,
    dateGrain: dateGrain || null,
    ...(visual ? { visual } : {}),
  });
  const repairedFilters = semanticValidation.repairedIntent.filters as MetaInsightFilter[];
  const filterScopes = buildFilterScopes(repairedFilters);
  const timeSortField = trendSortField(questionType, dimensions);
  const sortField = controlledEdit?.sort?.field || plannerIntent?.sort?.field || timeSortField || metrics[0] || "spend";
  const sortDirection =
    controlledEdit?.sort?.direction ||
    plannerIntent?.sort?.direction ||
    (timeSortField ? "asc" : detectSortDirection(input.prompt));
  const repairedVisual = semanticValidation.repairedIntent.visual;
  const repairedDimensions = dimensionsForVisual(dimensions, repairedVisual);
  const requestedLimit = plannerIntent?.limit || detectLimit(input.prompt) || null;
  const limit = controlledEdit?.limit || defaultLimitForIntent({
    requestedLimit,
    dateRange,
    dateGrain,
    dimensions: repairedDimensions,
    questionType,
  });
  const parser = input.plannerResult?.source === "ai" && plannerIntent
    ? {
        source: "ai" as const,
        model: input.plannerResult.model,
        confidence: plannerIntent.confidence,
        apiCost: input.plannerResult.apiCost,
        assumptions: plannerIntent.assumptions,
        unsupported: plannerIntent.unsupported,
      }
    : undefined;

  return {
    status: semanticValidation.status === "blocked" ? "blocked" : "ready",
    rawPrompt: input.prompt,
    outputMode: input.outputMode,
    questionType,
    metrics,
    dimensions: repairedDimensions,
    filters: repairedFilters,
    dateRange,
    dateGrain,
    sort: {
      field: sortField,
      direction: sortDirection,
    },
    limit,
    visual: repairedVisual,
    ...(parser ? { parser } : {}),
    semanticValidation,
    filterScopes,
    dateAssumptions: dateResolution.assumptions,
  };
}

function blockedResult(input: {
  prompt: string;
  title: string;
  outputMode: AnalysisOutputMode;
  planned: PlannedIntent;
}): AnalysisWorkbenchPipelineResult {
  const suggestedRequest = input.planned.semanticValidation.blockers.find(
    (blocker) => blocker.suggestedRequest,
  )?.suggestedRequest;
  return {
    status: "failed",
    title: input.title,
    intent: stripSemanticValidation(input.planned),
    queryPlan: {
      status: "blocked",
      source: "meta_ads",
      aggregateFunction: "aggregate_meta_daily_insights",
      requests: [],
    },
    facts: {
      status: "blocked",
      items: [],
    },
    answer: {
      summary: suggestedRequest
        ? `Request blocked. This analysis asks for data outside the governed Meta Ads catalog. Try: "${suggestedRequest}".`
        : "Request blocked. This analysis asks for data outside the governed Meta Ads catalog.",
      citations: [],
      apiCost: workbenchLocalApiCost(),
    },
    sourceNotes: [
      {
        id: "S1",
        label: "Governed semantic validation",
        value: "Request blocked before querying because validation found unsupported or ungoverned data.",
      },
    ],
    validation: {
      status: "blocked",
      blockers: input.planned.semanticValidation.blockers,
      warnings: input.planned.semanticValidation.warnings,
      assumptions: input.planned.semanticValidation.assumptions.map((assumption) => ({
        code: assumption.code,
        message: assumption.message,
      })),
    },
    visualCards: [],
    dashboardPacket: null,
  };
}

function aggregateRequest(
  planned: PlannedIntent,
  dimensions: WorkbenchDimension[],
  limit: number,
): AnalysisWorkbenchPipelineAggregateRequest {
  return {
    start: planned.dateRange.start,
    end: planned.dateRange.end,
    dimensions: dimensions as MetaInsightDimension[],
    metrics: planned.metrics,
    filters: planned.filters,
    sortField: planned.sort.field,
    sortDirection: planned.sort.direction,
    limit,
  };
}

function aggregateRequests(
  planned: PlannedIntent,
  dimensions: WorkbenchDimension[],
  limit: number,
): AnalysisWorkbenchPipelineAggregateRequest[] {
  return planned.filterScopes.map((filters) => ({
    ...aggregateRequest(planned, dimensions, limit),
    filters,
  }));
}

function trendAggregateRequests(planned: PlannedIntent): AnalysisWorkbenchPipelineAggregateRequest[] {
  const dimension = trendDimensionFor(planned);
  if (!dimension) return [];

  return aggregateRequests(planned, [dimension], trendLimit(planned)).map((request) => ({
    ...request,
    sortField: dimension,
    sortDirection: "asc",
  }));
}

async function executeAggregateRequests(input: {
  executeAggregate: PipelineInput["executeAggregate"];
  requests: AnalysisWorkbenchPipelineAggregateRequest[];
  dimensions: WorkbenchDimension[];
  sortField: WorkbenchMetric | WorkbenchDimension;
  sortDirection: "asc" | "desc";
  limit: number;
}) {
  if (!input.requests.length) return [];
  if (input.requests.length === 1) return input.executeAggregate(input.requests[0]);
  const rows = (await Promise.all(input.requests.map((request) => input.executeAggregate(request)))).flat();
  return sortAggregateRows(
    mergeAggregateRowsByDimensions(rows, input.dimensions),
    input.sortField,
    input.sortDirection,
  ).slice(0, input.limit);
}

function computeFacts(
  planned: PlannedIntent,
  groupedRows: MetaInsightAggregateRow[],
  totalRows: MetaInsightAggregateRow[],
  sourceNotes: AnalysisWorkbenchSourceNote[],
) {
  const sourceRows = sourceRowCount(groupedRows, totalRows);
  if (!groupedRows.length && !sourceRows) {
    return {
      status: "empty" as const,
      items: [sourceNoteFact(sourceNotes[0])],
    };
  }

  const totals = totalRows[0] || sumRows(groupedRows);
  const facts: AnalysisWorkbenchComputedFact[] = planned.metrics
    .slice(0, 2)
    .map((metric, index) => totalFact(metric, metricValue(totals, metric), index + 1));
  const rankFact = firstRankFact(planned, groupedRows, facts.length + 1);
  if (rankFact) facts.push(rankFact);
  const comparisonFact = firstComparisonFact(planned, groupedRows, facts.length + 1);
  if (comparisonFact) facts.push(comparisonFact);
  facts.push(sourceNoteFact(sourceNotes[0]));

  return {
    status: "computed" as const,
    items: facts,
  };
}

function composeAnswer(
  planned: PlannedIntent,
  facts: AnalysisWorkbenchComputedFact[],
  sourceNotes: AnalysisWorkbenchSourceNote[],
) {
  const sourceCitation = sourceNoteCitation(sourceNotes[0]);
  const numericFacts = facts.filter((fact) => fact.type !== "source_note");
  if (!numericFacts.length) {
    return {
      summary:
        "No matching Meta Ads rows were found for this governed request. Source notes: Meta Ads daily insights [S1].",
      citations: [sourceCitation],
    };
  }

  const totals = numericFacts.filter((fact) => fact.type === "total");
  const rank = numericFacts.find((fact) => fact.type === "rank");
  const comparison = numericFacts.find((fact) => fact.type === "comparison");
  const totalSentence = totals
    .map(
      (fact) =>
        `${fact.formattedValue} ${metricAnswerLabel(fact.metric)} [${fact.citationId}]`,
    )
    .join("; ");
  const rankSentence = rank
    ? `Top ${dimensionLabel(rank.dimension)} was ${rank.entityName} at ${rank.formattedValue} [${rank.citationId}].`
    : "";
  const comparisonSentence = comparison
    ? `${comparison.entityName} was ${comparison.formattedDeltaValue} above average ${dimensionLabel(
        comparison.dimension,
      )} ${metricLabel(comparison.metric).toLowerCase()} of ${comparison.formattedBaselineValue} [${
        comparison.citationId
      }].`
    : "";
  const caveat = totals.find((fact) => fact.caveat)?.caveat;
  const caveatSentence = caveat ? `Caveat: ${caveat} [${totals.find((fact) => fact.caveat)?.citationId}].` : "";

  return {
    summary: [
      `${outputModeLabel(planned.outputMode)} mode used governed Meta Ads facts. Totals: ${totalSentence}.`,
      rankSentence,
      comparisonSentence,
      "Assumption: relative range ends at latest synced Meta Ads day [S1].",
      caveatSentence,
      "Source notes: Meta Ads daily insights [S1].",
    ]
      .filter(Boolean)
      .join(" "),
    citations: [...numericFacts.map(citationForFact), sourceCitation],
  };
}

function withWorkbenchAnswerApiCost<T extends { summary: string; citations: AnalysisWorkbenchCitation[] }>(
  answer: T,
  planned: PlannedIntent,
) {
  return {
    ...answer,
    apiCost: planned.parser?.apiCost || workbenchLocalApiCost(),
  };
}

function workbenchLocalApiCost(): OpenAICostBreakdown {
  return {
    model: "governed-local",
    inputTokens: 0,
    outputTokens: 0,
    totalTokens: 0,
    estimatedCostUsd: 0,
  };
}

function sourceNotesFor(
  planned: PlannedIntent,
  groupedRows: MetaInsightAggregateRow[],
  totalRows: MetaInsightAggregateRow[],
  controlledEdit: AnalysisWorkbenchControlledEdit | null,
): AnalysisWorkbenchSourceNote[] {
  return [
    {
      id: "S1",
      label: "Data source",
      value: "Meta Ads daily insights via aggregate_meta_daily_insights",
    },
    {
      id: "S2",
      label: "Date range",
      value: `${planned.dateRange.start} to ${planned.dateRange.end}`,
    },
    {
      id: "S3",
      label: "Matched rows",
      value: `${sourceRowCount(groupedRows, totalRows)} matching Meta Ads daily rows`,
    },
    {
      id: "S4",
      label: "Grouping",
      value: planned.dimensions.map(dimensionLabel).join(", ") || "Summary",
    },
    {
      id: "S5",
      label: "Filters",
      value: filtersSourceNote(planned),
    },
    ...(planned.parser
      ? [
          {
            id: "S6",
            label: "Intent parser",
            value: `AI parser ${planned.parser.model} (${planned.parser.confidence} confidence).`,
          },
        ]
      : []),
    ...(controlledEdit && Object.keys(controlledEdit).length
      ? [
          {
            id: planned.parser ? "S7" : "S6",
            label: "Controlled edits",
            value: controlledEditSourceNote(controlledEdit),
          },
        ]
      : []),
  ];
}

function filtersSourceNote(planned: PlannedIntent) {
  if (planned.filterScopes.length > 1) {
    return planned.filterScopes
      .map((scope) => scope.map(formatFilter).join(" and ") || "No filters")
      .join(" OR ");
  }
  return planned.filters.length ? planned.filters.map(formatFilter).join("; ") : "No filters";
}

function formatFilter(filter: MetaInsightFilter) {
  return `${filter.field} ${filter.operator} ${filter.value}`;
}

function buildVisualCards(
  planned: PlannedIntent,
  facts: AnalysisWorkbenchComputedFact[],
  groupedRows: MetaInsightAggregateRow[],
  trendRows: MetaInsightAggregateRow[],
): AnalysisWorkbenchVisualCard[] {
  if (!shouldBuildVisualCards(planned.outputMode)) return [];
  const totalFacts = facts.filter((fact) => fact.type === "total" && fact.metric);
  if (!totalFacts.length) return [];

  const visualCards: AnalysisWorkbenchVisualCard[] = totalFacts.slice(0, 2).map((fact) => ({
    id: `metric_${fact.metric}`,
    type: "metric_card",
    title: `Total ${metricLabel(fact.metric)}`,
    metric: fact.metric as WorkbenchMetric,
    value: typeof fact.value === "number" ? fact.value : null,
    formattedValue: fact.formattedValue || "n/a",
    citationId: fact.citationId,
    sourceNoteIds: ["S1", "S2", "S3"],
    caveats: fact.caveat ? [fact.caveat] : undefined,
    assumptions: visualAssumptions(planned),
  }));

  const dimension = primaryEntityDimension(planned.dimensions);
  const metrics = planned.metrics.slice(0, 4);
  if (dimension && groupedRows.length && metrics.length) {
    visualCards.push(flatTableVisualCard(planned, dimension, metrics, groupedRows));
    visualCards.push(barChartVisualCard(planned, dimension, metrics[0], groupedRows));
  }

  const pivotVisual = pivotVisualIntent(planned);
  if (pivotVisual && groupedRows.length) {
    visualCards.push(pivotTableVisualCard(planned, pivotVisual, groupedRows));
  }

  if (planned.visual?.type === "scatter_chart" && groupedRows.length) {
    visualCards.push(scatterChartVisualCard(planned, planned.visual, groupedRows));
  }

  const trendDimension = trendDimensionFor(planned);
  if (trendDimension && trendRows.some((row) => row[trendDimension]) && metrics[0]) {
    visualCards.push(lineChartVisualCard(planned, metrics[0], trendRows));
  }

  return visualCards;
}

function flatTableVisualCard(
  planned: PlannedIntent,
  dimension: WorkbenchDimension,
  metrics: WorkbenchMetric[],
  groupedRows: MetaInsightAggregateRow[],
): AnalysisWorkbenchVisualCard {
  return {
    id: `table_${dimension}`,
    type: "flat_table",
    title: `${sentenceCase(visualDimensionLabel(dimension))} evidence`,
    columns: [
      { key: "entity", label: sentenceCase(visualDimensionLabel(dimension)), kind: "dimension" },
      ...metrics.map((metric) => ({
        key: metric,
        label: metricLabel(metric),
        kind: "metric" as const,
        metric,
      })),
    ],
    rows: groupedRows.slice(0, 10).map((row) => ({
      entity: entityName(row, dimension),
      ...Object.fromEntries(
        metrics.map((metric) => [
          metric,
          {
            value: metricValue(row, metric),
            formattedValue: formatMetric(metricValue(row, metric), metric),
            metric,
          },
        ]),
      ),
    })),
    sourceNoteIds: ["S1", "S2", "S3", "S4"],
    assumptions: visualAssumptions(planned),
  };
}

function barChartVisualCard(
  planned: PlannedIntent,
  dimension: WorkbenchDimension,
  metric: WorkbenchMetric,
  groupedRows: MetaInsightAggregateRow[],
): AnalysisWorkbenchVisualCard {
  return {
    id: `bar_${dimension}_${metric}`,
    type: "bar_chart",
    title: `${metricLabel(metric)} by ${visualDimensionLabel(dimension)}`,
    metric,
    dimension,
    bars: [...groupedRows]
      .sort((a, b) => metricValue(b, metric) - metricValue(a, metric))
      .slice(0, 8)
      .map((row) => {
        const value = metricValue(row, metric);
        return {
          label: entityName(row, dimension),
          value,
          formattedValue: formatMetric(value, metric),
        };
      }),
    sourceNoteIds: ["S1", "S2", "S3", "S4"],
    assumptions: visualAssumptions(planned),
  };
}

function lineChartVisualCard(
  planned: PlannedIntent,
  metric: WorkbenchMetric,
  trendRows: MetaInsightAggregateRow[],
): AnalysisWorkbenchVisualCard {
  const dimension = trendDimensionFor(planned) || "date";
  return {
    id: `line_${dimension}_${metric}`,
    type: "line_chart",
    title: `${metricLabel(metric)} trend`,
    metric,
    dimension,
    points: trendRows
      .filter((row) => row[dimension])
      .map((row) => {
        const value = metricValue(row, metric);
        return {
          label: String(row[dimension] || ""),
          value,
          formattedValue: formatMetric(value, metric),
        };
      }),
    sourceNoteIds: ["S1", "S2", "S3"],
    assumptions: visualAssumptions(planned),
  };
}

function pivotTableVisualCard(
  planned: PlannedIntent,
  visual: WorkbenchSemanticVisualIntent & {
    rowDimension: WorkbenchDimension;
    columnDimension: WorkbenchDimension;
  },
  groupedRows: MetaInsightAggregateRow[],
): AnalysisWorkbenchVisualCard {
  const metric = visual.metrics?.find(isWorkbenchMetric) || planned.metrics[0] || "spend";
  const columnLabels = unique(
    groupedRows.map((row) => dimensionValue(row, visual.columnDimension)),
  ).slice(0, 12);
  const rowLabels = unique(
    groupedRows.map((row) => dimensionValue(row, visual.rowDimension)),
  ).slice(0, 10);

  return {
    id: `pivot_${visual.rowDimension}_${visual.columnDimension}_${metric}`,
    type: "pivot_table",
    title: `${metricLabel(metric)} by ${visualDimensionLabel(
      visual.rowDimension,
    )} and ${visualDimensionLabel(visual.columnDimension)}`,
    rowDimension: visual.rowDimension,
    columnDimension: visual.columnDimension,
    metric,
    columns: columnLabels.map((label) => ({ key: label, label })),
    rows: rowLabels.map((rowLabel) => {
      const cells = Object.fromEntries(
        columnLabels.map((columnLabel) => {
          const value = groupedRows
            .filter(
              (row) =>
                dimensionValue(row, visual.rowDimension) === rowLabel &&
                dimensionValue(row, visual.columnDimension) === columnLabel,
            )
            .reduce((sum, row) => sum + metricValue(row, metric), 0);

          return [
            columnLabel,
            {
              value,
              formattedValue: formatMetric(value, metric),
              metric,
            },
          ];
        }),
      );
      const totalValue = Object.values(cells).reduce(
        (sum, cell) => sum + (typeof cell.value === "number" ? cell.value : 0),
        0,
      );

      return {
        rowLabel,
        cells,
        total: {
          value: totalValue,
          formattedValue: formatMetric(totalValue, metric),
          metric,
        },
      };
    }),
    sourceNoteIds: ["S1", "S2", "S3", "S4"],
    caveats: metricCaveat(metric) ? [metricCaveat(metric) as string] : undefined,
    assumptions: visualAssumptions(planned),
  };
}

function scatterChartVisualCard(
  planned: PlannedIntent,
  visual: WorkbenchSemanticVisualIntent,
  groupedRows: MetaInsightAggregateRow[],
): AnalysisWorkbenchVisualCard {
  const dimension =
    visual.dimensions?.find(
      (candidate): candidate is WorkbenchDimension =>
        isWorkbenchDimension(candidate) && ENTITY_DIMENSIONS.has(candidate),
    ) ||
    primaryEntityDimension(planned.dimensions) ||
    "campaign_umbrella";
  const metrics = (visual.metrics || []).filter(isWorkbenchMetric);
  const xMetric = metrics[0] || planned.metrics[0] || "spend";
  const yMetric = metrics[1] || planned.metrics.find((metric) => metric !== xMetric) || "cpl";

  return {
    id: `scatter_${dimension}_${xMetric}_${yMetric}`,
    type: "scatter_chart",
    title: `${metricLabel(xMetric)} versus ${metricLabel(yMetric)} by ${visualDimensionLabel(
      dimension,
    )}`,
    dimension,
    xMetric,
    yMetric,
    points: groupedRows.slice(0, 20).map((row) => {
      const x = metricValue(row, xMetric);
      const y = metricValue(row, yMetric);
      return {
        label: dimensionValue(row, dimension),
        x,
        y,
        formattedX: formatMetric(x, xMetric),
        formattedY: formatMetric(y, yMetric),
      };
    }),
    sourceNoteIds: ["S1", "S2", "S3", "S4"],
    caveats: [metricCaveat(xMetric), metricCaveat(yMetric)].filter(Boolean) as string[],
    assumptions: visualAssumptions(planned),
  };
}

function shouldBuildVisualCards(outputMode: AnalysisOutputMode) {
  return outputMode === "answer_visuals" || outputMode === "full_dashboard";
}

function visualAssumptions(planned: PlannedIntent) {
  return [
    ...planned.dateAssumptions.map((assumption) => assumption.message),
    ...(planned.parser?.assumptions || []).map((assumption) => assumption.message),
    ...planned.semanticValidation.assumptions.map((assumption) => assumption.message),
  ];
}

function controlledEditSourceNote(edit: AnalysisWorkbenchControlledEdit) {
  const parts = [
    edit.dateRange ? `date ${edit.dateRange.start} to ${edit.dateRange.end}` : "",
    edit.filters ? `${edit.filters.length} filter edits` : "",
    edit.metrics ? `metrics ${edit.metrics.map(metricLabel).join(", ") || "cleared"}` : "",
    edit.dimensions
      ? `grouping ${edit.dimensions.map(dimensionLabel).join(", ") || "cleared"}`
      : "",
    edit.sort ? `sort ${controlledEditFieldLabel(edit.sort.field)} ${edit.sort.direction}` : "",
    edit.limit ? `limit ${edit.limit}` : "",
    edit.visual ? `visual ${sentenceCase(edit.visual.type.replace(/_/g, " "))}` : "",
    edit.objectTitles ? "object titles edited" : "",
    edit.insightVisibility ? "insight visibility edited" : "",
  ].filter(Boolean);

  return parts.length
    ? `Applied governed dashboard edits: ${parts.join("; ")}.`
    : "Applied governed dashboard edits.";
}

function controlledEditFieldLabel(field: WorkbenchMetric | WorkbenchDimension) {
  return isWorkbenchMetric(field) ? metricLabel(field) : dimensionLabel(field);
}

function totalFact(
  metric: WorkbenchMetric,
  value: number | null,
  index: number,
): AnalysisWorkbenchComputedFact {
  return {
    id: `fact_total_${metric}`,
    type: "total",
    label: `Total ${metricLabel(metric)}`,
    metric,
    value,
    formattedValue: formatMetric(value, metric),
    citationId: `F${index}`,
    caveat: metricCaveat(metric),
  };
}

function firstRankFact(
  planned: PlannedIntent,
  groupedRows: MetaInsightAggregateRow[],
  citationIndex: number,
): AnalysisWorkbenchComputedFact | null {
  const metric = planned.metrics[0];
  const dimension = primaryEntityDimension(planned.dimensions);
  if (!metric || !dimension || !groupedRows.length) return null;
  const topRow = [...groupedRows].sort((a, b) => metricValue(b, metric) - metricValue(a, metric))[0];
  const value = metricValue(topRow, metric);

  return {
    id: `fact_top_${dimension}_${metric}`,
    type: "rank",
    label: `Top ${dimensionLabel(dimension)} by ${metricLabel(metric)}`,
    metric,
    dimension,
    entityName: entityName(topRow, dimension),
    value,
    formattedValue: formatMetric(value, metric),
    citationId: `F${citationIndex}`,
  };
}

function firstComparisonFact(
  planned: PlannedIntent,
  groupedRows: MetaInsightAggregateRow[],
  citationIndex: number,
): AnalysisWorkbenchComputedFact | null {
  const metric = planned.metrics[0];
  const dimension = primaryEntityDimension(planned.dimensions);
  if (!metric || !dimension || groupedRows.length < 2) return null;
  const topRow = [...groupedRows].sort((a, b) => metricValue(b, metric) - metricValue(a, metric))[0];
  const value = metricValue(topRow, metric);
  const baselineValue = groupedRows.reduce((sum, row) => sum + metricValue(row, metric), 0) / groupedRows.length;
  const deltaValue = value - baselineValue;

  return {
    id: `fact_${dimension}_${metric}_vs_average`,
    type: "comparison",
    label: `${dimensionLabel(dimension)} ${metricLabel(metric)} vs average`,
    metric,
    dimension,
    entityName: entityName(topRow, dimension),
    value,
    formattedValue: formatMetric(value, metric),
    baselineLabel: `average ${dimensionLabel(dimension)}`,
    baselineValue,
    formattedBaselineValue: formatMetric(baselineValue, metric),
    deltaValue,
    formattedDeltaValue: formatMetric(deltaValue, metric),
    citationId: `F${citationIndex}`,
  };
}

function sourceNoteFact(note: AnalysisWorkbenchSourceNote): AnalysisWorkbenchComputedFact {
  return {
    id: "fact_source_rows",
    type: "source_note",
    label: note.label,
    value: note.value,
    formattedValue: note.value,
    citationId: "S1",
  };
}

function citationForFact(fact: AnalysisWorkbenchComputedFact): AnalysisWorkbenchCitation {
  return {
    id: fact.citationId,
    kind: "fact",
    label: fact.label,
    value: fact.value,
    formattedValue: fact.formattedValue,
    values: [fact.value ?? null, fact.baselineValue ?? null, fact.deltaValue ?? null],
    formattedValues: [
      fact.formattedValue || "",
      fact.formattedBaselineValue || "",
      fact.formattedDeltaValue || "",
    ].filter(Boolean),
    metric: fact.metric,
    entityName: fact.entityName,
  };
}

function sourceNoteCitation(note: AnalysisWorkbenchSourceNote): AnalysisWorkbenchCitation {
  return {
    id: "S1",
    kind: "source_note",
    label: note.label,
    value: note.value,
    formattedValue: note.value,
  };
}

function detectMetrics(prompt: string, useDefault = true): WorkbenchMetric[] {
  const normalizedPrompt = normalizeToken(prompt);
  const catalog = getAnalysisWorkbenchSemanticCatalog();
  const detected = catalog.metrics
    .filter((metric) =>
      [metric.key, metric.label, ...metric.aliases].some((label) =>
        phraseAppears(normalizedPrompt, normalizeToken(label)),
      ),
    )
    .map((metric) => metric.key);

  const metrics = refineDetectedMetrics(prompt, unique(detected)).slice(0, 4);
  return metrics.length ? metrics : useDefault ? DEFAULT_METRICS : [];
}

function refineDetectedMetrics(prompt: string, metrics: WorkbenchMetric[]): WorkbenchMetric[] {
  const lower = prompt.toLowerCase();
  if (/\bnew\s+messages?\b|\bnew\s+messaging\s+contacts?\b|\bfirst\s+repl(?:y|ies)\b/.test(lower)) {
    return metrics.filter((metric) => metric !== "messaging_contacts");
  }
  if (primaryKpiRankingRequested(lower) && metrics.includes("primary_results")) {
    return [
      "primary_results",
      ...metrics.filter(
        (metric) => metric !== "primary_results" && !PRIMARY_KPI_PROXY_METRICS.has(metric),
      ),
    ];
  }
  return metrics;
}

function primaryKpiRankingRequested(lower: string) {
  return /\b(?:in\s+terms\s+of|based\s+on|using|rank(?:ed)?\s+by|sort(?:ed)?\s+by)\s+(?:primary\s+)?kpi\b|\bby\s+primary\s+(?:kpi|results)\b/.test(
    lower,
  );
}

function detectVisualIntent(
  prompt: string,
  metrics: WorkbenchMetric[],
  dimensions: WorkbenchDimension[],
): WorkbenchSemanticVisualIntent | null {
  const lower = prompt.toLowerCase();

  if (/\b(pivot|cross[-\s]?tab|crosstab|matrix|row[-\s]?by[-\s]?column)\b/.test(lower)) {
    return {
      type: "pivot_table",
      metrics,
      dimensions,
    };
  }

  if (
    /\b(scatter|correlation|relationship|plot)\b/.test(lower) ||
    (metrics.length >= 2 && /\b(?:versus|vs\.?)\b/.test(lower))
  ) {
    return {
      type: "scatter_chart",
      metrics,
      dimensions,
    };
  }

  if (/\bline\s+chart\b|\btrend\b/.test(lower)) {
    return {
      type: "line_chart",
      metrics,
      dimensions,
    };
  }

  if (/\bbar\s+chart\b|\bbars?\b/.test(lower)) {
    return {
      type: "bar_chart",
      metrics,
      dimensions,
    };
  }

  return null;
}

function detectSortDirection(prompt: string): "asc" | "desc" {
  const lower = prompt.toLowerCase();
  if (/\blowest\b|\bleast\b|\bcheapest\b|\bsmallest\b|\bminimum\b|\bmin\b|\bbottom\b/.test(lower)) {
    return "asc";
  }
  return "desc";
}

function detectLimit(prompt: string) {
  const lower = prompt.toLowerCase();
  const explicit =
    lower.match(new RegExp(`\\btop\\s+(${NUMBER_PATTERN})\\b`)) ||
    lower.match(
      new RegExp(
        `\\b(${NUMBER_PATTERN})\\s+(?:top|highest|best|lowest|cheapest|ranked|ranking|leaders?)\\b`,
      ),
    );
  if (!explicit) return null;
  const limit = wordNumber(explicit[1]);
  if (!limit) return null;
  return Math.min(Math.max(limit, 1), MAX_GROUP_ROWS);
}

function inferQuestionType(prompt: string): WorkbenchQuestionType {
  const lower = prompt.toLowerCase();
  if (/\b(?:why|drop|dropped|decline|declined|changed|what changed|anomaly|diagnos(?:e|is)|explain)\b/.test(lower)) {
    return "diagnosis";
  }
  if (/\b(?:recommend|should|pause|scale|waste|fatigue|fix first|next action|what to do)\b/.test(lower)) {
    return "recommendation";
  }
  if (/\b(?:compare|versus|vs\.?|against|previous|prior|from .* to)\b/.test(lower)) {
    return "comparison";
  }
  if (/\b(?:trend|over time|week[-\s]?by[-\s]?week|day[-\s]?by[-\s]?day|month[-\s]?by[-\s]?month|daily|weekly|monthly|quarterly)\b/.test(lower)) {
    return "trend";
  }
  return "leaderboard";
}

function dimensionsForDateIntent(
  dimensions: WorkbenchDimension[],
  dateGrain: WorkbenchDateGrain | null,
  questionType: WorkbenchQuestionType,
  visual: WorkbenchSemanticVisualIntent | null,
): WorkbenchDimension[] {
  const dateDimension = dateGrainToDimension(dateGrain);
  if (!dateDimension) return dimensions;
  const wantsTimeSeries =
    questionType === "trend" ||
    visual?.type === "line_chart" ||
    dimensions.some((dimension) => ["date", "week", "month", "quarter"].includes(dimension));
  if (!wantsTimeSeries || dimensions.includes(dateDimension)) return dimensions;
  return unique([dateDimension, ...dimensions]).slice(0, 3);
}

function preferredDateIntent(
  inferredDateIntent: ReturnType<typeof inferAnalysisWorkbenchDateIntentFromPrompt>,
  plannerDateIntent: WorkbenchPlannerIntent["dateIntent"] | null,
) {
  if (inferredDateIntent && inferredDateIntent.kind !== "inherit_or_default") {
    return inferredDateIntent;
  }

  return plannerDateIntent || inferredDateIntent;
}

function trendSortField(
  questionType: WorkbenchQuestionType,
  dimensions: WorkbenchDimension[],
): WorkbenchTimeDimension | null {
  if (questionType !== "trend") return null;
  const timeDimension = dimensions.find(isTimeDimension);
  return timeDimension || null;
}

function defaultLimitForIntent(input: {
  requestedLimit: number | null;
  dateRange: AnalysisWorkbenchPipelineIntent["dateRange"];
  dateGrain: WorkbenchDateGrain | null;
  dimensions: WorkbenchDimension[];
  questionType: WorkbenchQuestionType;
}) {
  const timeSeries = trendSortField(input.questionType, input.dimensions);
  if (timeSeries) {
    return Math.max(input.requestedLimit || 0, dateBucketLimit(input.dateRange, input.dateGrain));
  }
  return input.requestedLimit || MAX_GROUP_ROWS;
}

function trendDimensionFor(planned: PlannedIntent): WorkbenchTimeDimension | null {
  const dateGrainDimension = dateGrainToDimension(planned.dateGrain);
  if (isTimeDimension(dateGrainDimension)) return dateGrainDimension;
  return planned.dimensions.find(isTimeDimension) || "date";
}

function trendLimit(planned: PlannedIntent) {
  return Math.max(planned.limit, dateBucketLimit(planned.dateRange, planned.dateGrain || "day"));
}

function detectDimensions(prompt: string, useDefault = true): WorkbenchDimension[] {
  const lower = prompt.toLowerCase();
  const dimensions: WorkbenchDimension[] = [];
  if (/\bby\s+(?:day|date)\b|\band\s+(?:day|date)\b|\bdaily\b|\bper\s+day\b|\bevery\s+day\b|\beach\s+day\b|\bday[-\s]?by[-\s]?day\b/.test(lower)) {
    dimensions.push("date");
  }
  if (/\bby\s+week\b|\band\s+week\b|\bweekly\b|\bper\s+week\b|\beach\s+week\b/.test(lower)) dimensions.push("week");
  if (/\bby\s+month\b|\band\s+month\b|\bmonthly\b(?!\s+budget)|\bper\s+month\b|\beach\s+month\b/.test(lower)) dimensions.push("month");
  if (/\bby\s+quarter\b|\band\s+quarter\b|\bquarterly\b|\bper\s+quarter\b|\beach\s+quarter\b/.test(lower)) dimensions.push("quarter");
  if (/\bby\s+brands?\b|\bper\s+brands?\b|\bacross\s+brands?\b|\bwhich\s+brands?\b|\bcompare\s+brands?\b|\bbrands?\s+by\b|\bbrands?\s+(?:rows?|columns?)\b/.test(lower)) {
    dimensions.push("brand");
  }
  const mentionsCampaignGroup =
    /\bby\s+(?:campaign\s+)?(?:groups?|umbrellas?)\b|\bcampaign\s+umbrella\b|\bcampaign\s+groups?\s+(?:rows?|columns?)?\b/.test(
      lower,
    );
  if (mentionsCampaignGroup) {
    dimensions.push("campaign_umbrella");
  } else if (
    /\bby\s+campaigns?\b|\bacross\s+campaigns?\b|\bwhich\s+campaigns?\b|\btop\s+(?:\d+\s+)?(?:ranked\s+)?campaigns?\b|\branked\s+campaigns?\b|\bcampaigns?\s+(?:had|changed|drove|generated|performed|performing)\b/.test(
      lower,
    )
  ) {
    dimensions.push("campaign");
  }
  if (/\bby\s+ad\s+sets?\b|\bby\s+adsets?\b|\bwhich\s+ad\s+sets?\b|\btop\s+(?:\d+\s+)?(?:ranked\s+)?ad\s+sets?\b|\branked\s+ad\s+sets?\b|\bad\s+sets?\s+in\b|\badsets?\s+in\b/.test(lower)) {
    dimensions.push("ad_set");
  }
  if (
    /\bby\s+ads?\b(?!\s+(?:sets?|creatives?))|\bper\s+ads?\b(?!\s+(?:sets?|creatives?))|\bwhich\s+ads?\b(?!\s+(?:sets?|creatives?))|\btop\s+(?:\d+\s+)?(?:ranked\s+)?ads?\b(?!\s+(?:sets?|creatives?))/.test(
      lower,
    )
  ) {
    dimensions.push("ad");
  }
  if (
    /\bby\s+(?:ad\s+)?creatives?\b|\bwhich\s+(?:ad\s+)?creatives?\b|\btop\s+(?:\d+\s+)?(?:ranked\s+)?(?:ad\s+)?creatives?\b|\branked\s+(?:ad\s+)?creatives?\b|\b(?:ad\s+)?creatives?\s+in\b/.test(
      lower,
    )
  ) {
    dimensions.push("creative");
  }

  const detected = unique(dimensions).slice(0, 3);
  return detected.length ? detected : useDefault ? DEFAULT_DIMENSIONS : [];
}

function dimensionsForVisual(
  dimensions: WorkbenchDimension[],
  visual: WorkbenchSemanticVisualIntent | null,
): WorkbenchDimension[] {
  if (!visual) return dimensions;

  return unique([
    ...dimensions,
    ...(visual.dimensions || []).filter(isWorkbenchDimension),
    ...(visual.rowDimension && isWorkbenchDimension(visual.rowDimension)
      ? [visual.rowDimension]
      : []),
    ...(visual.columnDimension && isWorkbenchDimension(visual.columnDimension)
      ? [visual.columnDimension]
      : []),
  ]).slice(0, 3);
}

function pivotVisualIntent(
  planned: PlannedIntent,
): (WorkbenchSemanticVisualIntent & {
  rowDimension: WorkbenchDimension;
  columnDimension: WorkbenchDimension;
}) | null {
  if (
    planned.visual?.type === "pivot_table" &&
    planned.visual.rowDimension &&
    planned.visual.columnDimension &&
    isWorkbenchDimension(planned.visual.rowDimension) &&
    isWorkbenchDimension(planned.visual.columnDimension)
  ) {
    return {
      ...planned.visual,
      rowDimension: planned.visual.rowDimension,
      columnDimension: planned.visual.columnDimension,
    };
  }

  if (planned.visual) return null;

  const rowDimension = planned.dimensions.find((dimension) => ENTITY_DIMENSIONS.has(dimension));
  const columnDimension = planned.dimensions.find(
    (dimension) => dimension === "date" || dimension === "week" || dimension === "month" || dimension === "quarter",
  );
  if (!rowDimension || !columnDimension || rowDimension === columnDimension) return null;

  return {
    type: "pivot_table",
    metrics: planned.metrics.slice(0, 1),
    dimensions: planned.dimensions,
    rowDimension,
    columnDimension,
  };
}

function detectFilters(prompt: string): WorkbenchSemanticFilter[] {
  const filters: WorkbenchSemanticFilter[] = [];
  const lower = prompt.toLowerCase();
  const campaignUmbrellas: Array<[RegExp, string]> = [
    [/\bcash\s+for\s+gold\b/, "Cash for Gold US"],
    [/\bbook\s+(?:appts?|appointments?)\b/, "Book Appts US"],
    [/\bfacebook\s+us\s+product\b|\bus\s+product\b/, "Facebook US Product"],
    [/\bfacebook\s+vn\s+product\b|\bvn\s+product\b/, "Facebook VN Product"],
  ];

  campaignUmbrellas.forEach(([pattern, value]) => {
    if (pattern.test(lower)) {
      filters.push({ field: "campaign_umbrella", operator: "equals", value });
    }
  });

  if (/\bhung\s+phat\b|\bhp\b/.test(lower)) {
    filters.push({ field: "brand", operator: "equals", value: "HP" });
  } else if (/\bvvs\b/.test(lower)) {
    filters.push({ field: "brand", operator: "equals", value: "VVS" });
  }

  return uniqueFilters(filters);
}

function normalizeSemanticFilters(filters: WorkbenchSemanticFilter[]) {
  const deduped = uniqueFilters(
    filters.map((filter) => {
      if (filter.field !== "campaign") return filter;
      const umbrellaAlias = campaignUmbrellaAliasForText(filter.value);
      return umbrellaAlias
        ? { field: "campaign_umbrella", operator: "equals", value: umbrellaAlias }
        : filter;
    }),
  );
  const umbrellaValues = new Set(
    deduped
      .filter((filter) => filter.field === "campaign_umbrella" && filter.operator === "equals")
      .map((filter) => filter.value),
  );
  if (!umbrellaValues.size) return deduped;

  return deduped.filter((filter) => {
    if (filter.field !== "campaign") return true;
    const umbrellaAlias = campaignUmbrellaAliasForText(filter.value);
    return !umbrellaAlias || !umbrellaValues.has(umbrellaAlias);
  });
}

function campaignUmbrellaAliasForText(value: string) {
  const normalized = normalizeToken(value);
  const aliases: Record<string, string> = {
    "book appt": "Book Appts US",
    "book appts": "Book Appts US",
    "book appointment": "Book Appts US",
    "book appointments": "Book Appts US",
    appointments: "Book Appts US",
    "cash for gold": "Cash for Gold US",
    "facebook us product": "Facebook US Product",
    "us product": "Facebook US Product",
    "facebook vn product": "Facebook VN Product",
    "vn product": "Facebook VN Product",
  };

  return aliases[normalized] || null;
}

function buildFilterScopes(filters: MetaInsightFilter[]) {
  const exactFiltersByField = new Map<MetaInsightFilter["field"], MetaInsightFilter[]>();
  filters.forEach((filter) => {
    if (filter.operator !== "equals") return;
    const existing = exactFiltersByField.get(filter.field) || [];
    exactFiltersByField.set(filter.field, [...existing, filter]);
  });

  const conflictingExactFilterGroups = Array.from(exactFiltersByField.values())
    .map((group) => uniqueMetaInsightFilters(group))
    .filter((group) => group.length > 1);

  if (!conflictingExactFilterGroups.length) return [filters];

  const conflictingFields = new Set(
    conflictingExactFilterGroups.flatMap((group) => group.map((filter) => filter.field)),
  );
  const sharedFilters = filters.filter(
    (filter) => filter.operator !== "equals" || !conflictingFields.has(filter.field),
  );

  return conflictingExactFilterGroups.reduce<MetaInsightFilter[][]>(
    (scopes, group) =>
      scopes.flatMap((scope) =>
        group.map((filter) => uniqueMetaInsightFilters([...scope, filter])),
      ),
    [sharedFilters],
  );
}

function uniqueMetaInsightFilters(filters: MetaInsightFilter[]) {
  return uniqueFilters(filters) as MetaInsightFilter[];
}

function wordNumber(value: string) {
  const words: Record<string, number> = {
    one: 1,
    two: 2,
    three: 3,
    four: 4,
    five: 5,
    six: 6,
    seven: 7,
    eight: 8,
    nine: 9,
    ten: 10,
    eleven: 11,
    twelve: 12,
    thirteen: 13,
    fourteen: 14,
    fifteen: 15,
    sixteen: 16,
    seventeen: 17,
    eighteen: 18,
    nineteen: 19,
    twenty: 20,
    thirty: 30,
    ninety: 90,
  };
  return Number.isFinite(Number(value)) ? Number(value) : words[value];
}

function stripSemanticValidation(planned: PlannedIntent): AnalysisWorkbenchPipelineIntent {
  const intent: Partial<PlannedIntent> = { ...planned };
  delete intent.semanticValidation;
  delete intent.filterScopes;
  delete intent.dateAssumptions;
  return intent as AnalysisWorkbenchPipelineIntent;
}

function sourceRowCount(groupedRows: MetaInsightAggregateRow[], totalRows: MetaInsightAggregateRow[]) {
  const totalSourceRows = totalRows[0]?.source_rows;
  if (totalSourceRows) return totalSourceRows;
  return groupedRows.reduce((sum, row) => sum + row.source_rows, 0);
}

function sumRows(rows: MetaInsightAggregateRow[]) {
  return rows.reduce((sum, row) => {
    sum.spend += row.spend;
    sum.monthly_budget += row.monthly_budget;
    sum.impressions += row.impressions;
    sum.reach += row.reach;
    sum.clicks += row.clicks;
    sum.leads += row.leads;
    sum.bookings += row.bookings;
    sum.conversions += row.conversions;
    sum.website_bookings += row.website_bookings;
    sum.messaging_contacts += row.messaging_contacts;
    sum.new_messaging_contacts += row.new_messaging_contacts;
    sum.primary_results += row.primary_results;
    sum.secondary_results += row.secondary_results;
    sum.ctr = sum.impressions > 0 ? (sum.clicks / sum.impressions) * 100 : 0;
    sum.cpm = sum.impressions > 0 ? (sum.spend / sum.impressions) * 1000 : 0;
    sum.cpc = sum.clicks > 0 ? sum.spend / sum.clicks : 0;
    sum.cpl = sum.leads > 0 ? sum.spend / sum.leads : null;
    sum.frequency = sum.reach > 0 ? sum.impressions / sum.reach : 0;
    sum.source_rows += row.source_rows;
    return sum;
  }, emptyAggregateRow());
}

function mergeAggregateRowsByDimensions(
  rows: MetaInsightAggregateRow[],
  dimensions: WorkbenchDimension[],
) {
  if (!rows.length) return [];
  if (!dimensions.length) return [sumRows(rows)];

  const groups = new Map<string, MetaInsightAggregateRow[]>();
  rows.forEach((row) => {
    const key = dimensions.map((dimension) => dimensionValue(row, dimension)).join("\0");
    groups.set(key, [...(groups.get(key) || []), row]);
  });

  return Array.from(groups.values()).map((groupRows) => {
    const merged = sumRows(groupRows);
    const first = groupRows[0];
    dimensions.forEach((dimension) => copyDimensionValue(merged, first, dimension));
    return merged;
  });
}

function copyDimensionValue(
  target: MetaInsightAggregateRow,
  source: MetaInsightAggregateRow,
  dimension: WorkbenchDimension,
) {
  target[dimension] = source[dimension];
  if (dimension === "campaign") target.campaign_id = source.campaign_id;
  if (dimension === "ad_set") target.ad_set_id = source.ad_set_id;
  if (dimension === "ad") target.ad_id = source.ad_id;
  if (dimension === "creative") target.creative_id = source.creative_id;
}

function sortAggregateRows(
  rows: MetaInsightAggregateRow[],
  sortField: WorkbenchMetric | WorkbenchDimension,
  sortDirection: "asc" | "desc",
) {
  return [...rows].sort((a, b) => {
    const left = aggregateSortValue(a, sortField);
    const right = aggregateSortValue(b, sortField);
    const compared =
      typeof left === "number" && typeof right === "number"
        ? left - right
        : String(left).localeCompare(String(right));
    return sortDirection === "asc" ? compared : -compared;
  });
}

function aggregateSortValue(
  row: MetaInsightAggregateRow,
  sortField: WorkbenchMetric | WorkbenchDimension,
) {
  return isWorkbenchMetric(sortField) ? metricValue(row, sortField) : dimensionValue(row, sortField);
}

function emptyAggregateRow(): MetaInsightAggregateRow {
  return {
    date: null,
    week: null,
    month: null,
    quarter: null,
    brand: null,
    campaign_umbrella: null,
    campaign: null,
    campaign_id: null,
    ad_set: null,
    ad_set_id: null,
    ad: null,
    ad_id: null,
    creative: null,
    creative_id: null,
    spend: 0,
    monthly_budget: 0,
    impressions: 0,
    reach: 0,
    clicks: 0,
    leads: 0,
    bookings: 0,
    conversions: 0,
    website_bookings: 0,
    messaging_contacts: 0,
    new_messaging_contacts: 0,
    primary_results: 0,
    secondary_results: 0,
    ctr: 0,
    cpm: 0,
    cpc: 0,
    cpl: null,
    frequency: 0,
    source_rows: 0,
  };
}

function metricValue(row: MetaInsightAggregateRow, metric: WorkbenchMetric) {
  if (
    metric === "campaign_count" ||
    metric === "ad_set_count" ||
    metric === "ad_count" ||
    metric === "creative_count"
  ) {
    return 0;
  }

  return Number(row[metric] || 0);
}

function entityName(row: MetaInsightAggregateRow, dimension: WorkbenchDimension) {
  const value = row[dimension];
  if (value) return String(value);
  if (dimension === "campaign_umbrella") return "Needs review";
  if (dimension === "campaign") return row.campaign_id || "Unknown campaign";
  if (dimension === "ad_set") return row.ad_set_id || "Unknown ad set";
  if (dimension === "ad") return row.ad_id || "Unknown ad";
  if (dimension === "creative") return row.creative_id || "Unknown creative";
  return "All Meta Ads";
}

function dimensionValue(row: MetaInsightAggregateRow, dimension: WorkbenchDimension) {
  const value = row[dimension];
  if (value) return String(value);
  if (ENTITY_DIMENSIONS.has(dimension)) return entityName(row, dimension);
  return "Unspecified";
}

function primaryEntityDimension(dimensions: WorkbenchDimension[]) {
  return dimensions.find((dimension) => ENTITY_DIMENSIONS.has(dimension)) || dimensions[0] || null;
}

function isWorkbenchMetric(value: unknown): value is WorkbenchMetric {
  return (
    typeof value === "string" &&
    getAnalysisWorkbenchSemanticCatalog().metrics.some((definition) => definition.key === value)
  );
}

function isWorkbenchDimension(value: unknown): value is WorkbenchDimension {
  return (
    typeof value === "string" &&
    getAnalysisWorkbenchSemanticCatalog().dimensions.some((definition) => definition.key === value)
  );
}

function isTimeDimension(value: unknown): value is WorkbenchTimeDimension {
  return value === "date" || value === "week" || value === "month" || value === "quarter";
}

function metricLabel(metric?: WorkbenchMetric) {
  if (!metric) return "Metric";
  return (
    getAnalysisWorkbenchSemanticCatalog().metrics.find((definition) => definition.key === metric)?.label ||
    metric
  );
}

function metricAnswerLabel(metric?: WorkbenchMetric) {
  const label = metricLabel(metric);
  return metric === "primary_results" ? label : label.toLowerCase();
}

function dimensionLabel(dimension?: WorkbenchDimension | null) {
  if (!dimension) return "group";
  return (
    getAnalysisWorkbenchSemanticCatalog().dimensions.find((definition) => definition.key === dimension)?.label ||
    dimension
  ).toLowerCase();
}

function visualDimensionLabel(dimension?: WorkbenchDimension | null) {
  if (dimension === "campaign_umbrella") return "campaign group";
  return dimensionLabel(dimension);
}

function metricCaveat(metric: WorkbenchMetric) {
  return getAnalysisWorkbenchSemanticCatalog().metrics.find((definition) => definition.key === metric)
    ?.caveat;
}

function outputModeLabel(outputMode: AnalysisOutputMode) {
  if (outputMode === "answer_only") return "Answer only";
  if (outputMode === "full_dashboard") return "Full dashboard";
  return "Answer + visuals";
}

function sentenceCase(value: string) {
  return value ? `${value[0].toUpperCase()}${value.slice(1)}` : value;
}

function formatMetric(value: number | null | undefined, metric: WorkbenchMetric) {
  if (value === null || value === undefined) return "n/a";
  if (MONEY_METRICS.has(metric)) return formatMoney(value);
  if (RATE_METRICS.has(metric)) return `${formatNumber(value)}%`;
  if (RATIO_METRICS.has(metric)) return formatNumber(value);
  return formatNumber(value);
}

function formatMoney(value: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: Number.isInteger(value) ? 0 : 2,
  }).format(value);
}

function formatNumber(value: number) {
  return new Intl.NumberFormat("en-US", {
    maximumFractionDigits: Number.isInteger(value) ? 0 : 2,
  }).format(value);
}

function normalizeNumericClaim(value: unknown) {
  if (value === null || value === undefined || value === "") return null;
  const normalized = String(value).replace(/[$,%]/g, "").replace(/,/g, "").trim();
  const parsed = Number(normalized);
  if (!Number.isFinite(parsed)) return null;
  return String(Number(parsed.toFixed(4)));
}

function phraseAppears(normalizedPrompt: string, normalizedPhrase: string) {
  if (!normalizedPhrase) return false;
  return new RegExp(`(?:^|\\s)${escapeRegex(normalizedPhrase)}(?:\\s|$)`).test(normalizedPrompt);
}

function unique<T>(values: T[]): T[] {
  return Array.from(new Set(values));
}

function uniqueFilters(filters: WorkbenchSemanticFilter[]) {
  const seen = new Set<string>();
  return filters.filter((filter) => {
    const key = `${filter.field}\0${filter.operator}\0${filter.value}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function normalizePrompt(prompt: string) {
  return prompt.trim().replace(/\s+/g, " ");
}

function titleFromPrompt(prompt: string) {
  return prompt.length > 90 ? `${prompt.slice(0, 87)}...` : prompt;
}

function normalizeToken(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function escapeRegex(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
