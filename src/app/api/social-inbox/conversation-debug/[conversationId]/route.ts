import { requirePermissionFromRequest } from "@/lib/app-auth";
import { jsonError } from "@/lib/http";
import { getSocialInboxConversationDebug } from "@/lib/social-inbox";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  request: Request,
  context: { params: Promise<{ conversationId: string }> },
) {
  try {
    await requirePermissionFromRequest(request, "view_inbox");
    const { conversationId } = await context.params;
    const debug = await getSocialInboxConversationDebug(conversationId);
    return Response.json(debug);
  } catch (error) {
    return jsonError(error);
  }
}
