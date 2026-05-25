import { format, parseISO, subDays } from "date-fns";

import {
  getAnalysisWorkbenchSemanticCatalog,
  validateAnalysisWorkbenchSemanticIntent,
  type WorkbenchDimension,
  type WorkbenchMetric,
  type WorkbenchSemanticFilter,
  type WorkbenchSemanticIssue,
} from "./analysis-workbench-semantic-catalog.ts";
import type { AnalysisOutputMode, AnalysisRunStatus } from "./analysis-workbench-contract.ts";
import type {
  MetaInsightAggregateRow,
  MetaInsightDimension,
  MetaInsightFilter,
} from "./meta-insight-aggregates.ts";

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
  metrics: WorkbenchMetric[];
  dimensions: WorkbenchDimension[];
  filters: MetaInsightFilter[];
  dateRange: {
    start: string;
    end: string;
    days: number;
    label: string;
  };
  sort: {
    field: WorkbenchMetric | WorkbenchDimension;
    direction: "asc" | "desc";
  };
  limit: number;
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
  };
  sourceNotes: AnalysisWorkbenchSourceNote[];
  validation: {
    status: "ready" | "blocked";
    blockers: WorkbenchSemanticIssue[];
    warnings: WorkbenchSemanticIssue[];
    assumptions: Array<{ code: string; message: string }>;
  };
  visualCards: [];
  dashboardPacket: null;
};

type PipelineInput = {
  prompt: string;
  outputMode: AnalysisOutputMode;
  latestSyncedInsightDate?: string | null;
  executeAggregate: (
    request: AnalysisWorkbenchPipelineAggregateRequest,
  ) => Promise<MetaInsightAggregateRow[]>;
};

type PlannedIntent = AnalysisWorkbenchPipelineIntent & {
  semanticValidation: ReturnType<typeof validateAnalysisWorkbenchSemanticIntent>;
};

const DEFAULT_METRICS: WorkbenchMetric[] = ["spend", "primary_results"];
const DEFAULT_DIMENSIONS: WorkbenchDimension[] = ["campaign_umbrella"];
const MAX_GROUP_ROWS = 20;
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

export async function runAnalysisWorkbenchFactsPipeline(
  input: PipelineInput,
): Promise<AnalysisWorkbenchPipelineResult> {
  const prompt = normalizePrompt(input.prompt);
  const title = titleFromPrompt(prompt);
  const planned = planAnalysisWorkbenchIntent({
    prompt,
    outputMode: input.outputMode,
    latestSyncedInsightDate: input.latestSyncedInsightDate,
  });

  if (planned.semanticValidation.status === "blocked") {
    return blockedResult({ prompt, title, outputMode: input.outputMode, planned });
  }

  const groupedRequest = aggregateRequest(planned, planned.dimensions, MAX_GROUP_ROWS);
  const totalRequest = aggregateRequest(planned, [], 1);
  const groupedRows = await input.executeAggregate(groupedRequest);
  const totalRows = await input.executeAggregate(totalRequest);
  const sourceNotes = sourceNotesFor(planned, groupedRows, totalRows);
  const facts = computeFacts(planned, groupedRows, totalRows, sourceNotes);
  const answer = composeAnswer(planned, facts.items, sourceNotes);
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
      {
        code: "relative_date_range",
        message: "Relative date range ends at the latest complete synced Meta Ads date.",
      },
      ...planned.semanticValidation.assumptions.map((assumption) => ({
        code: assumption.code,
        message: assumption.message,
      })),
    ],
  };

  return {
    status: groundingIssues.length ? "failed" : "completed",
    title,
    intent: stripSemanticValidation(planned),
    queryPlan: {
      status: "ready",
      source: "meta_ads",
      aggregateFunction: "aggregate_meta_daily_insights",
      requests: [groupedRequest, totalRequest],
    },
    facts,
    answer,
    sourceNotes,
    validation,
    visualCards: [],
    dashboardPacket: null,
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
      ...(citation.values || []),
      ...(citation.formattedValues || []),
    ].forEach((value) => {
      const normalized = normalizeNumericClaim(value);
      if (normalized) allowed.add(normalized);
    });
  });

  const scrubbed = summary
    .replace(/\[[A-Z]\d+\]/g, "")
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
}): PlannedIntent {
  const metrics = detectMetrics(input.prompt);
  const dimensions = detectDimensions(input.prompt);
  const filters = detectFilters(input.prompt);
  const dateRange = resolvePromptDateRange(input.prompt, input.latestSyncedInsightDate);
  const dateGrain = dimensions.find((dimension) =>
    dimension === "date" || dimension === "week" || dimension === "month" || dimension === "quarter"
      ? dimension
      : null,
  );
  const semanticValidation = validateAnalysisWorkbenchSemanticIntent({
    prompt: input.prompt,
    metrics,
    dimensions,
    filters,
    dateGrain: dateGrain || null,
  });
  const repairedFilters = semanticValidation.repairedIntent.filters as MetaInsightFilter[];
  const sortField = metrics[0] || "spend";

  return {
    status: semanticValidation.status === "blocked" ? "blocked" : "ready",
    rawPrompt: input.prompt,
    outputMode: input.outputMode,
    metrics,
    dimensions,
    filters: repairedFilters,
    dateRange,
    sort: {
      field: sortField,
      direction: "desc",
    },
    limit: MAX_GROUP_ROWS,
    semanticValidation,
  };
}

function blockedResult(input: {
  prompt: string;
  title: string;
  outputMode: AnalysisOutputMode;
  planned: PlannedIntent;
}): AnalysisWorkbenchPipelineResult {
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
      summary: "Request blocked. This analysis asks for data outside the governed Meta Ads catalog.",
      citations: [],
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
      `Answer only mode used governed Meta Ads facts. Totals: ${totalSentence}.`,
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

function sourceNotesFor(
  planned: PlannedIntent,
  groupedRows: MetaInsightAggregateRow[],
  totalRows: MetaInsightAggregateRow[],
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
      value: planned.filters.length
        ? planned.filters.map((filter) => `${filter.field} ${filter.operator} ${filter.value}`).join("; ")
        : "No filters",
    },
  ];
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

function detectMetrics(prompt: string): WorkbenchMetric[] {
  const normalizedPrompt = normalizeToken(prompt);
  const catalog = getAnalysisWorkbenchSemanticCatalog();
  const detected = catalog.metrics
    .filter((metric) =>
      [metric.key, metric.label, ...metric.aliases].some((label) =>
        phraseAppears(normalizedPrompt, normalizeToken(label)),
      ),
    )
    .map((metric) => metric.key);

  return unique(detected).slice(0, 4).length ? unique(detected).slice(0, 4) : DEFAULT_METRICS;
}

function detectDimensions(prompt: string): WorkbenchDimension[] {
  const lower = prompt.toLowerCase();
  const dimensions: WorkbenchDimension[] = [];
  if (/\bby\s+(?:day|date)\b|\bdaily\b/.test(lower)) dimensions.push("date");
  if (/\bby\s+week\b|\bweekly\b/.test(lower)) dimensions.push("week");
  if (/\bby\s+month\b|\bmonthly\b/.test(lower)) dimensions.push("month");
  if (/\bby\s+quarter\b|\bquarterly\b/.test(lower)) dimensions.push("quarter");
  if (/\bby\s+brands?\b/.test(lower)) dimensions.push("brand");
  if (/\bby\s+(?:campaign\s+)?(?:groups?|umbrellas?)\b|\bcampaign\s+umbrella\b/.test(lower)) {
    dimensions.push("campaign_umbrella");
  } else if (/\bby\s+campaigns?\b/.test(lower)) {
    dimensions.push("campaign");
  }
  if (/\bby\s+ad\s+sets?\b|\bby\s+adsets?\b/.test(lower)) dimensions.push("ad_set");
  if (/\bby\s+ads?\b/.test(lower)) dimensions.push("ad");
  if (/\bby\s+(?:ad\s+)?creatives?\b/.test(lower)) dimensions.push("creative");

  return unique(dimensions).length ? unique(dimensions).slice(0, 3) : DEFAULT_DIMENSIONS;
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

function resolvePromptDateRange(prompt: string, latestSyncedInsightDate?: string | null) {
  const end = isDateString(latestSyncedInsightDate)
    ? latestSyncedInsightDate
    : format(new Date(), "yyyy-MM-dd");
  const days = promptDays(prompt);
  const start = format(subDays(parseISO(end), days - 1), "yyyy-MM-dd");

  return {
    start,
    end,
    days,
    label: `Last ${days} days`,
  };
}

function promptDays(prompt: string) {
  const lower = prompt.toLowerCase();
  const numberPattern = "(\\d+|seven|fourteen|thirty|ninety|four|eight|twelve)";
  const dayMatch = lower.match(new RegExp(`\\b(?:last|past|previous|prior)\\s+${numberPattern}\\s+days?\\b`));
  if (dayMatch) return wordNumber(dayMatch[1]) || 30;
  const weekMatch = lower.match(new RegExp(`\\b(?:last|past|previous|prior)\\s+${numberPattern}\\s+weeks?\\b`));
  if (weekMatch) return (wordNumber(weekMatch[1]) || 4) * 7;
  return 30;
}

function wordNumber(value: string) {
  const words: Record<string, number> = {
    seven: 7,
    fourteen: 14,
    thirty: 30,
    ninety: 90,
    four: 4,
    eight: 8,
    twelve: 12,
  };
  return Number.isFinite(Number(value)) ? Number(value) : words[value];
}

function stripSemanticValidation(planned: PlannedIntent): AnalysisWorkbenchPipelineIntent {
  const { semanticValidation: _semanticValidation, ...intent } = planned;
  return intent;
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

function primaryEntityDimension(dimensions: WorkbenchDimension[]) {
  return dimensions.find((dimension) => ENTITY_DIMENSIONS.has(dimension)) || dimensions[0] || null;
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

function metricCaveat(metric: WorkbenchMetric) {
  return getAnalysisWorkbenchSemanticCatalog().metrics.find((definition) => definition.key === metric)
    ?.caveat;
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
    .replace(/[_-]+/g, " ")
    .replace(/[()/.]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function isDateString(value: unknown): value is string {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function escapeRegex(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
