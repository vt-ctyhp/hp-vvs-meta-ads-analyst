import { requirePermissionFromRequest } from "@/lib/app-auth";
import { jsonError } from "@/lib/http";
import { parseJsonObjectBody } from "@/lib/meta-inbox-api-validation";
import {
  createSocialInboxSavedReply,
  updateSocialInboxSavedReplyStatus,
  type MetaInboxSavedReplyInput,
  type MetaInboxSavedReplyStatusInput,
} from "@/lib/social-inbox";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SAVED_REPLY_BODY_FIELDS = {
  title: { type: "string", nullable: true },
  body: { type: "string", nullable: true },
  visibility: { type: "string", nullable: true },
  queueCategoryKey: { type: "string", nullable: true },
  sourceChannel: { type: "string", nullable: true },
  language: { type: "string", nullable: true },
  leadQuality: { type: "string", nullable: true },
  approveShared: { type: "boolean", nullable: true },
} as const;

const SAVED_REPLY_STATUS_BODY_FIELDS = {
  savedReplyId: { type: "string", nullable: true },
  approvalStatus: { type: "string", nullable: true },
} as const;

export async function POST(request: Request) {
  try {
    const profile = await requirePermissionFromRequest(request, "send_inbox_reply");
    const input = await parseJsonObjectBody<MetaInboxSavedReplyInput>(
      request,
      SAVED_REPLY_BODY_FIELDS,
    );
    const result = await createSocialInboxSavedReply(profile, input);

    return Response.json(result);
  } catch (error) {
    return jsonError(error);
  }
}

export async function PATCH(request: Request) {
  try {
    const profile = await requirePermissionFromRequest(request, "manage_inbox_state");
    const input = await parseJsonObjectBody<MetaInboxSavedReplyStatusInput>(
      request,
      SAVED_REPLY_STATUS_BODY_FIELDS,
    );
    const result = await updateSocialInboxSavedReplyStatus(profile, input);

    return Response.json(result);
  } catch (error) {
    return jsonError(error);
  }
}
