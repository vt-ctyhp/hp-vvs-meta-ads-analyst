import assert from "node:assert/strict";
import test from "node:test";

import {
  estimateAnthropicAgentCost,
  normalizeAnthropicAgentResponse,
  toAnthropicAgentRequest,
} from "../src/lib/analysis-workbench-anthropic.ts";

test("maps system, user, assistant tool calls, and tool results into Anthropic shape", () => {
  const mapped = toAnthropicAgentRequest({
    model: "claude-sonnet-4-6",
    messages: [
      { role: "system", content: "You are the analyst." },
      { role: "user", content: "How many ads are live?" },
      {
        role: "assistant",
        content: null,
        toolCalls: [{ id: "tu_1", name: "query_entities", arguments: '{"entityType":"ad"}' }],
      },
      { role: "tool", toolCallId: "tu_1", content: '{"rowCount":3}' },
    ],
    tools: [{ name: "query_entities", description: "d", parameters: { type: "object" } }],
    toolChoice: "auto",
  });

  assert.equal(mapped.model, "claude-sonnet-4-6");
  assert.equal(mapped.system, "You are the analyst.");
  assert.deepEqual(mapped.tool_choice, { type: "auto" });
  const tools = mapped.tools as Array<Record<string, unknown>>;
  assert.equal(tools[0].name, "query_entities");
  assert.ok(tools[0].input_schema);

  const messages = mapped.messages as Array<{ role: string; content: Array<Record<string, unknown>> }>;
  assert.equal(messages[0].role, "user");
  assert.equal(messages[1].role, "assistant");
  assert.equal(messages[1].content[0].type, "tool_use");
  assert.equal(messages[1].content[0].id, "tu_1");
  assert.deepEqual(messages[1].content[0].input, { entityType: "ad" });
  assert.equal(messages[2].role, "user");
  assert.equal(messages[2].content[0].type, "tool_result");
  assert.equal(messages[2].content[0].tool_use_id, "tu_1");
});

test("merges consecutive tool results into one user turn and maps a forced tool choice", () => {
  const mapped = toAnthropicAgentRequest({
    model: "claude-sonnet-4-6",
    messages: [
      { role: "user", content: "q" },
      {
        role: "assistant",
        content: null,
        toolCalls: [
          { id: "a", name: "query_performance", arguments: "{}" },
          { id: "b", name: "query_entities", arguments: "{}" },
        ],
      },
      { role: "tool", toolCallId: "a", content: "{}" },
      { role: "tool", toolCallId: "b", content: "{}" },
    ],
    tools: [],
    toolChoice: { name: "submit_answer" },
  });

  assert.deepEqual(mapped.tool_choice, { type: "tool", name: "submit_answer" });
  const messages = mapped.messages as Array<{ role: string; content: unknown[] }>;
  // The two tool results collapse into a single user turn with two blocks.
  const lastTurn = messages[messages.length - 1];
  assert.equal(lastTurn.role, "user");
  assert.equal(lastTurn.content.length, 2);
});

test("normalizes text + tool_use content blocks and usage", () => {
  const normalized = normalizeAnthropicAgentResponse({
    model: "claude-sonnet-4-6",
    usage: { input_tokens: 120, output_tokens: 45 },
    content: [
      { type: "text", text: "Let me check." },
      { type: "tool_use", id: "tu_9", name: "query_performance", input: { metrics: ["spend"] } },
    ],
  });

  assert.equal(normalized.model, "claude-sonnet-4-6");
  assert.equal(normalized.message.content, "Let me check.");
  assert.equal(normalized.message.toolCalls?.[0].name, "query_performance");
  assert.equal(normalized.message.toolCalls?.[0].arguments, '{"metrics":["spend"]}');
  assert.equal(normalized.usage.inputTokens, 120);
  assert.equal(normalized.usage.outputTokens, 45);
});

test("a tool-call-free response yields null content and no toolCalls", () => {
  const normalized = normalizeAnthropicAgentResponse({
    model: "claude-sonnet-4-6",
    usage: { input_tokens: 10, output_tokens: 5 },
    content: [{ type: "text", text: "Final answer." }],
  });
  assert.equal(normalized.message.content, "Final answer.");
  assert.equal(normalized.message.toolCalls, undefined);
});

test("estimates Sonnet 4.6 cost from token counts", () => {
  const cost = estimateAnthropicAgentCost({
    model: "claude-sonnet-4-6",
    inputTokens: 1_000_000,
    outputTokens: 1_000_000,
  });
  // $3 input + $15 output per million.
  assert.equal(cost.estimatedCostUsd, 18);
  assert.equal(cost.totalTokens, 2_000_000);
});
