// TEMPORARY: production /convert perf diagnostic. Delete in follow-up commit.
// Gated by hardcoded one-shot secret. Read-only — no mutations.

import { fetchWebsiteFunnelData } from "@/lib/website-analytics";
import { fetchCustomerJourneyLedgerData } from "@/lib/customer-journey-ledger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const TEMP_SECRET = "7gpKxvW9pTUq3rZJ8aLBfNm6dRsQyHiE";

async function timeIt(label: string, fn: () => Promise<unknown>) {
  const t = performance.now();
  try {
    await fn();
    return { label, ms: Math.round(performance.now() - t), error: null as string | null };
  } catch (e) {
    return { label, ms: Math.round(performance.now() - t), error: String(e).slice(0, 200) };
  }
}

async function runRound(days: number) {
  // Mimic the /convert page: both fetches in parallel.
  const tP = performance.now();
  let parallel_err: string | null = null;
  try {
    await Promise.all([
      fetchWebsiteFunnelData({ days }),
      fetchCustomerJourneyLedgerData({ days }),
    ]);
  } catch (e) {
    parallel_err = String(e).slice(0, 200);
  }
  const parallel_ms = Math.round(performance.now() - tP);

  // Then time each in isolation (cache is now warm for this round).
  const funnel = await timeIt("funnel_solo", () => fetchWebsiteFunnelData({ days }));
  const ledger = await timeIt("ledger_solo", () => fetchCustomerJourneyLedgerData({ days }));

  return {
    parallel_ms,
    parallel_err,
    funnel_solo_ms: funnel.ms,
    funnel_err: funnel.error,
    ledger_solo_ms: ledger.ms,
    ledger_err: ledger.error,
  };
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  if (url.searchParams.get("secret") !== TEMP_SECRET) {
    return new Response("forbidden", { status: 403 });
  }
  const days = Number(url.searchParams.get("days") || "30");

  const meta = {
    commit_sha: process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ?? "local",
    region: process.env.VERCEL_REGION ?? "unknown",
    env: process.env.VERCEL_ENV ?? "local",
  };

  const cold = await runRound(days);
  const warm = await runRound(days);

  return Response.json({ meta, days, cold, warm });
}
