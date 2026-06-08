import { requirePermissionFromRequest } from "@/lib/app-auth";
import { jsonError } from "@/lib/http";
import { draftChangeLogEntryFromText } from "@/lib/change-log-capture";
import type { BrandCode } from "@/lib/change-log-types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

export async function POST(request: Request) {
  try {
    await requirePermissionFromRequest(request, "manage_change_log");
    const body = (await request.json()) as { text?: string; brandCode?: BrandCode; metaAccountId?: string | null; today?: string };
    if (!body.text?.trim()) return Response.json({ error: "Tell me what changed." }, { status: 400 });
    const draft = await draftChangeLogEntryFromText({
      text: body.text,
      brandCode: body.brandCode ?? "HP",
      metaAccountId: body.metaAccountId ?? null,
      today: body.today ?? new Date().toISOString().slice(0, 10),
    });
    return Response.json({ draft });
  } catch (error) {
    return jsonError(error);
  }
}
