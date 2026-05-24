import { AuthorizationError, requirePermissionFromRequest } from "@/lib/app-auth";
import { isMetaInboxCommentModerationAction } from "@/lib/meta-inbox-comment-actions";
import { jsonError } from "@/lib/http";
import {
  createSocialInboxCommentAction,
  type MetaInboxCommentActionInput,
} from "@/lib/social-inbox";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Params = {
  conversationId: string;
};

export async function POST(
  request: Request,
  { params }: { params: Promise<Params> },
) {
  try {
    const profile = await requirePermissionFromRequest(request, "send_inbox_reply");
    const { conversationId } = await params;
    const input = (await request.json()) as MetaInboxCommentActionInput;
    if (
      isMetaInboxCommentModerationAction(input.actionType) &&
      !profile.permissions.includes("manage_inbox_state")
    ) {
      throw new AuthorizationError("You do not have permission to moderate public comments.", 403);
    }

    const result = await createSocialInboxCommentAction(
      decodeURIComponent(conversationId),
      profile,
      input,
    );

    return Response.json(result);
  } catch (error) {
    return jsonError(error);
  }
}
