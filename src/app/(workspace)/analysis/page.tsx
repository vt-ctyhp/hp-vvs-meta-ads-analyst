import { OptimizeAiPanel } from "@/components/v2/optimize/ai-panel";
import { fetchSavedAnalysisDashboards } from "@/lib/ad-hoc-analytics";
import {
  resolveAnalysisRouteDateRange,
  type AnalysisRouteSearchParams,
} from "@/lib/analysis-route";
import { requirePagePermission } from "@/lib/server-route-auth";

export const dynamic = "force-dynamic";

export default async function AnalysisPage({
  searchParams,
}: {
  searchParams: Promise<AnalysisRouteSearchParams>;
}) {
  await requirePagePermission("view_ai_analysis", "/analysis");
  const params = await searchParams;
  const savedDashboards = await fetchSavedAnalysisDashboards();
  return (
    <OptimizeAiPanel
      initialSaved={savedDashboards}
      canUseAdHocAnalysis
      dateRange={resolveAnalysisRouteDateRange(params)}
    />
  );
}
