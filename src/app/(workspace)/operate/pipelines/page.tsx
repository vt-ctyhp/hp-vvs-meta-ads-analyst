import { PipelinesPanel } from "@/components/v2/operate/pipelines-panel";
import { StatusSentence } from "@/components/v2/status-sentence";
import { hasPermission } from "@/lib/access-control";
import {
  buildPipelinesSentence,
  fetchOperateSyncRuns,
} from "@/lib/operate-data";
import { getMetaAdsBackfillPipelineState } from "@/lib/meta-backfill";
import { requirePagePermission } from "@/lib/server-route-auth";

export const dynamic = "force-dynamic";

export default async function OperatePipelinesPage() {
  const profile = await requirePagePermission("view_backfill", "/operate/pipelines");
  const [pipelineState, syncRuns] = await Promise.all([
    getMetaAdsBackfillPipelineState().catch(() => null),
    fetchOperateSyncRuns().catch(() => []),
  ]);

  return (
    <div className="space-y-6">
      <StatusSentence
        sentence={buildPipelinesSentence({
          syncRuns,
          backfillJobsCount: pipelineState?.jobs.length ?? 0,
        })}
      />
      <PipelinesPanel
        canRunSync={hasPermission(profile.roles, "run_meta_sync")}
        syncRuns={syncRuns}
        backfillJobs={pipelineState?.jobs ?? []}
        backfillChunks={pipelineState?.chunks ?? []}
      />
    </div>
  );
}
