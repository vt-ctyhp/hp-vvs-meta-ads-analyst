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

export async function createAnthropicReplySuggestion({
  context,
  model = getAnthropicReplyModel(),
  client = createAnthropicReplyClient(),
}: AnthropicReplySuggestionRequest): Promise<AnthropicReplySuggestionResult> {
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

  const message = await client.messages.parse(request);

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

function createAnthropicReplyClient(): AnthropicReplyClient {
  const apiKey = process.env.ANTHROPIC_API_KEY?.trim();
  if (!apiKey) {
    throw new ConfigurationError("Missing ANTHROPIC_API_KEY", ["ANTHROPIC_API_KEY"]);
  }

  return new Anthropic({ apiKey }) as unknown as AnthropicReplyClient;
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
