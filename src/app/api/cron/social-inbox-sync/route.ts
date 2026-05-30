import { jsonError, isAuthorizedCronRequest } from "@/lib/http";
import { syncSocialInbox } from "@/lib/social-inbox";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function GET(request: Request) {
  if (!isAuthorizedCronRequest(request)) {
    return Response.json({ error: "Unauthorized cron request" }, { status: 401 });
  }

  try {
    // Bounded recent-only sync (see socialSyncBoundsForTrigger): a safety net for dropped
    // webhooks. Its writes flow through the broadcast trigger, so the UI updates on its own.
    return Response.json(await syncSocialInbox("cron"));
  } catch (error) {
    return jsonError(error);
  }
}
