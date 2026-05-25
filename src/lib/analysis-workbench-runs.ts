import {
  buildAnalysisRunInsert,
  mapAnalysisRunRecord,
  type AnalysisOutputMode,
  type AnalysisRunRecord,
  type AnalysisWorkbenchRun,
} from "./analysis-workbench-contract.ts";
import { createAdsAnalystClient, withAdsAnalystEnvironment } from "./ads-analyst-db.ts";
import { ConfigurationError, getMissingDashboardEnv } from "./env.ts";

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
}): Promise<AnalysisWorkbenchRun> {
  const missing = getMissingDashboardEnv();
  if (missing.length) {
    throw new ConfigurationError("Analysis run storage is not configured.", missing);
  }

  const run = buildAnalysisRunInsert({
    prompt: input.prompt,
    outputMode: input.outputMode,
    parentRunId: input.parentRunId,
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
