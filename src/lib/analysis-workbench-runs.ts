import {
  buildAnalysisRunInsert,
  mapAnalysisRunRecord,
  normalizeAnalysisOutputMode,
  removeAnalysisContextChips,
  resolveAnalysisRunContext,
  type AnalysisOutputMode,
  type AnalysisRunRecord,
  type AnalysisWorkbenchRun,
} from "./analysis-workbench-contract.ts";
import { runAnalysisWorkbenchFactsPipeline } from "./analysis-workbench-pipeline.ts";
import { createAdsAnalystClient, withAdsAnalystEnvironment } from "./ads-analyst-db.ts";
import { ConfigurationError, getMissingDashboardEnv } from "./env.ts";
import { aggregateMetaInsights } from "./meta-insight-aggregates.ts";

const RUN_COLUMNS =
  "id,status,prompt,output_mode,title,intent,query_plan,facts,visual_cards,source_notes,validation,lineage,answer,dashboard_packet,created_at,updated_at";

export async function listAnalysisWorkbenchRuns(limit = 12): Promise<AnalysisWorkbenchRun[]> {
  if (getMissingDashboardEnv().length) return [];

  const supabase = createAdsAnalystClient("web");
  const response = await supabase
    .from("ai_analysis_workbench_runs")
    .select(RUN_COLUMNS)
    .order("updated_at", { ascending: false })
    .limit(limit);

  if (response.error) throw response.error;
  return ((response.data || []) as AnalysisRunRecord[]).map(mapAnalysisRunRecord);
}

export async function getAnalysisWorkbenchRun(runId: string): Promise<AnalysisWorkbenchRun> {
  const supabase = createAdsAnalystClient("web");
  const response = await supabase
    .from("ai_analysis_workbench_runs")
    .select(RUN_COLUMNS)
    .eq("id", runId)
    .single();

  if (response.error) throw response.error;
  return mapAnalysisRunRecord(response.data as AnalysisRunRecord);
}

export async function createAnalysisWorkbenchRun(input: {
  prompt: string;
  outputMode?: AnalysisOutputMode;
  parentRunId?: string | null;
  removedContextKeys?: string[];
}): Promise<AnalysisWorkbenchRun> {
  const missing = getMissingDashboardEnv();
  if (missing.length) {
    throw new ConfigurationError("Analysis run storage is not configured.", missing);
  }

  const outputMode = normalizeAnalysisOutputMode(input.outputMode);
  const latestSyncedInsightDate = await fetchLatestSyncedInsightDate();
  const parentRun = input.parentRunId ? await getAnalysisWorkbenchRun(input.parentRunId) : null;
  const inheritedContext = removeAnalysisContextChips(
    parentRun ? resolveAnalysisRunContext(parentRun) : null,
    input.removedContextKeys || [],
  );
  const pipelineResult = await runAnalysisWorkbenchFactsPipeline({
    prompt: input.prompt,
    outputMode,
    latestSyncedInsightDate,
    inheritedContext,
    executeAggregate: async (request) =>
      aggregateMetaInsights({
        start: request.start,
        end: request.end,
        dimensions: request.dimensions,
        filters: request.filters,
        sortField: request.sortField,
        sortDirection: request.sortDirection,
        limit: request.limit,
      }),
  });

  const run = buildAnalysisRunInsert({
    prompt: input.prompt,
    outputMode,
    parentRunId: input.parentRunId,
    inheritedContext,
    removedContextKeys: input.removedContextKeys || [],
    pipelineResult,
  });

  const supabase = createAdsAnalystClient("web");
  const response = await supabase
    .from("ai_analysis_workbench_runs")
    .insert(withAdsAnalystEnvironment(run))
    .select(RUN_COLUMNS)
    .single();

  if (response.error) throw response.error;
  return mapAnalysisRunRecord(response.data as AnalysisRunRecord);
}

async function fetchLatestSyncedInsightDate() {
  const supabase = createAdsAnalystClient("web");
  const response = await supabase
    .from("meta_daily_insights")
    .select("date_start")
    .order("date_start", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (response.error) throw response.error;
  const value = (response.data as { date_start?: unknown } | null)?.date_start;
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : null;
}
