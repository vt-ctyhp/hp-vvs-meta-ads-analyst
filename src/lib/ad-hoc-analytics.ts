import OpenAI from "openai";
import { format, parseISO, subDays } from "date-fns";
import { z } from "zod";

import type { Json } from "./database.types.ts";
import {
  type AnalysisMode,
  ConfigurationError,
  getMissingDashboardEnv,
  getOpenAIAnalysisModel,
} from "./env.ts";
import { aggregateMetaInsights, type MetaInsightAggregateRow } from "./meta-insight-aggregates.ts";
import { calculateOpenAICostUsd } from "./openai-cost.ts";
import { createAdsAnalystClient, withAdsAnalystEnvironment } from "./ads-analyst-db.ts";

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
  "website_bookings",
  "messaging_contacts",
  "new_messaging_contacts",
  "primary_results",
  "secondary_results",
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
  "delivery_status",
] as const;

const DATE_PRESETS = [
  "last_7_days",
  "last_14_days",
  "last_30_days",
  "last_4_weeks",
  "last_8_weeks",
  "last_12_weeks",
  "last_90_days",
  "last_complete_week",
  "last_complete_month",
  "last_complete_quarter",
  "month_to_date",
  "week_to_date",
  "custom",
] as const;

const QUESTION_TYPES = [
  "leaderboard",
  "trend",
  "comparison",
  "diagnosis",
  "recommendation",
] as const;
const WIDGET_TYPES = ["metric", "table", "line", "bar"] as const;
const TABLE_LAYOUT_TYPES = ["flat", "pivot", "metric_rows_pivot"] as const;
const DEFAULT_METRICS: AnalysisMetric[] = ["spend", "impressions", "clicks", "ctr", "cpc", "leads", "cpl"];
const RPC_SORT_FIELDS = new Set<string>([
  "date",
  "week",
  "month",
  "brand",
  "campaign_umbrella",
  "campaign",
  "ad_set",
  "ad",
  "creative",
  "spend",
  "monthly_budget",
  "impressions",
  "clicks",
  "leads",
  "bookings",
  "conversions",
  "ctr",
  "cpm",
  "cpc",
  "cpl",
  "frequency",
]);
const MAX_DAYS = 10000;
const MAX_TABLE_ROWS = 100;
const MAX_ANALYSIS_ROWS = 18;

export type AnalysisMetric = (typeof ANALYSIS_METRICS)[number];
export type AnalysisDimension = (typeof ANALYSIS_DIMENSIONS)[number];
export type AnalysisFilterField = (typeof FILTER_FIELDS)[number];
export type AnalysisGrain = "summary" | "daily" | "weekly" | "monthly";
export type AnalysisWidgetType = (typeof WIDGET_TYPES)[number];
export type AnalysisTableLayoutType = (typeof TABLE_LAYOUT_TYPES)[number];
export type AnalysisValidationStatus = "ready" | "needs_clarification" | "unsupported";

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
    includeToday?: boolean;
    calendar?: {
      unit: "month" | "quarter";
      month?: number;
      quarter?: number;
      year?: number;
    };
    startDateParts?: {
      month: number;
      day: number;
      year?: number;
    };
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

export type AnalysisQuestionType = (typeof QUESTION_TYPES)[number];

export type AnalysisComparisonScope = {
  id: string;
  label: string;
  scopeType: "entity" | "period";
  dateRange: AnalysisSpec["dateRange"];
  filters: AnalysisFilter[];
};

export type AnalysisComparisonScopeResult = {
  scopeId: string;
  timeRange: { start: string; end: string; days: number };
  rows: MetaInsightAggregateRow[];
};

export type AnalysisComparisonScopeFact = {
  id: string;
  label: string;
  scopeType: AnalysisComparisonScope["scopeType"];
  timeRange: { start: string; end: string; days: number };
  filters: AnalysisFilter[];
  metrics: Record<AnalysisMetric, number | null>;
  sourceRows: number;
  empty: boolean;
};

export type AnalysisComparisonDelta = {
  metric: AnalysisMetric;
  fromScopeId: string;
  toScopeId: string;
  delta: number | null;
  percentDelta: number | null;
  winnerScopeId: string | null;
  winnerLabel: string | null;
};

export type AnalysisComparisonSourceNote = {
  label: string;
  timeRange: { start: string; end: string; days: number };
  filters: AnalysisFilter[];
  sourceRows: number;
  dataSource: "meta_ads";
  sourceTable: "meta_daily_insights";
  sourceFunction: "aggregate_meta_daily_insights";
};

export type AnalysisComparisonFactPack = {
  scopeType: AnalysisComparisonScope["scopeType"];
  primaryMetric: AnalysisMetric;
  metrics: AnalysisMetric[];
  scopes: AnalysisComparisonScopeFact[];
  deltas: AnalysisComparisonDelta[];
  sourceNotes: AnalysisComparisonSourceNote[];
  caveats: string[];
  groundingValues: string[];
};

export type AnalysisPlannerIntent = {
  questionType: AnalysisQuestionType;
  title: string;
  grain: AnalysisGrain;
  metrics: AnalysisMetric[];
  dimensions: AnalysisDimension[];
  filters: AnalysisFilter[];
  dateIntent: {
    dateRange: AnalysisSpec["dateRange"];
    source: "deterministic" | "model" | "fallback";
    phrase: string | null;
  };
  sort?: AnalysisSpec["sort"];
  limit: number;
  visualIntent: {
    widgets: AnalysisWidgetType[];
    tableLayout?: AnalysisTableLayoutType;
  };
  assumptions: string[];
  clarificationNeeds: string[];
  comparisonScopes?: AnalysisComparisonScope[];
};

export type AnalysisRuntimeContext = {
  dateRange?: {
    days?: number;
    startDate?: string | null;
    endDate?: string | null;
  };
  filters?: AnalysisFilter[];
};

export type AnalysisTableColumn = {
  key: string;
  label: string;
  type: "text" | "money" | "number" | "percent";
};

export type AnalysisAnalystDebug = {
  validationStatus: AnalysisValidationStatus;
  questionType?: AnalysisQuestionType;
  plannerIntent?: AnalysisPlannerIntent;
  comparison?: AnalysisComparisonFactPack | null;
  dataSource: "meta_ads";
  sourceTable: "meta_daily_insights";
  sourceFunction: "aggregate_meta_daily_insights" | null;
  resolvedDateRange: { start: string; end: string; days: number } | null;
  latestSyncedInsightDate: string | null;
  filters: AnalysisFilter[];
  metrics: AnalysisMetric[];
  dimensions: AnalysisDimension[];
  assumptions: string[];
  warnings: string[];
  unsupportedReasons: string[];
  recordCounts: Record<string, number>;
  repairedSpec: boolean;
};

export type AnalysisResult = {
  status: AnalysisValidationStatus;
  validationStatus: AnalysisValidationStatus;
  dashboardId: string | null;
  prompt: string;
  mode: AnalysisMode;
  title: string;
  answer: string;
  questionType: AnalysisQuestionType;
  plannerIntent: AnalysisPlannerIntent;
  spec: AnalysisSpec;
  resolvedSpec: AnalysisSpec;
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
    dataSource?: "meta_ads";
    sourceTable?: "meta_daily_insights";
    sourceFunction?: "aggregate_meta_daily_insights" | null;
    latestSyncedInsightDate?: string | null;
    filters?: AnalysisFilter[];
    comparisonScopes?: AnalysisComparisonSourceNote[];
  };
  comparison?: AnalysisComparisonFactPack | null;
  analystDebug: AnalysisAnalystDebug;
  warnings: string[];
  unsupportedReasons: string[];
  clarificationQuestions: string[];
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

export type DefaultAnalysisDateRange = {
  days?: number;
  startDate?: string | null;
  endDate?: string | null;
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
  requiredMetrics?: AnalysisMetric[];
  filters?: AnalysisFilter[];
  sort?: AnalysisSpec["sort"];
  limit?: number;
  tableOnly?: boolean;
  tableTitle?: string;
  title?: string;
  tableLayout?: AnalysisSpec["tableLayout"];
  widgets?: AnalysisSpec["widgets"];
  stripCashForGoldFilter?: boolean;
};

type ValidationResult = {
  status: AnalysisValidationStatus;
  warnings: string[];
  unsupportedReasons: string[];
  clarificationQuestions: string[];
  assumptions: string[];
};

type UnsupportedSourceRouter = {
  router: "website" | "social_inbox" | "crm";
  pattern: RegExp;
  reason: string;
};

const CAMPAIGN_GLOSSARY: Array<{
  label: string;
  value: string;
  pattern: RegExp;
}> = [
  {
    label: "cash for gold",
    value: "Cash for Gold US",
    pattern: /\bcash\s+for\s+gold\b/i,
  },
  {
    label: "book appointments",
    value: "Book Appts US",
    pattern:
      /\bbook\s+appts?\s+us\b|\bbook\s+appointments?\s+us\b|\bbook\s+(?:appointments?|appts?)\s+(?:ads?|campaign|umbrella)\b|\b(?:campaign|umbrella)\s+book\s+(?:appointments?|appts?)\b/i,
  },
];

const UNSUPPORTED_SOURCE_ROUTERS: UnsupportedSourceRouter[] = [
  {
    router: "website",
    pattern:
      /\b(website\s+visitors?|site\s+visitors?|landing[-\s]?pages?|page\s+views?|sessions?|traffic|utm|checkout|add\s+to\s+cart|funnel)\b/i,
    reason:
      "website_events routing is not wired into this Meta Ads ad-hoc analyst yet.",
  },
  {
    router: "social_inbox",
    pattern:
      /\b(social\s+inbox|inbox\s+response|response\s+time|employee|staff|agent|dm\s+response|comment\s+response|customer\s+messages?)\b/i,
    reason:
      "social_inbox routing is not wired into this Meta Ads ad-hoc analyst yet.",
  },
  {
    router: "crm",
    pattern:
      /\b(crm|customers?|orders?|sales\s+(?:data|orders?|revenue|amount|from|by)|revenue|invoice|deposit|closed\s+deals?|employees?)\b/i,
    reason:
      "crm routing is not wired into this Meta Ads ad-hoc analyst yet.",
  },
];

export const META_ADS_DATA_CATALOG = {
  source: "meta_ads",
  sourceTable: "meta_daily_insights",
  sourceFunction: "aggregate_meta_daily_insights",
  metrics: ANALYSIS_METRICS,
  dimensions: ANALYSIS_DIMENSIONS,
  filters: FILTER_FIELDS,
  dateSemantics:
    "Rolling last/past N day ranges end at the latest complete synced meta_daily_insights.date_start unless the prompt explicitly says including today. Last/previous/prior week, month, and quarter mean the previous complete calendar period. Past/recent/trailing month means rolling 30 days. Month-to-date and week-to-date end at the latest synced Meta Ads date.",
  sortableByRpc: Array.from(RPC_SORT_FIELDS),
  campaignGlossary: CAMPAIGN_GLOSSARY.map(({ label, value }) => ({ label, value, field: "campaign_umbrella" })),
  unsupportedRouters: UNSUPPORTED_SOURCE_ROUTERS.map(({ router, reason }) => ({ router, reason })),
} as const;

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
      includeToday: z.boolean().optional(),
      calendar: z
        .object({
          unit: z.enum(["month", "quarter"]),
          month: z.number().int().min(1).max(12).optional(),
          quarter: z.number().int().min(1).max(4).optional(),
          year: z.number().int().min(2000).max(2100).optional(),
        })
        .optional(),
      startDateParts: z
        .object({
          month: z.number().int().min(1).max(12),
          day: z.number().int().min(1).max(31),
          year: z.number().int().min(2000).max(2100).optional(),
        })
        .optional(),
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

const plannerDateRangeSchema = z.object({
  preset: z.enum(DATE_PRESETS).nullable().optional().transform((value) => value || undefined),
  start: z.string().nullable().optional().transform((value) => value || undefined),
  end: z.string().nullable().optional().transform((value) => value || undefined),
  days: z.number().int().positive().max(MAX_DAYS).nullable().optional().transform((value) => value || undefined),
  includeToday: z.boolean().nullable().optional().transform((value) => value || undefined),
}).strict();

const plannerFilterSchema = z.object({
  field: filterFieldSchema,
  operator: z.enum(["contains", "equals"]),
  value: z.string().max(120),
}).strict();

const plannerSortSchema = z.object({
  field: z.union([metricSchema, dimensionSchema]),
  direction: z.enum(["asc", "desc"]),
}).strict();

const plannerIntentOutputSchema = z.object({
  questionType: z.enum(QUESTION_TYPES),
  title: z.string().min(1).max(100),
  dateIntent: z.object({
    phrase: z.string().max(120).nullable(),
    dateRange: plannerDateRangeSchema,
    assumptions: z.array(z.string().max(200)).max(6),
  }).strict(),
  grain: z.enum(["summary", "daily", "weekly", "monthly"]),
  dimensions: z.array(dimensionSchema).min(1).max(3),
  filters: z.array(plannerFilterSchema).max(6),
  metrics: z.array(metricSchema).min(1).max(8),
  sort: plannerSortSchema.nullable(),
  limit: z.number().int().min(1).max(MAX_TABLE_ROWS),
  visualIntent: z.object({
    widgets: z.array(widgetTypeSchema).min(1).max(4),
    tableLayout: tableLayoutTypeSchema.nullable(),
  }).strict(),
  assumptions: z.array(z.string().max(200)).max(8),
  clarificationNeeds: z.array(z.string().max(200)).max(6),
}).strict();

const nullableStringSchema = { anyOf: [{ type: "string" }, { type: "null" }] } as const;
const nullableIntegerSchema = {
  anyOf: [{ type: "integer", minimum: 1, maximum: MAX_DAYS }, { type: "null" }],
} as const;
const nullableBooleanSchema = { anyOf: [{ type: "boolean" }, { type: "null" }] } as const;
const nullableDimensionSchema = { anyOf: [{ enum: ANALYSIS_DIMENSIONS }, { type: "null" }] } as const;
const nullableMetricSchema = { anyOf: [{ enum: ANALYSIS_METRICS }, { type: "null" }] } as const;

const analysisSpecResponseFormat = {
  type: "json_schema" as const,
  json_schema: {
    name: "analysis_spec",
    strict: true,
    schema: {
      type: "object",
      additionalProperties: false,
      properties: {
        title: { type: "string", minLength: 1, maxLength: 100 },
        dateRange: {
          type: "object",
          additionalProperties: false,
          properties: {
            preset: { anyOf: [{ enum: DATE_PRESETS }, { type: "null" }] },
            start: nullableStringSchema,
            end: nullableStringSchema,
            days: nullableIntegerSchema,
            includeToday: nullableBooleanSchema,
          },
          required: ["preset", "start", "end", "days", "includeToday"],
        },
        grain: { enum: ["summary", "daily", "weekly", "monthly"] },
        dimensions: {
          type: "array",
          minItems: 1,
          maxItems: 3,
          items: { enum: ANALYSIS_DIMENSIONS },
        },
        filters: {
          type: "array",
          maxItems: 6,
          items: {
            type: "object",
            additionalProperties: false,
            properties: {
              field: { enum: FILTER_FIELDS },
              operator: { enum: ["contains", "equals"] },
              value: { type: "string", maxLength: 120 },
            },
            required: ["field", "operator", "value"],
          },
        },
        metrics: {
          type: "array",
          minItems: 1,
          maxItems: 8,
          items: { enum: ANALYSIS_METRICS },
        },
        sort: {
          anyOf: [
            {
              type: "object",
              additionalProperties: false,
              properties: {
                field: { enum: [...ANALYSIS_METRICS, ...ANALYSIS_DIMENSIONS] },
                direction: { enum: ["asc", "desc"] },
              },
              required: ["field", "direction"],
            },
            { type: "null" },
          ],
        },
        limit: { type: "integer", minimum: 1, maximum: MAX_TABLE_ROWS },
        tableLayout: {
          anyOf: [
            {
              type: "object",
              additionalProperties: false,
              properties: {
                type: { enum: TABLE_LAYOUT_TYPES },
                rowDimension: nullableDimensionSchema,
                columnDimension: nullableDimensionSchema,
                metric: nullableMetricSchema,
              },
              required: ["type", "rowDimension", "columnDimension", "metric"],
            },
            { type: "null" },
          ],
        },
        widgets: {
          type: "array",
          minItems: 1,
          maxItems: 4,
          items: {
            type: "object",
            additionalProperties: false,
            properties: {
              type: { enum: WIDGET_TYPES },
              title: { type: "string", maxLength: 80 },
              x: nullableDimensionSchema,
              metrics: {
                type: "array",
                minItems: 1,
                maxItems: 6,
                items: { enum: ANALYSIS_METRICS },
              },
            },
            required: ["type", "title", "x", "metrics"],
          },
        },
      },
      required: [
        "title",
        "dateRange",
        "grain",
        "dimensions",
        "filters",
        "metrics",
        "sort",
        "limit",
        "tableLayout",
        "widgets",
      ],
    },
  },
};

const analysisPlannerIntentResponseFormat = {
  type: "json_schema" as const,
  json_schema: {
    name: "analysis_intent",
    strict: true,
    schema: {
      type: "object",
      additionalProperties: false,
      properties: {
        questionType: { enum: QUESTION_TYPES },
        title: { type: "string", minLength: 1, maxLength: 100 },
        dateIntent: {
          type: "object",
          additionalProperties: false,
          properties: {
            phrase: nullableStringSchema,
            dateRange: {
              type: "object",
              additionalProperties: false,
              properties: {
                preset: { anyOf: [{ enum: DATE_PRESETS }, { type: "null" }] },
                start: nullableStringSchema,
                end: nullableStringSchema,
                days: nullableIntegerSchema,
                includeToday: nullableBooleanSchema,
              },
              required: ["preset", "start", "end", "days", "includeToday"],
            },
            assumptions: {
              type: "array",
              maxItems: 6,
              items: { type: "string", maxLength: 200 },
            },
          },
          required: ["phrase", "dateRange", "assumptions"],
        },
        grain: { enum: ["summary", "daily", "weekly", "monthly"] },
        dimensions: {
          type: "array",
          minItems: 1,
          maxItems: 3,
          items: { enum: ANALYSIS_DIMENSIONS },
        },
        filters: {
          type: "array",
          maxItems: 6,
          items: {
            type: "object",
            additionalProperties: false,
            properties: {
              field: { enum: FILTER_FIELDS },
              operator: { enum: ["contains", "equals"] },
              value: { type: "string", maxLength: 120 },
            },
            required: ["field", "operator", "value"],
          },
        },
        metrics: {
          type: "array",
          minItems: 1,
          maxItems: 8,
          items: { enum: ANALYSIS_METRICS },
        },
        sort: {
          anyOf: [
            {
              type: "object",
              additionalProperties: false,
              properties: {
                field: { enum: [...ANALYSIS_METRICS, ...ANALYSIS_DIMENSIONS] },
                direction: { enum: ["asc", "desc"] },
              },
              required: ["field", "direction"],
            },
            { type: "null" },
          ],
        },
        limit: { type: "integer", minimum: 1, maximum: MAX_TABLE_ROWS },
        visualIntent: {
          type: "object",
          additionalProperties: false,
          properties: {
            widgets: {
              type: "array",
              minItems: 1,
              maxItems: 4,
              items: { enum: WIDGET_TYPES },
            },
            tableLayout: { anyOf: [{ enum: TABLE_LAYOUT_TYPES }, { type: "null" }] },
          },
          required: ["widgets", "tableLayout"],
        },
        assumptions: {
          type: "array",
          maxItems: 8,
          items: { type: "string", maxLength: 200 },
        },
        clarificationNeeds: {
          type: "array",
          maxItems: 6,
          items: { type: "string", maxLength: 200 },
        },
      },
      required: [
        "questionType",
        "title",
        "dateIntent",
        "grain",
        "dimensions",
        "filters",
        "metrics",
        "sort",
        "limit",
        "visualIntent",
        "assumptions",
        "clarificationNeeds",
      ],
    },
  },
};

export async function fetchSavedAnalysisDashboards(limit = 12): Promise<SavedAnalysisDashboard[]> {
  const missing = getMissingDashboardEnv();
  if (missing.length) return [];

  try {
    const supabase = createAdsAnalystClient("web");
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

export async function runSavedAdHocAnalysis(
  dashboardId: string,
  runtimeContext?: AnalysisRuntimeContext,
): Promise<AnalysisResult> {
  const dashboard = await fetchAnalysisDashboardRecord(dashboardId);
  const spec = normalizeSpec(dashboard.spec, dashboard.prompt);
  const repairedSpec = specWasRepaired(dashboard.spec, dashboard.prompt, spec);
  const resolvedSpec = applyRuntimeContext(spec, runtimeContext);
  const mode: AnalysisMode = dashboard.mode === "deep" ? "deep" : "fast";
  const planModel = dashboard.model_plan || getOpenAIAnalysisModel("fast");
  const analysisModel = dashboard.model_analysis;
  const validation = validateAnalysisSpec(dashboard.prompt, resolvedSpec, { repairedSpec });
  const plannerIntent = buildDeterministicPlannerIntent(dashboard.prompt, resolvedSpec, validation);

  if (validation.status !== "ready") {
    return nonExecutableResult({
      prompt: dashboard.prompt,
      mode,
      spec,
      resolvedSpec,
      plannerIntent,
      dashboardId: dashboard.id,
      planModel,
      analysisModel,
      tokenEstimate: emptyTokenEstimate(),
      validation,
      repairedSpec,
    });
  }

  const aggregated = await aggregateSpec(resolvedSpec, validation, repairedSpec, plannerIntent);

  return {
    ...baseResult({
      prompt: dashboard.prompt,
      mode,
      spec,
      resolvedSpec,
      plannerIntent,
      aggregated,
      dashboardId: dashboard.id,
      planModel,
      analysisModel,
      tokenEstimate: emptyTokenEstimate(),
      validation,
      repairedSpec,
    }),
    answer: aggregated.comparison
      ? buildComparisonAnswer(aggregated.comparison)
      : repairedSpec
        ? "Loaded saved dashboard spec, repaired it from the original prompt, and refreshed the data directly from Supabase."
        : "Loaded saved dashboard spec and refreshed the data directly from Supabase.",
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

  const supabase = createAdsAnalystClient("web");
  const response = await supabase
    .from("ai_analysis_dashboards")
    .update(withAdsAnalystEnvironment({
      title,
      spec: spec as unknown as Json,
    }))
    .eq("id", input.dashboardId)
    .select("id,title,prompt,mode,created_at,updated_at")
    .single();

  if (response.error) throw response.error;
  return mapSavedDashboard(response.data);
}

export async function deleteSavedAnalysisDashboard(dashboardId: string) {
  const supabase = createAdsAnalystClient("web");
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
  runtimeContext?: AnalysisRuntimeContext;
  defaultDateRange?: DefaultAnalysisDateRange;
}): Promise<AnalysisResult> {
  const prompt = input.prompt.trim();
  if (!prompt) {
    throw new ConfigurationError("Analysis prompt is required.");
  }

  const planModel = getOpenAIAnalysisModel("fast");
  const defaultDateRange = normalizeDefaultAnalysisDateRange(input.defaultDateRange);
  const preflightSpec = applyDefaultDateRange(
    normalizeSpec(fallbackSpec(prompt), prompt),
    prompt,
    defaultDateRange,
  );
  const preflightResolvedSpec = applyRuntimeContext(preflightSpec, input.runtimeContext);
  const preflightValidation = validateAnalysisSpec(prompt, preflightResolvedSpec);
  const preflightPlannerIntent = buildDeterministicPlannerIntent(prompt, preflightResolvedSpec, preflightValidation);
  if (preflightValidation.status === "unsupported") {
    return nonExecutableResult({
      prompt,
      mode: input.mode,
      spec: preflightSpec,
      resolvedSpec: preflightResolvedSpec,
      plannerIntent: preflightPlannerIntent,
      dashboardId: null,
      planModel,
      analysisModel: null,
      tokenEstimate: withEstimatedCost(emptyTokenEstimate(), planModel, null),
      validation: preflightValidation,
      repairedSpec: false,
    });
  }

  const {
    spec: generatedSpec,
    plannerIntent: generatedPlannerIntent,
    usage: planUsage,
    model: usedPlanModel,
  } = await createSpecWithAI(prompt, planModel);
  const spec = applyDefaultDateRange(generatedSpec, prompt, defaultDateRange);
  const resolvedSpec = applyRuntimeContext(spec, input.runtimeContext);
  const baseTokenEstimate = {
    ...emptyTokenEstimate(),
    planInputTokens: planUsage.input,
    planOutputTokens: planUsage.output,
  };
  const validation = validateAnalysisSpec(prompt, resolvedSpec);
  const plannerIntent = rebasePlannerIntent(prompt, resolvedSpec, validation, generatedPlannerIntent);

  if (validation.status !== "ready") {
    return nonExecutableResult({
      prompt,
      mode: input.mode,
      spec,
      resolvedSpec,
      plannerIntent,
      dashboardId: null,
      planModel: usedPlanModel,
      analysisModel: null,
      tokenEstimate: withEstimatedCost(baseTokenEstimate, usedPlanModel, null),
      validation,
      repairedSpec: false,
    });
  }

  const aggregated = await aggregateSpec(resolvedSpec, validation, false, plannerIntent);

  const analysis =
    input.mode === "deep" && !aggregated.comparison
      ? await generateDeepAnalysis(prompt, resolvedSpec, aggregated, getOpenAIAnalysisModel("deep"))
      : null;

  const resultBeforeSave = baseResult({
    prompt,
    mode: input.mode,
    spec,
    resolvedSpec,
    plannerIntent,
    aggregated,
    dashboardId: null,
    planModel: usedPlanModel,
    analysisModel: analysis?.model || null,
    tokenEstimate: withEstimatedCost(
      {
        ...baseTokenEstimate,
        analysisInputTokens: analysis?.usage.input || 0,
        analysisOutputTokens: analysis?.usage.output || 0,
      },
      usedPlanModel,
      analysis?.model || null,
    ),
    validation,
    repairedSpec: false,
  });

  const result = {
    ...resultBeforeSave,
    answer: aggregated.comparison
      ? buildComparisonAnswer(aggregated.comparison)
      : analysis?.answer || buildDeterministicAnswer(resolvedSpec, aggregated),
  };

  const persistence = await persistAnalysis(result, usedPlanModel, analysis?.model || null);
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
  runtimeContext?: AnalysisRuntimeContext;
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
  const prompt = mergePrompts(basePrompt, editPrompt);
  const preflightValidation = validateAnalysisSpec(prompt, currentSpec);
  const preflightPlannerIntent = buildDeterministicPlannerIntent(prompt, currentSpec, preflightValidation);
  if (preflightValidation.status === "unsupported") {
    return nonExecutableResult({
      prompt,
      mode: input.mode,
      spec: currentSpec,
      plannerIntent: preflightPlannerIntent,
      dashboardId: dashboard?.id || null,
      planModel,
      analysisModel: null,
      tokenEstimate: withEstimatedCost(emptyTokenEstimate(), planModel, null),
      validation: preflightValidation,
      repairedSpec: false,
    });
  }

  const { spec, usage: planUsage } = await editSpecWithAI({
    currentSpec,
    currentPrompt: basePrompt,
    editPrompt,
    model: planModel,
  });
  const resolvedSpec = applyRuntimeContext(spec, input.runtimeContext);
  const baseTokenEstimate = {
    ...emptyTokenEstimate(),
    planInputTokens: planUsage.input,
    planOutputTokens: planUsage.output,
  };
  const validation = validateAnalysisSpec(prompt, resolvedSpec);
  const plannerIntent = buildDeterministicPlannerIntent(prompt, resolvedSpec, validation);

  if (validation.status !== "ready") {
    return nonExecutableResult({
      prompt,
      mode: input.mode,
      spec,
      resolvedSpec,
      plannerIntent,
      dashboardId: dashboard?.id || null,
      planModel,
      analysisModel: null,
      tokenEstimate: withEstimatedCost(baseTokenEstimate, planModel, null),
      validation,
      repairedSpec: false,
    });
  }

  const aggregated = await aggregateSpec(resolvedSpec, validation, false, plannerIntent);

  const analysis =
    input.mode === "deep" && !aggregated.comparison
      ? await generateDeepAnalysis(prompt, resolvedSpec, aggregated, getOpenAIAnalysisModel("deep"))
      : null;

  const resultBeforeSave = baseResult({
    prompt,
    mode: input.mode,
    spec,
    resolvedSpec,
    plannerIntent,
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
    validation,
    repairedSpec: false,
  });

  const result = {
    ...resultBeforeSave,
    answer: aggregated.comparison
      ? buildComparisonAnswer(aggregated.comparison)
      : analysis?.answer || buildDeterministicAnswer(resolvedSpec, aggregated),
  };

  const persistence = await persistAnalysis(result, planModel, analysis?.model || null, dashboard?.id || null);
  return {
    ...result,
    dashboardId: persistence.dashboardId,
    persistenceWarning: persistence.warning,
  };
}

async function createSpecWithAI(prompt: string, model: string) {
  try {
    const response = await createOpenAIClient().chat.completions.create({
      model,
      response_format: analysisPlannerIntentResponseFormat,
      messages: [
        {
          role: "system",
          content:
            "You convert Meta Ads questions into governed analysis intent JSON. Return JSON matching the schema only. Never write SQL, code, raw data access, unsupported fields, or Meta mutation actions.",
        },
        {
          role: "user",
          content: JSON.stringify({
            task: "Create a governed AnalysisPlannerIntent for a Meta Ads Ask AI prompt.",
            userPrompt: prompt,
            catalog: META_ADS_DATA_CATALOG,
            questionTypes: QUESTION_TYPES,
            rules: [
              "Choose one questionType: leaderboard, trend, comparison, diagnosis, or recommendation.",
              "Use only catalog metrics, dimensions, filter fields, date presets, widget types, and table layout types.",
              "Do not output SQL, formulas, raw table names beyond the provided catalog, arbitrary sources, or unsupported fields.",
              "Metric/dimension/filter values must be exact catalog values.",
              "Map campaign umbrella, internal campaign umbrella, or umbrella to campaign_umbrella.",
              "Use exact campaign_umbrella filters for known campaign concepts: cash for gold => Cash for Gold US, book appointments => Book Appts US.",
              "Advisory prompts like waste, pause, scale, fix first, and fatigue should be recommendation questionType with evidence metrics, not generic spend leaderboards.",
              "Why, drop, improve, and what changed prompts should be diagnosis questionType with primary KPI, spend, and efficiency metrics.",
              "Trend prompts need a time dimension and line or table visual intent.",
              "Comparison prompts should keep safe shared query fields only; explicit comparison scopes are computed by later governed code.",
              "For unsupported sources such as revenue, ROAS, CRM, website, social inbox, employee, or landing-page analysis, keep a minimal Meta Ads intent; semantic validation will block the request.",
              "For since/from/starting a specific date, use custom start.",
              "For last/previous/prior week, month, and quarter, use the matching complete-calendar preset. For past/recent/trailing month, use last_30_days. For month-to-date or week-to-date, use the matching to-date preset.",
              "If no date is stated, use last_30_days and add an assumption.",
              "If no metric is stated for performance, use primary_results, spend, and an efficiency metric such as cpl or cpc.",
              "Recommendation wording must remain advisory; never claim the app will pause, edit, create, duplicate, or mutate campaigns.",
            ],
          }),
        },
      ],
    });

    const content = response.choices[0]?.message?.content;
    const plan = buildAnalysisPlanFromPlannerOutputForPrompt(parseJsonPreservingNulls(content), prompt);
    return {
      spec: plan.spec,
      plannerIntent: plan.plannerIntent,
      model: plan.plannerIntent.dateIntent.source === "fallback" ? "deterministic-fallback" : model,
      usage: {
        input: response.usage?.prompt_tokens || estimateTokens(prompt) + 900,
        output: response.usage?.completion_tokens || estimateTokens(content || ""),
      },
    };
  } catch {
    const plan = buildAnalysisPlanFromPlannerOutputForPrompt(null, prompt);
    return {
      spec: plan.spec,
      plannerIntent: plan.plannerIntent,
      model: "deterministic-fallback",
      usage: {
        input: 0,
        output: 0,
      },
    };
  }
}

async function editSpecWithAI(input: {
  currentSpec: AnalysisSpec;
  currentPrompt: string;
  editPrompt: string;
  model: string;
}) {
  const response = await createOpenAIClient().chat.completions.create({
    model: input.model,
    response_format: analysisSpecResponseFormat,
    messages: [
      {
        role: "system",
        content:
          "You edit an existing Meta Ads dashboard AnalysisSpec. Return the full updated JSON spec matching the provided schema only. Preserve existing filters/date range/metrics/widgets unless the user asks to change them. You may add, remove, rename, or reorder widgets to satisfy layout requests. Never write SQL or raw data.",
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
            "Use null for sort, tableLayout, dateRange fields, and widget x when they are not needed.",
            "If the user says add a chart/table/metric, append an appropriate widget.",
            "If the user says rearrange, update the widgets array order.",
            "If the user asks to compare by campaign, ad set, ad, creative, brand, or umbrella, adjust dimensions accordingly.",
            "Map campaign umbrella, internal campaign umbrella, or umbrella to campaign_umbrella, not to a search filter.",
            "Use exact campaign_umbrella filters for known campaign concepts: cash for gold => Cash for Gold US, book appointments => Book Appts US.",
            "If the user asks for website, social inbox, CRM, employee, landing page, or response-time data, keep the closest spec minimal; validation will mark the request unsupported. Do not substitute Meta spend/click/lead tables.",
            "For month by month, monthly, or by month, use grain monthly and include the month dimension.",
            "For since/from/starting a specific date, use preset custom with start as YYYY-MM-DD and omit end unless the user gives one.",
            "For last/previous/prior week, month, and quarter, use the matching complete-calendar preset. For past/recent/trailing month, use last_30_days. For month-to-date or week-to-date, use the matching to-date preset.",
            "For ad spend or spend-only requests, include spend first; if no other metric is requested, use only spend.",
            "For monthly budget or budget requests, use the monthly_budget metric. Do not substitute CTR, CPC, CPL, impressions, clicks, or leads for budget.",
            "If the user asks to add budget to a spend table, use metrics ['spend','monthly_budget'] unless they explicitly request more metrics.",
            "For messages, messaging, Messenger conversations, replies, or number of messages from ads, use the messaging_contacts metric. Use new_messaging_contacts only when the user explicitly asks for new messages, first replies, or new messaging contacts.",
            "For campaign result metrics, use primary_results for results, number of results, primary results, primary KPI, or KPI. Use secondary_results only when the user explicitly asks for secondary results or secondary KPI.",
            "For count/how many/number of campaigns, ad sets, ads, or creatives, use campaign_count, ad_set_count, ad_count, or creative_count. Do not list entity IDs unless the user asks to list or group by each entity.",
            "If the user asks to group by specific fields, replace dimensions with those fields instead of preserving unrelated existing dimensions.",
            "If the user says just count, only count, or no need to list IDs, remove the entity dimension and use the matching count metric.",
            "For pivot, crosstab, matrix, first-row/first-column, or intersection-table requests, set tableLayout.type to pivot with rowDimension, columnDimension, and metric.",
            "For pivot tables with one time dimension and one non-time dimension, use the non-time dimension as rowDimension and the time dimension as columnDimension unless the user says otherwise.",
            "If the user wants metrics as sub-rows under each row group, for example campaign umbrella then Spend then Primary KPI with weeks as columns, set tableLayout.type to metric_rows_pivot.",
            "Do not add multiple campaign_umbrella equals filters when campaign names are examples of desired row labels. Keep campaign_umbrella as a dimension unless the user explicitly asks to filter to one named umbrella.",
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

function applyRuntimeContext(
  spec: AnalysisSpec,
  runtimeContext?: AnalysisRuntimeContext,
): AnalysisSpec {
  if (!runtimeContext) return spec;

  const runtimeFilters = (runtimeContext.filters || [])
    .map((filter) => ({ ...filter, value: filter.value.trim() }))
    .filter((filter) => filter.value);
  const runtimeFilterFields = new Set(runtimeFilters.map((filter) => filter.field));
  const filters = [
    ...spec.filters.filter((filter) => !runtimeFilterFields.has(filter.field)),
    ...runtimeFilters,
  ];
  const runtimeDateRange = runtimeContext.dateRange;
  let dateRange = spec.dateRange;
  if (runtimeDateRange?.startDate || runtimeDateRange?.endDate) {
    dateRange = {
      preset: "custom",
      ...(runtimeDateRange.days ? { days: runtimeDateRange.days } : {}),
      start: runtimeDateRange.startDate || undefined,
      end: runtimeDateRange.endDate || undefined,
    };
  } else if (runtimeDateRange?.days) {
    dateRange = {
      days: runtimeDateRange.days,
    };
  }

  return {
    ...spec,
    dateRange,
    filters,
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

async function aggregateSpec(
  spec: AnalysisSpec,
  validation: ValidationResult = readyValidation(),
  repairedSpec = false,
  plannerIntent?: AnalysisPlannerIntent,
) {
  const latestSyncedInsightDate = await fetchLatestSyncedInsightDate();
  const range = resolveDateRange(spec.dateRange, latestSyncedInsightDate);
  const dateWarnings = latestSyncedInsightDate
    ? freshnessWarnings(spec.dateRange, latestSyncedInsightDate, range)
    : ["Could not confirm latest synced Meta insight date; date range fell back to server date."];
  const warnings = [...validation.warnings, ...dateWarnings];
  const countMetrics = spec.metrics.filter(isCountMetric);
  const needsClientSideSort = spec.sort?.field ? !RPC_SORT_FIELDS.has(spec.sort.field) : false;
  const aggregateLimit =
    isPivotTableLayoutType(spec.tableLayout?.type) || needsClientSideSort
      ? 10000
      : spec.limit;

  const supabase = createAdsAnalystClient("web");
  const aggregateRows = await aggregateMetaInsights({
    start: range.start,
    end: range.end,
    dimensions: spec.dimensions,
    filters: spec.filters,
    sortField: spec.sort?.field,
    sortDirection: spec.sort?.direction,
    limit: aggregateLimit,
  });
  const canDeriveTotalsFromGroups = !countMetrics.length && aggregateRows.length < aggregateLimit;
  const [totalRows, countRowsByMetric, totalCountRowsByMetric, accountsRes] = await Promise.all([
    canDeriveTotalsFromGroups
      ? Promise.resolve(sumAggregateRows(aggregateRows))
      : aggregateMetaInsights({
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
  const rowsForTableWithDates = completeDateRows(rowsForTable, spec, range);
  const rowsForTableSorted = sortResultRows(rowsForTableWithDates, spec).slice(0, spec.limit);
  const table = buildResultTable(spec, rowsForTableWithDates, rowsForTableSorted);
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
  const comparison = plannerIntent?.comparisonScopes?.length
    ? await aggregateComparisonScopes({
        metrics: spec.metrics,
        scopes: plannerIntent.comparisonScopes,
        latestSyncedInsightDate,
      })
    : null;

  const sourceTransparency = {
    timeRange: range,
    adAccountsAnalyzed: Array.from(accountNameById.values()),
    recordCounts: {
      meta_daily_insights: matchedRows,
      matched_insights: matchedRows,
      grouped_rows: aggregateRows.length,
      returned_rows: table.rows.length,
    },
    dataSource: "meta_ads" as const,
    sourceTable: "meta_daily_insights" as const,
    sourceFunction: "aggregate_meta_daily_insights" as const,
    latestSyncedInsightDate,
    filters: spec.filters,
    ...(comparison ? { comparisonScopes: comparison.sourceNotes } : {}),
  };
  const analystDebug = buildAnalystDebug({
    validation,
    spec,
    range,
    latestSyncedInsightDate,
    sourceFunction: "aggregate_meta_daily_insights",
    recordCounts: sourceTransparency.recordCounts,
    repairedSpec,
    warnings,
    comparison,
  });

  return {
    validationStatus: validation.status,
    warnings,
    unsupportedReasons: validation.unsupportedReasons,
    clarificationQuestions: validation.clarificationQuestions,
    table,
    totals,
    sourceTransparency,
    analystDebug,
    comparison,
  };
}

async function aggregateComparisonScopes(input: {
  metrics: AnalysisMetric[];
  scopes: AnalysisComparisonScope[];
  latestSyncedInsightDate: string | null;
}) {
  const scopeResults = await Promise.all(
    input.scopes.map(async (scope) => {
      const timeRange = resolveDateRange(scope.dateRange, input.latestSyncedInsightDate);
      return {
        scopeId: scope.id,
        timeRange,
        rows: await aggregateMetaInsights({
          start: timeRange.start,
          end: timeRange.end,
          dimensions: [],
          filters: scope.filters,
          sortField: "spend",
          sortDirection: "desc",
          limit: 1,
        }),
      };
    }),
  );

  return buildComparisonFactPack({
    metrics: input.metrics,
    scopes: input.scopes,
    scopeResults,
  });
}

export function buildComparisonFactPack(input: {
  metrics: AnalysisMetric[];
  scopes: AnalysisComparisonScope[];
  scopeResults: AnalysisComparisonScopeResult[];
}): AnalysisComparisonFactPack {
  const metrics = uniqueAllowed(input.metrics, ANALYSIS_METRICS, ["spend", "primary_results", "cpl"]);
  const primaryMetric = comparisonPrimaryMetric(metrics);
  const resultByScopeId = new Map(input.scopeResults.map((result) => [result.scopeId, result]));
  const scopes = input.scopes.map((scope) => {
    const result = resultByScopeId.get(scope.id);
    const totalRow = sumAggregateRows(result?.rows || [])[0];
    const totals = aggregateMetrics(totalRow);
    const sourceRows = totalRow?.source_rows || 0;

    return {
      id: scope.id,
      label: scope.label,
      scopeType: scope.scopeType,
      timeRange: result?.timeRange || resolveDateRange(scope.dateRange, null),
      filters: scope.filters,
      metrics: Object.fromEntries(metrics.map((metric) => [metric, totals[metric]])) as Record<
        AnalysisMetric,
        number | null
      >,
      sourceRows,
      empty: sourceRows === 0,
    };
  });
  const sourceNotes = scopes.map((scope) => ({
    label: scope.label,
    timeRange: scope.timeRange,
    filters: scope.filters,
    sourceRows: scope.sourceRows,
    dataSource: "meta_ads" as const,
    sourceTable: "meta_daily_insights" as const,
    sourceFunction: "aggregate_meta_daily_insights" as const,
  }));
  const deltas = metrics.map((metric) => comparisonDelta(metric, scopes));
  const caveats = comparisonCaveats(scopes);
  const groundingValues = comparisonGroundingValues({ scopes, deltas });

  return {
    scopeType: scopes[0]?.scopeType || "entity",
    primaryMetric,
    metrics,
    scopes,
    deltas,
    sourceNotes,
    caveats,
    groundingValues,
  };
}

export function buildComparisonAnswer(factPack: AnalysisComparisonFactPack) {
  if (!factPack.scopes.length) {
    return "No comparison scopes were available for this request.";
  }

  const labels = factPack.scopes.map((scope) => scope.label).join(" vs ");
  const primaryDelta = factPack.deltas.find((delta) => delta.metric === factPack.primaryMetric);
  const scopeFacts = factPack.scopes
    .map((scope) => {
      const metrics = factPack.metrics
        .map((metric) => `${labelFor(metric)} ${formatMetricForAnswer(scope.metrics[metric], metric)} [${scope.label}]`)
        .join(", ");
      return `${scope.label}: ${metrics}; source rows ${formatNumber(scope.sourceRows)} [${scope.label}]`;
    })
    .join(". ");
  const winningScope = factPack.scopes.find((scope) => scope.id === primaryDelta?.winnerScopeId);
  const winner = primaryDelta?.winnerLabel
    ? `Winner on ${labelFor(factPack.primaryMetric)}: ${primaryDelta.winnerLabel} at ${formatMetricForAnswer(
        winningScope?.metrics[factPack.primaryMetric] ?? null,
        factPack.primaryMetric,
      )} [${primaryDelta.winnerLabel}].`
    : `Winner on ${labelFor(factPack.primaryMetric)}: none; comparison metric is unavailable or tied.`;
  const deltaSummary = factPack.deltas
    .map((delta) => {
      const toScope = factPack.scopes.find((scope) => scope.id === delta.toScopeId);
      const fromScope = factPack.scopes.find((scope) => scope.id === delta.fromScopeId);
      return `${labelFor(delta.metric)} ${formatDelta(delta.delta, delta.metric)} (${formatPercentDelta(
        delta.percentDelta,
      )}) from ${fromScope?.label || "baseline"} to ${toScope?.label || "comparison"}`;
    })
    .join("; ");
  const sourceNotes = factPack.sourceNotes
    .map((note) =>
      `${note.label}: ${note.timeRange.start} to ${note.timeRange.end}, filters ${formatFiltersForAnswer(
        note.filters,
      )}, source rows ${formatNumber(note.sourceRows)}`,
    )
    .join("; ");
  const caveats = factPack.caveats.length ? ` Caveats: ${factPack.caveats.join(" ")}` : "";

  return `Compared ${labels}. ${scopeFacts}. ${winner} Deltas: ${deltaSummary}. Source notes: ${sourceNotes}.${caveats}`;
}

export function validateComparisonNumericGrounding(
  answer: string,
  factPack: AnalysisComparisonFactPack,
) {
  const allowed = new Set(factPack.groundingValues.map(normalizeGroundingNumber).filter(Boolean));
  return extractNumericClaims(answer).every((claim) => allowed.has(claim));
}

function comparisonPrimaryMetric(metrics: AnalysisMetric[]) {
  return metrics.find((metric) => metric !== "spend" && metric !== "primary_results") || metrics[0] || "spend";
}

function comparisonDelta(
  metric: AnalysisMetric,
  scopes: AnalysisComparisonScopeFact[],
): AnalysisComparisonDelta {
  const toScope = scopes[0];
  const fromScope = scopes[1];
  const toValue = toScope?.metrics[metric];
  const fromValue = fromScope?.metrics[metric];
  const hasComparableValues = typeof toValue === "number" && typeof fromValue === "number";
  const delta = hasComparableValues ? round(toValue - fromValue) : null;
  const percentDelta = hasComparableValues && fromValue !== 0
    ? round(((toValue - fromValue) / Math.abs(fromValue)) * 100, 1)
    : null;
  const winner = winningComparisonScope(metric, scopes);

  return {
    metric,
    fromScopeId: fromScope?.id || "",
    toScopeId: toScope?.id || "",
    delta,
    percentDelta,
    winnerScopeId: winner?.id || null,
    winnerLabel: winner?.label || null,
  };
}

function winningComparisonScope(metric: AnalysisMetric, scopes: AnalysisComparisonScopeFact[]) {
  const valued = scopes.filter((scope) => typeof scope.metrics[metric] === "number");
  if (!valued.length) return null;

  const direction = lowerIsBetterMetric(metric) ? -1 : 1;
  const sorted = [...valued].sort((a, b) => {
    const aValue = Number(a.metrics[metric]);
    const bValue = Number(b.metrics[metric]);
    return (bValue - aValue) * direction;
  });
  const best = sorted[0];
  const next = sorted[1];
  if (next && Number(best.metrics[metric]) === Number(next.metrics[metric])) return null;
  return best;
}

function lowerIsBetterMetric(metric: AnalysisMetric) {
  return metric === "cpc" || metric === "cpl" || metric === "cpm" || metric === "frequency";
}

function comparisonCaveats(scopes: AnalysisComparisonScopeFact[]) {
  const caveats = scopes
    .filter((scope) => scope.empty)
    .map((scope) => `${scope.label} had no matching rows, so its metric values are zero or unavailable.`);
  const dayCounts = new Set(scopes.map((scope) => scope.timeRange.days));
  if (dayCounts.size > 1) {
    caveats.push("Compared scopes use different day counts; interpret deltas as directional, not equal-length pacing.");
  }
  return caveats;
}

function comparisonGroundingValues(input: {
  scopes: AnalysisComparisonScopeFact[];
  deltas: AnalysisComparisonDelta[];
}) {
  const values: string[] = [];
  const add = (value: number | null | string | undefined) => {
    if (value === null || value === undefined) return;
    values.push(String(value));
  };

  input.scopes.forEach((scope) => {
    add(scope.sourceRows);
    add(scope.timeRange.days);
    Object.entries(scope.metrics).forEach(([metric, value]) => {
      add(value);
      if (typeof value === "number") add(formatMetricForAnswer(value, metric as AnalysisMetric));
    });
  });
  input.deltas.forEach((delta) => {
    add(delta.delta);
    add(delta.percentDelta);
    if (typeof delta.delta === "number") add(formatDelta(delta.delta, delta.metric));
    if (typeof delta.percentDelta === "number") add(formatPercentDelta(delta.percentDelta));
  });

  return uniqueStrings(values);
}

function formatDelta(value: number | null, metric: AnalysisMetric) {
  if (value === null) return "n/a";
  const formatted = formatMetricForAnswer(Math.abs(value), metric);
  if (value > 0) return `+${formatted}`;
  if (value < 0) return `-${formatted}`;
  return formatted;
}

function formatPercentDelta(value: number | null) {
  if (value === null) return "n/a";
  const sign = value > 0 ? "+" : "";
  return `${sign}${value.toFixed(1)}%`;
}

function formatFiltersForAnswer(filters: AnalysisFilter[]) {
  if (!filters.length) return "none";
  return filters.map((filter) => `${filter.field} ${filter.operator} ${filter.value}`).join(", ");
}

function extractNumericClaims(answer: string) {
  const withoutDates = answer.replace(/\b20\d{2}-\d{2}-\d{2}\b/g, " ");
  return Array.from(withoutDates.matchAll(/[-+]?\$?\d[\d,]*(?:\.\d+)?%?/g))
    .map((match) => normalizeGroundingNumber(match[0]))
    .filter(Boolean);
}

function normalizeGroundingNumber(value: string) {
  const cleaned = value.replace(/[$,%]/g, "").replace(/,/g, "");
  const numeric = Number(cleaned);
  return Number.isFinite(numeric) ? String(round(numeric, 4)) : "";
}

async function fetchLatestSyncedInsightDate() {
  const supabase = createAdsAnalystClient("web");
  const response = await supabase
    .from("meta_daily_insights")
    .select("date_start")
    .order("date_start", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (response.error) throw response.error;
  const value = (response.data as { date_start?: unknown } | null)?.date_start;
  return typeof value === "string" && isDateString(value) ? value : null;
}

function readyValidation(): ValidationResult {
  return {
    status: "ready",
    warnings: [],
    unsupportedReasons: [],
    clarificationQuestions: [],
    assumptions: [],
  };
}

function buildAnalystDebug(input: {
  validation: ValidationResult;
  spec: AnalysisSpec;
  range: { start: string; end: string; days: number } | null;
  latestSyncedInsightDate: string | null;
  sourceFunction: "aggregate_meta_daily_insights" | null;
  recordCounts: Record<string, number>;
  repairedSpec: boolean;
  warnings?: string[];
  comparison?: AnalysisComparisonFactPack | null;
}): AnalysisAnalystDebug {
  return {
    validationStatus: input.validation.status,
    comparison: input.comparison || null,
    dataSource: "meta_ads",
    sourceTable: "meta_daily_insights",
    sourceFunction: input.sourceFunction,
    resolvedDateRange: input.range,
    latestSyncedInsightDate: input.latestSyncedInsightDate,
    filters: input.spec.filters,
    metrics: input.spec.metrics,
    dimensions: input.spec.dimensions,
    assumptions: input.validation.assumptions,
    warnings: input.warnings || input.validation.warnings,
    unsupportedReasons: input.validation.unsupportedReasons,
    recordCounts: input.recordCounts,
    repairedSpec: input.repairedSpec,
  };
}

function freshnessWarnings(
  dateRange: AnalysisSpec["dateRange"],
  latestSyncedInsightDate: string,
  range: { start: string; end: string; days: number },
) {
  const warnings: string[] = [];
  const today = format(new Date(), "yyyy-MM-dd");

  if (!dateRange.includeToday && range.end === latestSyncedInsightDate) {
    warnings.push(
      `Date range ended at latest complete synced Meta insight date (${latestSyncedInsightDate}).`,
    );
  }

  if (dateRange.includeToday && range.end === today && latestSyncedInsightDate < today) {
    warnings.push(
      `Prompt asked to include today, but latest synced Meta insight date is ${latestSyncedInsightDate}; today may be partial or missing.`,
    );
  }

  return warnings;
}

function completeDateRows(
  rowsForTable: Array<Record<string, string | number | null>>,
  spec: AnalysisSpec,
  range: { start: string; end: string; days: number },
) {
  if (isPivotTableLayoutType(spec.tableLayout?.type) || spec.dimensions.length !== 1 || spec.dimensions[0] !== "date") {
    return rowsForTable;
  }

  const byDate = new Map(rowsForTable.map((row) => [String(row.date), row]));
  return datesInRange(range.start, range.end).map((date) => {
    const existing = byDate.get(date);
    if (existing) return existing;

    return {
      date,
      ...Object.fromEntries(spec.metrics.map((metric) => [metric, metric === "cpl" ? null : 0])),
      sourceRows: 0,
    };
  });
}

function normalizeSpec(value: unknown, prompt: string): AnalysisSpec {
  const parsed = analysisSpecSchema.safeParse(value);
  const intent = inferPromptIntent(prompt);
  const base = applyPromptIntent(parsed.success ? parsed.data : fallbackSpec(prompt), intent);
  const requiredMetrics = uniqueAllowed(intent.requiredMetrics || [], ANALYSIS_METRICS, []);
  const metrics = includeRequiredMetrics(
    uniqueAllowed(base.metrics, ANALYSIS_METRICS, DEFAULT_METRICS),
    requiredMetrics,
    8,
  );
  const tableLayout = normalizeTableLayout(base.tableLayout, base.dimensions, metrics);
  const dimensions = normalizeDimensions(
    isPivotTableLayoutType(tableLayout?.type) && tableLayout.rowDimension && tableLayout.columnDimension
      ? uniqueDimensions([...base.dimensions, tableLayout.rowDimension, tableLayout.columnDimension])
      : base.dimensions,
    base.grain,
  );
  const normalizedTableLayout = normalizeTableLayout(tableLayout, dimensions, metrics);
  const filters = repairConflictingEqualsFilters(base.filters)
    .map((filter) => ({ ...filter, value: filter.value.trim() }))
    .filter((filter) => filter.value);
  const widgets =
    isPivotTableLayoutType(normalizedTableLayout?.type) && !base.widgets.length
      ? [
          {
            type: "table" as const,
            title: "Pivot table",
            x: normalizedTableLayout.rowDimension,
            metrics:
              normalizedTableLayout.type === "metric_rows_pivot"
                ? metrics
                : [normalizedTableLayout.metric || metrics[0]],
          },
        ]
      : normalizeWidgets(base.widgets, dimensions, metrics, requiredMetrics);

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

function applyDefaultDateRange(
  spec: AnalysisSpec,
  prompt: string,
  defaultDateRange?: AnalysisSpec["dateRange"],
): AnalysisSpec {
  if (!defaultDateRange || inferDateRangeFromPrompt(prompt)) return spec;
  return { ...spec, dateRange: defaultDateRange };
}

function normalizeDefaultAnalysisDateRange(
  input?: DefaultAnalysisDateRange,
): AnalysisSpec["dateRange"] | undefined {
  if (!input) return undefined;
  const start = isDateString(input.startDate) ? input.startDate : undefined;
  const end = isDateString(input.endDate) ? input.endDate : undefined;
  const days = Number.isFinite(input.days)
    ? Math.min(Math.max(Math.floor(Number(input.days)), 1), MAX_DAYS)
    : undefined;

  if (start || end) {
    return {
      preset: "custom",
      ...(start ? { start } : {}),
      ...(end ? { end } : {}),
      ...(days ? { days } : {}),
    };
  }

  return days ? { days } : undefined;
}

export function normalizeAnalysisSpecForPrompt(
  value: unknown,
  prompt: string,
  options: { defaultDateRange?: DefaultAnalysisDateRange } = {},
): AnalysisSpec {
  return applyDefaultDateRange(
    normalizeSpec(value, prompt),
    prompt,
    normalizeDefaultAnalysisDateRange(options.defaultDateRange),
  );
}

export function buildAnalysisPlanForPrompt(
  value: unknown,
  prompt: string,
  options: { defaultDateRange?: DefaultAnalysisDateRange } = {},
) {
  const spec = normalizeAnalysisSpecForPrompt(value, prompt, options);
  const validation = validateAnalysisSpec(prompt, spec);
  const plannerIntent = buildDeterministicPlannerIntent(prompt, spec, validation);
  return {
    spec,
    questionType: plannerIntent.questionType,
    plannerIntent,
    validationStatus: validation.status,
    warnings: validation.warnings,
    unsupportedReasons: validation.unsupportedReasons,
    clarificationQuestions: validation.clarificationQuestions,
    assumptions: validation.assumptions,
  };
}

export function buildAnalysisPlanFromPlannerOutputForPrompt(
  value: unknown,
  prompt: string,
  options: { defaultDateRange?: DefaultAnalysisDateRange } = {},
) {
  const parsed = plannerIntentOutputSchema.safeParse(value);
  if (!parsed.success) {
    const fallback = buildAnalysisPlanForPrompt({}, prompt, options);
    const plannerIntent = {
      ...fallback.plannerIntent,
      dateIntent: {
        ...fallback.plannerIntent.dateIntent,
        source: "fallback" as const,
      },
      assumptions: uniqueStrings([
        "Model planner output was unavailable or malformed; deterministic planner used.",
        ...fallback.plannerIntent.assumptions,
      ]),
    };
    return {
      ...fallback,
      questionType: plannerIntent.questionType,
      plannerIntent,
      warnings: uniqueStrings([
        ...fallback.warnings,
        "Model planner output was unavailable or malformed; deterministic planner used.",
      ]),
    };
  }

  const spec = normalizeAnalysisSpecForPrompt(
    specFromPlannerIntentOutput(parsed.data, prompt),
    prompt,
    options,
  );
  const validation = validateAnalysisSpec(prompt, spec);
  const plannerIntent = buildPlannerIntent(prompt, spec, validation, "model", parsed.data);
  return {
    spec,
    questionType: plannerIntent.questionType,
    plannerIntent,
    validationStatus: validation.status,
    warnings: validation.warnings,
    unsupportedReasons: validation.unsupportedReasons,
    clarificationQuestions: validation.clarificationQuestions,
    assumptions: validation.assumptions,
  };
}

export function resolveAnalysisDateRangeForPrompt(
  prompt: string,
  latestSyncedInsightDate?: string | null,
) {
  const dateRange = inferDateRangeFromPrompt(prompt) || { preset: "last_30_days" as const };
  return resolveDateRange(dateRange, latestSyncedInsightDate);
}

function buildDeterministicPlannerIntent(
  prompt: string,
  spec: AnalysisSpec,
  validation: ValidationResult,
): AnalysisPlannerIntent {
  return buildPlannerIntent(prompt, spec, validation, "deterministic");
}

function buildPlannerIntent(
  prompt: string,
  spec: AnalysisSpec,
  validation: ValidationResult,
  source: AnalysisPlannerIntent["dateIntent"]["source"],
  modelIntent?: z.infer<typeof plannerIntentOutputSchema>,
): AnalysisPlannerIntent {
  const comparisonScopes = inferComparisonScopes(prompt, spec);

  return {
    questionType: modelIntent?.questionType || inferQuestionType(prompt),
    title: spec.title,
    grain: spec.grain,
    metrics: spec.metrics,
    dimensions: spec.dimensions,
    filters: spec.filters,
    dateIntent: {
      dateRange: spec.dateRange,
      source,
      phrase: modelIntent?.dateIntent.phrase || extractDatePhrase(prompt),
    },
    sort: spec.sort,
    limit: spec.limit,
    visualIntent: {
      widgets: spec.widgets.map((widget) => widget.type),
      ...(spec.tableLayout?.type ? { tableLayout: spec.tableLayout.type } : {}),
    },
    assumptions: uniqueStrings([
      ...(modelIntent?.assumptions || []),
      ...(modelIntent?.dateIntent.assumptions || []),
      ...validation.assumptions,
    ]),
    clarificationNeeds: uniqueStrings([
      ...(modelIntent?.clarificationNeeds || []),
      ...validation.clarificationQuestions,
    ]),
    ...(comparisonScopes.length ? { comparisonScopes } : {}),
  };
}

function rebasePlannerIntent(
  prompt: string,
  spec: AnalysisSpec,
  validation: ValidationResult,
  plannerIntent: AnalysisPlannerIntent,
): AnalysisPlannerIntent {
  const next = buildPlannerIntent(prompt, spec, validation, plannerIntent.dateIntent.source);
  return {
    ...next,
    questionType: plannerIntent.questionType,
    dateIntent: {
      ...next.dateIntent,
      phrase: plannerIntent.dateIntent.phrase || next.dateIntent.phrase,
    },
    assumptions: uniqueStrings([...plannerIntent.assumptions, ...next.assumptions]),
    clarificationNeeds: uniqueStrings([
      ...plannerIntent.clarificationNeeds,
      ...next.clarificationNeeds,
    ]),
  };
}

function specFromPlannerIntentOutput(
  output: z.infer<typeof plannerIntentOutputSchema>,
  prompt: string,
): AnalysisSpec {
  const x = output.dimensions.find(isTimeDimension) || output.dimensions[0];
  const tableLayout =
    output.visualIntent.tableLayout === "flat"
      ? ({ type: "flat" } as const)
      : output.visualIntent.tableLayout
        ? inferTableLayoutFromPrompt(prompt.toLowerCase(), output.dimensions, output.metrics)
        : undefined;

  return {
    title: output.title,
    dateRange: stripUndefinedValues(output.dateIntent.dateRange) as AnalysisSpec["dateRange"],
    grain: output.grain,
    dimensions: output.dimensions,
    filters: output.filters,
    metrics: output.metrics,
    sort: output.sort || undefined,
    limit: output.limit,
    tableLayout,
    widgets: output.visualIntent.widgets.map((type) => ({
      type,
      title: labelForWidget(type),
      ...(type === "metric" ? {} : { x }),
      metrics: type === "metric" ? output.metrics.slice(0, 4) : output.metrics,
    })),
  };
}

function validateAnalysisSpec(
  prompt: string,
  spec: AnalysisSpec,
  options: { repairedSpec?: boolean } = {},
): ValidationResult {
  const lower = prompt.toLowerCase();
  const warnings: string[] = [];
  const unsupportedReasons: string[] = [];
  const clarificationQuestions: string[] = [];
  const assumptions: string[] = [];

  for (const source of UNSUPPORTED_SOURCE_ROUTERS) {
    if (source.pattern.test(prompt)) {
      unsupportedReasons.push(`${source.reason} Matched requested source router: ${source.router}.`);
    }
  }

  const unsupportedMetricNames = unsupportedMetricMentions(lower);
  unsupportedMetricNames.forEach((metric) => {
    unsupportedReasons.push(`Metric "${metric}" is not available in the Meta Ads catalog.`);
  });

  const unsupportedDimensionNames = unsupportedDimensionMentions(lower);
  unsupportedDimensionNames.forEach((dimension) => {
    unsupportedReasons.push(`Dimension "${dimension}" is not available in the Meta Ads catalog.`);
  });

  const promptAsksForUmbrellaBreakdown =
    /\b(?:by|per|each|all|every)\s+(?:brand\s+and\s+)?(?:campaign[-\s]?umbrella|umbrella)s?\b/i.test(prompt) ||
    /\b(?:campaign[-\s]?umbrella|umbrella)s?\s+(?:as|are|is)\s+(?:rows?|columns?|headers?)\b/i.test(prompt);
  const asksForNamedUmbrella =
    !promptAsksForUmbrellaBreakdown &&
    (/\b(?:inside|within|under|in)\b[^.?!\n]{0,80}\b(?:campaign[-\s]?umbrella|umbrella|campaign)\b/i.test(prompt) ||
      /\bfor\s+(?!the\s+(?:last|past|previous|prior|recent|trailing)\b)(?!last\b)[^.?!\n]{1,80}\b(?:campaign[-\s]?umbrella|umbrella|campaign)\b/i.test(prompt) ||
      /\b(?:campaign[-\s]?umbrella|umbrella)\b[^.?!\n]{0,80}\b(?:called|named)\b/i.test(prompt));
  const hasUmbrellaFilter = spec.filters.some((filter) => filter.field === "campaign_umbrella");
  const mentionsKnownUmbrella = CAMPAIGN_GLOSSARY.some((entry) => entry.pattern.test(prompt));
  if (asksForNamedUmbrella && !hasUmbrellaFilter && !mentionsKnownUmbrella) {
    clarificationQuestions.push("Which campaign umbrella should I filter to?");
  }

  if (options.repairedSpec) {
    warnings.push("Saved spec was re-normalized from its original prompt before querying.");
  }

  if (spec.dateRange.includeToday) {
    assumptions.push("Prompt explicitly allowed including today; result may include partial synced data.");
  } else if (isCompleteCalendarDateRange(spec.dateRange)) {
    assumptions.push("Calendar date phrase resolved to a complete calendar period.");
  } else if (isToDateRange(spec.dateRange)) {
    assumptions.push("To-date range will end at the latest complete synced Meta insight date.");
  } else if (isOpenEndedCustomDateRange(spec.dateRange)) {
    assumptions.push("Open-ended since/from date range will end at the latest complete synced Meta insight date.");
  } else if (isRelativeDateRange(spec.dateRange)) {
    assumptions.push("Relative date range will end at the latest complete synced Meta insight date.");
  }

  if (spec.filters.some((filter) => filter.field === "campaign_umbrella")) {
    assumptions.push("Campaign glossary resolved named campaign concept to an exact campaign_umbrella filter.");
  }

  const status: AnalysisValidationStatus = unsupportedReasons.length
    ? "unsupported"
    : clarificationQuestions.length
      ? "needs_clarification"
      : "ready";

  return {
    status,
    warnings,
    unsupportedReasons,
    clarificationQuestions,
    assumptions,
  };
}

function unsupportedMetricMentions(lower: string) {
  const mentions: string[] = [];
  const candidates: Array<[string, RegExp]> = [
    ["ROAS", /\broas\b|\breturn\s+on\s+ad\s+spend\b/],
    ["landing page views", /\blanding\s+page\s+views?\b/],
    ["landing-page conversion rate", /\blanding[-\s]?page\s+conversion\s+rate\b|\bwebsite\s+conversion\s+rate\b/],
    ["website visitors", /\bwebsite\s+visitors?\b|\bsite\s+visitors?\b|\bvisitors?\b/],
    ["response time", /\bresponse\s+time\b/],
    ["revenue", /\brevenue\b|\bsales\s+(?:data|orders?|revenue|amount|from|by)\b|\border\s+value\b/],
    ["employee performance", /\bemployee\b|\bstaff\b|\bagent\b/],
  ];

  candidates.forEach(([label, pattern]) => {
    if (pattern.test(lower) && !mentions.includes(label)) mentions.push(label);
  });
  return mentions;
}

function unsupportedDimensionMentions(lower: string) {
  const mentions: string[] = [];
  const candidates: Array<[string, RegExp]> = [
    ["landing page", /\blanding\s+pages?\b/],
    ["employee", /\bemployees?\b|\bstaff\b|\bagents?\b/],
    ["customer", /\bcustomers?\b/],
  ];

  candidates.forEach(([label, pattern]) => {
    if (pattern.test(lower) && !mentions.includes(label)) mentions.push(label);
  });
  return mentions;
}

function specWasRepaired(rawSpec: unknown, prompt: string, normalizedSpec: AnalysisSpec) {
  const parsed = analysisSpecSchema.safeParse(rawSpec);
  if (!parsed.success) return true;
  return JSON.stringify(parsed.data) !== JSON.stringify(normalizedSpec);
}

function normalizeTableLayout(
  tableLayout: AnalysisSpec["tableLayout"] | undefined,
  dimensions: AnalysisDimension[],
  metrics: AnalysisMetric[],
): AnalysisSpec["tableLayout"] | undefined {
  if (!tableLayout) return undefined;
  if (tableLayout.type === "flat") return { type: "flat" };
  if (!isPivotTableLayoutType(tableLayout.type)) return undefined;

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
    type: tableLayout.type,
    rowDimension,
    columnDimension,
    metric,
  };
}

function isPivotTableLayoutType(type: AnalysisTableLayoutType | undefined) {
  return type === "pivot" || type === "metric_rows_pivot";
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
  requiredMetrics: AnalysisMetric[] = [],
) {
  const primaryDimension = dimensions[0];
  const normalized = widgets
    .filter((widget) => WIDGET_TYPES.includes(widget.type))
    .map((widget) => ({
      type: widget.type,
      title: widget.title || labelForWidget(widget.type),
      ...(widget.type === "metric"
        ? {}
        : { x: widget.x && dimensions.includes(widget.x) ? widget.x : primaryDimension }),
      metrics: includeRequiredMetrics(
        uniqueAllowed(widget.metrics, metrics, metrics),
        requiredMetrics,
        widget.type === "table" ? 6 : 4,
      ),
    }));

  if (normalized.length) {
    const hasTable = normalized.some((widget) => widget.type === "table");
    const metricCardsOnly = normalized.every((widget) => widget.type === "metric");
    if (hasTable || metricCardsOnly) return normalized;

    const tableWidget = {
      type: "table" as const,
      title: "Comparison table",
      x: primaryDimension,
      metrics,
    };
    return normalized.length >= 4
      ? [...normalized.slice(0, 3), tableWidget]
      : [...normalized, tableWidget];
  }

  const timeWidget = Boolean(primaryDimension && isTimeDimension(primaryDimension));
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

function resolveDateRange(dateRange: AnalysisSpec["dateRange"], latestSyncedInsightDate?: string | null) {
  const today = new Date();
  const fallbackEnd =
    !dateRange.includeToday && latestSyncedInsightDate && isDateString(latestSyncedInsightDate)
      ? parseISO(latestSyncedInsightDate)
      : today;
  const calendarRange = resolveCalendarDateRange(dateRange.calendar, fallbackEnd);
  if (calendarRange) return calendarRange;

  if (dateRange.preset === "month_to_date") {
    const start = new Date(fallbackEnd.getFullYear(), fallbackEnd.getMonth(), 1);
    return {
      start: format(start, "yyyy-MM-dd"),
      end: format(fallbackEnd, "yyyy-MM-dd"),
      days: differenceInCalendarDays(start, fallbackEnd) + 1,
    };
  }

  if (dateRange.preset === "week_to_date") {
    const start = startOfIsoWeek(fallbackEnd);
    return {
      start: format(start, "yyyy-MM-dd"),
      end: format(fallbackEnd, "yyyy-MM-dd"),
      days: differenceInCalendarDays(start, fallbackEnd) + 1,
    };
  }

  if (dateRange.preset === "last_complete_week") {
    const currentWeekStart = startOfIsoWeek(fallbackEnd);
    const end = subDays(currentWeekStart, 1);
    const start = subDays(end, 6);
    return {
      start: format(start, "yyyy-MM-dd"),
      end: format(end, "yyyy-MM-dd"),
      days: 7,
    };
  }

  if (dateRange.preset === "last_complete_month") {
    const previousMonth = new Date(fallbackEnd.getFullYear(), fallbackEnd.getMonth() - 1, 1);
    const start = new Date(previousMonth.getFullYear(), previousMonth.getMonth(), 1);
    const end = new Date(previousMonth.getFullYear(), previousMonth.getMonth() + 1, 0);
    return {
      start: format(start, "yyyy-MM-dd"),
      end: format(end, "yyyy-MM-dd"),
      days: differenceInCalendarDays(start, end) + 1,
    };
  }

  if (dateRange.preset === "last_complete_quarter") {
    const currentQuarterStartMonth = Math.floor(fallbackEnd.getMonth() / 3) * 3;
    const start = new Date(fallbackEnd.getFullYear(), currentQuarterStartMonth - 3, 1);
    const end = new Date(fallbackEnd.getFullYear(), currentQuarterStartMonth, 0);
    return {
      start: format(start, "yyyy-MM-dd"),
      end: format(end, "yyyy-MM-dd"),
      days: differenceInCalendarDays(start, end) + 1,
    };
  }
  let end = isDateString(dateRange.end) ? parseISO(dateRange.end) : fallbackEnd;
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
  const startFromParts = resolveStartDateParts(dateRange.startDateParts, end);
  let start = isDateString(dateRange.start)
    ? parseISO(dateRange.start)
    : startFromParts
      ? parseISO(startFromParts)
      : subDays(end, days - 1);
  if (start > end) [start, end] = [end, start];
  const actualDays = Math.max(1, differenceInCalendarDays(start, end) + 1);

  return {
    start: format(start, "yyyy-MM-dd"),
    end: format(end, "yyyy-MM-dd"),
    days: actualDays,
  };
}

function datesInRange(start: string, end: string) {
  const dates: string[] = [];
  let current = parseISO(start);
  const final = parseISO(end);
  while (current <= final && dates.length < MAX_DAYS) {
    dates.push(format(current, "yyyy-MM-dd"));
    current = subDays(current, -1);
  }
  return dates;
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
  if (!isPivotTableLayoutType(spec.tableLayout?.type)) {
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
  const pivotMetrics =
    spec.metrics.length > 1 ? [metric, ...spec.metrics.filter((candidate) => candidate !== metric)] : [metric];

  const rowLabels = new Set<string>();
  const columnLabels = new Set<string>();
  const valuesByRow = new Map<string, Map<string, Map<AnalysisMetric, number>>>();
  const rowTotals = new Map<string, Map<AnalysisMetric, number>>();

  rows.forEach((row) => {
    const rowLabel = String(row[rowDimension] || "n/a");
    const columnLabel = String(row[columnDimension] || "n/a");
    rowLabels.add(rowLabel);
    columnLabels.add(columnLabel);

    const rowValues = valuesByRow.get(rowLabel) || new Map<string, Map<AnalysisMetric, number>>();
    const columnValues = rowValues.get(columnLabel) || new Map<AnalysisMetric, number>();
    pivotMetrics.forEach((pivotMetric) => {
      const value = Number(row[pivotMetric] || 0);
      columnValues.set(pivotMetric, round((columnValues.get(pivotMetric) || 0) + value));

      const totals = rowTotals.get(rowLabel) || new Map<AnalysisMetric, number>();
      totals.set(pivotMetric, round((totals.get(pivotMetric) || 0) + value));
      rowTotals.set(rowLabel, totals);
    });
    rowValues.set(columnLabel, columnValues);
    valuesByRow.set(rowLabel, rowValues);
  });

  const sortedColumns = Array.from(columnLabels).sort((a, b) =>
    comparePivotLabels(a, b, columnDimension),
  );
  const sortedRows = Array.from(rowLabels)
    .sort((a, b) => comparePivotLabels(a, b, rowDimension))
    .slice(0, spec.limit);

  if (layout.type === "metric_rows_pivot") {
    const pivotColumns: AnalysisTableColumn[] = [
      {
        key: rowDimension,
        label: labelFor(rowDimension),
        type: "text",
      },
      {
        key: "pivot_metric",
        label: "Metric",
        type: "text",
      },
      ...sortedColumns.map((label, columnIndex) => ({
        key: `pivot_${columnIndex}`,
        label,
        type: "text" as const,
      })),
    ];
    const pivotRows = sortedRows.flatMap((rowLabel) => {
      const rowValues = valuesByRow.get(rowLabel) || new Map<string, Map<AnalysisMetric, number>>();
      return pivotMetrics.map((pivotMetric) => ({
        [rowDimension]: rowLabel,
        pivot_metric: labelFor(pivotMetric),
        ...Object.fromEntries(
          sortedColumns.map((columnLabel, columnIndex) => {
            const columnValues = rowValues.get(columnLabel) || new Map<AnalysisMetric, number>();
            return [`pivot_${columnIndex}`, formatMetricForAnswer(columnValues.get(pivotMetric) || 0, pivotMetric)];
          }),
        ),
      }));
    });

    return {
      columns: pivotColumns,
      rows: pivotRows,
    };
  }

  const metricTypeForCells = metricType(metric);
  const pivotMetricColumns = sortedColumns.flatMap((label, columnIndex) =>
    pivotMetrics.map((pivotMetric) => ({
      key: pivotKey(columnIndex, pivotMetric, pivotMetrics.length),
      label: pivotMetrics.length === 1 ? label : `${label} ${labelFor(pivotMetric)}`,
      type: metricType(pivotMetric),
    })),
  );
  const pivotColumns: AnalysisTableColumn[] = [
    {
      key: rowDimension,
      label: labelFor(rowDimension),
      type: "text",
    },
    ...pivotMetricColumns,
    ...pivotMetrics.map((pivotMetric, index) => ({
      key: index === 0 ? "pivot_total" : `pivot_total_${pivotMetric}`,
      label: `Total ${labelFor(pivotMetric)}`,
      type: index === 0 ? metricTypeForCells : metricType(pivotMetric),
    })),
  ];
  const pivotRows = sortedRows.map((rowLabel) => {
    const rowValues = valuesByRow.get(rowLabel) || new Map<string, Map<AnalysisMetric, number>>();
    const totals = rowTotals.get(rowLabel) || new Map<AnalysisMetric, number>();
    return {
      [rowDimension]: rowLabel,
      ...Object.fromEntries(
        sortedColumns.flatMap((columnLabel, columnIndex) => {
          const columnValues = rowValues.get(columnLabel) || new Map<AnalysisMetric, number>();
          return pivotMetrics.map((pivotMetric) => [
            pivotKey(columnIndex, pivotMetric, pivotMetrics.length),
            columnValues.get(pivotMetric) || 0,
          ]);
        }),
      ),
      pivot_total: totals.get(metric) || 0,
      ...Object.fromEntries(
        pivotMetrics.slice(1).map((pivotMetric) => [`pivot_total_${pivotMetric}`, totals.get(pivotMetric) || 0]),
      ),
    };
  });

  return {
    columns: pivotColumns,
    rows: pivotRows,
  };
}

function pivotKey(columnIndex: number, metric: AnalysisMetric, metricCount: number) {
  return metricCount === 1 ? `pivot_${columnIndex}` : `pivot_${columnIndex}_${metric}`;
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
    website_bookings: row.website_bookings,
    messaging_contacts: row.messaging_contacts,
    new_messaging_contacts: row.new_messaging_contacts,
    primary_results: row.primary_results,
    secondary_results: row.secondary_results,
    ctr: row.ctr,
    cpm: row.cpm,
    cpc: row.cpc,
    cpl: row.cpl,
    frequency: row.frequency,
  };
}

function sumAggregateRows(rows: MetaInsightAggregateRow[]) {
  if (!rows.length) return [];

  const totals = rows.reduce(
    (sum, row) => {
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
      sum.source_rows += row.source_rows;
      return sum;
    },
    {
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
      source_rows: 0,
    },
  );

  return [
    {
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
      ...totals,
      spend: round(totals.spend),
      monthly_budget: round(totals.monthly_budget),
      website_bookings: round(totals.website_bookings),
      messaging_contacts: round(totals.messaging_contacts),
      new_messaging_contacts: round(totals.new_messaging_contacts),
      primary_results: round(totals.primary_results),
      secondary_results: round(totals.secondary_results),
      ctr: totals.impressions > 0 ? round((totals.clicks / totals.impressions) * 100) : 0,
      cpm: totals.impressions > 0 ? round((totals.spend / totals.impressions) * 1000) : 0,
      cpc: totals.clicks > 0 ? round(totals.spend / totals.clicks) : 0,
      cpl: totals.leads > 0 ? round(totals.spend / totals.leads) : null,
      frequency: totals.reach > 0 ? round(totals.impressions / totals.reach) : 0,
    } satisfies MetaInsightAggregateRow,
  ];
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
  resolvedSpec?: AnalysisSpec;
  plannerIntent: AnalysisPlannerIntent;
  aggregated: Awaited<ReturnType<typeof aggregateSpec>>;
  dashboardId: string | null;
  planModel: string;
  analysisModel: string | null;
  tokenEstimate: AnalysisResult["tokenEstimate"];
  validation: ValidationResult;
  repairedSpec: boolean;
}): AnalysisResult {
  const resolvedSpec = input.resolvedSpec || input.spec;
  return {
    status: input.validation.status,
    validationStatus: input.validation.status,
    dashboardId: input.dashboardId,
    prompt: input.prompt,
    mode: input.mode,
    title: input.spec.title,
    answer: "",
    questionType: input.plannerIntent.questionType,
    plannerIntent: input.plannerIntent,
    spec: input.spec,
    resolvedSpec,
    table: input.aggregated.table,
    totals: input.aggregated.totals,
    widgets: resolvedSpec.widgets,
    sourceTransparency: input.aggregated.sourceTransparency,
    comparison: input.aggregated.comparison,
    analystDebug: {
      ...input.aggregated.analystDebug,
      questionType: input.plannerIntent.questionType,
      plannerIntent: input.plannerIntent,
    },
    warnings: input.aggregated.warnings,
    unsupportedReasons: input.aggregated.unsupportedReasons,
    clarificationQuestions: input.aggregated.clarificationQuestions,
    modelUsed: {
      plan: input.planModel,
      analysis: input.analysisModel,
    },
    tokenEstimate: input.tokenEstimate,
  };
}

function nonExecutableResult(input: {
  prompt: string;
  mode: AnalysisMode;
  spec: AnalysisSpec;
  resolvedSpec?: AnalysisSpec;
  plannerIntent: AnalysisPlannerIntent;
  dashboardId: string | null;
  planModel: string;
  analysisModel: string | null;
  tokenEstimate: AnalysisResult["tokenEstimate"];
  validation: ValidationResult;
  repairedSpec: boolean;
}): AnalysisResult {
  const resolvedSpec = input.resolvedSpec || input.spec;
  const range = resolveDateRange(resolvedSpec.dateRange, null);
  const recordCounts = {
    meta_daily_insights: 0,
    matched_insights: 0,
    grouped_rows: 0,
    returned_rows: 0,
  };
  const sourceTransparency: AnalysisResult["sourceTransparency"] = {
    timeRange: range,
    adAccountsAnalyzed: [],
    recordCounts,
    dataSource: "meta_ads",
    sourceTable: "meta_daily_insights",
    sourceFunction: null,
    latestSyncedInsightDate: null,
    filters: resolvedSpec.filters,
  };
  const analystDebug = buildAnalystDebug({
    validation: input.validation,
    spec: resolvedSpec,
    range,
    latestSyncedInsightDate: null,
    sourceFunction: null,
    recordCounts,
    repairedSpec: input.repairedSpec,
    warnings: input.validation.warnings,
  });

  return {
    status: input.validation.status,
    validationStatus: input.validation.status,
    dashboardId: input.dashboardId,
    prompt: input.prompt,
    mode: input.mode,
    title: input.spec.title,
    answer: buildValidationAnswer(input.validation),
    questionType: input.plannerIntent.questionType,
    plannerIntent: input.plannerIntent,
    spec: input.spec,
    resolvedSpec,
    table: {
      columns: [],
      rows: [],
    },
    totals: aggregateMetrics(undefined),
    widgets: [],
    sourceTransparency,
    comparison: null,
    analystDebug: {
      ...analystDebug,
      questionType: input.plannerIntent.questionType,
      plannerIntent: input.plannerIntent,
    },
    warnings: input.validation.warnings,
    unsupportedReasons: input.validation.unsupportedReasons,
    clarificationQuestions: input.validation.clarificationQuestions,
    modelUsed: {
      plan: input.planModel,
      analysis: input.analysisModel,
    },
    tokenEstimate: input.tokenEstimate,
  };
}

function buildValidationAnswer(validation: ValidationResult) {
  if (validation.status === "unsupported") {
    return [
      "I cannot generate this table from the current Meta Ads ad-hoc source.",
      ...validation.unsupportedReasons,
    ].join(" ");
  }

  if (validation.status === "needs_clarification") {
    return validation.clarificationQuestions.join(" ");
  }

  return "";
}

async function persistAnalysis(
  result: AnalysisResult,
  planModel: string,
  analysisModel: string | null,
  dashboardId?: string | null,
) {
  try {
    const supabase = createAdsAnalystClient("web");
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
          .update(withAdsAnalystEnvironment(dashboardPayload))
          .eq("id", dashboardId)
          .select("id")
          .single()
      : await supabase
          .from("ai_analysis_dashboards")
          .insert(withAdsAnalystEnvironment({
            ...dashboardPayload,
          }))
          .select("id")
          .single();

    if (savedDashboard.error) throw savedDashboard.error;

    const savedDashboardId = String((savedDashboard.data as { id: string }).id);
    await supabase.from("ai_analysis_runs").insert(withAdsAnalystEnvironment({
      dashboard_id: savedDashboardId,
      prompt: result.prompt,
      mode: result.mode,
      model_plan: planModel,
      model_analysis: analysisModel,
      token_estimate: result.tokenEstimate as unknown as Json,
      source_transparency: result.sourceTransparency as unknown as Json,
      result_preview: {
        title: result.title,
        answer: result.answer,
        questionType: result.questionType,
        validationStatus: result.validationStatus,
        rowCount: result.table.rows.length,
        widgets: result.widgets.map((widget) => widget.type),
        warnings: result.warnings,
        assumptions: result.plannerIntent.assumptions,
        sourceNotes: result.sourceTransparency,
        plannerIntent: result.plannerIntent,
        keyFacts: {
          totals: result.totals,
          firstRows: result.table.rows.slice(0, 3),
          comparison: result.comparison,
        },
      } as unknown as Json,
    }));

    return { dashboardId: savedDashboardId };
  } catch (error) {
    return {
      dashboardId: null,
      warning: error instanceof Error ? error.message : String(error),
    };
  }
}

async function fetchAnalysisDashboardRecord(dashboardId: string): Promise<AnalysisDashboardRecord> {
  const supabase = createAdsAnalystClient("web");
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
  const scoreField = spec.tableLayout?.type === "metric_rows_pivot"
    ? null
    : spec.tableLayout?.type === "pivot"
      ? "pivot_total"
      : firstMetric;
  const descriptionDimensions =
    isPivotTableLayoutType(spec.tableLayout?.type) && spec.tableLayout.rowDimension
      ? [spec.tableLayout.rowDimension]
      : spec.dimensions;
  const primarySummary = spec.metrics.includes("spend")
    ? includesLeadMetrics
      ? `Total spend was ${formatMoney(spend)}, with ${formatNumber(leads)} leads${cpl === null ? "" : ` at ${formatMoney(cpl)} CPL`}.`
      : `Total spend was ${formatMoney(spend)}.`
    : `Total ${labelFor(firstMetric).toLowerCase()} ${isCountMetric(firstMetric) ? "were" : "was"} ${formatMetricForAnswer(aggregated.totals[firstMetric], firstMetric)}.`;
  const bestRow = scoreField
    ? [...aggregated.table.rows].sort((a, b) => {
        const aValue = Number(a[scoreField] || 0);
        const bValue = Number(b[scoreField] || 0);
        return bValue - aValue;
      })[0]
    : null;

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
  const scaleDecision = inferScaleDecisionIntent(promptForModeLower) || inferScaleDecisionIntent(lower);
  const recommendationDecision =
    inferRecommendationDecisionIntent(promptForModeLower) || inferRecommendationDecisionIntent(lower);
  const decisionIntent = scaleDecision || recommendationDecision;
  const latestMetrics = inferMetricsFromPrompt(latestLower);
  const allMentionedMetrics = inferMetricsFromPrompt(lower);
  const additiveFollowUp = hasFollowUp && latestMetrics && shouldAddFollowUpMetrics(latestLower);
  const inferredMetrics = decisionIntent
    ? mergeMetricLists(decisionIntent.metrics, additiveFollowUp ? mergeMetricLists(allMentionedMetrics || [], latestMetrics || []) : latestMetrics || allMentionedMetrics || [])
    : additiveFollowUp
    ? mergeMetricLists(allMentionedMetrics || [], latestMetrics)
    : latestMetrics || allMentionedMetrics;
  const metrics = hasExplicitComparisonCue(lower) ? comparisonMetricBundle(inferredMetrics) : inferredMetrics;
  const requiredMetrics = metrics;
  const latestDimensions = inferDimensionsFromPrompt(latestLower, metrics);
  const allMentionedDimensions = inferDimensionsFromPrompt(lower, metrics);
  const scopedComparisonDimension = inferEntityComparisonDimension(prompt);
  const inferredDimensions =
    decisionIntent
      ? uniqueDimensions([
          ...decisionIntent.dimensions,
          ...((latestDimensions || allMentionedDimensions || []).filter(
            (dimension) => !decisionIntent.dimensions.includes(dimension),
          )),
        ])
      :
    (hasFollowUp && shouldMergeFollowUpDimensions(latestLower, latestDimensions, allMentionedDimensions)
      ? mergeDimensionsForFollowUp(allMentionedDimensions || [], latestDimensions || [])
      : latestDimensions || allMentionedDimensions);
  const dimensions = scopedComparisonDimension && hasExplicitComparisonCue(lower)
    ? uniqueDimensions([scopedComparisonDimension, ...(inferredDimensions || []).filter((dimension) => dimension !== scopedComparisonDimension)])
    : inferredDimensions;
  const dateRange = inferDateRangeFromPromptSegments(segments, prompt);
  const grain = inferGrainFromPrompt(latestPrompt) || inferGrainFromPrompt(prompt);
  const glossaryFilters = campaignGlossaryFilters(prompt);
  const searchTerm = inferSearchTerm(prompt);
  const filters = [
    ...glossaryFilters,
    ...(searchTerm ? [{ field: "search" as const, operator: "contains" as const, value: searchTerm }] : []),
  ];
  const tableOnly =
    /\btable\b|\btable format\b|\btabular\b/i.test(promptForMode) &&
    !/\bchart\b|\bgraph\b|\bline\b|\bbar\b/i.test(promptForMode);
  const summaryOnly = wantsSummaryOnly(promptForModeLower);
  const intendedDimensions: AnalysisDimension[] | undefined = summaryOnly ? ["brand"] : dimensions;
  const intendedMetrics = summaryOnly && !metrics ? DEFAULT_METRICS.slice(0, 4) : metrics;
  const firstDimension = intendedDimensions?.[0];
  const wantsBudget = metrics?.includes("monthly_budget") || /\bbudgets?\b/.test(lower);
  const isMonthlyUmbrella = intendedDimensions?.includes("campaign_umbrella") && intendedDimensions.includes("month");
  const tableLayout = summaryOnly
    ? undefined
    : inferTableLayoutFromPrompt(promptForModeLower, intendedDimensions, intendedMetrics) ||
      (hasFollowUp ? inferTableLayoutFromPrompt(lower, intendedDimensions, intendedMetrics) : undefined);
  const widgets = summaryOnly
    ? [
        {
          type: "metric" as const,
          title: "Totals",
          metrics: (intendedMetrics || DEFAULT_METRICS).slice(0, 4),
        },
      ]
    : inferWidgetsFromPrompt({
        lower: promptForModeLower,
        dimensions: intendedDimensions,
        metrics: intendedMetrics,
        tableOnly: tableOnly || isPivotTableLayoutType(tableLayout?.type),
        tableTitle:
          isPivotTableLayoutType(tableLayout?.type)
            ? "Pivot table"
            : tableOnly && isMonthlyUmbrella && wantsBudget
              ? "Monthly spend and budget by campaign umbrella"
              : tableOnly && isMonthlyUmbrella
                ? "Monthly spend by campaign umbrella"
                : undefined,
      });

  return {
    dateRange,
    grain: summaryOnly ? "summary" : grain,
    dimensions: intendedDimensions,
    metrics: intendedMetrics,
    requiredMetrics,
    filters: filters.length ? filters : undefined,
    sort: summaryOnly ? undefined : decisionIntent?.sort || inferSortFromPrompt(promptForModeLower, firstDimension, intendedMetrics),
    limit: decisionIntent?.limit || inferLimitFromPrompt(promptForModeLower, intendedDimensions),
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
      isPivotTableLayoutType(tableLayout?.type)
        ? "Pivot table"
        : isMonthlyUmbrella && wantsBudget
          ? "Monthly spend and budget by campaign umbrella"
          : isMonthlyUmbrella && metrics?.length === 1 && metrics[0] === "spend"
            ? "Ad spend by campaign umbrella by month"
            : undefined,
    stripCashForGoldFilter: !glossaryFilters.length,
  };
}

function applyPromptIntent(spec: AnalysisSpec, intent: PromptIntent): AnalysisSpec {
  const filteredSpecFilters = intent.stripCashForGoldFilter
    ? spec.filters.filter((filter) => !isGlossaryFilter(filter))
    : spec.filters;

  return {
    ...spec,
    title: intent.title || spec.title,
    dateRange: intent.dateRange || spec.dateRange,
    grain: intent.grain || spec.grain,
    dimensions: intent.dimensions || spec.dimensions,
    filters: mergeFilters(filteredSpecFilters, intent.filters || []),
    metrics: intent.metrics || spec.metrics,
    sort: intent.sort || spec.sort,
    limit: intent.limit || spec.limit,
    tableLayout: intent.tableLayout || spec.tableLayout,
    widgets: intent.widgets || spec.widgets,
  };
}

function shouldAddFollowUpMetrics(lower: string) {
  return /^\s*and\b|\b(add|include|bring in|add in|also|with|plus|alongside|keep|preserve|too)\b|\bas well\b/.test(
    lower,
  );
}

function mergeMetricLists(base: AnalysisMetric[], additions: AnalysisMetric[]) {
  return includeRequiredMetrics(base, additions, 8);
}

function comparisonMetricBundle(metrics?: AnalysisMetric[]) {
  const merged: AnalysisMetric[] = metrics?.length ? [...metrics] : ["spend", "primary_results", "cpl"];
  (["spend", "primary_results"] as AnalysisMetric[]).forEach((metric) => {
    if (!merged.includes(metric)) merged.push(metric);
  });
  if (!merged.some((metric) => metric === "cpl" || metric === "cpc" || metric === "cpm")) {
    merged.push("cpl");
  }
  return merged.slice(0, 8);
}

function hasExplicitComparisonCue(lower: string) {
  return /\b(vs\.?|versus|against)\b/.test(lower);
}

function includeRequiredMetrics(
  metrics: AnalysisMetric[],
  requiredMetrics: AnalysisMetric[],
  maxMetrics: number,
) {
  const allowedRequired = uniqueAllowed(requiredMetrics, ANALYSIS_METRICS, []).filter((metric) =>
    metrics.includes(metric) || ANALYSIS_METRICS.includes(metric),
  );
  const merged = [...metrics];
  allowedRequired.forEach((metric) => {
    if (!merged.includes(metric)) merged.push(metric);
  });

  if (merged.length <= maxMetrics) return merged;

  const requiredSet = new Set(allowedRequired);
  const required = merged.filter((metric) => requiredSet.has(metric));
  const optional = merged.filter((metric) => !requiredSet.has(metric));
  const optionalSlots = Math.max(maxMetrics - required.length, 0);
  return [...optional.slice(0, optionalSlots), ...required].slice(0, maxMetrics);
}

function mergeFilters(baseFilters: AnalysisFilter[], intendedFilters: AnalysisFilter[]) {
  const intendedHasGlossaryFilter = intendedFilters.some(
    (filter) => filter.field === "campaign_umbrella" && isGlossaryFilter(filter),
  );
  const merged = intendedHasGlossaryFilter ? baseFilters.filter((filter) => !isGlossaryFilter(filter)) : [...baseFilters];
  intendedFilters.forEach((filter) => {
    const value = filter.value.trim();
    if (!value) return;
    const exists = merged.some(
      (candidate) =>
        candidate.field === filter.field &&
        candidate.operator === filter.operator &&
        candidate.value.trim().toLowerCase() === value.toLowerCase(),
    );
    if (!exists) merged.push({ ...filter, value });
  });
  return merged;
}

function campaignGlossaryFilters(prompt: string): AnalysisFilter[] {
  const matches = CAMPAIGN_GLOSSARY.filter((entry) => entry.pattern.test(prompt));
  if (matches.length !== 1) return [];

  return matches.map((entry) => ({
    field: "campaign_umbrella" as const,
    operator: "equals" as const,
    value: entry.value,
  }));
}

function inferComparisonScopes(prompt: string, spec: AnalysisSpec): AnalysisComparisonScope[] {
  if (inferQuestionType(prompt) !== "comparison") return [];

  const periodScopes = inferPeriodComparisonScopes(prompt, spec);
  if (periodScopes.length) return periodScopes;

  return inferEntityComparisonScopes(prompt, spec);
}

function inferPeriodComparisonScopes(prompt: string, spec: AnalysisSpec): AnalysisComparisonScope[] {
  const lower = prompt.toLowerCase();
  if (!hasExplicitComparisonCue(lower)) return [];

  if (/\bthis\s+week\b/.test(lower) && /\b(?:last|previous|prior)\s+week\b/.test(lower)) {
    return [
      {
        id: "period-this-week",
        label: "This week",
        scopeType: "period",
        dateRange: { preset: "week_to_date" },
        filters: spec.filters,
      },
      {
        id: "period-last-week",
        label: "Last week",
        scopeType: "period",
        dateRange: { preset: "last_complete_week" },
        filters: spec.filters,
      },
    ];
  }

  if (/\bthis\s+month\b/.test(lower) && /\b(?:last|previous|prior)\s+month\b/.test(lower)) {
    return [
      {
        id: "period-this-month",
        label: "This month",
        scopeType: "period",
        dateRange: { preset: "month_to_date" },
        filters: spec.filters,
      },
      {
        id: "period-last-month",
        label: "Last month",
        scopeType: "period",
        dateRange: { preset: "last_complete_month" },
        filters: spec.filters,
      },
    ];
  }

  return [];
}

function inferEntityComparisonScopes(prompt: string, spec: AnalysisSpec): AnalysisComparisonScope[] {
  const unique = matchedEntityComparisonCandidates(prompt);
  const fields = new Set(unique.map((candidate) => candidate.field));
  if (unique.length < 2 || fields.size !== 1) return [];

  return unique.map((candidate) => ({
    id: candidate.id,
    label: candidate.label,
    scopeType: "entity" as const,
    dateRange: spec.dateRange,
    filters: mergeScopeFilters(spec.filters, [
      { field: candidate.field, operator: "equals", value: candidate.value },
    ]),
  }));
}

function inferEntityComparisonDimension(prompt: string): AnalysisDimension | undefined {
  const unique = matchedEntityComparisonCandidates(prompt);
  const fields = new Set(unique.map((candidate) => candidate.field));
  if (unique.length < 2 || fields.size !== 1) return undefined;
  const field = unique[0]?.field;
  return field === "brand" || field === "campaign_umbrella" || field === "campaign" || field === "ad_set" || field === "ad" || field === "creative"
    ? field
    : undefined;
}

function matchedEntityComparisonCandidates(prompt: string) {
  const matched = comparisonEntityCandidates().filter((candidate) => candidate.pattern.test(prompt));
  return matched.filter(
    (candidate, index) =>
      matched.findIndex((other) => other.field === candidate.field && other.value === candidate.value) === index,
  );
}

function comparisonEntityCandidates(): Array<{
  id: string;
  label: string;
  field: AnalysisFilterField;
  value: string;
  pattern: RegExp;
}> {
  return [
    { id: "brand-hp", label: "HP", field: "brand", value: "HP", pattern: /\bhp\b/i },
    { id: "brand-vvs", label: "VVS", field: "brand", value: "VVS", pattern: /\bvvs\b/i },
    ...CAMPAIGN_GLOSSARY.map((entry) => ({
      id: `campaign-${entry.value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")}`,
      label: titleCase(entry.label),
      field: "campaign_umbrella" as const,
      value: entry.value,
      pattern: entry.pattern,
    })),
  ];
}

function mergeScopeFilters(sharedFilters: AnalysisFilter[], scopeFilters: AnalysisFilter[]) {
  const scopedFields = new Set(scopeFilters.map((filter) => filter.field));
  return [
    ...sharedFilters.filter((filter) => !scopedFields.has(filter.field)),
    ...scopeFilters,
  ];
}

function repairConflictingEqualsFilters(filters: AnalysisFilter[]) {
  const equalsValuesByField = new Map<AnalysisFilterField, Set<string>>();
  filters.forEach((filter) => {
    if (filter.operator !== "equals") return;
    const values = equalsValuesByField.get(filter.field) || new Set<string>();
    values.add(filter.value.trim().toLowerCase());
    equalsValuesByField.set(filter.field, values);
  });
  const conflictingFields = new Set(
    Array.from(equalsValuesByField.entries())
      .filter(([, values]) => values.size > 1)
      .map(([field]) => field),
  );

  if (!conflictingFields.size) return filters;
  return filters.filter((filter) => filter.operator !== "equals" || !conflictingFields.has(filter.field));
}

function isGlossaryFilter(filter: AnalysisFilter) {
  const value = filter.value.trim().toLowerCase();
  return CAMPAIGN_GLOSSARY.some(
    (entry) => value === entry.label.toLowerCase() || value === entry.value.toLowerCase(),
  );
}

function inferSortFromPrompt(
  lower: string,
  firstDimension?: AnalysisDimension,
  metrics?: AnalysisMetric[],
): AnalysisSpec["sort"] | undefined {
  const requestedRanking = /\b(top|highest|best|leaderboard|rank(?:ed)?|lowest|cheapest|least expensive|most efficient)\b/.test(lower);
  if (requestedRanking && metrics?.length) {
    const metric =
      metrics.find((candidate) => metricPromptPatterns[candidate]?.test(lower)) ||
      metrics.find((candidate) => candidate !== "impressions") ||
      metrics[0];
    const wantsLowCost =
      /\b(lowest|cheapest|least expensive|most efficient)\b/.test(lower) ||
      (/\bbest\b/.test(lower) && isCostMetric(metric));
    return { field: metric, direction: wantsLowCost ? "asc" : "desc" };
  }

  if (firstDimension) return { field: firstDimension, direction: "asc" };
  return undefined;
}

function inferLimitFromPrompt(lower: string, dimensions?: AnalysisDimension[]) {
  const explicit =
    lower.match(/\btop\s+(\d{1,3})\b/) ||
    lower.match(/\b(\d{1,3})\s+(?:top|highest|best|lowest|cheapest|least expensive|most efficient|ranked)\b/);
  if (explicit) return Math.min(Math.max(Number(explicit[1]), 1), MAX_TABLE_ROWS);
  if (/\b(top|highest|best|leaderboard|rank(?:ed)?)\b/.test(lower)) return 10;
  return dimensions?.includes("campaign_umbrella") ? MAX_TABLE_ROWS : undefined;
}

function wantsSummaryOnly(lower: string) {
  const asksOnlyTotal =
    /\bonly\s+(?:show\s+|give\s+me\s+)?totals?\b/.test(lower) ||
    /\b(?:just|only)\s+(?:the\s+)?(?:total|summary)\b/.test(lower);
  if (!asksOnlyTotal) return false;
  return !/\b(by|per|each|broken out|breakdown|break down|group(?:ed)? by|table|chart|graph|trend|line|bar|pivot)\b/.test(
    lower,
  );
}

function isCostMetric(metric: AnalysisMetric) {
  return metric === "cpc" || metric === "cpl" || metric === "cpm";
}

function inferDimensionsFromPrompt(
  lower: string,
  metrics?: AnalysisMetric[],
): AnalysisDimension[] | undefined {
  const wantsMonth =
    /\bmonths?\s+by\s+months?\b|\bby months?\b|month-by-month|\bmonth\s+over\s+month\b|\bmonthly\b(?!\s+budgets?\b)|\b(?:group(?:ed)?|organize(?:d)?|break(?:down| out))\s+by\s+months?\b|\bmonths?\s+(?:is|are|as)\s+(?:rows?|columns?|headers?)\b|\b(?:header\s+row|rows?|columns?|headers?)\b[^.?!\n]{0,40}\bmonths?\b/.test(
      lower,
    );
  const wantsWeek =
    /\bweeks?\s+by\s+weeks?\b|\bby weeks?\b|week-by-week|\bweek\s+over\s+week\b|\bweekly\b|\b(?:group(?:ed)?|organize(?:d)?|break(?:down| out))\s+by\s+weeks?\b|\bweeks?\s+(?:is|are|as)\s+(?:rows?|columns?|headers?)\b|\b(?:header\s+row|rows?|columns?|headers?)\b[^.?!\n]{0,40}\bweeks?\b/.test(
      lower,
    );
  const wantsDay =
    /\bdays?\s+by\s+days?\b|\bdaily\b|\bby days?\b|day-by-day|\bday\s+over\s+day\b|\b(?:group(?:ed)?|organize(?:d)?|break(?:down| out))\s+by\s+days?\b|\bdays?\s+(?:is|are|as)\s+(?:rows?|columns?|headers?)\b|\b(?:header\s+row|rows?|columns?|headers?)\b[^.?!\n]{0,40}\bdays?\b/.test(
      lower,
    );
  const wantsUmbrella =
    /\bcampaign[-\s]?umbrellas?\b|\bumbrella[-\s]?campaigns?\b|\binternal campaign umbrellas?\b|\bumbrellas?\b/.test(
      lower,
    );
  const wantsCampaign = /\bcampaigns?\b/.test(lower) && !wantsUmbrella;
  const wantsAdSet = /\bad sets?\b/.test(lower);
  const knownCampaignGroupAdPhrase =
    /\b(?:cash\s+for\s+gold|book\s+(?:appointments?|appts?))\s+ads?\b/.test(lower);
  const wantsAd = /\bads?\b/.test(lower) && !knownCampaignGroupAdPhrase;
  const wantsCreative = /\b(?:ad\s+)?creatives?\b/.test(lower);
  const wantsBrand = /\bbrands?\b|\bhp\b|\bvvs\b/.test(lower);
  const dimensions: AnalysisDimension[] = [];
  const countMetrics = new Set((metrics || []).filter(isCountMetric));
  const addDimension = (dimension: AnalysisDimension) => {
    if (!dimensions.includes(dimension)) dimensions.push(dimension);
  };

  if (wantsMonth) addDimension("month");
  else if (wantsWeek) addDimension("week");
  else if (wantsDay) addDimension("date");

  const wantsAdSetBreakdown = wantsAdSet && shouldUseEntityDimension(lower, "ad_set", countMetrics);
  const wantsCreativeBreakdown = wantsCreative && shouldUseEntityDimension(lower, "creative", countMetrics);
  const wantsAdBreakdown = wantsAd && shouldUseEntityDimension(lower, "ad", countMetrics);
  const wantsCampaignBreakdown = wantsCampaign && shouldUseEntityDimension(lower, "campaign", countMetrics);

  if (wantsAdSetBreakdown) addDimension("ad_set");
  else if (wantsCreativeBreakdown) addDimension("creative");
  else if (wantsAdBreakdown) addDimension("ad");
  else if (wantsCampaignBreakdown) addDimension("campaign");

  if (wantsBrand) addDimension("brand");
  if (wantsUmbrella) addDimension("campaign_umbrella");

  return dimensions.length ? dimensions : undefined;
}

function inferMetricsFromPrompt(lower: string): AnalysisMetric[] | undefined {
  const requested: AnalysisMetric[] = [];
  const metricText = stripCampaignGlossaryLabels(lower).replace(/\bcost\s+per\s+leads?\b/g, "cpl");
  const add = (metric: AnalysisMetric) => {
    if (!requested.includes(metric)) requested.push(metric);
  };

  if (/\bad spend\b|\bspend\b|\bspent\b|\bcost\b/.test(metricText)) add("spend");
  if (/\bmonthly budgets?\b|\bbudgets?\b/.test(metricText)) add("monthly_budget");
  if (/\b(count|number of|how many)\b[^.?!\n]*\bcampaigns?\b/.test(metricText) && !/\bcampaign[-\s]?umbrellas?\b/.test(metricText)) {
    add("campaign_count");
  }
  if (/\b(count|number of|how many)\b[^.?!\n]*\bad sets?\b/.test(metricText)) add("ad_set_count");
  if (/\b(count|number of|how many)\b[^.?!\n]*\b(?:ad\s+)?creatives?\b/.test(metricText)) add("creative_count");
  if (
    /\b(count|number of|how many)\b[^.?!\n]*\bads\b/.test(metricText) &&
    !/\b(count|number of|how many)\b[^.?!\n]*\b(?:ad\s+)?creatives?\b/.test(metricText)
  ) {
    add("ad_count");
  }
  if (/\bimpressions?\b/.test(metricText)) add("impressions");
  if (/\breach\b/.test(metricText)) add("reach");
  if (/\bclicks?\b/.test(metricText)) add("clicks");
  if (/\bleads?\b/.test(metricText)) add("leads");
  if (/\bbookings?\b|\bappointments?\b/.test(metricText)) add("bookings");
  if (/\bconversions?\b/.test(metricText)) add("conversions");
  if (/\bwebsite\s+(bookings?|appointments?|conversions?)\b/.test(metricText)) add("website_bookings");
  if (/\bsecondary\s+(results?|kpi'?s?|key\s+performance\s+indicators?)\b/.test(metricText)) add("secondary_results");
  if (
    /\bprimary\s+results?\b/.test(metricText) ||
    /\bprimary\s+(?:kpi'?s?|key\s+performance\s+indicators?)\b/.test(metricText) ||
    /\bmain\s+(?:kpi'?s?|key\s+performance\s+indicators?)\b/.test(metricText) ||
    (/\bresults?\b/.test(metricText) && !/\bsecondary\s+results?\b/.test(metricText)) ||
    (/\bkpi'?s?\b|\bkey\s+performance\s+indicators?\b/.test(metricText) &&
      !/\bsecondary\s+(?:kpi'?s?|key\s+performance\s+indicators?)\b/.test(metricText))
  ) {
    add("primary_results");
  }
  if (
    /\bnew\b[^.?!\n]{0,40}\b(messages?|messaging contacts?|messenger conversations?|conversations?|replies?)\b/.test(
      metricText,
    ) ||
    /\bfirst\s+replies?\b/.test(metricText)
  ) {
    add("new_messaging_contacts");
  } else if (
    /\b(messages?|messaging contacts?|messenger conversations?|messenger|conversations?|replies?)\b/.test(
      metricText,
    )
  ) {
    add("messaging_contacts");
  }
  if (/\bctr\b/.test(metricText)) add("ctr");
  if (/\bcpm\b/.test(metricText)) add("cpm");
  if (/\bcpc\b/.test(metricText)) add("cpc");
  if (/\bcpl\b/.test(metricText)) add("cpl");
  if (/\bfrequency\b/.test(metricText)) add("frequency");

  return requested.length ? requested : undefined;
}

function stripCampaignGlossaryLabels(lower: string) {
  return CAMPAIGN_GLOSSARY.reduce(
    (text, entry) => text.replace(new RegExp(entry.pattern.source, "gi"), " "),
    lower,
  );
}

function inferScaleDecisionIntent(lower: string):
  | {
      dimensions: AnalysisDimension[];
      metrics: AnalysisMetric[];
      sort: AnalysisSpec["sort"];
      limit: number;
    }
  | undefined {
  const asksToScale =
    /\b(which|what)\b[^.?!\n]{0,80}\b(?:should|can|would)\b[^.?!\n]{0,80}\bscale\b/.test(lower) ||
    /\bscale\b[^.?!\n]{0,80}\b(?:which|what|creative|ad|campaign|winner|best)\b/.test(lower) ||
    /\b(?:creative|ad|campaign)\b[^.?!\n]{0,80}\b(?:to|should)\s+scale\b/.test(lower);
  if (!asksToScale) return undefined;

  const dimension = /\b(?:ad\s+)?creatives?\b/.test(lower)
    ? "creative"
    : /\bad\s+sets?\b/.test(lower)
      ? "ad_set"
      : /\bcampaigns?\b/.test(lower)
        ? "campaign"
        : /\bads?\b/.test(lower)
          ? "ad"
          : "creative";

  return {
    dimensions: [dimension],
    metrics: ["spend", "leads", "cpl", "primary_results", "ctr", "frequency"],
    sort: { field: "leads", direction: "desc" },
    limit: 20,
  };
}

function inferRecommendationDecisionIntent(lower: string):
  | {
      dimensions: AnalysisDimension[];
      metrics: AnalysisMetric[];
      sort: AnalysisSpec["sort"];
      limit: number;
    }
  | undefined {
  const asksForWaste =
    /\b(wast(?:e|ed|ing)\s+money|wasteful|pause|turn\s+off|shut\s+off|fix\s+first)\b/.test(
      lower,
    );
  if (!asksForWaste) return undefined;

  const dimension = /\b(?:ad\s+)?creatives?\b/.test(lower)
    ? "creative"
    : /\bad\s+sets?\b/.test(lower)
      ? "ad_set"
      : /\bads?\b/.test(lower)
        ? "ad"
        : /\bcampaigns?\b/.test(lower)
          ? "campaign"
          : "campaign_umbrella";

  return {
    dimensions: [dimension],
    metrics: ["spend", "primary_results", "cpl", "ctr", "frequency"],
    sort: { field: "spend", direction: "desc" },
    limit: 20,
  };
}

function inferGrainFromPrompt(prompt: string): AnalysisGrain | undefined {
  if (/\bmonth(?:\s+by\s+month)?\b|\bby month\b|month-by-month|\bmonthly\b(?!\s+budgets?\b)/i.test(prompt)) return "monthly";
  if (/\bweek(?:\s+by\s+week|ly)?\b|\bby week\b|week-by-week/i.test(prompt)) return "weekly";
  if (/\bday(?:\s+by\s+day)?\b|\bdaily\b|\bby day\b|day-by-day/i.test(prompt)) return "daily";
  return undefined;
}

function promptSegments(prompt: string) {
  return prompt
    .split(/(?:^|\n+)\s*Follow-up:\s*/i)
    .map((segment) => segment.trim())
    .filter(Boolean);
}

function shouldMergeFollowUpDimensions(
  latestLower: string,
  latestDimensions?: AnalysisDimension[],
  allMentionedDimensions?: AnalysisDimension[],
) {
  if (!latestDimensions?.length || !allMentionedDimensions?.length) return false;
  const asksForPivot =
    /\b(pivot|cross[-\s]?tab|crosstab|matrix|intersection|intersections|first column|first row)\b/.test(
      latestLower,
    );
  const asksForMetricRows = /\bmetrics?\b[^.?!\n]{0,50}\brows?\b|\b(?:spend|primary\s+(?:kpi|results?))\b[^.?!\n]{0,120}\bweek\s+over\s+week\b|\bcampaign[-\s]?umbrella\b[^.?!\n]{0,80}\bthen\b[^.?!\n]{0,120}\b(?:spend|primary\s+(?:kpi|results?))\b/.test(
    latestLower,
  );
  const asksToReorganize =
    /\b(reorganize|organize|organized|group(?:ed)? by|break(?:down| out)|table)\b/.test(latestLower);
  const latestOnlyTime = latestDimensions.every(isTimeDimension);
  const hasPriorNonTimeDimension = allMentionedDimensions.some((dimension) => !isTimeDimension(dimension));

  return (
    hasPriorNonTimeDimension &&
    ((asksForPivot && latestDimensions.length < 2) ||
      (asksToReorganize && latestOnlyTime) ||
      (asksForMetricRows && latestDimensions.some(isTimeDimension)))
  );
}

function mergeDimensionsForFollowUp(
  allMentionedDimensions: AnalysisDimension[],
  latestDimensions: AnalysisDimension[],
) {
  return uniqueDimensions([
    ...latestDimensions,
    ...allMentionedDimensions.filter((dimension) => !latestDimensions.includes(dimension)),
  ]);
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
  const availableDimensions = dimensions || [];
  if (availableDimensions.length < 2) return undefined;

  const metricRowsPivot = wantsMetricRowsPivot(lower, availableDimensions, metrics || []);
  const asksForPivot =
    /\b(pivot|cross[-\s]?tab|crosstab|matrix|intersection|intersections|first column|first row)\b/.test(
      lower,
    );
  const asksForColumnarTimeLayout =
    /\bweek\s+over\s+week\b|\bmonth\s+over\s+month\b|\bday\s+over\s+day\b|\bheader\s+row\b[^.?!\n]{0,50}\b(?:weeks?|months?|days?)\b|\b(?:weeks?|months?|days?)\b[^.?!\n]{0,50}\b(?:columns?|headers?)\b/.test(
      lower,
    );

  if (!asksForPivot && !metricRowsPivot && !asksForColumnarTimeLayout) return undefined;

  const explicitRowDimension =
    dimensionForExplicitPositionCue(lower, "row", availableDimensions) ||
    dimensionNearLayoutCue(lower, "row", availableDimensions);
  const explicitColumnDimension =
    dimensionForExplicitPositionCue(lower, "column", availableDimensions) ||
    dimensionNearLayoutCue(lower, "column", availableDimensions);
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
    type: metricRowsPivot ? "metric_rows_pivot" : "pivot",
    rowDimension,
    columnDimension,
    metric,
  };
}

function wantsMetricRowsPivot(
  lower: string,
  dimensions: AnalysisDimension[],
  metrics: AnalysisMetric[],
) {
  if (metrics.length < 2) return false;
  if (!dimensions.some(isTimeDimension) || !dimensions.some((dimension) => !isTimeDimension(dimension))) return false;

  return (
    /\bmetrics?\b[^.?!\n]{0,60}\b(?:rows?|sub[-\s]?rows?|under|beneath|stacked)\b/.test(lower) ||
    /\b(?:spend|primary\s+(?:kpi'?s?|results?))\b[^.?!\n]{0,80}\b(?:rows?|sub[-\s]?rows?|under|beneath|stacked)\b/.test(
      lower,
    ) ||
    /\bcampaign[-\s]?umbrella\b[^.?!\n]{0,80}\bthen\b[^.?!\n]{0,140}\b(?:spend|primary\s+(?:kpi'?s?|results?))\b/.test(
      lower,
    ) ||
    /\b(?:so\s+that\s+i\s+can\s+)?(?:easily\s+)?see\b[^.?!\n]{0,120}\b(?:spend|primary\s+(?:kpi'?s?|results?))\b[^.?!\n]{0,120}\bweek\s+over\s+week\b/.test(
      lower,
    )
  );
}

function dimensionNearLayoutCue(
  lower: string,
  cue: "row" | "column",
  availableDimensions: AnalysisDimension[],
) {
  const cuePattern =
    cue === "row"
      ? "\\b(rows|left|first\\s+column|row\\s+headers?)\\b"
      : "\\b(columns?|across|top|first\\s+row|header\\s+row|column\\s+headers?)\\b";
  const match = lower.match(new RegExp(cuePattern));
  if (!match) return undefined;
  const start = Math.max((match.index || 0) - 80, 0);
  const end = Math.min((match.index || 0) + match[0].length + 80, lower.length);
  return dimensionFromText(lower.slice(start, end), availableDimensions);
}

function dimensionForExplicitPositionCue(
  lower: string,
  cue: "row" | "column",
  availableDimensions: AnalysisDimension[],
) {
  const positionPattern =
    cue === "row"
      ? "\\b(rows|left|first\\s+column|row\\s+headers?)\\b"
      : "\\b(columns?|across|top|first\\s+row|header\\s+row|column\\s+headers?)\\b";
  const dimensionThenHeader =
    cue === "row" ? "\\b(?:headers?|row\\s+headers?)\\b" : "\\b(?:column\\s+headers?)\\b";
  const connector = "(?:is|are|as|in|on|to\\s+be|should\\s+be|=)?";

  for (const dimension of availableDimensions) {
    const dimensionPattern = `(?:${dimensionPatternSource(dimension)})`;
    const dimensionThenPosition = new RegExp(`${dimensionPattern}\\s+${connector}\\s*${positionPattern}`);
    const positionThenDimension = new RegExp(`${positionPattern}\\s+${connector}\\s*${dimensionPattern}`);
    const dimensionAsHeader = new RegExp(`${dimensionPattern}\\s+${connector}\\s*${dimensionThenHeader}`);
    if (dimensionThenPosition.test(lower) || positionThenDimension.test(lower) || dimensionAsHeader.test(lower)) {
      return dimension;
    }
  }

  return undefined;
}

function dimensionFromText(text: string, availableDimensions: AnalysisDimension[]) {
  const dimensionPatterns: Array<[AnalysisDimension, RegExp]> = [
    ["campaign_umbrella", /\bcampaign[-\s]?umbrellas?\b|\bumbrella[-\s]?campaigns?\b|\binternal campaign umbrellas?\b|\bumbrellas?\b/],
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

function dimensionPatternSource(dimension: AnalysisDimension) {
  const dimensionPatterns: Record<AnalysisDimension, string> = {
    campaign_umbrella: "\\b(?:campaign[-\\s]?umbrellas?|umbrella[-\\s]?campaigns?|internal campaign umbrellas?|umbrellas?)\\b",
    campaign: "\\bcampaigns?\\b",
    ad_set: "\\bad\\s+sets?\\b",
    creative: "\\b(?:ad\\s+)?creatives?\\b",
    ad: "\\bads?\\b",
    brand: "\\bbrands?\\b",
    month: "\\bmonths?\\b|\\bmonthly\\b",
    week: "\\bweeks?\\b|\\bweekly\\b",
    date: "\\bdates?\\b|\\bdays?\\b|\\bdaily\\b",
  };
  return dimensionPatterns[dimension];
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
  website_bookings: /\bwebsite\s+(bookings?|appointments?|conversions?)\b/,
  messaging_contacts: /\b(messages?|messaging contacts?|messenger conversations?|messenger|conversations?|replies?)\b/,
  new_messaging_contacts:
    /\bnew\b[^.?!\n]{0,40}\b(messages?|messaging contacts?|messenger conversations?|conversations?|replies?)\b|\bfirst\s+replies?\b/,
  primary_results:
    /\b(?:primary\s+)?results?\b|\b(?:primary\s+)?kpi'?s?\b|\b(?:primary\s+)?key\s+performance\s+indicators?\b|\bmain\s+(kpi'?s?|key\s+performance\s+indicators?)\b/,
  secondary_results: /\bsecondary\s+(results?|kpi'?s?|key\s+performance\s+indicators?)\b/,
  ctr: /\bctr\b/,
  cpm: /\bcpm\b/,
  cpc: /\bcpc\b/,
  cpl: /\bcpl\b|\bcost\s+per\s+leads?\b/,
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
    new RegExp(`\\b(top|highest|best|rank(?:ed)?|leaderboard)\\b[^.?!\\n]{0,60}\\b${pattern}\\b`).test(lower) ||
    new RegExp(`\\b(by|per|each|list|show|compare|breakdown|break down)\\b[^.?!\\n]{0,60}\\b${pattern}\\b`).test(lower) ||
    new RegExp(`\\bgroup(?:ed)?\\s+by\\b[^.?!\\n]{0,60}\\b${pattern}\\b`).test(lower) ||
    new RegExp(
      `\\b${pattern}\\b\\s+by\\s+\\b(spend|cost|messages?|messaging|clicks?|leads?|bookings?|appointments?|conversions?|ctr|cpc|cpl|cpm)\\b`,
    ).test(lower) ||
    new RegExp(`\\b${pattern}\\b\\s+by\\s+\\b${pattern}\\b`).test(lower)
  );
}

function isTimeDimension(value: unknown): value is AnalysisDimension {
  return value === "date" || value === "week" || value === "month";
}

function inferDateRangeFromPrompt(prompt: string): AnalysisSpec["dateRange"] | undefined {
  const lower = prompt.toLowerCase();
  const explicitDates = extractDates(prompt);
  const includeToday = /\bincluding\s+today\b|\binclude\s+today\b|\bthrough\s+today\b|\bup\s+to\s+today\b/.test(
    lower,
  );
  if (explicitDates.length >= 2 && /\bthrough\b|\bto\b|\buntil\b|\bbetween\b|\band\b/.test(lower)) {
    return { preset: "custom", start: explicitDates[0], end: explicitDates[1] };
  }

  const explicitDate = explicitDates[0] || null;
  if (explicitDate && /\bsince\b|\bfrom\b|\bstarting\b|\bbeginning\b/.test(lower)) {
    return { preset: "custom", start: explicitDate };
  }
  const startDateParts = extractMonthDayDate(prompt);
  if (startDateParts && /\bsince\b|\bfrom\b|\bstarting\b|\bbeginning\b/.test(lower)) {
    return { preset: "custom", startDateParts };
  }

  const calendarQuarter = extractCalendarQuarterPeriod(prompt);
  if (calendarQuarter) {
    return {
      preset: "custom",
      calendar: {
        unit: "quarter",
        quarter: calendarQuarter.quarter,
        ...(calendarQuarter.year ? { year: calendarQuarter.year } : {}),
      },
    };
  }

  const calendarMonth = extractCalendarMonthPeriod(prompt);
  if (calendarMonth) {
    return {
      preset: "custom",
      calendar: { unit: "month", month: calendarMonth.month, ...(calendarMonth.year ? { year: calendarMonth.year } : {}) },
    };
  }

  if (/\bytd\b|\byear to date\b|\bthis year\b/.test(lower)) {
    return { preset: "custom", start: `${new Date().getFullYear()}-01-01` };
  }

  if (/\bmonth[-\s]+to[-\s]+date\b|\bmtd\b|\bthis\s+month\b/.test(lower)) {
    return { preset: "month_to_date" };
  }

  if (/\bthis\s+week\b|\bweek[-\s]+to[-\s]+date\b|\bwtd\b/.test(lower)) {
    return { preset: "week_to_date" };
  }

  return inferRelativeDateRange(lower, includeToday);
}

function inferDateRangeFromPromptSegments(segments: string[], prompt: string) {
  for (let index = segments.length - 1; index >= 0; index -= 1) {
    const range = inferDateRangeFromPrompt(segments[index]);
    if (range) return range;
  }

  return inferDateRangeFromPrompt(prompt);
}

function inferRelativeDateRange(lower: string, includeToday = false): AnalysisSpec["dateRange"] | undefined {
  const explicit = lower.match(
    /\b(?:last|past|previous|prior|recent|trailing)\s+(\d+|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty|thirty|ninety)\s+(days?|weeks?|months?)\b/,
  );
  if (explicit) {
    const count = numberWordValue(explicit[1]);
    if (!count) return undefined;
    return rollingDateRange(count, explicit[2], includeToday);
  }

  const implicit = lower.match(/\b(?:last|past|previous|prior|recent|trailing)\s+(day|week|month|quarter)\b/);
  if (!implicit) return undefined;

  if (/\b(?:last|previous|prior)\s+(week|month|quarter)\b/.test(lower)) {
    if (implicit[1] === "week") return { preset: "last_complete_week" };
    if (implicit[1] === "month") return { preset: "last_complete_month" };
    if (implicit[1] === "quarter") return { preset: "last_complete_quarter" };
  }

  const daysByUnit: Record<string, number> = {
    day: 1,
    week: 7,
    month: 30,
    quarter: 90,
  };
  return rollingDateRange(daysByUnit[implicit[1]], "days", includeToday);
}

function rollingDateRange(count: number, unit: string, includeToday = false): AnalysisSpec["dateRange"] {
  const normalizedUnit = unit.toLowerCase();
  const days =
    normalizedUnit.startsWith("week") ? count * 7 : normalizedUnit.startsWith("month") ? count * 30 : count;
  const boundedDays = Math.min(Math.max(days, 1), MAX_DAYS);
  const presetByDays: Partial<Record<number, (typeof DATE_PRESETS)[number]>> = {
    7: "last_7_days",
    14: "last_14_days",
    28: "last_4_weeks",
    30: "last_30_days",
    56: "last_8_weeks",
    84: "last_12_weeks",
    90: "last_90_days",
  };
  const preset = presetByDays[boundedDays];
  const range = preset ? { preset } : { days: boundedDays };
  return includeToday ? { ...range, includeToday } : range;
}

function isRelativeDateRange(dateRange: AnalysisSpec["dateRange"]) {
  return Boolean(dateRange.days || (dateRange.preset && dateRange.preset !== "custom"));
}

function isCompleteCalendarDateRange(dateRange: AnalysisSpec["dateRange"]) {
  return Boolean(
    dateRange.calendar ||
      dateRange.preset === "last_complete_week" ||
      dateRange.preset === "last_complete_month" ||
      dateRange.preset === "last_complete_quarter",
  );
}

function isToDateRange(dateRange: AnalysisSpec["dateRange"]) {
  return dateRange.preset === "month_to_date" || dateRange.preset === "week_to_date";
}

function isOpenEndedCustomDateRange(dateRange: AnalysisSpec["dateRange"]) {
  return dateRange.preset === "custom" && Boolean((dateRange.start || dateRange.startDateParts) && !dateRange.end);
}

function inferQuestionType(prompt: string): AnalysisQuestionType {
  const lower = prompt.toLowerCase();
  if (/\b(wast(?:e|ed|ing)\s+money|wasteful|what\s+should|which\s+.+\s+should|pause|scale|turn\s+off|fix\s+first)\b/.test(lower)) {
    return "recommendation";
  }
  if (/\b(why|diagnos(?:e|is)|what\s+changed|drop(?:ped)?|declin(?:e|ed|ing)|improv(?:e|ed|ing))\b/.test(lower)) {
    return "diagnosis";
  }
  if (/\b(compare|vs\.?|versus|against)\b/.test(lower)) {
    return "comparison";
  }
  if (/\b(trend|over\s+time|by\s+day|daily|by\s+week|weekly|by\s+month|monthly|day\s+over\s+day|week\s+over\s+week|month\s+over\s+month)\b/.test(lower)) {
    return "trend";
  }
  return "leaderboard";
}

function extractDatePhrase(prompt: string) {
  const match = prompt.match(
    /\b(last|past|previous|prior|recent|trailing|this|since|from|starting|between|month to date|week to date|year to date)[^.?!\n,;]*/i,
  );
  return match?.[0]?.trim() || null;
}

function numberWordValue(value: string) {
  const numeric = Number(value);
  if (Number.isFinite(numeric) && numeric > 0) return numeric;

  const numbers: Record<string, number> = {
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
  return numbers[value] || 0;
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

  const monthYearPattern =
    /\b(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\s+(20\d{2})\b/gi;
  for (const match of prompt.matchAll(monthYearPattern)) {
    const previous = prompt.slice(Math.max(0, (match.index || 0) - 4), match.index || 0);
    if (/\d{1,2}(?:st|nd|rd|th)?(?:,)?\s*$/i.test(previous)) continue;
    const date = formatDateParts(Number(match[2]), monthNumber(match[1]), 1);
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

function extractCalendarMonthPeriod(prompt: string) {
  const monthPattern =
    /\b(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)(?:\s+(20\d{2}))?\b/gi;

  for (const match of prompt.matchAll(monthPattern)) {
    const month = monthNumber(match[1]);
    if (!month) continue;

    const nextText = prompt.slice((match.index || 0) + match[0].length, (match.index || 0) + match[0].length + 8);
    if (!match[2] && /^\s+\d{1,2}(?:st|nd|rd|th)?\b/i.test(nextText)) continue;

    return {
      month,
      year: match[2] ? Number(match[2]) : undefined,
    };
  }

  return null;
}

function extractCalendarQuarterPeriod(prompt: string) {
  const match = prompt.match(/\bq([1-4])(?:\s+(20\d{2}))?\b/i);
  if (!match) return null;

  return {
    quarter: Number(match[1]),
    year: match[2] ? Number(match[2]) : undefined,
  };
}

function extractMonthDayDate(prompt: string) {
  const monthDayPattern =
    /\b(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\s+(\d{1,2})(?:st|nd|rd|th)?(?:,)?(?:\s+(20\d{2}))?\b/i;
  const match = prompt.match(monthDayPattern);
  if (!match) return null;

  return {
    month: monthNumber(match[1]),
    day: Number(match[2]),
    ...(match[3] ? { year: Number(match[3]) } : {}),
  };
}

function resolveCalendarDateRange(
  calendar: AnalysisSpec["dateRange"]["calendar"],
  anchor: Date,
) {
  if (!calendar) return null;

  if (calendar.unit === "month" && calendar.month) {
    const year = calendar.year || latestCompleteMonthYear(calendar.month, anchor);
    const start = new Date(year, calendar.month - 1, 1);
    const end = new Date(year, calendar.month, 0);
    return {
      start: format(start, "yyyy-MM-dd"),
      end: format(end, "yyyy-MM-dd"),
      days: differenceInCalendarDays(start, end) + 1,
    };
  }

  if (calendar.unit === "quarter" && calendar.quarter) {
    const year = calendar.year || latestCompleteQuarterYear(calendar.quarter, anchor);
    const startMonth = (calendar.quarter - 1) * 3;
    const start = new Date(year, startMonth, 1);
    const end = new Date(year, startMonth + 3, 0);
    return {
      start: format(start, "yyyy-MM-dd"),
      end: format(end, "yyyy-MM-dd"),
      days: differenceInCalendarDays(start, end) + 1,
    };
  }

  return null;
}

function latestCompleteMonthYear(month: number, anchor: Date) {
  const candidateEnd = new Date(anchor.getFullYear(), month, 0);
  return candidateEnd <= anchor ? anchor.getFullYear() : anchor.getFullYear() - 1;
}

function latestCompleteQuarterYear(quarter: number, anchor: Date) {
  const candidateEnd = new Date(anchor.getFullYear(), quarter * 3, 0);
  return candidateEnd <= anchor ? anchor.getFullYear() : anchor.getFullYear() - 1;
}

function resolveStartDateParts(
  startDateParts: AnalysisSpec["dateRange"]["startDateParts"],
  anchor: Date,
) {
  if (!startDateParts) return null;
  const year = startDateParts.year || latestStartDatePartsYear(startDateParts.month, startDateParts.day, anchor);
  return formatDateParts(year, startDateParts.month, startDateParts.day);
}

function latestStartDatePartsYear(month: number, day: number, anchor: Date) {
  const candidate = new Date(anchor.getFullYear(), month - 1, day);
  return candidate <= anchor ? anchor.getFullYear() : anchor.getFullYear() - 1;
}

function startOfIsoWeek(date: Date) {
  const start = new Date(date);
  const day = start.getDay();
  const offset = day === 0 ? -6 : 1 - day;
  start.setDate(start.getDate() + offset);
  return start;
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
    return stripNullValues(JSON.parse(content) as unknown);
  } catch {
    return null;
  }
}

function parseJsonPreservingNulls(content: string | null | undefined) {
  if (!content) return null;
  try {
    return JSON.parse(content) as unknown;
  } catch {
    return null;
  }
}

function stripNullValues(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stripNullValues);
  if (!value || typeof value !== "object") return value;

  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .filter(([, entryValue]) => entryValue !== null)
      .map(([key, entryValue]) => [key, stripNullValues(entryValue)]),
  );
}

function stripUndefinedValues(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stripUndefinedValues);
  if (!value || typeof value !== "object") return value;

  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .filter(([, entryValue]) => entryValue !== undefined)
      .map(([key, entryValue]) => [key, stripUndefinedValues(entryValue)]),
  );
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

function uniqueStrings(values: string[]) {
  return Array.from(new Set(values.filter(Boolean)));
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

function titleCase(value: string) {
  return value.replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function inferSearchTerm(prompt: string) {
  if (CAMPAIGN_GLOSSARY.some((entry) => entry.pattern.test(prompt))) return "";
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
    messaging_contacts: "Messages",
    month: "Month",
    monthly_budget: "Monthly Budget",
    new_messaging_contacts: "New Messages",
    primary_results: "Primary Results",
    reach: "Reach",
    secondary_results: "Secondary Results",
    spend: "Spend",
    website_bookings: "Website Bookings",
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
      calculateOpenAICostUsd({
        model: planModel,
        inputTokens: estimate.planInputTokens,
        outputTokens: estimate.planOutputTokens,
      }) +
        (analysisModel
          ? calculateOpenAICostUsd({
              model: analysisModel,
              inputTokens: estimate.analysisInputTokens,
              outputTokens: estimate.analysisOutputTokens,
            })
          : 0),
      5,
    ),
  };
}

function estimateTokens(value: string) {
  return Math.ceil(value.length / 4);
}
