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
  "campaign_count",
  "ad_set_count",
  "ad_count",
  "creative_count",
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
const TABLE_LAYOUT_TYPES = ["flat", "pivot"] as const;
const DEFAULT_METRICS: AnalysisMetric[] = ["spend", "impressions", "clicks", "ctr", "cpc", "leads", "cpl"];
const MAX_DAYS = 10000;
const MAX_TABLE_ROWS = 100;
const MAX_ANALYSIS_ROWS = 18;

export type AnalysisMetric = (typeof ANALYSIS_METRICS)[number];
export type AnalysisDimension = (typeof ANALYSIS_DIMENSIONS)[number];
export type AnalysisFilterField = (typeof FILTER_FIELDS)[number];
export type AnalysisGrain = "summary" | "daily" | "weekly" | "monthly";
export type AnalysisWidgetType = (typeof WIDGET_TYPES)[number];
export type AnalysisTableLayoutType = (typeof TABLE_LAYOUT_TYPES)[number];

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
  tableLayout?: {
    type: AnalysisTableLayoutType;
    rowDimension?: AnalysisDimension;
    columnDimension?: AnalysisDimension;
    metric?: AnalysisMetric;
  };
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
  tableLayout?: AnalysisSpec["tableLayout"];
  widgets?: AnalysisSpec["widgets"];
  stripCashForGoldFilter?: boolean;
};

const metricSchema = z.enum(ANALYSIS_METRICS);
const dimensionSchema = z.enum(ANALYSIS_DIMENSIONS);
const filterFieldSchema = z.enum(FILTER_FIELDS);
const widgetTypeSchema = z.enum(WIDGET_TYPES);
const tableLayoutTypeSchema = z.enum(TABLE_LAYOUT_TYPES);

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
  tableLayout: z
    .object({
      type: tableLayoutTypeSchema.catch("flat"),
      rowDimension: dimensionSchema.optional(),
      columnDimension: dimensionSchema.optional(),
      metric: metricSchema.optional(),
    })
    .optional(),
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
            tableLayouts: TABLE_LAYOUT_TYPES,
            datePresets: DATE_PRESETS,
          },
          rules: [
            "Map campaign umbrella, internal campaign umbrella, or umbrella to the campaign_umbrella dimension. Do not use a search filter for that.",
            "For month by month, monthly, or by month, use grain monthly and include the month dimension.",
            "For since/from/starting a specific date, use preset custom with start as YYYY-MM-DD and omit end unless the user gives one.",
            "For ad spend or spend-only requests, include spend first; if no other metric is requested, use only spend.",
            "For monthly budget or budget requests, use the monthly_budget metric. Do not substitute CTR, CPC, CPL, impressions, clicks, or leads for budget.",
            "If the user asks to add budget to a spend table, use metrics ['spend','monthly_budget'] unless they explicitly request more metrics.",
            "For count/how many/number of campaigns, ad sets, ads, or creatives, use campaign_count, ad_set_count, ad_count, or creative_count. Do not list entity IDs unless the user asks to list or group by each entity.",
            "If the user asks to group by specific fields, replace dimensions with those fields instead of preserving unrelated existing dimensions.",
            "Use search filters only for free-text ad concepts, product names, or campaign/ad text explicitly named by the user.",
            "For table-format requests, return a table widget first and add charts only when the user asks for charts.",
            "For pivot, crosstab, matrix, first-row/first-column, or intersection-table requests, set tableLayout.type to pivot with rowDimension, columnDimension, and metric.",
            "For pivot tables with one time dimension and one non-time dimension, use the non-time dimension as rowDimension and the time dimension as columnDimension unless the user says otherwise.",
            "For chart/graph requests, include a line widget for time-series groupings and a bar widget for non-time groupings.",
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
            tableLayouts: TABLE_LAYOUT_TYPES,
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
            "For count/how many/number of campaigns, ad sets, ads, or creatives, use campaign_count, ad_set_count, ad_count, or creative_count. Do not list entity IDs unless the user asks to list or group by each entity.",
            "If the user asks to group by specific fields, replace dimensions with those fields instead of preserving unrelated existing dimensions.",
            "If the user says just count, only count, or no need to list IDs, remove the entity dimension and use the matching count metric.",
            "For pivot, crosstab, matrix, first-row/first-column, or intersection-table requests, set tableLayout.type to pivot with rowDimension, columnDimension, and metric.",
            "For pivot tables with one time dimension and one non-time dimension, use the non-time dimension as rowDimension and the time dimension as columnDimension unless the user says otherwise.",
            "For chart/graph requests, include a line widget for time-series groupings and a bar widget for non-time groupings.",
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
  const countMetrics = spec.metrics.filter(isCountMetric);
  const aggregateLimit =
    spec.tableLayout?.type === "pivot" || (spec.sort?.field && isCountMetric(spec.sort.field))
      ? 10000
      : spec.limit;

  const supabase = createServiceClient();
  const [aggregateRows, totalRows, countRowsByMetric, totalCountRowsByMetric, accountsRes] = await Promise.all([
    aggregateMetaInsights({
      start: range.start,
      end: range.end,
      dimensions: spec.dimensions,
      filters: spec.filters,
      sortField: spec.sort?.field,
      sortDirection: spec.sort?.direction,
      limit: aggregateLimit,
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
    Promise.all(
      countMetrics.map(async (metric) => ({
        metric,
        rows: await aggregateMetaInsights({
          start: range.start,
          end: range.end,
          dimensions: uniqueDimensions([...spec.dimensions, countDimensionForMetric(metric)]),
          filters: spec.filters,
          sortField: countDimensionForMetric(metric),
          sortDirection: "asc",
          limit: 10000,
        }),
      })),
    ),
    Promise.all(
      countMetrics.map(async (metric) => ({
        metric,
        rows: await aggregateMetaInsights({
          start: range.start,
          end: range.end,
          dimensions: [countDimensionForMetric(metric)],
          filters: spec.filters,
          sortField: countDimensionForMetric(metric),
          sortDirection: "asc",
          limit: 10000,
        }),
      })),
    ),
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
  const countRowsLookup = new Map(countRowsByMetric.map((entry) => [entry.metric, entry.rows]));
  const rowsForTable: Array<Record<string, string | number | null>> = aggregateRows.map((row) => {
    const metrics = Object.fromEntries(
      spec.metrics.map((metric) => [
        metric,
        isCountMetric(metric)
          ? countMetricForRow(row, spec.dimensions, countRowsLookup.get(metric) || [], metric)
          : aggregateMetricValue(row, metric),
      ]),
    );

    return {
      ...Object.fromEntries(spec.dimensions.map((dimension) => [dimension, aggregateDimensionValue(row, dimension)])),
      ...metrics,
      sourceRows: row.source_rows,
    };
  });
  const rowsForTableSorted = sortResultRows(rowsForTable, spec).slice(0, spec.limit);
  const table = buildResultTable(spec, rowsForTable, rowsForTableSorted);
  const totalCountRowsLookup = new Map(totalCountRowsByMetric.map((entry) => [entry.metric, entry.rows]));
  const totals = {
    ...aggregateMetrics(totalRows[0]),
    ...Object.fromEntries(
      countMetrics.map((metric) => [
        metric,
        totalCountRowsLookup.get(metric)?.filter((row) => hasCountIdentity(row, metric)).length || 0,
      ]),
    ),
  };
  const matchedRows = totalRows[0]?.source_rows || 0;

  const sourceTransparency = {
    timeRange: range,
    adAccountsAnalyzed: Array.from(accountNameById.values()),
    recordCounts: {
      meta_daily_insights: matchedRows,
      matched_insights: matchedRows,
      grouped_rows: aggregateRows.length,
      returned_rows: table.rows.length,
    },
  };

  return {
    needsNarrowing: false,
    narrowingMessage: "",
    table,
    totals,
    sourceTransparency,
  };
}

function normalizeSpec(value: unknown, prompt: string): AnalysisSpec {
  const parsed = analysisSpecSchema.safeParse(value);
  const intent = inferPromptIntent(prompt);
  const base = applyPromptIntent(parsed.success ? parsed.data : fallbackSpec(prompt), intent);
  const metrics = uniqueAllowed(base.metrics, ANALYSIS_METRICS, DEFAULT_METRICS);
  const tableLayout = normalizeTableLayout(base.tableLayout, base.dimensions, metrics);
  const dimensions = normalizeDimensions(
    tableLayout?.type === "pivot" && tableLayout.rowDimension && tableLayout.columnDimension
      ? uniqueDimensions([...base.dimensions, tableLayout.rowDimension, tableLayout.columnDimension])
      : base.dimensions,
    base.grain,
  );
  const normalizedTableLayout = normalizeTableLayout(tableLayout, dimensions, metrics);
  const filters = base.filters
    .map((filter) => ({ ...filter, value: filter.value.trim() }))
    .filter((filter) => filter.value);
  const widgets =
    normalizedTableLayout?.type === "pivot" && !base.widgets.length
      ? [
          {
            type: "table" as const,
            title: "Pivot table",
            x: normalizedTableLayout.rowDimension,
            metrics: [normalizedTableLayout.metric || metrics[0]],
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
    tableLayout: normalizedTableLayout,
    widgets,
  };
}

function normalizeTableLayout(
  tableLayout: AnalysisSpec["tableLayout"] | undefined,
  dimensions: AnalysisDimension[],
  metrics: AnalysisMetric[],
): AnalysisSpec["tableLayout"] | undefined {
  if (tableLayout?.type !== "pivot") return tableLayout?.type === "flat" ? { type: "flat" } : undefined;

  const rowDimension =
    tableLayout.rowDimension && dimensions.includes(tableLayout.rowDimension)
      ? tableLayout.rowDimension
      : dimensions.find((dimension) => !isTimeDimension(dimension)) || dimensions[0];
  const columnDimension =
    tableLayout.columnDimension && dimensions.includes(tableLayout.columnDimension)
      ? tableLayout.columnDimension
      : dimensions.find((dimension) => dimension !== rowDimension && isTimeDimension(dimension)) ||
        dimensions.find((dimension) => dimension !== rowDimension);
  const metric =
    tableLayout.metric && metrics.includes(tableLayout.metric)
      ? tableLayout.metric
      : metrics.find((candidate) => candidate !== "impressions") || metrics[0];

  if (!rowDimension || !columnDimension || !metric || rowDimension === columnDimension) return undefined;

  return {
    type: "pivot",
    rowDimension,
    columnDimension,
    metric,
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
      metrics: uniqueAllowed(widget.metrics, metrics, metrics).slice(0, 4),
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
    tableLayout: intent.tableLayout,
    widgets: intent.widgets || [],
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
  const actualDays = Math.max(1, differenceInCalendarDays(start, end) + 1);

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

function buildResultTable(
  spec: AnalysisSpec,
  allRows: Array<Record<string, string | number | null>>,
  flatRows: Array<Record<string, string | number | null>>,
): AnalysisResult["table"] {
  if (spec.tableLayout?.type !== "pivot") {
    return {
      columns: buildColumns(spec),
      rows: flatRows,
    };
  }

  return buildPivotTable(spec, allRows) || {
    columns: buildColumns(spec),
    rows: flatRows,
  };
}

function buildPivotTable(
  spec: AnalysisSpec,
  rows: Array<Record<string, string | number | null>>,
): AnalysisResult["table"] | null {
  const layout = normalizeTableLayout(spec.tableLayout, spec.dimensions, spec.metrics);
  if (!layout?.rowDimension || !layout.columnDimension || !layout.metric) return null;
  const rowDimension = layout.rowDimension;
  const columnDimension = layout.columnDimension;
  const metric = layout.metric;

  const rowLabels = new Set<string>();
  const columnLabels = new Set<string>();
  const valuesByRow = new Map<string, Map<string, number>>();
  const rowTotals = new Map<string, number>();

  rows.forEach((row) => {
    const rowLabel = String(row[rowDimension] || "n/a");
    const columnLabel = String(row[columnDimension] || "n/a");
    const value = Number(row[metric] || 0);
    rowLabels.add(rowLabel);
    columnLabels.add(columnLabel);

    const rowValues = valuesByRow.get(rowLabel) || new Map<string, number>();
    rowValues.set(columnLabel, round((rowValues.get(columnLabel) || 0) + value));
    valuesByRow.set(rowLabel, rowValues);
    rowTotals.set(rowLabel, round((rowTotals.get(rowLabel) || 0) + value));
  });

  const sortedColumns = Array.from(columnLabels).sort((a, b) =>
    comparePivotLabels(a, b, columnDimension),
  );
  const sortedRows = Array.from(rowLabels)
    .sort((a, b) => comparePivotLabels(a, b, rowDimension))
    .slice(0, spec.limit);
  const metricTypeForCells = metricType(metric);
  const pivotColumns: AnalysisTableColumn[] = [
    {
      key: rowDimension,
      label: labelFor(rowDimension),
      type: "text",
    },
    ...sortedColumns.map((label, index) => ({
      key: `pivot_${index}`,
      label,
      type: metricTypeForCells,
    })),
    {
      key: "pivot_total",
      label: `Total ${labelFor(metric)}`,
      type: metricTypeForCells,
    },
  ];
  const pivotRows = sortedRows.map((rowLabel) => {
    const rowValues = valuesByRow.get(rowLabel) || new Map<string, number>();
    return {
      [rowDimension]: rowLabel,
      ...Object.fromEntries(
        sortedColumns.map((columnLabel, index) => [`pivot_${index}`, rowValues.get(columnLabel) || 0]),
      ),
      pivot_total: rowTotals.get(rowLabel) || 0,
    };
  });

  return {
    columns: pivotColumns,
    rows: pivotRows,
  };
}

function comparePivotLabels(a: string, b: string, dimension: AnalysisDimension) {
  if (isTimeDimension(dimension)) return a.localeCompare(b, undefined, { numeric: true });
  return a.localeCompare(b, undefined, { numeric: true });
}

function aggregateMetrics(row: MetaInsightAggregateRow | undefined): Record<AnalysisMetric, number | null> {
  if (!row) {
    return {
      spend: 0,
      monthly_budget: 0,
      campaign_count: 0,
      ad_set_count: 0,
      ad_count: 0,
      creative_count: 0,
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
    campaign_count: 0,
    ad_set_count: 0,
    ad_count: 0,
    creative_count: 0,
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

function isCountMetric(value: unknown): value is AnalysisMetric {
  return (
    value === "campaign_count" ||
    value === "ad_set_count" ||
    value === "ad_count" ||
    value === "creative_count"
  );
}

function countDimensionForMetric(metric: AnalysisMetric): AnalysisDimension {
  if (metric === "campaign_count") return "campaign";
  if (metric === "ad_set_count") return "ad_set";
  if (metric === "ad_count") return "ad";
  return "creative";
}

function countIdentityFieldForMetric(metric: AnalysisMetric) {
  if (metric === "campaign_count") return "campaign_id";
  if (metric === "ad_set_count") return "ad_set_id";
  if (metric === "ad_count") return "ad_id";
  return "creative_id";
}

function hasCountIdentity(row: MetaInsightAggregateRow, metric: AnalysisMetric) {
  const value = row[countIdentityFieldForMetric(metric)];
  return Boolean(value && !String(value).toLowerCase().startsWith("unknown"));
}

function countMetricForRow(
  baseRow: MetaInsightAggregateRow,
  dimensions: AnalysisDimension[],
  countRows: MetaInsightAggregateRow[],
  metric: AnalysisMetric,
) {
  const baseKey = dimensionKey(baseRow, dimensions);
  const identityField = countIdentityFieldForMetric(metric);
  const seen = new Set<string>();

  countRows.forEach((row) => {
    if (dimensionKey(row, dimensions) !== baseKey || !hasCountIdentity(row, metric)) return;
    const identity = row[identityField];
    if (identity) seen.add(identity);
  });

  return seen.size;
}

function dimensionKey(row: MetaInsightAggregateRow, dimensions: AnalysisDimension[]) {
  return dimensions.map((dimension) => aggregateDimensionValue(row, dimension)).join("\u001f");
}

function uniqueDimensions(dimensions: AnalysisDimension[]) {
  return Array.from(new Set(dimensions));
}

function sortResultRows(
  rows: Array<Record<string, string | number | null>>,
  spec: AnalysisSpec,
) {
  const firstDimension = spec.dimensions[0];
  const sortField = spec.sort?.field || firstDimension || spec.metrics[0] || "spend";
  const isDimensionSort = ANALYSIS_DIMENSIONS.includes(sortField as AnalysisDimension);
  const sortDirection =
    spec.sort?.direction || (isTimeDimension(sortField) || isDimensionSort ? "asc" : "desc");
  const direction = sortDirection === "asc" ? 1 : -1;

  return [...rows].sort((a, b) => {
    const sorted = compareResultValues(a[sortField], b[sortField]);
    if (sorted !== 0) return sorted * direction;

    for (const dimension of spec.dimensions) {
      const tieBreak = compareResultValues(a[dimension], b[dimension]);
      if (tieBreak !== 0) return tieBreak;
    }

    return 0;
  });
}

function compareResultValues(
  a: string | number | null | undefined,
  b: string | number | null | undefined,
) {
  if (typeof a === "number" || typeof b === "number") {
    return Number(a || 0) - Number(b || 0);
  }

  return String(a || "").localeCompare(String(b || ""), undefined, { numeric: true });
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
  const scoreField = spec.tableLayout?.type === "pivot" ? "pivot_total" : firstMetric;
  const descriptionDimensions =
    spec.tableLayout?.type === "pivot" && spec.tableLayout.rowDimension
      ? [spec.tableLayout.rowDimension]
      : spec.dimensions;
  const primarySummary = spec.metrics.includes("spend")
    ? includesLeadMetrics
      ? `Total spend was ${formatMoney(spend)}, with ${formatNumber(leads)} leads${cpl === null ? "" : ` at ${formatMoney(cpl)} CPL`}.`
      : `Total spend was ${formatMoney(spend)}.`
    : `Total ${labelFor(firstMetric).toLowerCase()} ${isCountMetric(firstMetric) ? "were" : "was"} ${formatMetricForAnswer(aggregated.totals[firstMetric], firstMetric)}.`;
  const bestRow = [...aggregated.table.rows].sort((a, b) => {
    const aValue = Number(a[scoreField] || 0);
    const bValue = Number(b[scoreField] || 0);
    return bValue - aValue;
  })[0];

  return [
    `${spec.title} returned ${aggregated.table.rows.length} grouped rows from ${aggregated.sourceTransparency.recordCounts.matched_insights} matching daily records.`,
    primarySummary,
    bestRow ? `Highest ${labelFor(firstMetric).toLowerCase()} row: ${describeRow(bestRow, descriptionDimensions)}.` : "",
  ]
    .filter(Boolean)
    .join(" ");
}

function inferPromptIntent(prompt: string): PromptIntent {
  const segments = promptSegments(prompt);
  const latestPrompt = segments[segments.length - 1] || prompt;
  const hasFollowUp = segments.length > 1;
  const lower = prompt.toLowerCase();
  const latestLower = latestPrompt.toLowerCase();
  const promptForMode = hasFollowUp ? latestPrompt : prompt;
  const promptForModeLower = promptForMode.toLowerCase();
  const latestMetrics = inferMetricsFromPrompt(latestLower);
  const metrics = latestMetrics || inferMetricsFromPrompt(lower);
  const dimensions = inferDimensionsFromPrompt(latestLower, metrics) || inferDimensionsFromPrompt(lower, metrics);
  const dateRange = inferDateRangeFromPrompt(prompt);
  const grain = inferGrainFromPrompt(latestPrompt) || inferGrainFromPrompt(prompt);
  const tableOnly =
    /\btable\b|\btable format\b|\btabular\b/i.test(promptForMode) &&
    !/\bchart\b|\bgraph\b|\bline\b|\bbar\b/i.test(promptForMode);
  const firstDimension = dimensions?.[0];
  const wantsBudget = metrics?.includes("monthly_budget") || /\bbudgets?\b/.test(lower);
  const isMonthlyUmbrella = dimensions?.includes("campaign_umbrella") && dimensions.includes("month");
  const tableLayout = inferTableLayoutFromPrompt(promptForModeLower, dimensions, metrics);
  const widgets = inferWidgetsFromPrompt({
    lower: promptForModeLower,
    dimensions,
    metrics,
    tableOnly: tableOnly || tableLayout?.type === "pivot",
    tableTitle:
      tableLayout?.type === "pivot"
        ? "Pivot table"
        : tableOnly && isMonthlyUmbrella && wantsBudget
        ? "Monthly spend and budget by campaign umbrella"
        : tableOnly && isMonthlyUmbrella
          ? "Monthly spend by campaign umbrella"
          : undefined,
  });

  return {
    dateRange,
    grain,
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
    tableLayout,
    widgets,
    title:
      tableLayout?.type === "pivot"
        ? "Pivot table"
        : isMonthlyUmbrella && wantsBudget
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
    tableLayout: intent.tableLayout || spec.tableLayout,
    widgets: intent.widgets || spec.widgets,
  };
}

function inferDimensionsFromPrompt(
  lower: string,
  metrics?: AnalysisMetric[],
): AnalysisDimension[] | undefined {
  const wantsMonth = /\bmonth(?:\s+by\s+month)?\b|\bby month\b|month-by-month|\bmonthly\b(?!\s+budgets?\b)/.test(lower);
  const wantsWeek = /\bweek(?:\s+by\s+week|ly)?\b|\bby week\b|week-by-week/.test(lower);
  const wantsDay = /\bday(?:\s+by\s+day)?\b|\bdaily\b|\bby day\b|day-by-day/.test(lower);
  const wantsUmbrella = /\bcampaign[-\s]?umbrellas?\b|\binternal campaign umbrellas?\b|\bumbrellas?\b/.test(lower);
  const wantsCampaign = /\bcampaigns?\b/.test(lower) && !wantsUmbrella;
  const wantsAdSet = /\bad sets?\b/.test(lower);
  const wantsAd = /\bads?\b/.test(lower);
  const wantsCreative = /\b(?:ad\s+)?creatives?\b/.test(lower);
  const wantsBrand = /\bbrands?\b/.test(lower);
  const dimensions: AnalysisDimension[] = [];
  const countMetrics = new Set((metrics || []).filter(isCountMetric));

  if (wantsMonth) dimensions.push("month");
  else if (wantsWeek) dimensions.push("week");
  else if (wantsDay) dimensions.push("date");

  if (wantsUmbrella) dimensions.push("campaign_umbrella");
  else if (wantsAdSet && shouldUseEntityDimension(lower, "ad_set", countMetrics)) dimensions.push("ad_set");
  else if (wantsCreative && shouldUseEntityDimension(lower, "creative", countMetrics)) dimensions.push("creative");
  else if (wantsAd && shouldUseEntityDimension(lower, "ad", countMetrics)) dimensions.push("ad");
  else if (wantsCampaign && shouldUseEntityDimension(lower, "campaign", countMetrics)) dimensions.push("campaign");
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
  if (/\b(count|number of|how many)\b[^.?!\n]*\bcampaigns?\b/.test(lower) && !/\bcampaign[-\s]?umbrellas?\b/.test(lower)) {
    add("campaign_count");
  }
  if (/\b(count|number of|how many)\b[^.?!\n]*\bad sets?\b/.test(lower)) add("ad_set_count");
  if (/\b(count|number of|how many)\b[^.?!\n]*\b(?:ad\s+)?creatives?\b/.test(lower)) add("creative_count");
  if (
    /\b(count|number of|how many)\b[^.?!\n]*\bads\b/.test(lower) &&
    !/\b(count|number of|how many)\b[^.?!\n]*\b(?:ad\s+)?creatives?\b/.test(lower)
  ) {
    add("ad_count");
  }
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

function inferGrainFromPrompt(prompt: string): AnalysisGrain | undefined {
  if (/\bmonth(?:\s+by\s+month)?\b|\bby month\b|month-by-month|\bmonthly\b(?!\s+budgets?\b)/i.test(prompt)) return "monthly";
  if (/\bweek(?:\s+by\s+week|ly)?\b|\bby week\b|week-by-week/i.test(prompt)) return "weekly";
  if (/\bday(?:\s+by\s+day)?\b|\bdaily\b|\bby day\b|day-by-day/i.test(prompt)) return "daily";
  return undefined;
}

function promptSegments(prompt: string) {
  return prompt
    .split(/\n\nFollow-up:\s*/i)
    .map((segment) => segment.trim())
    .filter(Boolean);
}

function inferWidgetsFromPrompt(input: {
  lower: string;
  dimensions?: AnalysisDimension[];
  metrics?: AnalysisMetric[];
  tableOnly: boolean;
  tableTitle?: string;
}): AnalysisSpec["widgets"] | undefined {
  const dimensions = input.dimensions || [];
  const metrics = input.metrics || [];
  const x = dimensions.find(isTimeDimension) || dimensions[0];
  const tableWidget = {
    type: "table" as const,
    title: input.tableTitle || "Comparison table",
    x,
    metrics,
  };

  if (input.tableOnly) return [tableWidget];
  if (!/\b(chart|graph|plot|visuali[sz]e|trend|line|bar)\b/.test(input.lower)) return undefined;

  const chartType =
    /\bbar\b/.test(input.lower) || (!/\b(line|trend|over time)\b/.test(input.lower) && !x)
      ? ("bar" as const)
      : ("line" as const);
  const chartWidget = {
    type: chartType,
    title: chartType === "line" ? "Trend" : "Comparison",
    x,
    metrics: metrics.length ? metrics : DEFAULT_METRICS.slice(0, 2),
  };
  const wantsTableToo = /\b(add|also|include|with)\b[^.?!\n]*\b(table|chart|graph)\b|\btable\b/.test(input.lower);

  return wantsTableToo ? [tableWidget, chartWidget] : [chartWidget];
}

function inferTableLayoutFromPrompt(
  lower: string,
  dimensions?: AnalysisDimension[],
  metrics?: AnalysisMetric[],
): AnalysisSpec["tableLayout"] | undefined {
  if (
    !/\b(pivot|cross[-\s]?tab|crosstab|matrix|intersection|intersections|first column|first row)\b/.test(
      lower,
    )
  ) {
    return undefined;
  }

  const availableDimensions = dimensions || [];
  if (availableDimensions.length < 2) return undefined;

  const explicitRowDimension = dimensionNearLayoutCue(lower, "row", availableDimensions);
  const explicitColumnDimension = dimensionNearLayoutCue(lower, "column", availableDimensions);
  const timeDimension = availableDimensions.find(isTimeDimension);
  const nonTimeDimension = availableDimensions.find((dimension) => !isTimeDimension(dimension));
  const rowDimension =
    explicitRowDimension ||
    (timeDimension && nonTimeDimension ? nonTimeDimension : availableDimensions[0]);
  const columnDimension =
    explicitColumnDimension && explicitColumnDimension !== rowDimension
      ? explicitColumnDimension
      : timeDimension && timeDimension !== rowDimension
        ? timeDimension
        : availableDimensions.find((dimension) => dimension !== rowDimension);
  const metric = pivotMetricFromPrompt(lower, metrics || []);

  if (!rowDimension || !columnDimension || !metric) return undefined;

  return {
    type: "pivot",
    rowDimension,
    columnDimension,
    metric,
  };
}

function dimensionNearLayoutCue(
  lower: string,
  cue: "row" | "column",
  availableDimensions: AnalysisDimension[],
) {
  const cuePattern =
    cue === "row"
      ? "\\b(rows?|left|first\\s+column)\\b"
      : "\\b(columns?|across|top|first\\s+row)\\b";
  const match = lower.match(new RegExp(cuePattern));
  if (!match) return undefined;
  const start = Math.max((match.index || 0) - 80, 0);
  const end = Math.min((match.index || 0) + match[0].length + 80, lower.length);
  return dimensionFromText(lower.slice(start, end), availableDimensions);
}

function dimensionFromText(text: string, availableDimensions: AnalysisDimension[]) {
  const dimensionPatterns: Array<[AnalysisDimension, RegExp]> = [
    ["campaign_umbrella", /\bcampaign[-\s]?umbrellas?\b|\binternal campaign umbrellas?\b|\bumbrellas?\b/],
    ["campaign", /\bcampaigns?\b/],
    ["ad_set", /\bad sets?\b/],
    ["creative", /\b(?:ad\s+)?creatives?\b/],
    ["ad", /\bads?\b/],
    ["brand", /\bbrands?\b/],
    ["month", /\bmonths?\b|\bmonthly\b/],
    ["week", /\bweeks?\b|\bweekly\b/],
    ["date", /\bdates?\b|\bdays?\b|\bdaily\b/],
  ];

  return dimensionPatterns.find(([dimension, pattern]) => availableDimensions.includes(dimension) && pattern.test(text))?.[0];
}

function pivotMetricFromPrompt(lower: string, metrics: AnalysisMetric[]) {
  const explicitMetric = ANALYSIS_METRICS.find((metric) => metricPromptPatterns[metric]?.test(lower));
  if (explicitMetric && metrics.includes(explicitMetric)) return explicitMetric;
  return metrics.find((metric) => metric !== "impressions") || metrics[0];
}

const metricPromptPatterns: Partial<Record<AnalysisMetric, RegExp>> = {
  spend: /\bad spend\b|\bspend\b|\bspent\b|\bcost\b/,
  monthly_budget: /\bmonthly budgets?\b|\bbudgets?\b/,
  campaign_count: /\b(count|number of|how many)\b[^.?!\n]*\bcampaigns?\b/,
  ad_set_count: /\b(count|number of|how many)\b[^.?!\n]*\bad sets?\b/,
  ad_count: /\b(count|number of|how many)\b[^.?!\n]*\bads\b/,
  creative_count: /\b(count|number of|how many)\b[^.?!\n]*\b(?:ad\s+)?creatives?\b/,
  impressions: /\bimpressions?\b/,
  reach: /\breach\b/,
  clicks: /\bclicks?\b/,
  leads: /\bleads?\b/,
  bookings: /\bbookings?\b|\bappointments?\b/,
  conversions: /\bconversions?\b/,
  ctr: /\bctr\b/,
  cpm: /\bcpm\b/,
  cpc: /\bcpc\b/,
  cpl: /\bcpl\b/,
  frequency: /\bfrequency\b/,
};

function shouldUseEntityDimension(
  lower: string,
  dimension: AnalysisDimension,
  countMetrics: Set<AnalysisMetric>,
) {
  const countMetricByDimension: Partial<Record<AnalysisDimension, AnalysisMetric>> = {
    campaign: "campaign_count",
    ad_set: "ad_set_count",
    ad: "ad_count",
    creative: "creative_count",
  };
  const countMetric = countMetricByDimension[dimension];
  const asksNotToListIds = /\b(no need|don't|do not|without)\b[^.?!\n]*\b(list|show|include)\b[^.?!\n]*\b(ids?|id numbers?)\b/.test(lower);
  if (countMetric && countMetrics.has(countMetric) && !hasEntityBreakdownCue(lower, dimension)) return false;
  if (asksNotToListIds) return false;
  return hasEntityBreakdownCue(lower, dimension);
}

function hasEntityBreakdownCue(lower: string, dimension: AnalysisDimension) {
  const patternByDimension: Partial<Record<AnalysisDimension, string>> = {
    campaign: "campaigns?",
    ad_set: "ad\\s+sets?",
    ad: "ads?",
    creative: "(?:ad\\s+)?creatives?",
  };
  const pattern = patternByDimension[dimension];
  if (!pattern) return false;

  return (
    new RegExp(`\\b(by|per|each|list|show|compare|breakdown|break down)\\b[^.?!\\n]{0,60}\\b${pattern}\\b`).test(lower) ||
    new RegExp(`\\bgroup(?:ed)?\\s+by\\b[^.?!\\n]{0,60}\\b${pattern}\\b`).test(lower) ||
    new RegExp(`\\b${pattern}\\b\\s+by\\s+\\b${pattern}\\b`).test(lower)
  );
}

function isTimeDimension(value: unknown): value is AnalysisDimension {
  return value === "date" || value === "week" || value === "month";
}

function inferDateRangeFromPrompt(prompt: string): AnalysisSpec["dateRange"] | undefined {
  const lower = prompt.toLowerCase();
  const explicitDates = extractDates(prompt);
  if (explicitDates.length >= 2 && /\bthrough\b|\bto\b|\buntil\b|\bbetween\b|\band\b/.test(lower)) {
    return { preset: "custom", start: explicitDates[0], end: explicitDates[1] };
  }

  const explicitDate = explicitDates[0] || null;
  if (explicitDate && /\bsince\b|\bfrom\b|\bstarting\b|\bbeginning\b/.test(lower)) {
    return { preset: "custom", start: explicitDate };
  }

  if (/\bytd\b|\byear to date\b|\bthis year\b/.test(lower)) {
    return { preset: "custom", start: `${new Date().getFullYear()}-01-01` };
  }

  return undefined;
}

function extractDates(prompt: string) {
  const matches: Array<{ index: number; date: string }> = [];

  for (const match of prompt.matchAll(/\b(20\d{2})-(\d{1,2})-(\d{1,2})\b/g)) {
    const date = formatDateParts(Number(match[1]), Number(match[2]), Number(match[3]));
    if (date) matches.push({ index: match.index || 0, date });
  }

  for (const match of prompt.matchAll(/\b(\d{1,2})\/(\d{1,2})\/(20\d{2})\b/g)) {
    const date = formatDateParts(Number(match[3]), Number(match[1]), Number(match[2]));
    if (date) matches.push({ index: match.index || 0, date });
  }

  const monthPattern =
    /\b(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\s+(\d{1,2})(?:st|nd|rd|th)?(?:,)?\s+(20\d{2})\b/gi;
  for (const match of prompt.matchAll(monthPattern)) {
    const date = formatDateParts(Number(match[3]), monthNumber(match[1]), Number(match[2]));
    if (date) matches.push({ index: match.index || 0, date });
  }

  const seen = new Set<string>();
  return matches
    .sort((a, b) => a.index - b.index)
    .map((match) => match.date)
    .filter((date) => {
      if (seen.has(date)) return false;
      seen.add(date);
      return true;
    });
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
    ad: "Ad",
    ad_count: "Ads",
    ad_set: "Ad Set",
    ad_set_count: "Ad Sets",
    bookings: "Bookings",
    brand: "Brand",
    campaign: "Campaign",
    campaign_count: "Campaigns",
    campaign_umbrella: "Umbrella",
    clicks: "Clicks",
    conversions: "Conversions",
    cpc: "CPC",
    cpl: "CPL",
    cpm: "CPM",
    creative: "Creative",
    creative_count: "Creatives",
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

function formatMetricForAnswer(value: number | null, metric: AnalysisMetric) {
  if (metricType(metric) === "money") return formatMoney(value);
  if (metricType(metric) === "percent") return `${Number(value || 0).toFixed(2)}%`;
  return formatNumber(value);
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
