import { jsonError, isAuthorizedCronRequest } from "@/lib/http";
import { syncMetaAds } from "@/lib/meta";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function GET(request: Request) {
  if (!isAuthorizedCronRequest(request)) {
    return Response.json({ error: "Unauthorized cron request" }, { status: 401 });
  }

  try {
    const result = await syncMetaAds("cron");
    return Response.json(result);
  } catch (error) {
    return jsonError(error);
  }
}
