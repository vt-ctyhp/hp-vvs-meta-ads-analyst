import { requirePermissionFromRequest } from "@/lib/app-auth";
import { jsonError } from "@/lib/http";
import { buildFoundationAiReplyDisabledResponse } from "@/lib/social-reply-foundation-gate";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

export async function POST(request: Request) {
  try {
    await requirePermissionFromRequest(request, "view_inbox");
    return Response.json(buildFoundationAiReplyDisabledResponse(), { status: 501 });
  } catch (error) {
    return jsonError(error);
  }
}
