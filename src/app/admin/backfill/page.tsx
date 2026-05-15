import { MetaBackfillClient } from "@/components/meta-backfill-client";
import { getMetaAdsBackfillState } from "@/lib/meta-backfill";
import { getMetaDataHealth } from "@/lib/meta-data-health";

export const dynamic = "force-dynamic";

export default async function MetaBackfillAdminPage() {
  let initialDataHealth = null;
  let initialState = null;
  let initialError = null;

  try {
    [initialDataHealth, initialState] = await Promise.all([
      getMetaDataHealth(),
      getMetaAdsBackfillState(),
    ]);
  } catch (error) {
    initialError = errorToMessage(error);
  }

  return (
    <MetaBackfillClient
      initialDataHealth={initialDataHealth}
      initialState={initialState}
      initialError={initialError}
    />
  );
}

function errorToMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}
