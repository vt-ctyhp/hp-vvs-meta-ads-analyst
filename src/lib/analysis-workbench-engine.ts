/**
 * Engine selector for an Ask AI Workbench answer (Phase 5, Unit 9).
 *
 * One seam decides whether a run is answered by the agentic path (Phases 1–4)
 * or by the deterministic facts pipeline. The agent path runs only when the
 * `ANALYSIS_WORKBENCH_AGENT` flag is on AND an OpenAI key is configured;
 * otherwise the deterministic pipeline answers, exactly as before. This keeps
 * the deterministic engine as both the fallback and the A/B control while the
 * flag defaults OFF.
 *
 * Every external dependency (the flag, the API key, the model transport, the
 * Supabase entity fetcher, and both runners) is overridable so the wiring can
 * be tested without touching OpenAI or Supabase.
 *
 * Unsupported-boundary note: the agent path intentionally has no separate
 * revenue/ROAS/CRM pre-check. `query_performance` only exposes Meta-side
 * metrics (the whitelist excludes revenue/ROAS), so the agent cannot fetch what
 * is not tracked; it answers "not tracked" instead, and the grounding pass
 * redacts any figure it cannot trace. The deterministic path keeps its governed
 * unsupported validator.
 */
import {
  analysisWorkbenchAgentEnabled,
  createOpenAIAgentCompletion,
  runWorkbenchAgent,
  type AgentCompletion,
  type RunWorkbenchAgentInput,
  type WorkbenchAgentResult,
} from "./analysis-workbench-agent.ts";
import { mapWorkbenchAgentResultToPipelineResult } from "./analysis-workbench-agent-mapper.ts";
import { createSupabaseEntityFetcher } from "./analysis-workbench-entity-fetcher.ts";
import {
  queryEntities,
  queryPerformance,
  type QueryEntitiesDeps,
} from "./analysis-workbench-query-tools.ts";
import {
  runAnalysisWorkbenchFactsPipeline,
  type AnalysisWorkbenchEntityDisplayRequest,
  type AnalysisWorkbenchPipelineAggregateRequest,
  type AnalysisWorkbenchPipelineResult,
} from "./analysis-workbench-pipeline.ts";
import type {
  AnalysisOutputMode,
  AnalysisWorkbenchContextSnapshot,
  AnalysisWorkbenchControlledEdit,
  AnalysisWorkbenchEntityDisplay,
} from "./analysis-workbench-contract.ts";
import type { MetaInsightAggregateRow } from "./meta-insight-aggregates.ts";

export type RunAnalysisWorkbenchAnswerInput = {
  prompt: string;
  outputMode: AnalysisOutputMode;
  latestSyncedInsightDate: string | null;
  inheritedContext?: AnalysisWorkbenchContextSnapshot | null;
  controlledEdit?: AnalysisWorkbenchControlledEdit | null;
  executeAggregate: (
    request: AnalysisWorkbenchPipelineAggregateRequest,
  ) => Promise<MetaInsightAggregateRow[]>;
  loadEntityDisplays: (
    request: AnalysisWorkbenchEntityDisplayRequest,
  ) => Promise<AnalysisWorkbenchEntityDisplay[]>;

  // Overrides (flag/key resolution + injected runners) — defaulted in production.
  agentEnabled?: boolean;
  openAiApiKey?: string | null;
  createCompletion?: () => AgentCompletion;
  fetchEntities?: QueryEntitiesDeps["fetchEntities"];
  /** Agent path only: swap id-shaped entity names for real names before the model sees rows. */
  resolveEntityNames?: (rows: MetaInsightAggregateRow[]) => Promise<MetaInsightAggregateRow[]>;
  runAgent?: (input: RunWorkbenchAgentInput) => Promise<WorkbenchAgentResult>;
  mapAgentResult?: typeof mapWorkbenchAgentResultToPipelineResult;
  runDeterministic?: typeof runAnalysisWorkbenchFactsPipeline;
};

/** True when the agent flag is on and an OpenAI key is configured. */
export function isAnalysisWorkbenchAgentPathReady(
  agentEnabled: boolean,
  apiKey: string | null | undefined,
): boolean {
  return Boolean(agentEnabled && apiKey && apiKey.trim());
}

export async function runAnalysisWorkbenchAnswer(
  input: RunAnalysisWorkbenchAnswerInput,
): Promise<AnalysisWorkbenchPipelineResult> {
  const agentEnabled =
    input.agentEnabled !== undefined ? input.agentEnabled : analysisWorkbenchAgentEnabled();
  const apiKey =
    input.openAiApiKey !== undefined ? input.openAiApiKey : process.env.OPENAI_API_KEY ?? null;

  if (isAnalysisWorkbenchAgentPathReady(agentEnabled, apiKey)) {
    const runAgent = input.runAgent ?? runWorkbenchAgent;
    const mapAgent = input.mapAgentResult ?? mapWorkbenchAgentResultToPipelineResult;
    const completion = (input.createCompletion ?? createOpenAIAgentCompletion)();
    const fetchEntities = input.fetchEntities ?? createSupabaseEntityFetcher();
    const resolveEntityNames = input.resolveEntityNames ?? (async (rows) => rows);

    const agentResult = await runAgent({
      prompt: input.prompt,
      outputMode: input.outputMode,
      latestSyncedInsightDate: input.latestSyncedInsightDate,
      completion,
      executePerformance: (params) =>
        queryPerformance(params, {
          executeAggregate: async (request) => resolveEntityNames(await input.executeAggregate(request)),
        }),
      executeEntities: (params) => queryEntities(params, { fetchEntities }),
    });

    return mapAgent({
      prompt: input.prompt,
      outputMode: input.outputMode,
      agentResult,
    });
  }

  const runDeterministic = input.runDeterministic ?? runAnalysisWorkbenchFactsPipeline;
  return runDeterministic({
    prompt: input.prompt,
    outputMode: input.outputMode,
    latestSyncedInsightDate: input.latestSyncedInsightDate,
    inheritedContext: input.inheritedContext,
    controlledEdit: input.controlledEdit,
    executeAggregate: input.executeAggregate,
    loadEntityDisplays: input.loadEntityDisplays,
  });
}
