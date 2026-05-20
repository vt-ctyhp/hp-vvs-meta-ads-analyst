/**
 * Temporary diagnostic endpoint for the rebuild branch.
 *
 * Surfaces the public Supabase URL (browser-exposed env var already) and a
 * fingerprint of the publishable key so we can confirm whether Preview and
 * Production are pointed at the same Supabase project. Remove this route
 * before cutover.
 */

import { jsonError } from "@/lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? null;
    const publishable = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? null;
    const adsEnv = process.env.ADS_ANALYST_ENVIRONMENT ?? null;
    const enforceLimited = process.env.ADS_ANALYST_ENFORCE_LIMITED_DB_ACCESS ?? null;
    return Response.json({
      ads_analyst_environment: adsEnv,
      enforce_limited_db_access: enforceLimited,
      supabase_url: url,
      supabase_url_host: url ? new URL(url).host : null,
      publishable_key_prefix: publishable ? publishable.slice(0, 12) : null,
      publishable_key_length: publishable ? publishable.length : 0,
    });
  } catch (error) {
    return jsonError(error);
  }
}
