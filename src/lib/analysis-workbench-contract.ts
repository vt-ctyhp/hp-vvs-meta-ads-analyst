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

export type AnalysisWorkbenchRun = {
  id: string;
  status: AnalysisRunStatus;
  prompt: string;
  outputMode: AnalysisOutputMode;
  title: string;
  intent: JsonValue;
  queryPlan: JsonValue;
  facts: JsonValue;
  visualCards: JsonValue[];
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
}): AnalysisRunInsert {
  const prompt = normalizePrompt(input.prompt);
  if (!prompt) {
    throw new Error("Analysis prompt is required.");
  }

  const outputMode = normalizeAnalysisOutputMode(input.outputMode);
  const now = input.now || new Date().toISOString();

  return {
    status: "created",
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
        label: "Foundation run",
        value: "Saved prompt and run identity. Governed facts arrive in the next slice.",
      },
    ],
    validation: {
      status: "not_run",
      blockers: [],
      warnings: ["Foundation run created before governed planner and fact engine are connected."],
    },
    lineage: {
      parentRunId: input.parentRunId || null,
    },
    answer: {
      summary: "Run created. Governed facts, citations, and visuals have not run yet.",
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
    visualCards: Array.isArray(record.visual_cards) ? record.visual_cards : [],
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
