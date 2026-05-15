import {
  createMetaAdsBackfillJob,
  getMetaAdsBackfillState,
  updateMetaAdsBackfillJob,
} from "@/lib/meta-backfill";
import { isAuthorizedCronRequest, jsonError } from "@/lib/http";
import { requirePermissionFromRequest } from "@/lib/app-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

export async function GET(request: Request) {
  try {
    if (!isAuthorizedCronRequest(request)) {
      await requirePermissionFromRequest(request, "view_backfill");
    }

    const url = new URL(request.url);
    return Response.json(
      await getMetaAdsBackfillState({
        startDate: url.searchParams.get("start"),
        endDate: url.searchParams.get("end"),
      }),
    );
  } catch (error) {
    return jsonError(error);
  }
}

export async function POST(request: Request) {
  if (!isAuthorizedCronRequest(request)) {
    return Response.json({ error: "Unauthorized backfill request" }, { status: 401 });
  }

  try {
    const body = (await request.json().catch(() => ({}))) as {
      startDate?: string | null;
      endDate?: string | null;
    };
    return Response.json(await createMetaAdsBackfillJob(body));
  } catch (error) {
    return jsonError(error);
  }
}

export async function PATCH(request: Request) {
  if (!isAuthorizedCronRequest(request)) {
    return Response.json({ error: "Unauthorized backfill request" }, { status: 401 });
  }

  try {
    const body = (await request.json().catch(() => ({}))) as {
      jobId?: string;
      action?: "pause" | "resume" | "cancel" | "retry_failed";
    };

    if (!body.jobId) {
      return Response.json({ error: "Job ID is required" }, { status: 400 });
    }

    if (
      body.action !== "pause" &&
      body.action !== "resume" &&
      body.action !== "cancel" &&
      body.action !== "retry_failed"
    ) {
      return Response.json({ error: "Valid action is required" }, { status: 400 });
    }

    return Response.json(
      await updateMetaAdsBackfillJob({
        jobId: body.jobId,
        action: body.action,
      }),
    );
  } catch (error) {
    return jsonError(error);
  }
}
