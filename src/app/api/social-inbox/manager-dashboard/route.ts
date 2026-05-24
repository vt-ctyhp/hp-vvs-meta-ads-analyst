import { requirePermissionFromRequest } from "@/lib/app-auth";
import { jsonError } from "@/lib/http";
import { buildMetaInboxManagerDashboard } from "@/lib/meta-inbox-manager-dashboard";
import { getSocialInboxData } from "@/lib/social-inbox";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const profile = await requirePermissionFromRequest(request, "view_inbox");
    const url = new URL(request.url);
    const days = Number(url.searchParams.get("days") || 0);
    const data = await getSocialInboxData(profile);

    return Response.json(
      buildMetaInboxManagerDashboard(data, {
        days: Number.isFinite(days) && days > 0 ? days : undefined,
      }),
    );
  } catch (error) {
    return jsonError(error);
  }
}
