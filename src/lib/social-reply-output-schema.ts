export type SocialReplyLanguage = "en" | "vi" | "mixed";
export type SocialReplyConfidence = "low" | "medium" | "high";
export type SocialReplyNextBestAction =
  | "invite_to_store"
  | "ask_clarifying_question"
  | "answer_question"
  | "collect_contact_info"
  | "handoff_to_human"
  | "no_reply_needed";

export type SocialReplySuggestionOutput = {
  draft: string;
  strategy: string;
  nextBestAction: SocialReplyNextBestAction;
  confidence: SocialReplyConfidence;
  suggestedLanguage: SocialReplyLanguage;
  toneNotes: string[];
  riskFlags: string[];
};

export const SOCIAL_REPLY_OUTPUT_JSON_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: [
    "draft",
    "strategy",
    "nextBestAction",
    "confidence",
    "suggestedLanguage",
    "toneNotes",
    "riskFlags",
  ],
  properties: {
    draft: {
      type: "string",
      minLength: 1,
      maxLength: 2000,
      description: "One editable customer-facing reply draft. No markdown.",
    },
    strategy: {
      type: "string",
      minLength: 1,
      maxLength: 1200,
      description: "Brief internal reason for the reply strategy.",
    },
    nextBestAction: {
      type: "string",
      enum: [
        "invite_to_store",
        "ask_clarifying_question",
        "answer_question",
        "collect_contact_info",
        "handoff_to_human",
        "no_reply_needed",
      ],
    },
    confidence: {
      type: "string",
      enum: ["low", "medium", "high"],
    },
    suggestedLanguage: {
      type: "string",
      enum: ["en", "vi", "mixed"],
    },
    toneNotes: {
      type: "array",
      maxItems: 5,
      items: { type: "string", maxLength: 240 },
    },
    riskFlags: {
      type: "array",
      maxItems: 8,
      items: { type: "string", maxLength: 240 },
    },
  },
} as const;

export function parseSocialReplySuggestionOutput(value: unknown): SocialReplySuggestionOutput {
  const record = jsonRecord(value);
  const draft = nonBlankString(record.draft, "draft");
  const strategy = nonBlankString(record.strategy, "strategy");
  const nextBestAction = enumValue(
    record.nextBestAction,
    [
      "invite_to_store",
      "ask_clarifying_question",
      "answer_question",
      "collect_contact_info",
      "handoff_to_human",
      "no_reply_needed",
    ] as const,
    "nextBestAction",
  );
  const confidence = enumValue(record.confidence, ["low", "medium", "high"] as const, "confidence");
  const suggestedLanguage = enumValue(
    record.suggestedLanguage,
    ["en", "vi", "mixed"] as const,
    "suggestedLanguage",
  );

  return {
    draft,
    strategy,
    nextBestAction,
    confidence,
    suggestedLanguage,
    toneNotes: stringArray(record.toneNotes).slice(0, 5),
    riskFlags: stringArray(record.riskFlags).slice(0, 8),
  };
}

export function parseSocialReplySuggestionJson(content: string | null | undefined) {
  const trimmed = String(content || "").trim();
  if (!trimmed) throw new Error("Anthropic returned an empty reply suggestion.");

  try {
    return parseSocialReplySuggestionOutput(JSON.parse(trimmed));
  } catch (error) {
    if (error instanceof SyntaxError) {
      throw new Error("Anthropic returned invalid reply suggestion JSON.");
    }
    throw error;
  }
}

function jsonRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Reply suggestion output must be a JSON object.");
  }
  return value as Record<string, unknown>;
}

function nonBlankString(value: unknown, field: string) {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`Reply suggestion ${field} is required.`);
  }
  return value.trim();
}

function enumValue<const T extends readonly string[]>(
  value: unknown,
  allowed: T,
  field: string,
): T[number] {
  if (typeof value === "string" && (allowed as readonly string[]).includes(value)) {
    return value as T[number];
  }
  throw new Error(`Reply suggestion ${field} is invalid.`);
}

function stringArray(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value.filter(
    (item): item is string => typeof item === "string" && item.trim().length > 0,
  )
    .map((item) => item.trim());
}
