import { isAuthorizedCronRequest, jsonError } from "@/lib/http";
import { revalidateAndWarmMetaInsightAggregateCache } from "@/lib/meta-insight-cache-warmup";
import { resyncMetaAdsMonth } from "@/lib/meta-backfill";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function POST(request: Request) {
  if (!isAuthorizedCronRequest(request)) {
    return Response.json({ error: "Unauthorized month re-sync request" }, { status: 401 });
  }

  try {
    const body = (await request.json().catch(() => ({}))) as { month?: string | null };
    const result = await resyncMetaAdsMonth({ month: body.month });
    await revalidateAndWarmMetaInsightAggregateCache();
    return Response.json(result);
  } catch (error) {
    return jsonError(error);
  }
}
