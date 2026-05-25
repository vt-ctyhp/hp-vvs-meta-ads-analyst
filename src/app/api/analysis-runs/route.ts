import {
  normalizeAnalysisOutputMode,
  normalizeAnalysisWorkbenchControlledEdits,
} from "@/lib/analysis-workbench-contract";
import {
  createAnalysisWorkbenchRun,
  getAnalysisWorkbenchRun,
  listAnalysisWorkbenchRuns,
  promoteAnalysisWorkbenchRunToDashboard,
  rerunAnalysisWorkbenchRun,
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
      edits?: unknown;
    };

    if (typeof body.runId !== "string" || !body.runId.trim()) {
      return Response.json({ error: "Run ID is required" }, { status: 400 });
    }
    const runId = body.runId.trim();

    if (body.action === "rerun") {
      const validation = normalizeAnalysisWorkbenchControlledEdits(body.edits);
      if (validation.status === "blocked") {
        const customLogicBlocked = validation.blockers.some(
          (blocker) => blocker.code === "unsupported_custom_logic",
        );
        return Response.json(
          {
            error: customLogicBlocked
              ? "Unsupported custom SQL, formulas, or calculated fields in controlled dashboard edits."
              : "Invalid controlled dashboard edits.",
            blockers: validation.blockers,
          },
          { status: 400 },
        );
      }

      return Response.json({
        run: await rerunAnalysisWorkbenchRun(runId, validation.edit),
      });
    }

    if (body.action !== "promote_dashboard") {
      return Response.json({ error: "Unsupported analysis run action" }, { status: 400 });
    }

    return Response.json({
      run: await promoteAnalysisWorkbenchRunToDashboard(runId),
    });
  } catch (error) {
    return jsonError(error);
  }
}
