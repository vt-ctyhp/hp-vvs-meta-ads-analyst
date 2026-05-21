import { cacheThumbnailBatch } from "@/lib/creative-thumbnail-batch";
import { isAuthorizedCronRequest, jsonError } from "@/lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// Caching ~50 thumbnails takes well under a minute when Meta + Supabase
// are healthy, but a slow upstream could push us past Vercel's default 10s.
// 120s is the cap on Pro plans for serverless functions.
export const maxDuration = 120;

/**
 * Hourly cron that materializes Meta thumbnail bytes into Supabase Storage.
 *
 * Authorized via the existing CRON_SECRET (`Authorization: Bearer …` or
 * `?secret=…`), same pattern as the other cron routes.
 */
export async function GET(request: Request) {
  if (!isAuthorizedCronRequest(request)) {
    return Response.json({ error: "Unauthorized cron request" }, { status: 401 });
  }

  try {
    const url = new URL(request.url);
    const requestedLimit = Number(url.searchParams.get("limit") || 0);
    const limit = Number.isFinite(requestedLimit) && requestedLimit > 0
      ? requestedLimit
      : undefined;
    const result = await cacheThumbnailBatch({ limit });
    return Response.json(result);
  } catch (error) {
    return jsonError(error);
  }
}
