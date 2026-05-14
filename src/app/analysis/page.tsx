import { AnalysisClient } from "@/components/analysis-client";
import { fetchSavedAnalysisDashboards } from "@/lib/ad-hoc-analytics";

export const dynamic = "force-dynamic";

export default async function AnalysisPage() {
  const savedDashboards = await fetchSavedAnalysisDashboards();
  return <AnalysisClient initialSaved={savedDashboards} />;
}
