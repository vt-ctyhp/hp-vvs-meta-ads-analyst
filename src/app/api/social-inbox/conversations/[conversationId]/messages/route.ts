import { requirePermissionFromRequest } from "@/lib/app-auth";
import { jsonError } from "@/lib/http";
import { getSocialInboxConversationHistory } from "@/lib/social-inbox";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Params = {
  conversationId: string;
};

export async function GET(
  request: Request,
  { params }: { params: Promise<Params> },
) {
  try {
    const profile = await requirePermissionFromRequest(request, "view_inbox");
    const { conversationId } = await params;
    const url = new URL(request.url);
    const history = await getSocialInboxConversationHistory(
      decodeURIComponent(conversationId),
      profile,
      {
        cursor: url.searchParams.get("cursor"),
        pageSize: numberParam(url.searchParams.get("limit")),
      },
    );

    if (!history) {
      return Response.json({ error: "Conversation not found." }, { status: 404 });
    }

    return Response.json(history);
  } catch (error) {
    return jsonError(error);
  }
}

function numberParam(value: string | null) {
  if (!value) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}
