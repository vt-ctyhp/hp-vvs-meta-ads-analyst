import { BackfillMonthTable } from "@/components/v2/operate/backfill-month-table";
import { StatusSentence } from "@/components/v2/status-sentence";
import { getMetaAdsBackfillMonthState } from "@/lib/meta-backfill";
import { requirePagePermission } from "@/lib/server-route-auth";

export const dynamic = "force-dynamic";

export default async function OperateCoveragePage() {
  await requirePagePermission("view_backfill", "/operate/coverage");
  const monthState = await getMetaAdsBackfillMonthState().catch(() => null);

  return (
    <div className="space-y-6">
      <StatusSentence
        sentence={
          monthState?.rows.length
            ? `${monthState.rows.length} historical backfill months tracked.`
            : "Historical backfill month status is not available yet."
        }
      />

      {monthState ? (
        <BackfillMonthTable
          rows={monthState.rows}
          rangeStart={monthState.range.start}
          rangeEnd={monthState.range.end}
        />
      ) : (
        <p className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
          Backfill month status unavailable. Try refreshing.
        </p>
      )}
    </div>
  );
}
