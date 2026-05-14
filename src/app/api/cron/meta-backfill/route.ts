import { isAuthorizedCronRequest, jsonError } from "@/lib/http";
import { runMetaAdsBackfillBatch } from "@/lib/meta-backfill";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function GET(request: Request) {
  if (!isAuthorizedCronRequest(request)) {
    return Response.json({ error: "Unauthorized cron request" }, { status: 401 });
  }

  try {
    return Response.json(await runMetaAdsBackfillBatch());
  } catch (error) {
    return jsonError(error);
  }
}
