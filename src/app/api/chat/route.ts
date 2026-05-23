import { answerExecutiveChat } from "@/lib/ai";
import { requirePermissionFromRequest } from "@/lib/app-auth";
import type { AnalysisMode } from "@/lib/env";
import { jsonError } from "@/lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

export async function POST(request: Request) {
  try {
    await requirePermissionFromRequest(request, "view_dashboard");
    const body = (await request.json()) as {
      sessionId?: string | null;
      message?: string;
      mode?: AnalysisMode;
      days?: number;
      startDate?: string | null;
      endDate?: string | null;
      brand?: string | null;
      group?: string | null;
      status?: string | null;
    };

    if (!body.message?.trim()) {
      return Response.json({ error: "Message is required" }, { status: 400 });
    }

    const result = await answerExecutiveChat({
      sessionId: body.sessionId,
      message: body.message,
      mode: body.mode === "deep" ? "deep" : body.mode === "fast" ? "fast" : undefined,
      days: body.days,
      startDate: body.startDate,
      endDate: body.endDate,
      brand: body.brand,
      group: body.group,
      status: body.status,
    });

    return Response.json(result);
  } catch (error) {
    return jsonError(error);
  }
}
