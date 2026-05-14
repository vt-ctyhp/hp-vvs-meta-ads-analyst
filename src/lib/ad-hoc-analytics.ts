import OpenAI from "openai";
import { format, parseISO, subDays } from "date-fns";
import { z } from "zod";

import type { Json } from "./database.types";
import {
  type AnalysisMode,
  ConfigurationError,
  getMissingRequiredEnv,
  getOpenAIAnalysisModel,
} from "./env";
import { aggregateMetaInsights, type MetaInsightAggregateRow } from "./meta-insight-aggregates";
import { createServiceClient } from "./supabase";

const ANALYSIS_METRICS = [
  "spend",
  "monthly_budget",
  "impressions",
  "reach",
  "clicks",
  "leads",
  "bookings",
  "conversions",
  "ctr",
  "cpm",
  "cpc",
  "cpl",
  "frequency",
] as const;

const ANALYSIS_DIMENSIONS = [
  "date",
  "week",
  "month",
  "brand",
  "campaign_umbrella",
  "campaign",
  "ad_set",
  "ad",
  "creative",
] as const;

const FILTER_FIELDS = [
  "search",
  "brand",
  "campaign_umbrella",
  "campaign",
  "ad_set",
  "ad",
  "creative",
] as const;

const DATE_PRESETS = [
  "last_7_days",
  "last_14_days",
  "last_30_days",
  "last_4_weeks",
  "last_8_weeks",
  "last_12_weeks",
  "last_90_days",
  "custom",
] as const;

const WIDGET_TYPES = ["metric", "table", "line", "bar"] as const;
const DEFAULT_METRICS: AnalysisMetric[] = ["spend", "impressions", "clicks", "ctr", "cpc", "leads", "cpl"];
const MAX_DAYS = 10000;
const MAX_TABLE_ROWS = 100;
const MAX_ANALYSIS_ROWS = 18;

export type AnalysisMetric = (typeof ANALYSIS_METRICS)[number];
export type AnalysisDimension = (typeof ANALYSIS_DIMENSIONS)[number];
export type AnalysisFilterField = (typeof FILTER_FIELDS)[number];
export type AnalysisGrain = "summary" | "daily" | "weekly" | "monthly";
export type AnalysisWidgetType = (typeof WIDGET_TYPES)[number];

export type AnalysisFilter = {
  field: AnalysisFilterField;
  operator: "contains" | "equals";
  value: string;
};

export type AnalysisSpec = {
  title: string;
  dateRange: {
    preset?: (typeof DATE_PRESETS)[number];
    start?: string;
    end?: string;
    days?: number;
  };
  grain: AnalysisGrain;
  dimensions: AnalysisDimension[];
  filters: AnalysisFilter[];
  metrics: AnalysisMetric[];
  sort?: {
    field: AnalysisMetric | AnalysisDimension;
    direction: "asc" | "desc";
  };
  limit: number;
  widgets: Array<{
    type: AnalysisWidgetType;
    title: string;
    x?: AnalysisDimension;
    metrics: AnalysisMetric[];
  }>;
};

export type AnalysisTableColumn = {
  key: string;
  label: string;
  type: "text" | "money" | "number" | "percent";
};

export type AnalysisResult = {
  status: "ready" | "needs_narrowing";
  dashboardId: string | null;
  prompt: string;
  mode: AnalysisMode;
  title: string;
  answer: string;
  spec: AnalysisSpec;
  table: {
    columns: AnalysisTableColumn[];
    rows: Array<Record<string, string | number | null>>;
  };
  totals: Record<string, number | null>;
  widgets: AnalysisSpec["widgets"];
  sourceTransparency: {
    timeRange: { start: string; end: string; days: number };
    adAccountsAnalyzed: string[];
    recordCounts: Record<string, number>;
  };
  modelUsed: {
    plan: string;
    analysis: string | null;
  };
  tokenEstimate: {
    planInputTokens: number;
    planOutputTokens: number;
    analysisInputTokens: number;
    analysisOutputTokens: number;
    estimatedCostUsd: number;
  };
  persistenceWarning?: string;
};

export type SavedAnalysisDashboard = {
  id: string;
  title: string;
  prompt: string;
  mode: AnalysisMode;
  createdAt: string;
  updatedAt: string;
};

type AccountRow = { meta_account_id: string; name: string | null };
type AnalysisDashboardRecord = {
  id: string;
  title: string;
  prompt: string;
  mode: string;
  spec: unknown;
  model_plan: string | null;
  model_analysis: string | null;
  created_at?: string;
  updated_at?: string;
};
type PromptIntent = {
  dateRange?: AnalysisSpec["dateRange"];
  grain?: AnalysisGrain;
  dimensions?: AnalysisDimension[];
  metrics?: AnalysisMetric[];
  sort?: AnalysisSpec["sort"];
  limit?: number;
  tableOnly?: boolean;
  tableTitle?: string;
  title?: string;
  stripCashForGoldFilter?: boolean;
};

const metricSchema = z.enum(ANALYSIS_METRICS);
const dimensionSchema = z.enum(ANALYSIS_DIMENSIONS);
const filterFieldSchema = z.enum(FILTER_FIELDS);
const widgetTypeSchema = z.enum(WIDGET_TYPES);

const widgetSchema = z.object({
  type: widgetTypeSchema.catch("table"),
  title: z.string().max(80).catch("Analysis"),
  x: dimensionSchema.optional(),
  metrics: z.array(metricSchema).min(1).max(6).catch(["spend", "ctr", "leads"]),
});

const analysisSpecSchema = z.object({
  title: z.string().min(1).max(100).catch("Ad-hoc analysis"),
  dateRange: z
    .object({
      preset: z.enum(DATE_PRESETS).optional(),
      start: z.string().optional(),
      end: z.string().optional(),
      days: z.number().int().positive().max(MAX_DAYS).optional(),
    })
    .catch({ preset: "last_30_days" }),
  grain: z.enum(["summary", "daily", "weekly", "monthly"]).catch("weekly"),
  dimensions: z.array(dimensionSchema).min(1).max(3).catch(["week"]),
  filters: z
    .array(
      z.object({
        field: filterFieldSchema.catch("search"),
        operator: z.enum(["contains", "equals"]).catch("contains"),
        value: z.string().max(120).catch(""),
      }),
    )
    .max(6)
    .catch([]),
  metrics: z.array(metricSchema).min(1).max(8).catch(DEFAULT_METRICS),
  sort: z
    .object({
      field: z.union([metricSchema, dimensionSchema]).catch("spend"),
      direction: z.enum(["asc", "desc"]).catch("desc"),
    })
    .optional(),
  limit: z.number().int().min(1).max(MAX_TABLE_ROWS).catch(50),
  widgets: z.array(widgetSchema).min(1).max(4).catch([]),
});

export async function fetchSavedAnalysisDashboards(limit = 12): Promise<SavedAnalysisDashboard[]> {
  const missing = getMissingRequiredEnv([
    "NEXT_PUBLIC_SUPABASE_URL",
    "SUPABASE_SERVICE_ROLE_KEY",
  ]);
  if (missing.length) return [];

  try {
    const supabase = createServiceClient();
    const response = await supabase
      .from("ai_analysis_dashboards")
      .select("id,title,prompt,mode,created_at,updated_at")
      .order("updated_at", { ascending: false })
      .limit(limit);

    if (response.error) throw response.error;

    return rows<Record<string, unknown>>(response.data).map((dashboard) => ({
      id: String(dashboard.id),
      title: String(dashboard.title),
      prompt: String(dashboard.prompt),
      mode: dashboard.mode === "deep" ? "deep" : "fast",
      createdAt: String(dashboard.created_at),
      updatedAt: String(dashboard.updated_at),
    }));
  } catch {
    return [];
  }
}

export async function runSavedAdHocAnalysis(dashboardId: string): Promise<AnalysisResult> {
  const dashboard = await fetchAnalysisDashboardRecord(dashboardId);
  const spec = normalizeSpec(dashboard.spec, dashboard.prompt);
  const mode: AnalysisMode = dashboard.mode === "deep" ? "deep" : "fast";
  const planModel = dashboard.model_plan || getOpenAIAnalysisModel("fast");
  const analysisModel = dashboard.model_analysis;
  const aggregated = await aggregateSpec(spec);

  return {
    ...baseResult({
      prompt: dashboard.prompt,
      mode,
      spec,
      aggregated,
      dashboardId: dashboard.id,
      planModel,
      analysisModel,
      tokenEstimate: emptyTokenEstimate(),
    }),
    answer: "Loaded saved dashboard spec and refreshed the data directly from Supabase.",
  };
}

export async function renameSavedAnalysisDashboard(input: {
  dashboardId: string;
  title: string;
}): Promise<SavedAnalysisDashboard> {
  const title = normalizeDashboardTitle(input.title);
  if (!title) {
    throw new ConfigurationError("Dashboard title is required.");
  }

  const dashboard = await fetchAnalysisDashboardRecord(input.dashboardId);
  const spec = {
    ...normalizeSpec(dashboard.spec, dashboard.prompt),
    title,
  };

  const supabase = createServiceClient();
  const response = await supabase
    .from("ai_analysis_dashboards")
    .update({
      title,
      spec: spec as unknown as Json,
    })
    .eq("id", input.dashboardId)
    .select("id,title,prompt,mode,created_at,updated_at")
    .single();

  if (response.error) throw response.error;
  return mapSavedDashboard(response.data);
}

export async function deleteSavedAnalysisDashboard(dashboardId: string) {
  const supabase = createServiceClient();
  const response = await supabase
    .from("ai_analysis_dashboards")
    .delete()
    .eq("id", dashboardId)
    .select("id")
    .single();

  if (response.error) throw response.error;
  return { id: String(response.data.id) };
}

export async function createAdHocAnalysis(input: {
  prompt: string;
  mode: AnalysisMode;
}): Promise<AnalysisResult> {
  const prompt = input.prompt.trim();
  if (!prompt) {
    throw new ConfigurationError("Analysis prompt is required.");
  }

  const planModel = getOpenAIAnalysisModel("fast");
  const { spec, usage: planUsage } = await createSpecWithAI(prompt, planModel);
  const aggregated = await aggregateSpec(spec);
  const baseTokenEstimate = {
    ...emptyTokenEstimate(),
    planInputTokens: planUsage.input,
    planOutputTokens: planUsage.output,
  };

  if (aggregated.needsNarrowing) {
    return baseResult({
      prompt,
      mode: input.mode,
      spec,
      aggregated,
      dashboardId: null,
      planModel,
      analysisModel: null,
      tokenEstimate: withEstimatedCost(baseTokenEstimate, planModel, null),
    });
  }

  const analysis =
    input.mode === "deep"
      ? await generateDeepAnalysis(prompt, spec, aggregated, getOpenAIAnalysisModel("deep"))
      : null;

  const resultBeforeSave = baseResult({
    prompt,
    mode: input.mode,
    spec,
    aggregated,
    dashboardId: null,
    planModel,
    analysisModel: analysis?.model || null,
    tokenEstimate: withEstimatedCost(
      {
        ...baseTokenEstimate,
        analysisInputTokens: analysis?.usage.input || 0,
        analysisOutputTokens: analysis?.usage.output || 0,
      },
      planModel,
      analysis?.model || null,
    ),
  });

  const result = {
    ...resultBeforeSave,
    answer: analysis?.answer || buildDeterministicAnswer(spec, aggregated),
  };

  const persistence = await persistAnalysis(result, planModel, analysis?.model || null);
  return {
    ...result,
    dashboardId: persistence.dashboardId,
    persistenceWarning: persistence.warning,
  };
}

export async function editAdHocAnalysis(input: {
  dashboardId?: string | null;
  currentSpec?: unknown;
  currentPrompt?: string | null;
  prompt: string;
  mode: AnalysisMode;
}): Promise<AnalysisResult> {
  const editPrompt = input.prompt.trim();
  if (!editPrompt) {
    throw new ConfigurationError("Edit prompt is required.");
  }

  const dashboard = input.dashboardId
    ? await fetchAnalysisDashboardRecord(input.dashboardId)
    : null;
  const basePrompt = dashboard?.prompt || input.currentPrompt?.trim() || "Ad-hoc Meta Ads analysis";
  const currentSpec = normalizeSpec(dashboard?.spec || input.currentSpec, basePrompt);
  const planModel = getOpenAIAnalysisModel("fast");
  const { spec, usage: planUsage } = await editSpecWithAI({
    currentSpec,
    currentPrompt: basePrompt,
    editPrompt,
    model: planModel,
  });
  const prompt = mergePrompts(basePrompt, editPrompt);
  const aggregated = await aggregateSpec(spec);
  const baseTokenEstimate = {
    ...emptyTokenEstimate(),
    planInputTokens: planUsage.input,
    planOutputTokens: planUsage.output,
  };

  if (aggregated.needsNarrowing) {
    return baseResult({
      prompt,
      mode: input.mode,
      spec,
      aggregated,
      dashboardId: dashboard?.id || null,
      planModel,
      analysisModel: null,
      tokenEstimate: withEstimatedCost(baseTokenEstimate, planModel, null),
    });
  }

  const analysis =
    input.mode === "deep"
      ? await generateDeepAnalysis(prompt, spec, aggregated, getOpenAIAnalysisModel("deep"))
      : null;

  const resultBeforeSave = baseResult({
    prompt,
    mode: input.mode,
    spec,
    aggregated,
    dashboardId: dashboard?.id || null,
    planModel,
    analysisModel: analysis?.model || null,
    tokenEstimate: withEstimatedCost(
      {
        ...baseTokenEstimate,
        analysisInputTokens: analysis?.usage.input || 0,
        analysisOutputTokens: analysis?.usage.output || 0,
      },
      planModel,
      analysis?.model || null,
    ),
  });

  const result = {
    ...resultBeforeSave,
    answer: analysis?.answer || buildDeterministicAnswer(spec, aggregated),
  };

  const persistence = await persistAnalysis(result, planModel, analysis?.model || null, dashboard?.id || null);
  return {
    ...result,
    dashboardId: persistence.dashboardId,
    persistenceWarning: persistence.warning,
  };
}

async function createSpecWithAI(prompt: string, model: string) {
  const response = await createOpenAIClient().chat.completions.create({
    model,
    response_format: { type: "json_object" },
    messages: [
      {
        role: "system",
        content:
          "You convert Meta Ads questions into a compact JSON dashboard spec. Return JSON only. Never write SQL, code, or raw data. Use only the allowed fields and widgets.",
      },
      {
        role: "user",
        content: JSON.stringify({
          task: "Create an AnalysisSpec for a Meta Ads ad-hoc dashboard.",
          userPrompt: prompt,
          allowed: {
            metrics: ANALYSIS_METRICS,
            dimensions: ANALYSIS_DIMENSIONS,
            filterFields: FILTER_FIELDS,
            grains: ["summary", "daily", "weekly", "monthly"],
            widgets: WIDGET_TYPES,
            datePresets: DATE_PRESETS,
          },
          rules: [
            "Map campaign umbrella, internal campaign umbrella, or umbrella to the campaign_umbrella dimension. Do not use a search filter for that.",
            "For month by month, monthly, or by month, use grain monthly and include the month dimension.",
            "For since/from/starting a specific date, use preset custom with start as YYYY-MM-DD and omit end unless the user gives one.",
            "For ad spend or spend-only requests, include spend first; if no other metric is requested, use only spend.",
            "For monthly budget or budget requests, use the monthly_budget metric. Do not substitute CTR, CPC, CPL, impressions, clicks, or leads for budget.",
            "If the user asks to add budget to a spend table, use metrics ['spend','monthly_budget'] unless they explicitly request more metrics.",
            "Use search filters only for free-text ad concepts, product names, or campaign/ad text explicitly named by the user.",
            "For table-format requests, return a table widget first and add charts only when the user asks for charts.",
            "Keep limits at or below 50 unless the user asks for a leaderboard.",
          ],
        }),
      },
    ],
  });

  const content = response.choices[0]?.message?.content;
  return {
    spec: normalizeSpec(parseJson(content) || fallbackSpec(prompt), prompt),
    usage: {
      input: response.usage?.prompt_tokens || estimateTokens(prompt) + 700,
      output: response.usage?.completion_tokens || estimateTokens(content || ""),
    },
  };
}

async function editSpecWithAI(input: {
  currentSpec: AnalysisSpec;
  currentPrompt: string;
  editPrompt: string;
  model: string;
}) {
  const response = await createOpenAIClient().chat.completions.create({
    model: input.model,
    response_format: { type: "json_object" },
    messages: [
      {
        role: "system",
        content:
          "You edit an existing Meta Ads dashboard AnalysisSpec. Return the full updated JSON spec only. Preserve existing filters/date range/metrics/widgets unless the user asks to change them. You may add, remove, rename, or reorder widgets to satisfy layout requests. Never write SQL or raw data.",
      },
      {
        role: "user",
        content: JSON.stringify({
          task: "Modify this existing AnalysisSpec according to the requested follow-up.",
          currentPrompt: input.currentPrompt,
          requestedChange: input.editPrompt,
          currentSpec: input.currentSpec,
          allowed: {
            metrics: ANALYSIS_METRICS,
            dimensions: ANALYSIS_DIMENSIONS,
            filterFields: FILTER_FIELDS,
            grains: ["summary", "daily", "weekly", "monthly"],
            widgets: WIDGET_TYPES,
            datePresets: DATE_PRESETS,
          },
          rules: [
            "Return one complete AnalysisSpec JSON object.",
            "If the user says add a chart/table/metric, append an appropriate widget.",
            "If the user says rearrange, update the widgets array order.",
            "If the user asks to compare by campaign, ad set, ad, creative, brand, or umbrella, adjust dimensions accordingly.",
            "Map campaign umbrella, internal campaign umbrella, or umbrella to campaign_umbrella, not to a search filter.",
            "For month by month, monthly, or by month, use grain monthly and include the month dimension.",
            "For since/from/starting a specific date, use preset custom with start as YYYY-MM-DD and omit end unless the user gives one.",
            "For ad spend or spend-only requests, include spend first; if no other metric is requested, use only spend.",
            "For monthly budget or budget requests, use the monthly_budget metric. Do not substitute CTR, CPC, CPL, impressions, clicks, or leads for budget.",
            "If the user asks to add budget to a spend table, use metrics ['spend','monthly_budget'] unless they explicitly request more metrics.",
            "Keep limits at or below 50 unless the user asks for a leaderboard.",
          ],
        }),
      },
    ],
  });

  const content = response.choices[0]?.message?.content;
  const promptContext = mergePrompts(input.currentPrompt, input.editPrompt);
  return {
    spec: normalizeSpec(parseJson(content) || input.currentSpec, promptContext),
    usage: {
      input:
        response.usage?.prompt_tokens ||
        estimateTokens(JSON.stringify(input.currentSpec)) + estimateTokens(input.editPrompt) + 900,
      output: response.usage?.completion_tokens || estimateTokens(content || ""),
    },
  };
}

async function generateDeepAnalysis(
  prompt: string,
  spec: AnalysisSpec,
  aggregated: Awaited<ReturnType<typeof aggregateSpec>>,
  model: string,
) {
  const compactRows = aggregated.table.rows.slice(0, MAX_ANALYSIS_ROWS);
  const response = await createOpenAIClient().chat.completions.create({
    model,
    messages: [
      {
        role: "system",
        content:
          "You are a Meta Ads analyst. Interpret only the compact aggregated data supplied. Be concise, compare periods clearly, and cite metric values from the table. Do not claim access to raw rows.",
      },
      {
        role: "user",
        content: JSON.stringify({
          userPrompt: prompt,
          spec,
          sourceTransparency: aggregated.sourceTransparency,
          totals: aggregated.totals,
          compactRows,
        }),
      },
    ],
  });

  const answer =
    response.choices[0]?.message?.content ||
    "Deep analysis could not be generated from the aggregated result.";

  return {
    model,
    answer,
    usage: {
      input: response.usage?.prompt_tokens || estimateTokens(JSON.stringify(compactRows)) + 900,
      output: response.usage?.completion_tokens || estimateTokens(answer),
    },
  };
}

async function aggregateSpec(spec: AnalysisSpec) {
  const range = resolveDateRange(spec.dateRange);

  const supabase = createServiceClient();
  const [aggregateRows, totalRows, accountsRes] = await Promise.all([
    aggregateMetaInsights({
      start: range.start,
      end: range.end,
      dimensions: spec.dimensions,
      filters: spec.filters,
      sortField: spec.sort?.field,
      sortDirection: spec.sort?.direction,
      limit: spec.limit,
    }),
    aggregateMetaInsights({
      start: range.start,
      end: range.end,
      dimensions: [],
      filters: spec.filters,
      sortField: "spend",
      sortDirection: "desc",
      limit: 1,
    }),
    supabase.from("meta_ad_accounts").select("meta_account_id,name"),
  ]);

  const firstError = accountsRes.error;
  if (firstError) throw firstError;

  const accountNameById = new Map(
    rows<AccountRow>(accountsRes.data).map((account) => [
      account.meta_account_id,
      account.name || account.meta_account_id,
    ]),
  );
  const rowsForTable: Array<Record<string, string | number | null>> = aggregateRows.map((row) => ({
    ...Object.fromEntries(spec.dimensions.map((dimension) => [dimension, aggregateDimensionValue(row, dimension)])),
    ...Object.fromEntries(spec.metrics.map((metric) => [metric, aggregateMetricValue(row, metric)])),
    sourceRows: row.source_rows,
  }));
  const totals = aggregateMetrics(totalRows[0]);
  const matchedRows = totalRows[0]?.source_rows || 0;

  const sourceTransparency = {
    timeRange: range,
    adAccountsAnalyzed: Array.from(accountNameById.values()),
    recordCounts: {
      meta_daily_insights: matchedRows,
      matched_insights: matchedRows,
      grouped_rows: aggregateRows.length,
      returned_rows: rowsForTable.length,
    },
  };

  return {
    needsNarrowing: false,
    narrowingMessage: "",
    table: {
      columns: buildColumns(spec),
      rows: rowsForTable,
    },
    totals,
    sourceTransparency,
  };
}

function normalizeSpec(value: unknown, prompt: string): AnalysisSpec {
  const parsed = analysisSpecSchema.safeParse(value);
  const intent = inferPromptIntent(prompt);
  const base = applyPromptIntent(parsed.success ? parsed.data : fallbackSpec(prompt), intent);
  const dimensions = normalizeDimensions(base.dimensions, base.grain);
  const metrics = uniqueAllowed(base.metrics, ANALYSIS_METRICS, DEFAULT_METRICS);
  const filters = base.filters
    .map((filter) => ({ ...filter, value: filter.value.trim() }))
    .filter((filter) => filter.value);
  const widgets = intent.tableOnly
    ? [
        {
          type: "table" as const,
          title: intent.tableTitle || "Comparison table",
          x: dimensions[0],
          metrics,
        },
      ]
    : normalizeWidgets(base.widgets, dimensions, metrics, base.grain);

  return {
    title: base.title,
    dateRange: base.dateRange,
    grain: base.grain,
    dimensions,
    filters,
    metrics,
    sort: base.sort,
    limit: Math.min(Math.max(base.limit, 1), MAX_TABLE_ROWS),
    widgets,
  };
}

function normalizeDimensions(dimensions: AnalysisDimension[], grain: AnalysisGrain) {
  const fallback: AnalysisDimension[] =
    grain === "daily" ? ["date"] : grain === "monthly" ? ["month"] : grain === "summary" ? ["brand"] : ["week"];
  return uniqueAllowed(dimensions, ANALYSIS_DIMENSIONS, fallback).slice(0, 3);
}

function normalizeWidgets(
  widgets: AnalysisSpec["widgets"],
  dimensions: AnalysisDimension[],
  metrics: AnalysisMetric[],
  grain: AnalysisGrain,
) {
  const normalized = widgets
    .filter((widget) => WIDGET_TYPES.includes(widget.type))
    .map((widget) => ({
      type: widget.type,
      title: widget.title || labelForWidget(widget.type),
      x: widget.x && dimensions.includes(widget.x) ? widget.x : dimensions[0],
      metrics: uniqueAllowed(widget.metrics, ANALYSIS_METRICS, metrics).slice(0, 4),
    }));

  if (normalized.length) return normalized;

  const timeWidget = grain === "daily" || grain === "weekly" || grain === "monthly";
  return [
    { type: "metric" as const, title: "Totals", metrics: metrics.slice(0, 4) },
    { type: "table" as const, title: "Comparison table", x: dimensions[0], metrics },
    {
      type: timeWidget ? ("line" as const) : ("bar" as const),
      title: timeWidget ? "Trend" : "Comparison",
      x: dimensions[0],
      metrics: metrics.filter((metric) => metric !== "impressions").slice(0, 3),
    },
  ];
}

function fallbackSpec(prompt: string): AnalysisSpec {
  const weekly = /week|weekly|four|4/i.test(prompt);
  const search = inferSearchTerm(prompt);
  const intent = inferPromptIntent(prompt);

  return {
    title: titleFromPrompt(prompt),
    dateRange: intent.dateRange || { preset: weekly ? "last_4_weeks" : "last_30_days" },
    grain: intent.grain || (weekly ? "weekly" : "summary"),
    dimensions: intent.dimensions || (weekly ? ["week"] : ["brand"]),
    filters: search ? [{ field: "search", operator: "contains", value: search }] : [],
    metrics: intent.metrics || DEFAULT_METRICS,
    sort: intent.sort || (weekly ? { field: "week", direction: "asc" } : { field: "spend", direction: "desc" }),
    limit: intent.limit || 50,
    widgets: intent.tableOnly
      ? [
          {
            type: "table",
            title: intent.tableTitle || "Comparison table",
            x: intent.dimensions?.[0],
            metrics: intent.metrics || DEFAULT_METRICS,
          },
        ]
      : [],
  };
}

function resolveDateRange(dateRange: AnalysisSpec["dateRange"]) {
  const today = new Date();
  let end = isDateString(dateRange.end) ? parseISO(dateRange.end) : today;
  const presetDays: Record<string, number> = {
    last_7_days: 7,
    last_14_days: 14,
    last_30_days: 30,
    last_4_weeks: 28,
    last_8_weeks: 56,
    last_12_weeks: 84,
    last_90_days: 90,
  };
  const days = Math.min(
    Math.max(dateRange.days || presetDays[dateRange.preset || ""] || 30, 1),
    MAX_DAYS,
  );
  let start = isDateString(dateRange.start) ? parseISO(dateRange.start) : subDays(end, days - 1);
  if (start > end) [start, end] = [end, start];
  const actualDays = Math.max(1, differenceInCalendarDays(end, start) + 1);

  return {
    start: format(start, "yyyy-MM-dd"),
    end: format(end, "yyyy-MM-dd"),
    days: actualDays,
  };
}

function buildColumns(spec: AnalysisSpec): AnalysisTableColumn[] {
  return [
    ...spec.dimensions.map((dimension) => ({
      key: dimension,
      label: labelFor(dimension),
      type: "text" as const,
    })),
    ...spec.metrics.map((metric) => ({
      key: metric,
      label: labelFor(metric),
      type: metricType(metric),
    })),
  ];
}

function aggregateMetrics(row: MetaInsightAggregateRow | undefined): Record<AnalysisMetric, number | null> {
  if (!row) {
    return {
      spend: 0,
      monthly_budget: 0,
      impressions: 0,
      reach: 0,
      clicks: 0,
      leads: 0,
      bookings: 0,
      conversions: 0,
      ctr: 0,
      cpm: 0,
      cpc: 0,
      cpl: null,
      frequency: 0,
    };
  }

  return {
    spend: row.spend,
    monthly_budget: row.monthly_budget,
    impressions: row.impressions,
    reach: row.reach,
    clicks: row.clicks,
    leads: row.leads,
    bookings: row.bookings,
    conversions: row.conversions,
    ctr: row.ctr,
    cpm: row.cpm,
    cpc: row.cpc,
    cpl: row.cpl,
    frequency: row.frequency,
  };
}

function aggregateMetricValue(row: MetaInsightAggregateRow, metric: AnalysisMetric) {
  return aggregateMetrics(row)[metric];
}

function aggregateDimensionValue(row: MetaInsightAggregateRow, dimension: AnalysisDimension) {
  const value = row[dimension];
  if (value) return value;
  if (dimension === "campaign_umbrella") return "Needs review";
  if (dimension === "campaign") return row.campaign_id || "Unknown campaign";
  if (dimension === "ad_set") return row.ad_set_id || "Unknown ad set";
  if (dimension === "ad") return row.ad_id || "Unknown ad";
  if (dimension === "creative") return row.creative_id || "Unknown creative";
  return "";
}

function baseResult(input: {
  prompt: string;
  mode: AnalysisMode;
  spec: AnalysisSpec;
  aggregated: Awaited<ReturnType<typeof aggregateSpec>>;
  dashboardId: string | null;
  planModel: string;
  analysisModel: string | null;
  tokenEstimate: AnalysisResult["tokenEstimate"];
}): AnalysisResult {
  return {
    status: input.aggregated.needsNarrowing ? "needs_narrowing" : "ready",
    dashboardId: input.dashboardId,
    prompt: input.prompt,
    mode: input.mode,
    title: input.spec.title,
    answer: input.aggregated.needsNarrowing ? input.aggregated.narrowingMessage : "",
    spec: input.spec,
    table: input.aggregated.table,
    totals: input.aggregated.totals,
    widgets: input.spec.widgets,
    sourceTransparency: input.aggregated.sourceTransparency,
    modelUsed: {
      plan: input.planModel,
      analysis: input.analysisModel,
    },
    tokenEstimate: input.tokenEstimate,
  };
}

async function persistAnalysis(
  result: AnalysisResult,
  planModel: string,
  analysisModel: string | null,
  dashboardId?: string | null,
) {
  try {
    const supabase = createServiceClient();
    const dashboardPayload = {
      title: result.title,
      prompt: result.prompt,
      mode: result.mode,
      spec: result.spec as unknown as Json,
      model_plan: planModel,
      model_analysis: analysisModel,
      source_transparency: result.sourceTransparency as unknown as Json,
    };
    const savedDashboard = dashboardId
      ? await supabase
          .from("ai_analysis_dashboards")
          .update(dashboardPayload)
          .eq("id", dashboardId)
          .select("id")
          .single()
      : await supabase
          .from("ai_analysis_dashboards")
          .insert({
            ...dashboardPayload,
          })
          .select("id")
          .single();

    if (savedDashboard.error) throw savedDashboard.error;

    const savedDashboardId = String((savedDashboard.data as { id: string }).id);
    await supabase.from("ai_analysis_runs").insert({
      dashboard_id: savedDashboardId,
      prompt: result.prompt,
      mode: result.mode,
      model_plan: planModel,
      model_analysis: analysisModel,
      token_estimate: result.tokenEstimate as unknown as Json,
      source_transparency: result.sourceTransparency as unknown as Json,
      result_preview: {
        title: result.title,
        rowCount: result.table.rows.length,
        widgets: result.widgets.map((widget) => widget.type),
      } as unknown as Json,
    });

    return { dashboardId: savedDashboardId };
  } catch (error) {
    return {
      dashboardId: null,
      warning: error instanceof Error ? error.message : String(error),
    };
  }
}

async function fetchAnalysisDashboardRecord(dashboardId: string): Promise<AnalysisDashboardRecord> {
  const supabase = createServiceClient();
  const response = await supabase
    .from("ai_analysis_dashboards")
    .select("id,title,prompt,mode,spec,model_plan,model_analysis,created_at,updated_at")
    .eq("id", dashboardId)
    .single();

  if (response.error) throw response.error;
  return response.data as AnalysisDashboardRecord;
}

function mapSavedDashboard(dashboard: Record<string, unknown>): SavedAnalysisDashboard {
  return {
    id: String(dashboard.id),
    title: String(dashboard.title),
    prompt: String(dashboard.prompt),
    mode: dashboard.mode === "deep" ? "deep" : "fast",
    createdAt: String(dashboard.created_at),
    updatedAt: String(dashboard.updated_at),
  };
}

function normalizeDashboardTitle(title: string) {
  return title.trim().replace(/\s+/g, " ").slice(0, 100);
}

function mergePrompts(basePrompt: string, editPrompt: string) {
  return `${basePrompt.trim()}\n\nFollow-up: ${editPrompt.trim()}`;
}

function buildDeterministicAnswer(
  spec: AnalysisSpec,
  aggregated: Awaited<ReturnType<typeof aggregateSpec>>,
) {
  const rowsForAnswer = aggregated.table.rows.slice(0, 4);
  if (!rowsForAnswer.length) {
    return "No matching Meta Ads records were found for this request.";
  }

  const spend = aggregated.totals.spend ?? 0;
  const leads = aggregated.totals.leads ?? 0;
  const cpl = aggregated.totals.cpl;
  const includesLeadMetrics = spec.metrics.some((metric) => metric === "leads" || metric === "cpl");
  const firstMetric = spec.metrics.find((metric) => metric !== "impressions") || "spend";
  const bestRow = [...aggregated.table.rows].sort((a, b) => {
    const aValue = Number(a[firstMetric] || 0);
    const bValue = Number(b[firstMetric] || 0);
    return bValue - aValue;
  })[0];

  return [
    `${spec.title} returned ${aggregated.table.rows.length} grouped rows from ${aggregated.sourceTransparency.recordCounts.matched_insights} matching daily records.`,
    includesLeadMetrics
      ? `Total spend was ${formatMoney(spend)}, with ${formatNumber(leads)} leads${cpl === null ? "" : ` at ${formatMoney(cpl)} CPL`}.`
      : `Total spend was ${formatMoney(spend)}.`,
    bestRow ? `Highest ${labelFor(firstMetric).toLowerCase()} row: ${describeRow(bestRow, spec.dimensions)}.` : "",
  ]
    .filter(Boolean)
    .join(" ");
}

function inferPromptIntent(prompt: string): PromptIntent {
  const lower = prompt.toLowerCase();
  const dimensions = inferDimensionsFromPrompt(lower);
  const dateRange = inferDateRangeFromPrompt(prompt);
  const wantsMonthly = /\bmonth(?:\s+by\s+month|ly)?\b|\bby month\b|month-by-month/i.test(prompt);
  const wantsWeekly = /\bweek(?:\s+by\s+week|ly)?\b|\bby week\b|week-by-week/i.test(prompt);
  const wantsDaily = /\bday(?:\s+by\s+day)?\b|\bdaily\b|\bby day\b|day-by-day/i.test(prompt);
  const metrics = inferMetricsFromPrompt(lower);
  const tableOnly = /\btable\b|\btable format\b|\btabular\b/i.test(prompt) && !/\bchart\b|\bgraph\b|\bline\b|\bbar\b/i.test(prompt);
  const firstDimension = dimensions?.[0];
  const wantsBudget = metrics?.includes("monthly_budget") || /\bbudgets?\b/.test(lower);
  const isMonthlyUmbrella = dimensions?.includes("campaign_umbrella") && dimensions.includes("month");

  return {
    dateRange,
    grain: wantsMonthly ? "monthly" : wantsWeekly ? "weekly" : wantsDaily ? "daily" : undefined,
    dimensions,
    metrics,
    sort: firstDimension
      ? {
          field: firstDimension,
          direction: "asc",
        }
      : undefined,
    limit: dimensions?.includes("campaign_umbrella") ? MAX_TABLE_ROWS : undefined,
    tableOnly,
    tableTitle:
      tableOnly && isMonthlyUmbrella && wantsBudget
        ? "Monthly spend and budget by campaign umbrella"
        : tableOnly && isMonthlyUmbrella
          ? "Monthly spend by campaign umbrella"
          : undefined,
    title:
      isMonthlyUmbrella && wantsBudget
        ? "Monthly spend and budget by campaign umbrella"
        : isMonthlyUmbrella && metrics?.length === 1 && metrics[0] === "spend"
          ? "Ad spend by campaign umbrella by month"
          : undefined,
    stripCashForGoldFilter: !lower.includes("cash for gold"),
  };
}

function applyPromptIntent(spec: AnalysisSpec, intent: PromptIntent): AnalysisSpec {
  return {
    ...spec,
    title: intent.title || spec.title,
    dateRange: intent.dateRange || spec.dateRange,
    grain: intent.grain || spec.grain,
    dimensions: intent.dimensions || spec.dimensions,
    filters: intent.stripCashForGoldFilter
      ? spec.filters.filter((filter) => !filter.value.toLowerCase().includes("cash for gold"))
      : spec.filters,
    metrics: intent.metrics || spec.metrics,
    sort: intent.sort || spec.sort,
    limit: intent.limit || spec.limit,
    widgets: intent.tableOnly
      ? [
          {
            type: "table",
            title: intent.tableTitle || "Comparison table",
            x: intent.dimensions?.[0] || spec.dimensions[0],
            metrics: intent.metrics || spec.metrics,
          },
        ]
      : spec.widgets,
  };
}

function inferDimensionsFromPrompt(lower: string): AnalysisDimension[] | undefined {
  const wantsMonth = /\bmonth(?:\s+by\s+month|ly)?\b|\bby month\b|month-by-month/.test(lower);
  const wantsWeek = /\bweek(?:\s+by\s+week|ly)?\b|\bby week\b|week-by-week/.test(lower);
  const wantsDay = /\bday(?:\s+by\s+day)?\b|\bdaily\b|\bby day\b|day-by-day/.test(lower);
  const wantsUmbrella = /\bcampaign[-\s]?umbrellas?\b|\binternal campaign umbrellas?\b|\bumbrellas?\b/.test(lower);
  const wantsCampaign = /\bcampaigns?\b/.test(lower);
  const wantsAdSet = /\bad sets?\b/.test(lower);
  const wantsAd = /\bads?\b/.test(lower);
  const wantsCreative = /\bcreatives?\b/.test(lower);
  const wantsBrand = /\bbrands?\b/.test(lower);
  const dimensions: AnalysisDimension[] = [];

  if (wantsMonth) dimensions.push("month");
  else if (wantsWeek) dimensions.push("week");
  else if (wantsDay) dimensions.push("date");

  if (wantsUmbrella) dimensions.push("campaign_umbrella");
  else if (wantsAdSet) dimensions.push("ad_set");
  else if (wantsCreative) dimensions.push("creative");
  else if (wantsAd) dimensions.push("ad");
  else if (wantsCampaign) dimensions.push("campaign");
  else if (wantsBrand) dimensions.push("brand");

  return dimensions.length ? dimensions : undefined;
}

function inferMetricsFromPrompt(lower: string): AnalysisMetric[] | undefined {
  const requested: AnalysisMetric[] = [];
  const add = (metric: AnalysisMetric) => {
    if (!requested.includes(metric)) requested.push(metric);
  };

  if (/\bad spend\b|\bspend\b|\bspent\b|\bcost\b/.test(lower)) add("spend");
  if (/\bmonthly budgets?\b|\bbudgets?\b/.test(lower)) add("monthly_budget");
  if (/\bimpressions?\b/.test(lower)) add("impressions");
  if (/\breach\b/.test(lower)) add("reach");
  if (/\bclicks?\b/.test(lower)) add("clicks");
  if (/\bleads?\b/.test(lower)) add("leads");
  if (/\bbookings?\b|\bappointments?\b/.test(lower)) add("bookings");
  if (/\bconversions?\b/.test(lower)) add("conversions");
  if (/\bctr\b/.test(lower)) add("ctr");
  if (/\bcpm\b/.test(lower)) add("cpm");
  if (/\bcpc\b/.test(lower)) add("cpc");
  if (/\bcpl\b/.test(lower)) add("cpl");
  if (/\bfrequency\b/.test(lower)) add("frequency");

  return requested.length ? requested : undefined;
}

function inferDateRangeFromPrompt(prompt: string): AnalysisSpec["dateRange"] | undefined {
  const lower = prompt.toLowerCase();
  const explicitDate = extractDate(prompt);
  if (explicitDate && /\bsince\b|\bfrom\b|\bstarting\b|\bbeginning\b/.test(lower)) {
    return { preset: "custom", start: explicitDate };
  }

  if (/\bytd\b|\byear to date\b|\bthis year\b/.test(lower)) {
    return { preset: "custom", start: `${new Date().getFullYear()}-01-01` };
  }

  return undefined;
}

function extractDate(prompt: string) {
  const isoMatch = prompt.match(/\b(20\d{2})-(\d{1,2})-(\d{1,2})\b/);
  if (isoMatch) return formatDateParts(Number(isoMatch[1]), Number(isoMatch[2]), Number(isoMatch[3]));

  const slashMatch = prompt.match(/\b(\d{1,2})\/(\d{1,2})\/(20\d{2})\b/);
  if (slashMatch) return formatDateParts(Number(slashMatch[3]), Number(slashMatch[1]), Number(slashMatch[2]));

  const monthMatch = prompt.match(
    /\b(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\s+(\d{1,2})(?:st|nd|rd|th)?(?:,)?\s+(20\d{2})\b/i,
  );
  if (monthMatch) {
    return formatDateParts(
      Number(monthMatch[3]),
      monthNumber(monthMatch[1]),
      Number(monthMatch[2]),
    );
  }

  return null;
}

function monthNumber(month: string) {
  const key = month.slice(0, 3).toLowerCase();
  return ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"].indexOf(key) + 1;
}

function formatDateParts(year: number, month: number, day: number) {
  if (!year || !month || !day) return null;
  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return null;
  }

  return [
    String(year).padStart(4, "0"),
    String(month).padStart(2, "0"),
    String(day).padStart(2, "0"),
  ].join("-");
}

function createOpenAIClient() {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new ConfigurationError("Missing OPENAI_API_KEY", ["OPENAI_API_KEY"]);
  }
  return new OpenAI({ apiKey });
}

function parseJson(content: string | null | undefined) {
  if (!content) return null;
  try {
    return JSON.parse(content) as unknown;
  } catch {
    return null;
  }
}

function rows<T>(data: unknown): T[] {
  return Array.isArray(data) ? (data as T[]) : [];
}

function round(value: number, precision = 2) {
  const factor = 10 ** precision;
  return Math.round(value * factor) / factor;
}

function uniqueAllowed<T extends string>(values: T[], allowed: readonly T[], fallback: T[]) {
  const allowedSet = new Set(allowed);
  const unique = Array.from(new Set(values.filter((value) => allowedSet.has(value))));
  return unique.length ? unique : fallback;
}

function differenceInCalendarDays(start: Date, end: Date) {
  const startUtc = Date.UTC(start.getFullYear(), start.getMonth(), start.getDate());
  const endUtc = Date.UTC(end.getFullYear(), end.getMonth(), end.getDate());
  return Math.round((endUtc - startUtc) / 86400000);
}

function isDateString(value: unknown): value is string {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function titleFromPrompt(prompt: string) {
  const trimmed = prompt.trim().replace(/\s+/g, " ");
  if (!trimmed) return "Ad-hoc Meta Ads analysis";
  return trimmed.length > 90 ? `${trimmed.slice(0, 87)}...` : trimmed;
}

function inferSearchTerm(prompt: string) {
  const lower = prompt.toLowerCase();
  if (lower.includes("cash for gold")) return "cash for gold";
  return "";
}

function labelFor(value: string) {
  const labels: Record<string, string> = {
    ad_set: "Ad Set",
    bookings: "Bookings",
    brand: "Brand",
    campaign: "Campaign",
    campaign_umbrella: "Umbrella",
    clicks: "Clicks",
    conversions: "Conversions",
    cpc: "CPC",
    cpl: "CPL",
    cpm: "CPM",
    creative: "Creative",
    ctr: "CTR",
    date: "Date",
    frequency: "Frequency",
    impressions: "Impressions",
    leads: "Leads",
    month: "Month",
    monthly_budget: "Monthly Budget",
    reach: "Reach",
    spend: "Spend",
    week: "Week",
  };
  return labels[value] || value;
}

function labelForWidget(type: AnalysisWidgetType) {
  if (type === "metric") return "Totals";
  if (type === "line") return "Trend";
  if (type === "bar") return "Comparison";
  return "Table";
}

function metricType(metric: AnalysisMetric): AnalysisTableColumn["type"] {
  if (["spend", "monthly_budget", "cpc", "cpl", "cpm"].includes(metric)) return "money";
  if (["ctr", "frequency"].includes(metric)) return metric === "ctr" ? "percent" : "number";
  return "number";
}

function describeRow(row: Record<string, string | number | null>, dimensions: AnalysisDimension[]) {
  return dimensions.map((dimension) => `${labelFor(dimension)} ${row[dimension]}`).join(", ");
}

function formatMoney(value: number | null) {
  if (value === null) return "n/a";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: value >= 100 ? 0 : 2,
  }).format(value);
}

function formatNumber(value: number | null) {
  if (value === null) return "n/a";
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(value);
}

function emptyTokenEstimate(): AnalysisResult["tokenEstimate"] {
  return {
    planInputTokens: 0,
    planOutputTokens: 0,
    analysisInputTokens: 0,
    analysisOutputTokens: 0,
    estimatedCostUsd: 0,
  };
}

function withEstimatedCost(
  estimate: AnalysisResult["tokenEstimate"],
  planModel: string,
  analysisModel: string | null,
) {
  return {
    ...estimate,
    estimatedCostUsd: round(
      costFor(planModel, estimate.planInputTokens, estimate.planOutputTokens) +
        (analysisModel
          ? costFor(analysisModel, estimate.analysisInputTokens, estimate.analysisOutputTokens)
          : 0),
      5,
    ),
  };
}

function costFor(model: string, inputTokens: number, outputTokens: number) {
  const rates = model.includes("gpt-5.5")
    ? { input: 5, output: 30 }
    : model.includes("gpt-5.4-nano")
      ? { input: 0.2, output: 1.25 }
      : model.includes("gpt-5.4-mini")
        ? { input: 0.75, output: 4.5 }
        : { input: 1, output: 5 };

  return (inputTokens / 1_000_000) * rates.input + (outputTokens / 1_000_000) * rates.output;
}

function estimateTokens(value: string) {
  return Math.ceil(value.length / 4);
}
