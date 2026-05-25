import { requirePermissionFromRequest } from "@/lib/app-auth";
import { jsonError } from "@/lib/http";
import { parseJsonObjectBody } from "@/lib/meta-inbox-api-validation";
import {
  createSocialInboxSendAttempt,
  type MetaInboxSendAttemptInput,
} from "@/lib/social-inbox";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Params = {
  conversationId: string;
};

const SEND_ATTEMPT_BODY_FIELDS = {
  replyText: { type: "string", nullable: true },
  idempotencyKey: { type: "string", nullable: true },
  attachmentIds: { type: "stringArray", nullable: true },
} as const;

export async function POST(
  request: Request,
  { params }: { params: Promise<Params> },
) {
  try {
    const profile = await requirePermissionFromRequest(request, "send_inbox_reply");
    const { conversationId } = await params;
    const input = await parseJsonObjectBody<MetaInboxSendAttemptInput>(
      request,
      SEND_ATTEMPT_BODY_FIELDS,
    );
    const result = await createSocialInboxSendAttempt(
      decodeURIComponent(conversationId),
      profile,
      input,
    );

    return Response.json(result);
  } catch (error) {
    return jsonError(error);
  }
}
