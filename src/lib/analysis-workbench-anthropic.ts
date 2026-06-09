/**
 * Anthropic (Claude) transport for the Ask AI Workbench agent.
 *
 * The agent loop is provider-agnostic: it talks to an injected
 * {@link AgentCompletion}. This module supplies the Claude implementation —
 * translating the SDK-agnostic request into the Anthropic Messages tool-use
 * shape and normalizing the response back. The two translation functions are
 * pure so they can be unit-tested without the SDK.
 *
 * Default model: Claude Sonnet 4.6 (strong tool-use + reasoning, sensible
 * cost). Override with ANALYSIS_WORKBENCH_AGENT_MODEL.
 */
import Anthropic from "@anthropic-ai/sdk";

import { ConfigurationError } from "./env.ts";
import type { OpenAICostBreakdown } from "./openai-cost.ts";
import type {
  AgentCompletion,
  AgentCompletionRequest,
  AgentCompletionResponse,
  AgentToolCall,
} from "./analysis-workbench-agent.ts";

export const WORKBENCH_AGENT_ANTHROPIC_MODEL = "claude-sonnet-4-6";
export const WORKBENCH_AGENT_ANTHROPIC_MAX_TOKENS = 4096;

/** USD per million tokens. Keep in sync with the Claude pricing table. */
const ANTHROPIC_PRICING_USD_PER_MTOK: Record<string, { input: number; output: number }> = {
  "claude-sonnet-4-6": { input: 3, output: 15 },
  "claude-opus-4-8": { input: 5, output: 25 },
  "claude-haiku-4-5": { input: 1, output: 5 },
};

export function getAnalysisWorkbenchAgentModel(): string {
  return process.env.ANALYSIS_WORKBENCH_AGENT_MODEL?.trim() || WORKBENCH_AGENT_ANTHROPIC_MODEL;
}

export function estimateAnthropicAgentCost(input: {
  model: string;
  inputTokens: number;
  outputTokens: number;
}): OpenAICostBreakdown {
  const inputTokens = Math.max(0, Math.floor(input.inputTokens || 0));
  const outputTokens = Math.max(0, Math.floor(input.outputTokens || 0));
  const priceKey =
    Object.keys(ANTHROPIC_PRICING_USD_PER_MTOK).find((key) => input.model.startsWith(key)) ??
    WORKBENCH_AGENT_ANTHROPIC_MODEL;
  const price = ANTHROPIC_PRICING_USD_PER_MTOK[priceKey];
  const estimatedCostUsd =
    (inputTokens / 1_000_000) * price.input + (outputTokens / 1_000_000) * price.output;

  return {
    model: input.model,
    inputTokens,
    outputTokens,
    totalTokens: inputTokens + outputTokens,
    estimatedCostUsd,
  };
}

// ---------------------------------------------------------------------------
// Request / response translation (pure)
// ---------------------------------------------------------------------------

type AnthropicContentBlock =
  | { type: "text"; text: string }
  | { type: "tool_use"; id: string; name: string; input: unknown }
  | { type: "tool_result"; tool_use_id: string; content: string };

type AnthropicMessage = { role: "user" | "assistant"; content: AnthropicContentBlock[] };

/** Translate the SDK-agnostic request into Anthropic Messages params. */
export function toAnthropicAgentRequest(request: AgentCompletionRequest): Record<string, unknown> {
  const systemText = request.messages
    .filter((message) => message.role === "system")
    .map((message) => message.content ?? "")
    .join("\n\n");

  const messages: AnthropicMessage[] = [];
  for (const message of request.messages) {
    if (message.role === "system") continue;

    if (message.role === "tool") {
      // Tool results are user-turn blocks; merge consecutive results into one turn.
      const block: AnthropicContentBlock = {
        type: "tool_result",
        tool_use_id: message.toolCallId ?? "",
        content: message.content ?? "",
      };
      const last = messages[messages.length - 1];
      if (last && last.role === "user" && last.content.every((b) => b.type === "tool_result")) {
        last.content.push(block);
      } else {
        messages.push({ role: "user", content: [block] });
      }
      continue;
    }

    if (message.role === "assistant") {
      const content: AnthropicContentBlock[] = [];
      if (message.content?.trim()) content.push({ type: "text", text: message.content });
      for (const call of message.toolCalls ?? []) {
        content.push({ type: "tool_use", id: call.id, name: call.name, input: safeJson(call.arguments) });
      }
      messages.push({ role: "assistant", content: content.length ? content : [{ type: "text", text: "" }] });
      continue;
    }

    // user
    messages.push({ role: "user", content: [{ type: "text", text: message.content ?? "" }] });
  }

  const toolChoice =
    request.toolChoice === "auto" || request.toolChoice === "none"
      ? { type: request.toolChoice }
      : { type: "tool", name: request.toolChoice.name };

  return {
    model: request.model,
    max_tokens: WORKBENCH_AGENT_ANTHROPIC_MAX_TOKENS,
    ...(systemText ? { system: systemText } : {}),
    messages,
    tools: request.tools.map((tool) => ({
      name: tool.name,
      description: tool.description,
      input_schema: tool.parameters,
    })),
    tool_choice: toolChoice,
  };
}

type AnthropicRawResponse = {
  model?: string;
  usage?: { input_tokens?: number; output_tokens?: number } | null;
  content?: Array<
    | { type?: "text"; text?: string }
    | { type?: "tool_use"; id?: string; name?: string; input?: unknown }
    | { type?: string; [key: string]: unknown }
  > | null;
};

/** Normalize an Anthropic Messages response into the SDK-agnostic shape. */
export function normalizeAnthropicAgentResponse(raw: AnthropicRawResponse): AgentCompletionResponse {
  const blocks = raw.content ?? [];
  const text = blocks
    .filter((block): block is { type: "text"; text?: string } => block?.type === "text")
    .map((block) => block.text ?? "")
    .join("");
  const toolCalls: AgentToolCall[] = blocks
    .filter((block): block is { type: "tool_use"; id?: string; name?: string; input?: unknown } => block?.type === "tool_use")
    .map((block) => ({
      id: block.id || "",
      name: block.name || "",
      arguments: JSON.stringify(block.input ?? {}),
    }));

  return {
    model: raw.model,
    message: {
      content: text ? text : null,
      ...(toolCalls.length ? { toolCalls } : {}),
    },
    usage: {
      inputTokens: raw.usage?.input_tokens || 0,
      outputTokens: raw.usage?.output_tokens || 0,
    },
  };
}

function safeJson(raw: string): unknown {
  try {
    return JSON.parse(raw || "{}");
  } catch {
    return {};
  }
}

/** Binds the agent loop to the real Anthropic client. */
export function createAnthropicAgentCompletion(): AgentCompletion {
  const apiKey = process.env.ANTHROPIC_API_KEY?.trim();
  if (!apiKey) {
    throw new ConfigurationError("Missing ANTHROPIC_API_KEY", ["ANTHROPIC_API_KEY"]);
  }
  const client = new Anthropic({ apiKey });
  return async (request) => {
    const raw = (await client.messages.create(
      toAnthropicAgentRequest(request) as unknown as Parameters<typeof client.messages.create>[0],
    )) as unknown as AnthropicRawResponse;
    return normalizeAnthropicAgentResponse(raw);
  };
}
