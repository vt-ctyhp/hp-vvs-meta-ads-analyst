import { MetaBackfillClient } from "@/components/meta-backfill-client";
import { requirePagePermission } from "@/lib/server-route-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

export default async function MetaBackfillAdminPage() {
  await requirePagePermission("view_backfill", "/admin/backfill");
  return <MetaBackfillClient />;
}
