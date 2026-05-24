import { requirePermissionFromRequest } from "@/lib/app-auth";
import { jsonError } from "@/lib/http";
import {
  createSocialInboxSavedReply,
  updateSocialInboxSavedReplyStatus,
  type MetaInboxSavedReplyInput,
  type MetaInboxSavedReplyStatusInput,
} from "@/lib/social-inbox";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const profile = await requirePermissionFromRequest(request, "send_inbox_reply");
    const input = (await request.json()) as MetaInboxSavedReplyInput;
    const result = await createSocialInboxSavedReply(profile, input);

    return Response.json(result);
  } catch (error) {
    return jsonError(error);
  }
}

export async function PATCH(request: Request) {
  try {
    const profile = await requirePermissionFromRequest(request, "manage_inbox_state");
    const input = (await request.json()) as MetaInboxSavedReplyStatusInput;
    const result = await updateSocialInboxSavedReplyStatus(profile, input);

    return Response.json(result);
  } catch (error) {
    return jsonError(error);
  }
}
