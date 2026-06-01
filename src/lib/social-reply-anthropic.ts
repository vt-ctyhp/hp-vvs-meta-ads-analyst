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
  const message = await client.messages.parse({
    model,
    max_tokens: 1200,
    system: context.systemPrompt,
    messages: [{ role: "user", content: context.userPrompt }],
    output_config: {
      format: jsonSchemaOutputFormat(SOCIAL_REPLY_OUTPUT_JSON_SCHEMA),
    },
  });

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
