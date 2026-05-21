import type { RepairNextMetaInsightRollupChunkResult } from "./meta-insight-rollups.ts";

type MetaRollupCronDeps = {
  isAuthorizedRequest: (request: Request) => boolean;
  repairNextChunk: () => Promise<RepairNextMetaInsightRollupChunkResult>;
  revalidateAggregates: () => void;
  jsonError: (error: unknown) => Response;
};

export function createMetaRollupsCronHandler(deps: MetaRollupCronDeps) {
  return async function GET(request: Request) {
    if (!deps.isAuthorizedRequest(request)) {
      return Response.json({ error: "Unauthorized cron request" }, { status: 401 });
    }

    try {
      const result = await deps.repairNextChunk();
      if (result.status === "repaired") {
        deps.revalidateAggregates();
      }
      return Response.json(result);
    } catch (error) {
      return deps.jsonError(error);
    }
  };
}
