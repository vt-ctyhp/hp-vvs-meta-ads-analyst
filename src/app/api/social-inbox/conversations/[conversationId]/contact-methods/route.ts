import { requirePermissionFromRequest } from "@/lib/app-auth";
import { jsonError } from "@/lib/http";
import { parseJsonObjectBody } from "@/lib/meta-inbox-api-validation";
import {
  updateSocialInboxConversationContactMethod,
  type MetaInboxContactMethodMutationInput,
} from "@/lib/social-inbox";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Params = {
  conversationId: string;
};

const CONTACT_METHOD_BODY_FIELDS = {
  contactMethodId: { type: "string", nullable: true },
  type: { type: "string", nullable: true },
  value: { type: "string", nullable: true },
  providedInMessageId: { type: "string", nullable: true },
  changeReason: { type: "string", nullable: true },
} as const;

export async function POST(
  request: Request,
  { params }: { params: Promise<Params> },
) {
  return mutateContactMethod(request, params, "create");
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<Params> },
) {
  return mutateContactMethod(request, params, "update");
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<Params> },
) {
  return mutateContactMethod(request, params, "delete");
}

async function mutateContactMethod(
  request: Request,
  params: Promise<Params>,
  action: "create" | "update" | "delete",
) {
  try {
    const profile = await requirePermissionFromRequest(request, "manage_inbox_state");
    const { conversationId } = await params;
    const input = await parseJsonObjectBody<MetaInboxContactMethodMutationInput>(
      request,
      CONTACT_METHOD_BODY_FIELDS,
    );
    const result = await updateSocialInboxConversationContactMethod(
      decodeURIComponent(conversationId),
      profile,
      action,
      input,
    );

    return Response.json(result);
  } catch (error) {
    return jsonError(error);
  }
}
