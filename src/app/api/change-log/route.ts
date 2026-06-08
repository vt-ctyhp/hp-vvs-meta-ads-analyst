import { requirePermissionFromRequest } from "@/lib/app-auth";
import { jsonError } from "@/lib/http";
import { createChangeLogEntry, listChangeLogEntries } from "@/lib/change-log";
import type { ChangeLogDraft } from "@/lib/change-log-types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    await requirePermissionFromRequest(request, "view_change_log");
    return Response.json({ entries: await listChangeLogEntries() });
  } catch (error) {
    return jsonError(error);
  }
}

export async function POST(request: Request) {
  try {
    const profile = await requirePermissionFromRequest(request, "manage_change_log");
    const body = (await request.json()) as { draft?: ChangeLogDraft };
    if (!body.draft) return Response.json({ error: "Missing draft." }, { status: 400 });
    const id = await createChangeLogEntry(body.draft, { appUserId: profile.appUserId, email: profile.email });
    return Response.json({ id });
  } catch (error) {
    return jsonError(error);
  }
}
