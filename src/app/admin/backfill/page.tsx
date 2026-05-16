import { MetaBackfillClient } from "@/components/meta-backfill-client";
import { getMetaAdsBackfillState } from "@/lib/meta-backfill";
import { getMetaDataHealth } from "@/lib/meta-data-health";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

export default async function MetaBackfillAdminPage() {
  const [stateResult, healthResult] = await Promise.allSettled([
    getMetaAdsBackfillState(),
    getMetaDataHealth(),
  ]);
  const errors = [];

  if (stateResult.status === "rejected") {
    errors.push(errorMessage(stateResult.reason));
  }

  if (healthResult.status === "rejected") {
    errors.push(errorMessage(healthResult.reason));
  }

  return (
    <MetaBackfillClient
      initialState={stateResult.status === "fulfilled" ? stateResult.value : null}
      initialDataHealth={healthResult.status === "fulfilled" ? healthResult.value : null}
      initialError={errors.length ? errors.join(" ") : null}
    />
  );
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}
