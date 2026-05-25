import { requirePermissionFromRequest } from "@/lib/app-auth";
import { jsonError } from "@/lib/http";
import { parseJsonObjectBody } from "@/lib/meta-inbox-api-validation";
import {
  createSocialInboxConversationNote,
  type MetaInboxConversationNoteInput,
} from "@/lib/social-inbox";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Params = {
  conversationId: string;
};

const NOTE_BODY_FIELDS = {
  noteType: { type: "string", nullable: true },
  body: { type: "string", nullable: true },
  mentionUserIds: { type: "stringArray", nullable: true },
} as const;

export async function POST(
  request: Request,
  { params }: { params: Promise<Params> },
) {
  try {
    const profile = await requirePermissionFromRequest(request, "manage_inbox_state");
    const { conversationId } = await params;
    const input = await parseJsonObjectBody<MetaInboxConversationNoteInput>(
      request,
      NOTE_BODY_FIELDS,
    );
    const result = await createSocialInboxConversationNote(
      decodeURIComponent(conversationId),
      profile,
      input,
    );

    return Response.json(result);
  } catch (error) {
    return jsonError(error);
  }
}
