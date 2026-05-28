import OpenAI from "openai";
import { z } from "zod";

import type { AnalysisWorkbenchContextSnapshot } from "./analysis-workbench-contract.ts";
import {
  WORKBENCH_DIMENSIONS,
  WORKBENCH_FILTERS,
  WORKBENCH_METRICS,
  WORKBENCH_VISUAL_TYPES,
  getAnalysisWorkbenchSemanticCatalog,
  validateAnalysisWorkbenchSemanticIntent,
  type WorkbenchDimension,
  type WorkbenchFilterField,
  type WorkbenchMetric,
  type WorkbenchSemanticVisualIntent,
} from "./analysis-workbench-semantic-catalog.ts";
import {
  WORKBENCH_PLANNER_DATE_GRAINS,
  WORKBENCH_PLANNER_ROLLING_UNITS,
  type WorkbenchPlannerDateGrain,
  type WorkbenchPlannerDateIntent,
} from "./analysis-workbench-date-intent.ts";
import { getOpenAIAnalysisModel } from "./env.ts";
import { buildOpenAICostBreakdown, type OpenAICostBreakdown } from "./openai-cost.ts";

export const WORKBENCH_QUESTION_TYPES = [
  "leaderboard",
  "trend",
  "comparison",
  "diagnosis",
  "recommendation",
] as const;

export type WorkbenchQuestionType = (typeof WORKBENCH_QUESTION_TYPES)[number];

export type WorkbenchPlannerFilter = {
  field: WorkbenchFilterField;
  operator: "contains" | "equals";
  value: string;
};

export type WorkbenchPlannerComparison = {
  mode: "previous_period" | "previous_year" | "two_ranges" | "none";
};

export type WorkbenchPlannerUnsupported = {
  code: string;
  message: string;
  suggestedRewrite?: string | null;
};

export type WorkbenchPlannerAssumption = {
  code: string;
  message: string;
};

export type WorkbenchPlannerIntent = {
  questionType: WorkbenchQuestionType;
  metrics: WorkbenchMetric[];
  dimensions: WorkbenchDimension[];
  filters: WorkbenchPlannerFilter[];
  dateIntent: WorkbenchPlannerDateIntent;
  comparison: WorkbenchPlannerComparison;
  visualIntent: WorkbenchSemanticVisualIntent | null;
  sort: {
    field: WorkbenchMetric | WorkbenchDimension;
    direction: "asc" | "desc";
  } | null;
  limit: number | null;
  confidence: "high" | "medium" | "low";
  assumptions: WorkbenchPlannerAssumption[];
  unsupported: WorkbenchPlannerUnsupported[];
};

export type AnalysisWorkbenchIntentPlannerResult = {
  source: "ai" | "fallback";
  intent: WorkbenchPlannerIntent | null;
  model: string;
  apiCost: OpenAICostBreakdown;
  fallbackReason?: string;
};

export type PlannerChatCompletion = {
  model?: string;
  choices?: Array<{
    message?: {
      content?: string | null;
      refusal?: string | null;
    };
  }>;
  usage?: {
    prompt_tokens?: number | null;
    completion_tokens?: number | null;
  } | null;
};

export type PlannerCreateCompletion = (input: {
  model: string;
  response_format: typeof analysisWorkbenchIntentResponseFormat;
  messages: Array<{ role: "system" | "user"; content: string }>;
}) => Promise<PlannerChatCompletion>;

const metricSchema = z.enum(WORKBENCH_METRICS);
const dimensionSchema = z.enum(WORKBENCH_DIMENSIONS);
const filterFieldSchema = z.enum(WORKBENCH_FILTERS);
const visualTypeSchema = z.enum(WORKBENCH_VISUAL_TYPES);
const questionTypeSchema = z.enum(WORKBENCH_QUESTION_TYPES);
const dateGrainSchema = z.enum(WORKBENCH_PLANNER_DATE_GRAINS);
const rollingUnitSchema = z.enum(WORKBENCH_PLANNER_ROLLING_UNITS);

const plannerFilterSchema = z.object({
  field: filterFieldSchema,
  operator: z.enum(["contains", "equals"]),
  value: z.string().min(1).max(120),
}).strict();

const plannerDateIntentSchema = z.object({
  kind: z.enum([
    "calendar_year",
    "calendar_month",
    "calendar_quarter",
    "year_to_date",
    "month_to_date",
    "week_to_date",
    "quarter_to_date",
    "rolling",
    "explicit_range",
    "inherit_or_default",
  ]),
  year: z.number().int().min(2000).max(2100).nullable(),
  month: z.number().int().min(1).max(12).nullable(),
  quarter: z.number().int().min(1).max(4).nullable(),
  unit: rollingUnitSchema.nullable(),
  count: z.number().int().min(1).max(10000).nullable(),
  start: z.string().max(10).nullable(),
  end: z.string().max(10).nullable(),
  grain: dateGrainSchema.nullable(),
}).strict();

const plannerVisualSchema = z.object({
  type: visualTypeSchema,
  metrics: z.array(metricSchema).max(4),
  dimensions: z.array(dimensionSchema).max(3),
  rowDimension: dimensionSchema.nullable(),
  columnDimension: dimensionSchema.nullable(),
  x: z.union([metricSchema, dimensionSchema]).nullable(),
  y: z.union([metricSchema, dimensionSchema]).nullable(),
}).strict();

const plannerIntentOutputSchema = z.object({
  questionType: questionTypeSchema,
  metrics: z.array(metricSchema).min(1).max(4),
  dimensions: z.array(dimensionSchema).max(3),
  filters: z.array(plannerFilterSchema).max(6),
  dateIntent: plannerDateIntentSchema,
  comparison: z.object({
    mode: z.enum(["previous_period", "previous_year", "two_ranges", "none"]),
  }).strict(),
  visualIntent: plannerVisualSchema.nullable(),
  sort: z.object({
    field: z.union([metricSchema, dimensionSchema]),
    direction: z.enum(["asc", "desc"]),
  }).strict().nullable(),
  limit: z.number().int().min(1).max(500).nullable(),
  confidence: z.enum(["high", "medium", "low"]),
  assumptions: z.array(z.object({
    code: z.string().min(1).max(80),
    message: z.string().min(1).max(240),
  }).strict()).max(8),
  unsupported: z.array(z.object({
    code: z.string().min(1).max(80),
    message: z.string().min(1).max(240),
    suggestedRewrite: z.string().max(240).nullable(),
  }).strict()).max(8),
}).strict();

const nullableStringSchema = { anyOf: [{ type: "string" }, { type: "null" }] } as const;
const nullableYearSchema = {
  anyOf: [{ type: "integer", minimum: 2000, maximum: 2100 }, { type: "null" }],
} as const;
const nullableMonthSchema = {
  anyOf: [{ type: "integer", minimum: 1, maximum: 12 }, { type: "null" }],
} as const;
const nullableQuarterSchema = {
  anyOf: [{ type: "integer", minimum: 1, maximum: 4 }, { type: "null" }],
} as const;
const nullableCountSchema = {
  anyOf: [{ type: "integer", minimum: 1, maximum: 10000 }, { type: "null" }],
} as const;
const nullableDateGrainSchema = { anyOf: [{ enum: WORKBENCH_PLANNER_DATE_GRAINS }, { type: "null" }] } as const;
const nullableRollingUnitSchema = { anyOf: [{ enum: WORKBENCH_PLANNER_ROLLING_UNITS }, { type: "null" }] } as const;
const nullableDimensionSchema = { anyOf: [{ enum: WORKBENCH_DIMENSIONS }, { type: "null" }] } as const;
const nullableMetricOrDimensionSchema = {
  anyOf: [{ enum: [...WORKBENCH_METRICS, ...WORKBENCH_DIMENSIONS] }, { type: "null" }],
} as const;

export const analysisWorkbenchIntentResponseFormat = {
  type: "json_schema" as const,
  json_schema: {
    name: "analysis_workbench_intent",
    strict: true,
    schema: {
      type: "object",
      additionalProperties: false,
      properties: {
        questionType: { enum: WORKBENCH_QUESTION_TYPES },
        metrics: {
          type: "array",
          minItems: 1,
          maxItems: 4,
          items: { enum: WORKBENCH_METRICS },
        },
        dimensions: {
          type: "array",
          maxItems: 3,
          items: { enum: WORKBENCH_DIMENSIONS },
        },
        filters: {
          type: "array",
          maxItems: 6,
          items: {
            type: "object",
            additionalProperties: false,
            properties: {
              field: { enum: WORKBENCH_FILTERS },
              operator: { enum: ["contains", "equals"] },
              value: { type: "string", minLength: 1, maxLength: 120 },
            },
            required: ["field", "operator", "value"],
          },
        },
        dateIntent: {
          type: "object",
          additionalProperties: false,
          properties: {
            kind: {
              enum: [
                "calendar_year",
                "calendar_month",
                "calendar_quarter",
                "year_to_date",
                "month_to_date",
                "week_to_date",
                "quarter_to_date",
                "rolling",
                "explicit_range",
                "inherit_or_default",
              ],
            },
            year: nullableYearSchema,
            month: nullableMonthSchema,
            quarter: nullableQuarterSchema,
            unit: nullableRollingUnitSchema,
            count: nullableCountSchema,
            start: nullableStringSchema,
            end: nullableStringSchema,
            grain: nullableDateGrainSchema,
          },
          required: ["kind", "year", "month", "quarter", "unit", "count", "start", "end", "grain"],
        },
        comparison: {
          type: "object",
          additionalProperties: false,
          properties: {
            mode: { enum: ["previous_period", "previous_year", "two_ranges", "none"] },
          },
          required: ["mode"],
        },
        visualIntent: {
          anyOf: [
            {
              type: "object",
              additionalProperties: false,
              properties: {
                type: { enum: WORKBENCH_VISUAL_TYPES },
                metrics: {
                  type: "array",
                  maxItems: 4,
                  items: { enum: WORKBENCH_METRICS },
                },
                dimensions: {
                  type: "array",
                  maxItems: 3,
                  items: { enum: WORKBENCH_DIMENSIONS },
                },
                rowDimension: nullableDimensionSchema,
                columnDimension: nullableDimensionSchema,
                x: nullableMetricOrDimensionSchema,
                y: nullableMetricOrDimensionSchema,
              },
              required: ["type", "metrics", "dimensions", "rowDimension", "columnDimension", "x", "y"],
            },
            { type: "null" },
          ],
        },
        sort: {
          anyOf: [
            {
              type: "object",
              additionalProperties: false,
              properties: {
                field: { enum: [...WORKBENCH_METRICS, ...WORKBENCH_DIMENSIONS] },
                direction: { enum: ["asc", "desc"] },
              },
              required: ["field", "direction"],
            },
            { type: "null" },
          ],
        },
        limit: { anyOf: [{ type: "integer", minimum: 1, maximum: 500 }, { type: "null" }] },
        confidence: { enum: ["high", "medium", "low"] },
        assumptions: {
          type: "array",
          maxItems: 8,
          items: {
            type: "object",
            additionalProperties: false,
            properties: {
              code: { type: "string", minLength: 1, maxLength: 80 },
              message: { type: "string", minLength: 1, maxLength: 240 },
            },
            required: ["code", "message"],
          },
        },
        unsupported: {
          type: "array",
          maxItems: 8,
          items: {
            type: "object",
            additionalProperties: false,
            properties: {
              code: { type: "string", minLength: 1, maxLength: 80 },
              message: { type: "string", minLength: 1, maxLength: 240 },
              suggestedRewrite: nullableStringSchema,
            },
            required: ["code", "message", "suggestedRewrite"],
          },
        },
      },
      required: [
        "questionType",
        "metrics",
        "dimensions",
        "filters",
        "dateIntent",
        "comparison",
        "visualIntent",
        "sort",
        "limit",
        "confidence",
        "assumptions",
        "unsupported",
      ],
    },
  },
};

export async function parseAnalysisWorkbenchIntentWithAI(input: {
  prompt: string;
  latestSyncedInsightDate?: string | null;
  inheritedContext?: AnalysisWorkbenchContextSnapshot | null;
  model?: string;
  createCompletion?: PlannerCreateCompletion;
}): Promise<AnalysisWorkbenchIntentPlannerResult> {
  const model = input.model || getOpenAIAnalysisModel("fast");
  if (!input.createCompletion && !aiParserEnabled()) {
    return fallbackPlannerResult("ai_parser_disabled", model);
  }
  if (!input.createCompletion && !process.env.OPENAI_API_KEY?.trim()) {
    return fallbackPlannerResult("missing_openai_api_key", model);
  }

  try {
    const createCompletion = input.createCompletion || defaultCreateCompletion;
    const response = await createCompletion({
      model,
      response_format: analysisWorkbenchIntentResponseFormat,
      messages: plannerMessages(input),
    });
    const message = response.choices?.[0]?.message;
    if (message?.refusal) return fallbackPlannerResult("model_refusal", model);

    const intent = parseAnalysisWorkbenchPlannerOutput(parseJsonPreservingNulls(message?.content));
    if (!intent) return fallbackPlannerResult("malformed_model_output", model);

    const validation = validateAnalysisWorkbenchSemanticIntent({
      prompt: input.prompt,
      metrics: intent.metrics,
      dimensions: intent.dimensions,
      filters: intent.filters,
      dateGrain: intent.dateIntent.grain || null,
      ...(intent.visualIntent ? { visual: intent.visualIntent } : {}),
    });
    if (validation.blockers.some((blocker) => blocker.code.startsWith("invalid_"))) {
      return fallbackPlannerResult("invalid_model_intent", model);
    }

    return {
      source: "ai",
      intent,
      model: response.model || model,
      apiCost: buildOpenAICostBreakdown({
        model: response.model || model,
        inputTokens: response.usage?.prompt_tokens || 0,
        outputTokens: response.usage?.completion_tokens || 0,
      }),
    };
  } catch {
    return fallbackPlannerResult("openai_request_failed", model);
  }
}

export function parseAnalysisWorkbenchPlannerOutput(value: unknown): WorkbenchPlannerIntent | null {
  const parsed = plannerIntentOutputSchema.safeParse(value);
  if (!parsed.success) return null;
  return {
    ...parsed.data,
    dateIntent: {
      ...parsed.data.dateIntent,
      quarter: parsed.data.dateIntent.quarter as 1 | 2 | 3 | 4 | null,
      grain: parsed.data.dateIntent.grain as WorkbenchPlannerDateGrain | null,
    },
    visualIntent: parsed.data.visualIntent
      ? stripNullVisualFields(parsed.data.visualIntent)
      : null,
  };
}

function plannerMessages(input: {
  prompt: string;
  latestSyncedInsightDate?: string | null;
  inheritedContext?: AnalysisWorkbenchContextSnapshot | null;
}) {
  return [
    {
      role: "system" as const,
      content:
        "You convert Meta Ads Ask AI workbench prompts into governed intent JSON. Return JSON matching schema only. Never compute final numbers, write SQL, request raw rows, invent metrics, or propose Meta mutations.",
    },
    {
      role: "user" as const,
      content: JSON.stringify({
        task: "Map user language to governed Meta Ads analysis intent.",
        userPrompt: input.prompt,
        latestSyncedInsightDate: input.latestSyncedInsightDate || null,
        inheritedContext: input.inheritedContext || null,
        catalog: plannerCatalog(),
        rules: [
          "Use only catalog metric, dimension, filter, date grain, and visual keys.",
          "For week by week, each week, weekly, or by week phrasing, set dateIntent.grain to week and include week dimension for trends.",
          "For entire/full/all/whole year phrasing such as 'entire of 2026', use dateIntent kind calendar_year with that year.",
          "For prompts like '2026 weekly spend trend', use calendar_year 2026 and grain week.",
          "For month-to-date, week-to-date, quarter-to-date, and year-to-date, use the matching *_to_date kind.",
          "For last/past/recent/trailing N periods, use rolling with unit and count.",
          "For no date phrase, use inherit_or_default and add an assumption.",
          "For trend prompts, use a time grain dimension and line_chart visual when useful.",
          "For leaderboard prompts, prefer entity dimensions such as campaign_umbrella, campaign, ad_set, ad, or creative.",
          "For diagnosis and recommendation prompts, include spend, primary_results, and an efficiency metric when the user did not name metrics.",
          "For unsupported daily budget, revenue, ROAS, CRM, staff, website, landing page, or social inbox requests, add unsupported entries and keep only a minimal safe Meta Ads intent.",
          "Recommendation wording must remain advisory; never claim the system will pause, edit, create, or mutate campaigns.",
        ],
        requiredExample: {
          prompt: "week by week ad spend for the entire of 2026",
          intent: {
            questionType: "trend",
            metrics: ["spend"],
            dimensions: ["week"],
            filters: [],
            dateIntent: {
              kind: "calendar_year",
              year: 2026,
              month: null,
              quarter: null,
              unit: null,
              count: null,
              start: null,
              end: null,
              grain: "week",
            },
            comparison: { mode: "none" },
            visualIntent: {
              type: "line_chart",
              metrics: ["spend"],
              dimensions: ["week"],
              rowDimension: null,
              columnDimension: null,
              x: "week",
              y: "spend",
            },
            sort: { field: "week", direction: "asc" },
            limit: null,
            confidence: "high",
            assumptions: [],
            unsupported: [],
          },
        },
      }),
    },
  ];
}

function plannerCatalog() {
  const catalog = getAnalysisWorkbenchSemanticCatalog();
  return {
    source: catalog.source.key,
    metrics: catalog.metrics.map(({ key, label, aliases, caveat }) => ({ key, label, aliases, caveat })),
    dimensions: catalog.dimensions.map(({ key, label, aliases }) => ({ key, label, aliases })),
    filters: catalog.filters.map(({ key, label, operators, aliases }) => ({ key, label, operators, aliases })),
    dateGrains: catalog.dateGrains.map(({ key, label, aliases }) => ({ key, label, aliases })),
    visualTypes: WORKBENCH_VISUAL_TYPES,
    questionTypes: WORKBENCH_QUESTION_TYPES,
    unsupportedBoundaries: catalog.unsupportedBoundaries,
    supportedFilterValues: catalog.supportedFilterValues,
  };
}

async function defaultCreateCompletion(input: Parameters<PlannerCreateCompletion>[0]) {
  const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  return client.chat.completions.create(input);
}

function fallbackPlannerResult(
  reason: string,
  model: string,
): AnalysisWorkbenchIntentPlannerResult {
  return {
    source: "fallback",
    intent: null,
    model: "deterministic-fallback",
    fallbackReason: reason,
    apiCost: buildOpenAICostBreakdown({
      model,
      inputTokens: 0,
      outputTokens: 0,
    }),
  };
}

function aiParserEnabled() {
  const configured = process.env.ANALYSIS_WORKBENCH_AI_PARSER?.trim().toLowerCase();
  if (configured) return ["1", "true", "yes", "on"].includes(configured);
  return process.env.NODE_ENV === "production";
}

function stripNullVisualFields(
  visual: z.infer<typeof plannerVisualSchema>,
): WorkbenchSemanticVisualIntent {
  return {
    type: visual.type,
    metrics: visual.metrics,
    dimensions: visual.dimensions,
    ...(visual.rowDimension ? { rowDimension: visual.rowDimension } : {}),
    ...(visual.columnDimension ? { columnDimension: visual.columnDimension } : {}),
    ...(visual.x ? { x: visual.x } : {}),
    ...(visual.y ? { y: visual.y } : {}),
  };
}

function parseJsonPreservingNulls(content: string | null | undefined) {
  if (!content) return null;
  try {
    return JSON.parse(content) as unknown;
  } catch {
    return null;
  }
}
