import { normalizeAnalysisOutputMode } from "@/lib/analysis-workbench-contract";
import {
  createAnalysisWorkbenchRun,
  getAnalysisWorkbenchRun,
  listAnalysisWorkbenchRuns,
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

    return Response.json({ run: await createAnalysisWorkbenchRun(input) });
  } catch (error) {
    return jsonError(error);
  }
}
