import { requirePermissionFromRequest } from "@/lib/app-auth";
import { jsonError } from "@/lib/http";
import { parseJsonObjectBody } from "@/lib/meta-inbox-api-validation";
import {
  queueSocialInboxSendAttempt,
  type MetaInboxQueueSendAttemptInput,
} from "@/lib/social-inbox";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Params = {
  conversationId: string;
};

const QUEUE_SEND_ATTEMPT_BODY_FIELDS = {
  sendAttemptId: { type: "string", nullable: true },
} as const;

export async function POST(
  request: Request,
  { params }: { params: Promise<Params> },
) {
  try {
    const profile = await requirePermissionFromRequest(request, "send_inbox_reply");
    const { conversationId } = await params;
    const input = await parseJsonObjectBody<MetaInboxQueueSendAttemptInput>(
      request,
      QUEUE_SEND_ATTEMPT_BODY_FIELDS,
    );
    const result = await queueSocialInboxSendAttempt(
      decodeURIComponent(conversationId),
      profile,
      input,
    );

    return Response.json(result);
  } catch (error) {
    return jsonError(error);
  }
}
