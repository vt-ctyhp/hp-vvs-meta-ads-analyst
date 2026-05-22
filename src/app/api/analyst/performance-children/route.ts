import { requirePermissionFromRequest } from "@/lib/app-auth";
import {
  fetchDashboardPerformanceChildren,
  type DashboardPerformanceChildrenInput,
} from "@/lib/analytics";
import { jsonError } from "@/lib/http";
import { normalizeAnalystPeriodCount } from "@/lib/analyst-periods";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PARENT_LEVELS = new Set(["campaign", "ad_set"]);

export async function GET(request: Request) {
  try {
    await requirePermissionFromRequest(request, "view_dashboard");

    const url = new URL(request.url);
    const parentLevel = url.searchParams.get("parentLevel");
    const parentId = url.searchParams.get("parentId")?.trim();

    if (!isParentLevel(parentLevel) || !parentId) {
      return Response.json(
        { error: "parentLevel must be campaign or ad_set, and parentId is required." },
        { status: 400 },
      );
    }

    const input: DashboardPerformanceChildrenInput = {
      parentLevel,
      parentId,
      startDate: url.searchParams.get("start"),
      endDate: url.searchParams.get("end"),
      brand: url.searchParams.get("brand"),
      group: url.searchParams.get("group"),
      status: url.searchParams.get("status"),
      periodCount: normalizeAnalystPeriodCount(url.searchParams.get("periods")),
    };

    return Response.json(await fetchDashboardPerformanceChildren(input));
  } catch (error) {
    return jsonError(error);
  }
}

function isParentLevel(
  value: string | null,
): value is DashboardPerformanceChildrenInput["parentLevel"] {
  return value !== null && PARENT_LEVELS.has(value);
}
