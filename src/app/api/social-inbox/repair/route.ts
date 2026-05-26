import { requirePermissionFromRequest } from "@/lib/app-auth";
import { jsonError } from "@/lib/http";
import { repairSocialInboxCustomerInfo } from "@/lib/social-inbox";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function POST(request: Request) {
  try {
    await requirePermissionFromRequest(request, "manage_inbox_state");
    const body = (await request.json().catch(() => ({}))) as {
      conversationId?: string;
      limit?: number;
    };
    const result = await repairSocialInboxCustomerInfo({
      conversationId:
        typeof body.conversationId === "string" && body.conversationId.trim()
          ? body.conversationId.trim()
          : undefined,
      limit: typeof body.limit === "number" ? body.limit : undefined,
    });
    return Response.json(result);
  } catch (error) {
    return jsonError(error);
  }
}
