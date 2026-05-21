import { requirePermissionFromRequest } from "@/lib/app-auth";
import { jsonError } from "@/lib/http";
import {
  fetchPeriodPivotChildren,
  isPeriodMetric,
  normalizePeriodCount,
  type PeriodPivotParentLevel,
} from "@/lib/period-pivot-data";
import { isFrequency } from "@/lib/period-windows";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}T/;
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

    const frequency = url.searchParams.get("frequency");
    const metric = url.searchParams.get("metric");
    const anchor = parseAnchor(url.searchParams.get("anchor"));

    if (!isFrequency(frequency) || !isPeriodMetric(metric)) {
      return Response.json(
        { error: "frequency and metric must be valid period-pivot controls." },
        { status: 400 },
      );
    }

    const payload = await fetchPeriodPivotChildren({
      now: anchor,
      periodCount: normalizePeriodCount(url.searchParams.get("periodCount")),
      frequency,
      metric,
      brand: url.searchParams.get("brand"),
      group: url.searchParams.get("group"),
      parentLevel,
      parentId,
    });

    return Response.json(payload);
  } catch (error) {
    return jsonError(error);
  }
}

function isParentLevel(value: string | null): value is PeriodPivotParentLevel {
  return value !== null && PARENT_LEVELS.has(value);
}

function parseAnchor(value: string | null) {
  if (!value || !DATE_PATTERN.test(value)) return new Date();
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? new Date() : parsed;
}
