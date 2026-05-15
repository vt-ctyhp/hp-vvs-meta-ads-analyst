import { isAuthorizedCronRequest, jsonError } from "@/lib/http";
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
    return Response.json(await resyncMetaAdsMonth({ month: body.month }));
  } catch (error) {
    return jsonError(error);
  }
}
