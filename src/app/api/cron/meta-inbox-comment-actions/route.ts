import { isAuthorizedCronRequest, jsonError } from "@/lib/http";
import { deliverQueuedMetaInboxCommentActions } from "@/lib/meta-inbox-comment-action-worker";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

/**
 * Processes queued public comment actions. Live Meta delivery remains gated by
 * ALLOW_LIVE_META_SEND inside the worker, matching inbox send-attempt delivery.
 */
export async function GET(request: Request) {
  if (!isAuthorizedCronRequest(request)) {
    return Response.json({ error: "Unauthorized cron request" }, { status: 401 });
  }

  try {
    const url = new URL(request.url);
    const requestedLimit = Number(url.searchParams.get("limit") || 0);
    const result = await deliverQueuedMetaInboxCommentActions({
      limit: Number.isFinite(requestedLimit) && requestedLimit > 0 ? requestedLimit : undefined,
    });
    return Response.json(result);
  } catch (error) {
    return jsonError(error);
  }
}
