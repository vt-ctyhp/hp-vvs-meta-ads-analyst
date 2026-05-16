import { MetaBackfillClient } from "@/components/meta-backfill-client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

export default function MetaBackfillAdminPage() {
  return <MetaBackfillClient />;
}
