import { isAuthorizedCronRequest, jsonError } from "@/lib/http";
import { runMetaAdsBackfillBatch } from "@/lib/meta-backfill";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function POST(request: Request) {
  if (!isAuthorizedCronRequest(request)) {
    return Response.json({ error: "Unauthorized backfill request" }, { status: 401 });
  }

  try {
    const body = (await request.json().catch(() => ({}))) as { limit?: number };
    return Response.json(await runMetaAdsBackfillBatch({ limit: body.limit }));
  } catch (error) {
    return jsonError(error);
  }
}
