// One-shot backfill for meta_inbox_metrics_daily. Iterates each date in the
// window and calls compute_inbox_metrics_daily_for_tz for every distinct
// effective timezone. Run with:
//   node --experimental-strip-types scripts/backfill-inbox-metrics-daily.ts [START] [END]
// START/END are YYYY-MM-DD (default: last 30 days through today).
import { createAdsAnalystClient } from "../src/lib/ads-analyst-db.ts";

export function enumerateBackfillDates(start?: string, end?: string): string[] {
  const today = new Date();
  const defaultEnd = isoDate(today);
  const defaultStart = isoDate(new Date(today.getTime() - 29 * 86_400_000)); // 30 inclusive
  const startDate = start ?? defaultStart;
  const endDate = end ?? defaultEnd;
  const out: string[] = [];
  let cursor = Date.parse(`${startDate}T00:00:00Z`);
  const last = Date.parse(`${endDate}T00:00:00Z`);
  if (!Number.isFinite(cursor) || !Number.isFinite(last)) return out;
  while (cursor <= last) {
    out.push(isoDate(new Date(cursor)));
    cursor += 86_400_000;
  }
  return out;
}

function isoDate(d: Date): string {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
}

async function main() {
  const [, , startArg, endArg] = process.argv;
  const dates = enumerateBackfillDates(startArg, endArg);
  // Use the ingest/worker-scoped client (write access to metrics_daily).
  const supabase = createAdsAnalystClient("ingest") as unknown as {
    from: (t: string) => { select: (c: string) => Promise<{ data: { timezone: string }[] | null }> };
    rpc: (fn: string, args: Record<string, unknown>) => Promise<{ error: unknown }>;
  };
  const { data: prefRows } = await supabase
    .from("meta_inbox_user_preferences")
    .select("timezone");
  const timezones = new Set<string>(["America/Los_Angeles"]);
  for (const row of prefRows || []) timezones.add(row.timezone);

  for (const date of dates) {
    for (const tz of timezones) {
      const { error } = await supabase.rpc("compute_inbox_metrics_daily_for_tz", {
        p_tz: tz,
        p_target_date: date,
      });
      if (error) {
        console.error(`backfill failed for ${tz} ${date}:`, error);
      } else {
        console.log(`backfilled ${tz} ${date}`);
      }
    }
  }
}

// Run only when invoked directly, not when imported by the test.
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
