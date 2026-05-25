import { validateAnalysisWorkbenchSemanticIntent } from "./analysis-workbench-semantic-catalog.ts";
import type {
  WorkbenchDimension,
  WorkbenchMetric,
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

export type AnalysisWorkbenchVisualCard =
  | AnalysisWorkbenchMetricVisualCard
  | AnalysisWorkbenchTableVisualCard
  | AnalysisWorkbenchBarVisualCard
  | AnalysisWorkbenchLineVisualCard;

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
      lineage: {
        parentRunId: input.parentRunId || null,
      },
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
