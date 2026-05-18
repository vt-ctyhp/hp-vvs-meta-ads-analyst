import { requirePermissionFromRequest } from "@/lib/app-auth";
import { jsonError } from "@/lib/http";
import { fetchMetaAdVideoMetricsForRange } from "@/lib/meta";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export async function GET(request: Request) {
  try {
    await requirePermissionFromRequest(request, "view_creative_analysis");
    const url = new URL(request.url);
    const metaAccountId = url.searchParams.get("metaAccountId")?.trim();
    const adId = url.searchParams.get("adId")?.trim();
    const start = url.searchParams.get("start")?.trim();
    const end = url.searchParams.get("end")?.trim();

    if (!metaAccountId || !adId || !start || !end) {
      return Response.json(
        { error: "metaAccountId, adId, start, and end are required." },
        { status: 400 },
      );
    }

    if (!DATE_PATTERN.test(start) || !DATE_PATTERN.test(end)) {
      return Response.json({ error: "start and end must use YYYY-MM-DD." }, { status: 400 });
    }

    const since = start <= end ? start : end;
    const until = start <= end ? end : start;

    const metrics = await fetchMetaAdVideoMetricsForRange({
      metaAccountId,
      adId,
      since,
      until,
      signal: request.signal,
    });

    return Response.json({ metrics });
  } catch (error) {
    return jsonError(error);
  }
}
