import { requirePermissionFromRequest } from "@/lib/app-auth";
import { jsonError } from "@/lib/http";
import { suggestSocialReply } from "@/lib/social-reply-suggestions";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

export async function POST(request: Request) {
  try {
    await requirePermissionFromRequest(request, "view_inbox");
    const body = (await request.json()) as {
      platform?: "facebook" | "instagram";
      sourceType?: "message" | "comment";
      sourceId?: string;
      brand?: "HP" | "VVS" | "Unassigned";
      language?: "auto" | "en" | "vi";
      instruction?: string | null;
    };

    if (body.platform !== "facebook" && body.platform !== "instagram") {
      return Response.json({ error: "Platform must be facebook or instagram." }, { status: 400 });
    }

    if (body.sourceType !== "message" && body.sourceType !== "comment") {
      return Response.json({ error: "Source type must be message or comment." }, { status: 400 });
    }

    if (!body.sourceId?.trim()) {
      return Response.json({ error: "Source ID is required." }, { status: 400 });
    }

    return Response.json(
      await suggestSocialReply({
        platform: body.platform,
        sourceType: body.sourceType,
        sourceId: body.sourceId,
        brand: body.brand,
        language: body.language || "auto",
        instruction: body.instruction,
      }),
    );
  } catch (error) {
    return jsonError(error);
  }
}
