/**
 * Agentic Ask AI Workbench core (Phase 2).
 *
 * One agent reads the question, looks up real data through the two read-only
 * query tools, then submits a written answer plus the visuals it chose. There
 * is no per-question-type code: the output "mode" is only a breadth hint.
 *
 *   - {@link buildWorkbenchAgentSystemPrompt} (Unit 4) — role, schema, tools,
 *     grounding rules, visual-selection guidance, mode hint.
 *   - {@link runWorkbenchAgent} (Unit 5) — the tool-calling loop with hard
 *     cost ($0.05) and tool-call caps. Returns the answer, the visual specs the
 *     model chose, and an evidence ledger of every query that ran.
 *
 * The model transport and the two tool executors are injected so the loop is
 * deterministic under test; {@link createOpenAIAgentCompletion} binds the real
 * OpenAI client for production.
 */
import OpenAI from "openai";

import { getOpenAIAnalysisModel } from "./env.ts";
import { buildOpenAICostBreakdown, type OpenAICostBreakdown } from "./openai-cost.ts";
import {
  QUERY_TOOLS_SCHEMA_DESCRIPTION,
  QueryToolError,
  ENTITY_TYPES,
  type QueryEntitiesParams,
  type QueryEntitiesResult,
  type QueryPerformanceParams,
  type QueryPerformanceResult,
} from "./analysis-workbench-query-tools.ts";
import type { AnalysisOutputMode } from "./analysis-workbench-contract.ts";
import type { AnalysisWorkbenchPipelineAggregateRequest } from "./analysis-workbench-pipeline.ts";

// ---------------------------------------------------------------------------
// Caps
// ---------------------------------------------------------------------------

export const WORKBENCH_AGENT_COST_CEILING_USD = 0.05;
export const WORKBENCH_AGENT_MAX_TOOL_CALLS = 6;
/** Absolute safety bound on model round-trips (loop never exceeds this). */
const WORKBENCH_AGENT_MAX_MODEL_CALLS = 12;
/** Rows from a single tool result echoed back to the model (token control). */
const TOOL_RESULT_ROW_CAP = 50;

// ---------------------------------------------------------------------------
// Transport types (a minimal, SDK-agnostic completion contract)
// ---------------------------------------------------------------------------

export type AgentToolCall = { id: string; name: string; arguments: string };

export type AgentMessage = {
  role: "system" | "user" | "assistant" | "tool";
  content: string | null;
  toolCalls?: AgentToolCall[];
  toolCallId?: string;
};

export type AgentToolSpec = {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
};

export type AgentToolChoice = "auto" | "none" | { name: string };

export type AgentCompletionRequest = {
  model: string;
  messages: AgentMessage[];
  tools: AgentToolSpec[];
  toolChoice: AgentToolChoice;
};

export type AgentCompletionResponse = {
  message: { content: string | null; toolCalls?: AgentToolCall[] };
  usage: { inputTokens: number; outputTokens: number };
  model?: string;
};

export type AgentCompletion = (request: AgentCompletionRequest) => Promise<AgentCompletionResponse>;

// ---------------------------------------------------------------------------
// Result types
// ---------------------------------------------------------------------------

export type AgentLedgerEntry = {
  id: string;
  tool: "query_performance" | "query_entities";
  params: unknown;
  summary: string;
  rowCount: number;
  rows: Array<Record<string, unknown>>;
};

export type AgentVisualSpec = Record<string, unknown>;

export type WorkbenchAgentStopReason =
  | "submitted"
  | "cost_ceiling"
  | "max_tool_calls"
  | "model_final"
  | "no_submission";

export type WorkbenchAgentResult = {
  answer: string;
  visuals: AgentVisualSpec[];
  ledger: AgentLedgerEntry[];
  requests: AnalysisWorkbenchPipelineAggregateRequest[];
  cost: OpenAICostBreakdown;
  model: string;
  stopReason: WorkbenchAgentStopReason;
  toolCallCount: number;
};

export type RunWorkbenchAgentInput = {
  prompt: string;
  outputMode: AnalysisOutputMode;
  latestSyncedInsightDate?: string | null;
  completion: AgentCompletion;
  executePerformance: (params: QueryPerformanceParams) => Promise<QueryPerformanceResult>;
  executeEntities: (params: QueryEntitiesParams) => Promise<QueryEntitiesResult>;
  model?: string;
  costCeilingUsd?: number;
  maxToolCalls?: number;
  /** Cost estimator for the ceiling check; defaults to OpenAI pricing. */
  estimateCost?: (input: { model: string; inputTokens: number; outputTokens: number }) => OpenAICostBreakdown;
};

// ---------------------------------------------------------------------------
// Unit 4 — system prompt
// ---------------------------------------------------------------------------

const MODE_BREADTH_HINT: Record<AnalysisOutputMode, string> = {
  answer_only:
    "Mode: ANSWER ONLY. Lead with prose. Usually choose no visual; add one only if a single chart is clearly the best way to convey the answer.",
  answer_visuals:
    "Mode: ANSWER + VISUALS. Write the answer, then choose the one or two visuals that most directly support it. Omit visuals when prose alone answers the question.",
  full_dashboard:
    "Mode: FULL DASHBOARD. Write the answer, then choose the broader set of charts and tables a reader would want to explore the result — only the ones the data actually supports. Never pad with empty or redundant visuals.",
};

export function buildWorkbenchAgentSystemPrompt(outputMode: AnalysisOutputMode): string {
  return `You are the Ask AI analyst for a Meta Ads workbench. You answer the user's question directly, in plain language, grounded in real data.

HOW YOU WORK
- Decide what data the question needs, then call the read-only query tools to fetch it. You may call tools several times to refine.
- When you have enough, call submit_answer with your written answer and the visuals you chose.
- Answer the actual question asked. A status/roster/yes-no question gets a roster or a sentence, not a forced metric breakdown.

${QUERY_TOOLS_SCHEMA_DESCRIPTION}

GROUNDING (non-negotiable)
- Every number, name, and status in your answer must come from a tool result you received this run. Never invent, estimate, or recall figures from memory.
- If the tools return nothing, say so plainly (e.g. "No live US Product ads were found") instead of inventing a breakdown of zeros.
- When you report how many entities are live/paused/off, use the exact counts query_entities returned (its statusBreakdown). Do not re-tally or estimate, and do not add counts across separate queries unless that total also came back from a tool.
- Keep recommendations advisory. This tool is read-only; never claim it will pause, edit, or create anything.

WRITING THE ANSWER (formatting)
- Plain text only. Do NOT use markdown: no #/##/### headings, no **bold** or *italics*, no backticks or code spans, no markdown tables or pipes.
- Lead with one or two sentences that directly answer the question — the headline plus the key takeaway (e.g. the winner, the trend, the ranking).
- Keep the prose SHORT — a brief narrative, not a data dump. Do NOT list every row's metrics in sentences. When you have row-level detail (many entities, or several metrics per entity), put it in a flat_table visual and let the table carry the numbers; the prose just summarizes.
- A short status roster (just a few counts) may use one line per count, e.g. "Live: 4 campaigns", "Paused: 2 campaigns".
- Refer to campaigns, ad sets, ads, and creatives by their name. Never print raw numeric ids in the answer.
- No preamble, no restating the question, no decorative dividers.

CHOOSING VISUALS (you choose; nothing is preset)
- You decide whether a visual helps and which kind fits: bar_chart, line_chart, flat_table, metric_card, pivot_table, or scatter_chart — or none.
- When the answer compares several entities or reports multiple metrics per entity (e.g. "all creatives for X", "by campaign group", "winners and losers"), you MUST include a flat_table built from that query, and keep the prose to a short summary instead of listing the rows. Add a bar_chart of the single most important metric when ranking entities helps.
- Trends over time → line_chart; comparisons across a handful of entities → bar_chart; a single headline number → metric_card; detailed multi-metric rows → flat_table.
- Build every visual from a query you ran: reference its id (e.g. "Q1") and the metric/dimension columns to plot. Never hand-write data points. Prefer no chart only when a sentence or two fully answers the question.

${MODE_BREADTH_HINT[outputMode]}

submit_answer takes { answer: string, visuals: Array<{ type, title, sourceCallId, metric?, dimension?, rowDimension?, columnDimension?, xMetric?, yMetric? }> }. visuals may be empty.`;
}

// ---------------------------------------------------------------------------
// Tool specs given to the model
// ---------------------------------------------------------------------------

function agentToolSpecs(): AgentToolSpec[] {
  return [
    {
      name: "query_performance",
      description:
        "Read Meta Ads daily performance (spend, impressions, messaging contacts, CTR, budgets, trends) over a date range, optionally grouped and filtered.",
      parameters: {
        type: "object",
        additionalProperties: false,
        required: ["start", "end", "metrics"],
        properties: {
          start: { type: "string", description: "ISO start date YYYY-MM-DD." },
          end: { type: "string", description: "ISO end date YYYY-MM-DD." },
          metrics: { type: "array", items: { type: "string" }, description: "One or more performance metrics." },
          dimensions: { type: "array", items: { type: "string" }, description: "Group-by dimensions (optional)." },
          filters: {
            type: "array",
            items: {
              type: "object",
              additionalProperties: false,
              required: ["field", "value"],
              properties: {
                field: { type: "string" },
                operator: { type: "string", enum: ["equals", "contains"] },
                value: { type: "string" },
              },
            },
          },
          sortField: { type: "string" },
          sortDirection: { type: "string", enum: ["asc", "desc"] },
          limit: { type: "number" },
        },
      },
    },
    {
      name: "query_entities",
      description:
        "Read the CURRENT state of advertising objects (campaigns, ad sets, ads, creatives): delivery status (live/paused/off), name, budget, thumbnail. Independent of any date window.",
      parameters: {
        type: "object",
        additionalProperties: false,
        required: ["entityType"],
        properties: {
          entityType: { type: "string", enum: [...ENTITY_TYPES] },
          filters: {
            type: "object",
            additionalProperties: false,
            properties: {
              brand: { type: "string" },
              campaignUmbrella: { type: "string" },
              status: { type: "string", enum: ["live", "paused", "off"] },
              nameContains: { type: "string" },
            },
          },
          limit: { type: "number" },
        },
      },
    },
    {
      name: "submit_answer",
      description: "Submit the final written answer and the visuals you chose. Call this once you have enough data.",
      parameters: {
        type: "object",
        additionalProperties: false,
        required: ["answer", "visuals"],
        properties: {
          answer: { type: "string", description: "The written answer, grounded in tool results." },
          visuals: {
            type: "array",
            description: "0..N visuals built from queried rows. Empty when prose answers the question.",
            items: {
              type: "object",
              additionalProperties: true,
              required: ["type", "title", "sourceCallId"],
              properties: {
                type: {
                  type: "string",
                  enum: ["bar_chart", "line_chart", "flat_table", "metric_card", "pivot_table", "scatter_chart"],
                },
                title: { type: "string" },
                sourceCallId: { type: "string", description: "Id of the query that produced the rows (e.g. Q1)." },
              },
            },
          },
        },
      },
    },
  ];
}

// ---------------------------------------------------------------------------
// Unit 5 — the loop
// ---------------------------------------------------------------------------

export async function runWorkbenchAgent(input: RunWorkbenchAgentInput): Promise<WorkbenchAgentResult> {
  const model = input.model || getOpenAIAnalysisModel("fast");
  const costCeiling = input.costCeilingUsd ?? WORKBENCH_AGENT_COST_CEILING_USD;
  const maxToolCalls = input.maxToolCalls ?? WORKBENCH_AGENT_MAX_TOOL_CALLS;
  const tools = agentToolSpecs();

  const messages: AgentMessage[] = [
    { role: "system", content: buildWorkbenchAgentSystemPrompt(input.outputMode) },
    {
      role: "user",
      content: JSON.stringify({
        question: input.prompt,
        outputMode: input.outputMode,
        latestSyncedInsightDate: input.latestSyncedInsightDate || null,
      }),
    },
  ];

  const ledger: AgentLedgerEntry[] = [];
  const requests: AnalysisWorkbenchPipelineAggregateRequest[] = [];
  let inputTokens = 0;
  let outputTokens = 0;
  let toolCallCount = 0;
  let lastAssistantText = "";
  let resolvedModel = model;

  const estimate = input.estimateCost ?? buildOpenAICostBreakdown;
  const cost = () => estimate({ model: resolvedModel, inputTokens, outputTokens });

  const finish = (
    answer: string,
    visuals: AgentVisualSpec[],
    stopReason: WorkbenchAgentStopReason,
  ): WorkbenchAgentResult => ({
    answer,
    visuals,
    ledger,
    requests,
    cost: cost(),
    model: resolvedModel,
    stopReason,
    toolCallCount,
  });

  for (let modelCall = 0; modelCall < WORKBENCH_AGENT_MAX_MODEL_CALLS; modelCall += 1) {
    // Hard cost cap: once we have spent the ceiling, stop without another paid call.
    if (cost().estimatedCostUsd >= costCeiling) {
      return finish(synthesizeFallbackAnswer(lastAssistantText, ledger), [], "cost_ceiling");
    }

    const forceSubmit = toolCallCount >= maxToolCalls;
    const response = await input.completion({
      model,
      messages,
      tools,
      toolChoice: forceSubmit ? { name: "submit_answer" } : "auto",
    });
    inputTokens += Math.max(0, response.usage?.inputTokens || 0);
    outputTokens += Math.max(0, response.usage?.outputTokens || 0);
    if (response.model) resolvedModel = response.model;

    const toolCalls = response.message.toolCalls ?? [];
    if (!toolCalls.length) {
      const text = response.message.content?.trim() || synthesizeFallbackAnswer(lastAssistantText, ledger);
      return finish(text, [], forceSubmit ? "max_tool_calls" : "model_final");
    }

    if (response.message.content?.trim()) lastAssistantText = response.message.content.trim();
    messages.push({ role: "assistant", content: response.message.content, toolCalls });

    for (const call of toolCalls) {
      if (call.name === "submit_answer") {
        const submission = parseSubmission(call.arguments);
        return finish(
          submission.answer || synthesizeFallbackAnswer(lastAssistantText, ledger),
          submission.visuals,
          forceSubmit ? "max_tool_calls" : "submitted",
        );
      }

      const toolMessage = await executeAgentTool(call, input, ledger, requests);
      messages.push({ role: "tool", toolCallId: call.id, content: toolMessage });
      if (call.name === "query_performance" || call.name === "query_entities") toolCallCount += 1;
    }
  }

  return finish(synthesizeFallbackAnswer(lastAssistantText, ledger), [], "no_submission");
}

async function executeAgentTool(
  call: AgentToolCall,
  input: RunWorkbenchAgentInput,
  ledger: AgentLedgerEntry[],
  requests: AnalysisWorkbenchPipelineAggregateRequest[],
): Promise<string> {
  let params: Record<string, unknown>;
  try {
    params = JSON.parse(call.arguments || "{}");
  } catch {
    return JSON.stringify({ error: "Arguments were not valid JSON. Send a JSON object." });
  }

  try {
    if (call.name === "query_performance") {
      const result = await input.executePerformance(params as QueryPerformanceParams);
      requests.push(result.request);
      const id = `Q${ledger.length + 1}`;
      ledger.push({
        id,
        tool: "query_performance",
        params,
        summary: result.summary,
        rowCount: result.rowCount,
        rows: result.rows,
      });
      return JSON.stringify({
        id,
        summary: result.summary,
        rowCount: result.rowCount,
        rows: result.rows.slice(0, TOOL_RESULT_ROW_CAP),
      });
    }

    if (call.name === "query_entities") {
      const result = await input.executeEntities(params as QueryEntitiesParams);
      const id = `Q${ledger.length + 1}`;
      ledger.push({
        id,
        tool: "query_entities",
        params,
        summary: result.summary,
        rowCount: result.rowCount,
        rows: result.rows as unknown as Array<Record<string, unknown>>,
      });
      return JSON.stringify({
        id,
        summary: result.summary,
        rowCount: result.rowCount,
        statusBreakdown: result.statusBreakdown,
        rows: result.rows.slice(0, TOOL_RESULT_ROW_CAP),
      });
    }

    return JSON.stringify({ error: `Unknown tool "${call.name}".` });
  } catch (error) {
    const message =
      error instanceof QueryToolError || error instanceof Error
        ? error.message
        : "The query failed.";
    return JSON.stringify({ error: message });
  }
}

function parseSubmission(rawArguments: string): { answer: string; visuals: AgentVisualSpec[] } {
  try {
    const parsed = JSON.parse(rawArguments || "{}") as { answer?: unknown; visuals?: unknown };
    const answer = typeof parsed.answer === "string" ? parsed.answer.trim() : "";
    const visuals = Array.isArray(parsed.visuals)
      ? parsed.visuals.filter(
          (visual): visual is AgentVisualSpec =>
            Boolean(visual) && typeof visual === "object" && !Array.isArray(visual),
        )
      : [];
    return { answer, visuals };
  } catch {
    return { answer: "", visuals: [] };
  }
}

function synthesizeFallbackAnswer(lastAssistantText: string, ledger: AgentLedgerEntry[]): string {
  if (lastAssistantText) return lastAssistantText;
  if (ledger.length) {
    return `Based on the data gathered so far: ${ledger.map((entry) => entry.summary).join(" ")}`;
  }
  return "No data was available to answer this question.";
}

// ---------------------------------------------------------------------------
// Rollout flag (Phase 5 wiring)
// ---------------------------------------------------------------------------

/**
 * The agentic answer path is the default. It still requires an OpenAI key (the
 * engine falls back to the deterministic pipeline when no key is present, so the
 * tool never goes dark). Set `ANALYSIS_WORKBENCH_AGENT=off` (or 0/false/no) to
 * force the deterministic path as a kill-switch.
 */
export function analysisWorkbenchAgentEnabled(): boolean {
  const configured = process.env.ANALYSIS_WORKBENCH_AGENT?.trim().toLowerCase();
  if (!configured) return true;
  return !["0", "false", "no", "off"].includes(configured);
}

// ---------------------------------------------------------------------------
// Production OpenAI transport
// ---------------------------------------------------------------------------

type OpenAIChatRawResponse = {
  model?: string;
  usage?: { prompt_tokens?: number; completion_tokens?: number } | null;
  choices?: Array<{
    message?: {
      content?: string | null;
      tool_calls?: Array<{ id?: string; type?: string; function?: { name?: string; arguments?: string } }> | null;
    } | null;
  }> | null;
};

/** Translate the SDK-agnostic request into OpenAI chat.completions params. */
export function toOpenAIChatRequest(request: AgentCompletionRequest): Record<string, unknown> {
  return {
    model: request.model,
    messages: request.messages.map((message) => {
      if (message.role === "tool") {
        return { role: "tool", tool_call_id: message.toolCallId, content: message.content ?? "" };
      }
      if (message.role === "assistant" && message.toolCalls?.length) {
        return {
          role: "assistant",
          content: message.content,
          tool_calls: message.toolCalls.map((call) => ({
            id: call.id,
            type: "function",
            function: { name: call.name, arguments: call.arguments },
          })),
        };
      }
      return { role: message.role, content: message.content ?? "" };
    }),
    tools: request.tools.map((tool) => ({
      type: "function",
      function: { name: tool.name, description: tool.description, parameters: tool.parameters },
    })),
    tool_choice:
      request.toolChoice === "auto" || request.toolChoice === "none"
        ? request.toolChoice
        : { type: "function", function: { name: request.toolChoice.name } },
  };
}

/** Normalize an OpenAI chat response into the SDK-agnostic shape. */
export function normalizeOpenAIChatResponse(raw: OpenAIChatRawResponse): AgentCompletionResponse {
  const message = raw.choices?.[0]?.message;
  const toolCalls = (message?.tool_calls ?? [])
    .filter((call) => call?.type === "function" && call.function?.name)
    .map((call) => ({
      id: call.id || "",
      name: call.function?.name || "",
      arguments: call.function?.arguments || "{}",
    }));

  return {
    model: raw.model,
    message: {
      content: message?.content ?? null,
      ...(toolCalls.length ? { toolCalls } : {}),
    },
    usage: {
      inputTokens: raw.usage?.prompt_tokens || 0,
      outputTokens: raw.usage?.completion_tokens || 0,
    },
  };
}

/** Binds the agent loop to the real OpenAI client. */
export function createOpenAIAgentCompletion(): AgentCompletion {
  const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  return async (request) => {
    const raw = (await client.chat.completions.create(
      toOpenAIChatRequest(request) as unknown as Parameters<typeof client.chat.completions.create>[0],
    )) as unknown as OpenAIChatRawResponse;
    return normalizeOpenAIChatResponse(raw);
  };
}
