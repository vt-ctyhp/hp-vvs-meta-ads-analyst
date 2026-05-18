import { AnalysisClient } from "@/components/analysis-client";
import { fetchSavedAnalysisDashboards } from "@/lib/ad-hoc-analytics";
import { requirePagePermission } from "@/lib/server-route-auth";

export const dynamic = "force-dynamic";

export default async function AnalysisPage() {
  await requirePagePermission("view_ai_analysis", "/analysis");
  const savedDashboards = await fetchSavedAnalysisDashboards();
  return <AnalysisClient initialSaved={savedDashboards} />;
}
