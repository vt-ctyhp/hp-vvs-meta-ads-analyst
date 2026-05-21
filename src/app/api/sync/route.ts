import { requirePermissionFromRequest } from "@/lib/app-auth";
import { jsonError } from "@/lib/http";
import { syncMetaAds } from "@/lib/meta";
import type { MetaAdsSyncTrigger } from "@/lib/meta-sync-options";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function POST(request: Request) {
  try {
    await requirePermissionFromRequest(request, "run_meta_sync");
    const trigger = await parseSyncTrigger(request);
    if (!trigger) {
      return Response.json(
        { error: "Unsupported sync mode. Use incremental or catalog." },
        { status: 400 },
      );
    }

    const result = await syncMetaAds(trigger);
    return Response.json(result);
  } catch (error) {
    return jsonError(error);
  }
}

async function parseSyncTrigger(request: Request): Promise<MetaAdsSyncTrigger | null> {
  const body = (await request.json().catch(() => null)) as { mode?: unknown } | null;
  const mode = body?.mode;

  if (mode === undefined || mode === null || mode === "" || mode === "incremental") {
    return "manual";
  }

  if (mode === "catalog") return "manual_catalog";

  return null;
}
