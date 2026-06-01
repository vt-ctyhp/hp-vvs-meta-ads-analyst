import { requirePermissionFromRequest } from "@/lib/app-auth";
import { jsonError } from "@/lib/http";
import { parseJsonObjectBody } from "@/lib/meta-inbox-api-validation";
import {
  buildFoundationAiReplyDisabledResponse,
  isSocialReplySuggestionReady,
} from "@/lib/social-reply-foundation-gate";
import { suggestSocialReply, type SuggestReplyInput } from "@/lib/social-reply-suggestions";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

const SUGGEST_REPLY_BODY_FIELDS = {
  conversationId: { type: "string" },
  brand: { type: "string", nullable: true },
  language: { type: "string", nullable: true },
  staffGuidance: { type: "string", nullable: true },
} as const;

export async function POST(request: Request) {
  try {
    const profile = await requirePermissionFromRequest(request, "send_inbox_reply");
    if (!isSocialReplySuggestionReady()) {
      return Response.json(buildFoundationAiReplyDisabledResponse(), { status: 501 });
    }

    const input = await parseJsonObjectBody<SuggestReplyInput>(
      request,
      SUGGEST_REPLY_BODY_FIELDS,
    );
    const result = await suggestSocialReply(input, profile);
    return Response.json(result);
  } catch (error) {
    return jsonError(error);
  }
}
