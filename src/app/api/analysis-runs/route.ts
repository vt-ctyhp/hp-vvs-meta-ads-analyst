import { normalizeAnalysisOutputMode } from "@/lib/analysis-workbench-contract";
import {
  createAnalysisWorkbenchRun,
  getAnalysisWorkbenchRun,
  listAnalysisWorkbenchRuns,
  promoteAnalysisWorkbenchRunToDashboard,
} from "@/lib/analysis-workbench-runs";
import { requirePermissionFromRequest } from "@/lib/app-auth";
import { jsonError } from "@/lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    await requirePermissionFromRequest(request, "view_ai_analysis");
    const url = new URL(request.url);
    const runId = url.searchParams.get("runId");

    if (runId) {
      return Response.json({ run: await getAnalysisWorkbenchRun(runId) });
    }

    return Response.json({ runs: await listAnalysisWorkbenchRuns() });
  } catch (error) {
    return jsonError(error);
  }
}

export async function POST(request: Request) {
  try {
    await requirePermissionFromRequest(request, "view_ai_analysis");
    const body = (await request.json()) as {
      prompt?: string;
      outputMode?: unknown;
      parentRunId?: string | null;
      removedContextKeys?: unknown;
    };
    const prompt = body.prompt?.trim();

    if (!prompt) {
      return Response.json({ error: "Prompt is required" }, { status: 400 });
    }

    const input: Parameters<typeof createAnalysisWorkbenchRun>[0] = {
      prompt,
      outputMode: normalizeAnalysisOutputMode(body.outputMode),
    };
    if (body.parentRunId) input.parentRunId = body.parentRunId;
    const removedContextKeys = Array.isArray(body.removedContextKeys)
      ? body.removedContextKeys.filter((key): key is string => typeof key === "string")
      : [];
    if (removedContextKeys.length) input.removedContextKeys = removedContextKeys;

    return Response.json({ run: await createAnalysisWorkbenchRun(input) });
  } catch (error) {
    return jsonError(error);
  }
}

export async function PATCH(request: Request) {
  try {
    await requirePermissionFromRequest(request, "view_ai_analysis");
    const body = (await request.json()) as {
      action?: unknown;
      runId?: unknown;
    };

    if (body.action !== "promote_dashboard") {
      return Response.json({ error: "Unsupported analysis run action" }, { status: 400 });
    }
    if (typeof body.runId !== "string" || !body.runId.trim()) {
      return Response.json({ error: "Run ID is required" }, { status: 400 });
    }

    return Response.json({
      run: await promoteAnalysisWorkbenchRunToDashboard(body.runId.trim()),
    });
  } catch (error) {
    return jsonError(error);
  }
}
