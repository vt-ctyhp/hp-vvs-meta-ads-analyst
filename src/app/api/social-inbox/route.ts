import { requirePermissionFromRequest } from "@/lib/app-auth";
import { jsonError } from "@/lib/http";
import { getSocialInboxData } from "@/lib/social-inbox";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    await requirePermissionFromRequest(request, "view_inbox");
    return Response.json(await getSocialInboxData());
  } catch (error) {
    return jsonError(error);
  }
}
