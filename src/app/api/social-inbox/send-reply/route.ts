import { requirePermissionFromRequest } from "@/lib/app-auth";
import { jsonError } from "@/lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    await requirePermissionFromRequest(request, "send_inbox_reply");

    return Response.json(
      {
        error:
          "Legacy raw-source send endpoint is disabled. Use normalized conversation send attempts.",
        next: "/api/social-inbox/conversations/{conversationId}/send-attempts",
      },
      { status: 403 },
    );
  } catch (error) {
    return jsonError(error);
  }
}
