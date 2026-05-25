import { requirePermissionFromRequest } from "@/lib/app-auth";
import { jsonError } from "@/lib/http";
import { parseJsonObjectBody } from "@/lib/meta-inbox-api-validation";
import {
  retrySocialInboxCommentAction,
  type MetaInboxRetryCommentActionInput,
} from "@/lib/social-inbox";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Params = {
  conversationId: string;
};

const RETRY_COMMENT_ACTION_BODY_FIELDS = {
  commentActionId: { type: "string", nullable: true },
} as const;

export async function POST(
  request: Request,
  { params }: { params: Promise<Params> },
) {
  try {
    const profile = await requirePermissionFromRequest(request, "send_inbox_reply");
    const { conversationId } = await params;
    const input = await parseJsonObjectBody<MetaInboxRetryCommentActionInput>(
      request,
      RETRY_COMMENT_ACTION_BODY_FIELDS,
    );
    const result = await retrySocialInboxCommentAction(
      decodeURIComponent(conversationId),
      profile,
      input,
    );

    return Response.json(result);
  } catch (error) {
    return jsonError(error);
  }
}
