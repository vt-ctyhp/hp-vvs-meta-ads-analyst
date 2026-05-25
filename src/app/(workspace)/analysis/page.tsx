import { AnalysisWorkbenchClient } from "@/components/analysis-workbench-client";
import { listAnalysisWorkbenchRuns } from "@/lib/analysis-workbench-runs";
import { requirePagePermission } from "@/lib/server-route-auth";

export const dynamic = "force-dynamic";

export default async function AnalysisPage() {
  await requirePagePermission("view_ai_analysis", "/analysis");
  const runs = await listAnalysisWorkbenchRuns();
  return <AnalysisWorkbenchClient initialRuns={runs} />;
}
