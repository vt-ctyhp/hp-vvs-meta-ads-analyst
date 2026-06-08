import { requirePermissionFromRequest } from "@/lib/app-auth";
import { jsonError } from "@/lib/http";
import { softDeleteChangeLogEntry, updateChangeLogEntry } from "@/lib/change-log";
import type { ChangeLogEntry } from "@/lib/change-log-types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, ctx: Ctx) {
  try {
    const profile = await requirePermissionFromRequest(request, "manage_change_log");
    const { id } = await ctx.params;
    const patch = (await request.json()) as Partial<ChangeLogEntry>;
    await updateChangeLogEntry(id, patch, { appUserId: profile.appUserId, email: profile.email });
    return Response.json({ ok: true });
  } catch (error) {
    return jsonError(error);
  }
}

export async function DELETE(request: Request, ctx: Ctx) {
  try {
    const profile = await requirePermissionFromRequest(request, "manage_change_log");
    const { id } = await ctx.params;
    await softDeleteChangeLogEntry(id, { appUserId: profile.appUserId, email: profile.email });
    return Response.json({ ok: true });
  } catch (error) {
    return jsonError(error);
  }
}
