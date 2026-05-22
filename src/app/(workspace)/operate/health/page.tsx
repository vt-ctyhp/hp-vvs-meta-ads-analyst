import { HealthPanel } from "@/components/v2/operate/health-panel";
import { StatusSentence } from "@/components/v2/status-sentence";
import { buildHealthSentence } from "@/lib/operate-data";
import { requirePagePermission } from "@/lib/server-route-auth";
import { getSystemHealth } from "@/lib/system-health";

export const dynamic = "force-dynamic";

export default async function OperateHealthPage() {
  await requirePagePermission("view_backfill", "/operate/health");
  const health = await getSystemHealth().catch(() => null);

  return (
    <div className="space-y-6">
      <StatusSentence sentence={buildHealthSentence(health?.status ?? null)} />
      {health ? (
        <HealthPanel snapshot={health} />
      ) : (
        <p className="border border-signal-danger bg-signal-danger-bg px-5 py-4 text-sm text-signal-danger">
          Health snapshot unavailable. Try refreshing.
        </p>
      )}
    </div>
  );
}
