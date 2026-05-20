import { requirePermissionFromRequest } from "@/lib/app-auth";
import { jsonError } from "@/lib/http";
import { dismissSignal } from "@/lib/signal-engine";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const profile = await requirePermissionFromRequest(request, "view_dashboard");
    const { id } = await params;
    if (!id) {
      return Response.json({ error: "Signal id is required" }, { status: 400 });
    }
    await dismissSignal(id, profile.appUserId ?? null);
    return Response.json({ ok: true });
  } catch (error) {
    return jsonError(error);
  }
}
