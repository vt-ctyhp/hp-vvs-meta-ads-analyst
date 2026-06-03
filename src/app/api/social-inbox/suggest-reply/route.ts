import { requirePermissionFromRequest } from "@/lib/app-auth";
import { jsonError } from "@/lib/http";
import { parseJsonObjectBody } from "@/lib/meta-inbox-api-validation";
import {
  buildFoundationAiReplyDisabledResponse,
  isSocialReplySuggestionReady,
} from "@/lib/social-reply-foundation-gate";
import { createReplySuggestionStream } from "@/lib/social-reply-stream";
import { streamSocialReply, type SuggestReplyInput } from "@/lib/social-reply-suggestions";

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
  // Auth, the foundation gate, and body validation resolve before streaming
  // begins, so failures here stay plain JSON responses with real status codes
  // (the client's non-OK branch depends on that). Once the stream opens, the
  // draft is delivered token-by-token via Server-Sent Events.
  let profile: Awaited<ReturnType<typeof requirePermissionFromRequest>>;
  let input: SuggestReplyInput;
  try {
    profile = await requirePermissionFromRequest(request, "send_inbox_reply");
    if (!isSocialReplySuggestionReady()) {
      return Response.json(buildFoundationAiReplyDisabledResponse(), { status: 501 });
    }
    input = await parseJsonObjectBody<SuggestReplyInput>(request, SUGGEST_REPLY_BODY_FIELDS);
  } catch (error) {
    return jsonError(error);
  }

  const stream = createReplySuggestionStream((onDraftDelta) =>
    streamSocialReply(input, profile, { onDraftDelta }),
  );

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      // Disable proxy buffering (e.g. nginx) so deltas flush immediately.
      "X-Accel-Buffering": "no",
    },
  });
}
