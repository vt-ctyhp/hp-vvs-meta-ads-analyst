import { isAuthorizedCronRequest, jsonError } from "@/lib/http";
import { computeAndStoreSignals } from "@/lib/signal-engine";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function GET(request: Request) {
  if (!isAuthorizedCronRequest(request)) {
    return Response.json({ error: "Unauthorized cron request" }, { status: 401 });
  }

  try {
    const result = await computeAndStoreSignals();
    return Response.json(result);
  } catch (error) {
    return jsonError(error);
  }
}
