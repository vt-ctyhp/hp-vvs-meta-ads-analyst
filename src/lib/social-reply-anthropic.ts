import Anthropic from "@anthropic-ai/sdk";
import { jsonSchemaOutputFormat } from "@anthropic-ai/sdk/helpers/json-schema";

import {
  ConfigurationError,
  getAnthropicReplyModel,
} from "./env.ts";
import type { SocialReplyContext } from "./social-reply-context.ts";
import {
  parseSocialReplySuggestionJson,
  parseSocialReplySuggestionOutput,
  SOCIAL_REPLY_OUTPUT_JSON_SCHEMA,
  type SocialReplySuggestionOutput,
} from "./social-reply-output-schema.ts";

type AnthropicMessage = {
  content?: Array<{ type?: string; text?: string }>;
  parsed_output?: unknown;
  usage?: {
    input_tokens?: number | null;
    output_tokens?: number | null;
  };
};

export type AnthropicReplyClient = {
  messages: {
    parse: (request: Record<string, unknown>) => Promise<AnthropicMessage>;
  };
};

export type AnthropicReplySuggestionRequest = {
  context: SocialReplyContext;
  model?: string;
  client?: AnthropicReplyClient;
};

export type AnthropicReplySuggestionResult = {
  output: SocialReplySuggestionOutput;
  model: string;
  usage: {
    inputTokens: number | null;
    outputTokens: number | null;
  };
};

export type AnthropicReplyMessageStream = {
  on: (
    event: "text",
    listener: (textDelta: string, textSnapshot: string) => void,
  ) => AnthropicReplyMessageStream;
  finalMessage: () => Promise<AnthropicMessage>;
};

export type AnthropicReplyStreamClient = {
  messages: {
    stream: (request: Record<string, unknown>) => AnthropicReplyMessageStream;
  };
};

export type AnthropicReplyStreamRequest = {
  context: SocialReplyContext;
  model?: string;
  client?: AnthropicReplyStreamClient;
  onDraftDelta?: (draft: string) => void;
};

export async function createAnthropicReplySuggestion({
  context,
  model = getAnthropicReplyModel(),
  client = createAnthropicReplyClient(),
}: AnthropicReplySuggestionRequest): Promise<AnthropicReplySuggestionResult> {
  const message = await client.messages.parse(buildReplyRequest(context, model));
  return finalizeReplyResult(message, model);
}

// Streams the structured suggestion. The draft is the first schema field, so it
// arrives long before the object closes; `onDraftDelta` fires with the decoded
// draft-so-far on each text update. The complete structured output (strategy,
// risk flags, etc.) is read from the final parsed message.
export async function streamAnthropicReplySuggestion({
  context,
  model = getAnthropicReplyModel(),
  client = createAnthropicReplyStreamClient(),
  onDraftDelta,
}: AnthropicReplyStreamRequest): Promise<AnthropicReplySuggestionResult> {
  const stream = client.messages.stream(buildReplyRequest(context, model));

  if (onDraftDelta) {
    let lastDraft = "";
    stream.on("text", (_textDelta, textSnapshot) => {
      const draft = extractStreamingDraft(textSnapshot);
      if (draft && draft !== lastDraft) {
        lastDraft = draft;
        onDraftDelta(draft);
      }
    });
  }

  const message = await stream.finalMessage();
  return finalizeReplyResult(message, model);
}

function buildReplyRequest(
  context: SocialReplyContext,
  model: string,
): Record<string, unknown> {
  const request: Record<string, unknown> = {
    model,
    // Adaptive thinking shares this budget with the visible output, so leave headroom.
    max_tokens: 4000,
    // Prefer the cacheable block form; fall back to the plain string for tests/fixtures.
    system: context.systemBlocks ?? context.systemPrompt,
    messages: [{ role: "user", content: context.userPrompt }],
    output_config: {
      format: jsonSchemaOutputFormat(SOCIAL_REPLY_OUTPUT_JSON_SCHEMA),
    },
  };

  // Adaptive thinking only exists on newer models; sending it to an older
  // pinned ANTHROPIC_REPLY_MODEL (e.g. claude-sonnet-4-5) returns a 400.
  if (supportsAdaptiveThinking(model)) {
    request.thinking = { type: "adaptive" };
  }

  return request;
}

function finalizeReplyResult(
  message: AnthropicMessage,
  model: string,
): AnthropicReplySuggestionResult {
  const output = message.parsed_output
    ? parseSocialReplySuggestionOutput(message.parsed_output)
    : parseSocialReplySuggestionJson(extractTextContent(message));

  return {
    output,
    model,
    usage: {
      inputTokens: numberOrNull(message.usage?.input_tokens),
      outputTokens: numberOrNull(message.usage?.output_tokens),
    },
  };
}

// Models that accept `thinking: { type: "adaptive" }`. Older models use the
// legacy enabled/budget_tokens shape and reject adaptive with a 400, so we
// simply omit thinking for anything not on this list.
const ADAPTIVE_THINKING_MODEL_PREFIXES = [
  "claude-opus-4-6",
  "claude-opus-4-7",
  "claude-opus-4-8",
  "claude-sonnet-4-6",
];

export function supportsAdaptiveThinking(model: string): boolean {
  const normalized = model.trim().toLowerCase();
  return ADAPTIVE_THINKING_MODEL_PREFIXES.some((prefix) => normalized.startsWith(prefix));
}

function anthropicInstance(): Anthropic {
  const apiKey = process.env.ANTHROPIC_API_KEY?.trim();
  if (!apiKey) {
    throw new ConfigurationError("Missing ANTHROPIC_API_KEY", ["ANTHROPIC_API_KEY"]);
  }

  return new Anthropic({ apiKey });
}

function createAnthropicReplyClient(): AnthropicReplyClient {
  return anthropicInstance() as unknown as AnthropicReplyClient;
}

function createAnthropicReplyStreamClient(): AnthropicReplyStreamClient {
  return anthropicInstance() as unknown as AnthropicReplyStreamClient;
}

function extractTextContent(message: AnthropicMessage) {
  return (message.content || [])
    .map((block) => (block.type === "text" && typeof block.text === "string" ? block.text : ""))
    .join("\n")
    .trim();
}

function numberOrNull(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

// Pull the decoded `draft` value out of a partial structured-output JSON
// snapshot while it is still streaming. The schema emits `draft` first, so the
// snapshot looks like `{"draft":"...` long before the object closes. Returns the
// text decoded so far, or "" if the value has not started yet. An incomplete
// trailing escape (a dangling backslash or short `\uXXXX`) is held back rather
// than rendered as garbage.
export function extractStreamingDraft(jsonSnapshot: string): string {
  const keyIndex = jsonSnapshot.indexOf('"draft"');
  if (keyIndex === -1) return "";

  let i = keyIndex + '"draft"'.length;
  while (i < jsonSnapshot.length && isJsonWhitespace(jsonSnapshot[i])) i += 1;
  if (jsonSnapshot[i] !== ":") return "";
  i += 1;
  while (i < jsonSnapshot.length && isJsonWhitespace(jsonSnapshot[i])) i += 1;
  if (jsonSnapshot[i] !== '"') return "";
  i += 1;

  return decodeJsonStringPrefix(jsonSnapshot, i);
}

function isJsonWhitespace(char: string | undefined) {
  return char === " " || char === "\n" || char === "\t" || char === "\r";
}

function decodeJsonStringPrefix(source: string, start: number): string {
  let out = "";
  let i = start;
  while (i < source.length) {
    const char = source[i];
    if (char === '"') return out;
    if (char !== "\\") {
      out += char;
      i += 1;
      continue;
    }

    // Escape sequence; hold back if the rest hasn't arrived yet.
    if (i + 1 >= source.length) return out;
    const escaped = source[i + 1];
    if (escaped === "u") {
      if (i + 6 > source.length) return out;
      const hex = source.slice(i + 2, i + 6);
      if (!/^[0-9a-fA-F]{4}$/.test(hex)) return out;
      out += String.fromCharCode(parseInt(hex, 16));
      i += 6;
      continue;
    }
    out += JSON_ESCAPES[escaped] ?? escaped;
    i += 2;
  }
  return out;
}

const JSON_ESCAPES: Record<string, string> = {
  '"': '"',
  "\\": "\\",
  "/": "/",
  n: "\n",
  t: "\t",
  r: "\r",
  b: "\b",
  f: "\f",
};
