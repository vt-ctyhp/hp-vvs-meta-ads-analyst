import {
  createAdHocAnalysis,
  fetchSavedAnalysisDashboards,
  runSavedAdHocAnalysis,
} from "@/lib/ad-hoc-analytics";
import type { AnalysisMode } from "@/lib/env";
import { jsonError } from "@/lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const dashboardId = url.searchParams.get("dashboardId");

    if (dashboardId) {
      return Response.json(await runSavedAdHocAnalysis(dashboardId));
    }

    return Response.json({ dashboards: await fetchSavedAnalysisDashboards() });
  } catch (error) {
    return jsonError(error);
  }
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      prompt?: string;
      mode?: AnalysisMode;
      dashboardId?: string;
    };

    if (body.dashboardId && !body.prompt?.trim()) {
      return Response.json(await runSavedAdHocAnalysis(body.dashboardId));
    }

    const prompt = body.prompt?.trim();
    if (!prompt) {
      return Response.json({ error: "Prompt is required" }, { status: 400 });
    }

    const mode: AnalysisMode = body.mode === "deep" ? "deep" : "fast";
    return Response.json(await createAdHocAnalysis({ prompt, mode }));
  } catch (error) {
    return jsonError(error);
  }
}
