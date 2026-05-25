import { requirePermissionFromRequest } from "@/lib/app-auth";
import { jsonError } from "@/lib/http";
import { parseJsonObjectBody } from "@/lib/meta-inbox-api-validation";
import {
  updateSocialInboxConversationWorkflow,
  type MetaInboxWorkflowPatchInput,
} from "@/lib/social-inbox";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Params = {
  conversationId: string;
};

const WORKFLOW_BODY_FIELDS = {
  assignmentMode: { type: "string", nullable: true },
  assignedTeamId: { type: "string", nullable: true },
  queueCategoryKey: { type: "string", nullable: true },
  conversationStatus: { type: "string", nullable: true },
  followUpAt: { type: "string", nullable: true },
  leadQuality: { type: "string", nullable: true },
  leadQualityReasonTags: { type: "stringArray", nullable: true },
  inboxOutcome: { type: "string", nullable: true },
  inboxLostReason: { type: "string", nullable: true },
  changeReason: { type: "string", nullable: true },
} as const;

export async function PATCH(
  request: Request,
  { params }: { params: Promise<Params> },
) {
  try {
    const profile = await requirePermissionFromRequest(request, "manage_inbox_state");
    const { conversationId } = await params;
    const input = await parseJsonObjectBody<MetaInboxWorkflowPatchInput>(
      request,
      WORKFLOW_BODY_FIELDS,
    );
    const result = await updateSocialInboxConversationWorkflow(
      decodeURIComponent(conversationId),
      profile,
      input,
    );

    return Response.json(result);
  } catch (error) {
    return jsonError(error);
  }
}
