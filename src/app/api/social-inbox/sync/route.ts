import { requirePermissionFromRequest } from "@/lib/app-auth";
import { jsonError } from "@/lib/http";
import { syncSocialInbox } from "@/lib/social-inbox";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function POST(request: Request) {
  try {
    await requirePermissionFromRequest(request, "view_inbox");
    return Response.json(await syncSocialInbox("manual"));
  } catch (error) {
    return jsonError(error);
  }
}
