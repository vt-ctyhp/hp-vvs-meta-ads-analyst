import { requirePermissionFromRequest } from "@/lib/app-auth";
import { jsonError } from "@/lib/http";
import {
  updateSocialInboxConversationContactMethod,
  type MetaInboxContactMethodMutationInput,
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
    const input = (await request.json()) as MetaInboxContactMethodMutationInput;
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
