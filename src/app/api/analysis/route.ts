import {
  createAdHocAnalysis,
  deleteSavedAnalysisDashboard,
  editAdHocAnalysis,
  fetchSavedAnalysisDashboards,
  renameSavedAnalysisDashboard,
  runSavedAdHocAnalysis,
} from "@/lib/ad-hoc-analytics";
import { requirePermissionFromRequest } from "@/lib/app-auth";
import type { AnalysisMode } from "@/lib/env";
import { jsonError } from "@/lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

export async function GET(request: Request) {
  try {
    await requirePermissionFromRequest(request, "view_ai_analysis");
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
    await requirePermissionFromRequest(request, "view_ai_analysis");
    const body = (await request.json()) as {
      action?: "create" | "edit";
      prompt?: string;
      mode?: AnalysisMode;
      dashboardId?: string;
      currentPrompt?: string | null;
      currentSpec?: unknown;
      defaultDateRange?: {
        days?: number;
        startDate?: string | null;
        endDate?: string | null;
      };
    };

    if (body.dashboardId && !body.prompt?.trim()) {
      return Response.json(await runSavedAdHocAnalysis(body.dashboardId));
    }

    const prompt = body.prompt?.trim();
    if (!prompt) {
      return Response.json({ error: "Prompt is required" }, { status: 400 });
    }

    const mode: AnalysisMode = body.mode === "deep" ? "deep" : "fast";
    if (body.action === "edit" || body.dashboardId || body.currentSpec) {
      return Response.json(
        await editAdHocAnalysis({
          dashboardId: body.dashboardId,
          currentPrompt: body.currentPrompt,
          currentSpec: body.currentSpec,
          prompt,
          mode,
        }),
      );
    }

    return Response.json(
      await createAdHocAnalysis({
        prompt,
        mode,
        defaultDateRange: body.defaultDateRange,
      }),
    );
  } catch (error) {
    return jsonError(error);
  }
}

export async function PATCH(request: Request) {
  try {
    await requirePermissionFromRequest(request, "view_ai_analysis");
    const body = (await request.json()) as {
      dashboardId?: string;
      title?: string;
    };

    if (!body.dashboardId) {
      return Response.json({ error: "Dashboard ID is required" }, { status: 400 });
    }

    if (!body.title?.trim()) {
      return Response.json({ error: "Title is required" }, { status: 400 });
    }

    return Response.json(
      await renameSavedAnalysisDashboard({
        dashboardId: body.dashboardId,
        title: body.title,
      }),
    );
  } catch (error) {
    return jsonError(error);
  }
}

export async function DELETE(request: Request) {
  try {
    await requirePermissionFromRequest(request, "view_ai_analysis");
    const url = new URL(request.url);
    const dashboardId = url.searchParams.get("dashboardId");
    if (!dashboardId) {
      return Response.json({ error: "Dashboard ID is required" }, { status: 400 });
    }

    return Response.json(await deleteSavedAnalysisDashboard(dashboardId));
  } catch (error) {
    return jsonError(error);
  }
}
