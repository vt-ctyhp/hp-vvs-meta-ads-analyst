/**
 * Temporary diagnostic endpoint for the rebuild branch.
 *
 * Surfaces the public Supabase URL (browser-exposed env var already) and a
 * fingerprint of the publishable key so we can confirm whether Preview and
 * Production are pointed at the same Supabase project. Remove this route
 * before cutover.
 */

import { createAdsAnalystClient } from "@/lib/ads-analyst-db";
import { jsonError } from "@/lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type CountClient = {
  from: (table: string) => {
    select: (
      cols: string,
      options: { count: "exact"; head: boolean },
    ) => Promise<{ count: number | null; error: Error | null }>;
  };
  rpc: (
    name: string,
    args: Record<string, unknown>,
  ) => Promise<{ data: unknown; error: Error | null }>;
};

export async function GET() {
  try {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? null;
    const publishable = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? null;
    const adsEnv = process.env.ADS_ANALYST_ENVIRONMENT ?? null;
    const enforceLimited = process.env.ADS_ANALYST_ENFORCE_LIMITED_DB_ACCESS ?? null;

    // Probe what the LIMITED web client can actually see for analyst tables.
    // This tells us if RLS + JWT claims are wired correctly: if writes land
    // as environment='staging' but the reading JWT carries production / no
    // claim, counts will be 0 even though rows exist.
    const probe = await probeLimitedReads().catch((e) => ({
      error: e instanceof Error ? e.message : String(e),
    }));

    return Response.json({
      ads_analyst_environment: adsEnv,
      enforce_limited_db_access: enforceLimited,
      supabase_url: url,
      supabase_url_host: url ? new URL(url).host : null,
      publishable_key_prefix: publishable ? publishable.slice(0, 12) : null,
      publishable_key_length: publishable ? publishable.length : 0,
      limited_read_probe: probe,
    });
  } catch (error) {
    return jsonError(error);
  }
}

async function probeLimitedReads() {
  const web = createAdsAnalystClient("web") as unknown as CountClient;
  const [insights, ads, creatives, campaigns, accounts] = await Promise.all([
    countRows(web, "meta_daily_insights"),
    countRows(web, "meta_ads"),
    countRows(web, "meta_creatives"),
    countRows(web, "meta_campaigns"),
    countRows(web, "meta_ad_accounts"),
  ]);

  // Also call the aggregate RPC the dashboard uses, to confirm it sees rows.
  const rpcEnd = new Date().toISOString().slice(0, 10);
  const rpcStartDate = new Date();
  rpcStartDate.setUTCDate(rpcStartDate.getUTCDate() - 30);
  const rpcStart = rpcStartDate.toISOString().slice(0, 10);
  const [byBrand, byCreative, byCampaign] = await Promise.all([
    callRpc(web, rpcStart, rpcEnd, ["brand"]),
    callRpc(web, rpcStart, rpcEnd, ["creative"]),
    callRpc(web, rpcStart, rpcEnd, ["campaign"]),
  ]);

  return {
    counts: { insights, ads, creatives, campaigns, accounts },
    rpc_window: { start: rpcStart, end: rpcEnd },
    rpc: {
      by_brand: byBrand,
      by_creative: byCreative,
      by_campaign: byCampaign,
    },
  };
}

async function callRpc(
  client: CountClient,
  start: string,
  end: string,
  dimensions: string[],
) {
  const { data, error } = await client.rpc("aggregate_meta_daily_insights", {
    p_start: start,
    p_end: end,
    p_dimensions: dimensions,
    p_filters: [],
    p_sort_field: "spend",
    p_sort_direction: "desc",
    p_limit: 100,
  });
  return {
    dimensions,
    error: error ? error.message : null,
    row_count: Array.isArray(data) ? data.length : 0,
    first_row: Array.isArray(data) ? data[0] : null,
  };
}

async function countRows(client: CountClient, table: string) {
  const { count, error } = await client
    .from(table)
    .select("id", { count: "exact", head: true });
  return { table, count: count ?? 0, error: error ? error.message : null };
}
