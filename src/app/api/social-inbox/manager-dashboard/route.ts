import { requirePermissionFromRequest } from "@/lib/app-auth";
import { jsonError } from "@/lib/http";
import { enrichManagerDashboardWithCreativeMedia } from "@/lib/meta-inbox-attribution-media";
import {
  buildMetaInboxManagerDashboard,
  type MetaInboxManagerDashboardFilters,
} from "@/lib/meta-inbox-manager-dashboard";
import { getSocialInboxManagerDashboardData } from "@/lib/social-inbox";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const profile = await requirePermissionFromRequest(request, "view_inbox");
    const url = new URL(request.url);
    const days = Number(url.searchParams.get("days") || 0);
    const data = await getSocialInboxManagerDashboardData(profile);

    const dashboard = buildMetaInboxManagerDashboard(data, {
      days: Number.isFinite(days) && days > 0 ? days : undefined,
      filters: managerDashboardFiltersFromSearchParams(url.searchParams),
    });
    return Response.json(await enrichManagerDashboardWithCreativeMedia(dashboard));
  } catch (error) {
    return jsonError(error);
  }
}

function managerDashboardFiltersFromSearchParams(
  searchParams: URLSearchParams,
): MetaInboxManagerDashboardFilters {
  return {
    assignedUserId: firstSearchParam(searchParams, "assignedUserId", "userId"),
    assignedTeamId: firstSearchParam(searchParams, "assignedTeamId", "teamId"),
    queueCategoryKey: firstSearchParam(searchParams, "queueCategoryKey", "queue"),
    sourceChannel: firstSearchParam(searchParams, "sourceChannel", "source"),
    campaignUmbrellaId: firstSearchParam(
      searchParams,
      "campaignUmbrellaId",
      "campaignUmbrella",
    ),
    adId: searchParams.get("adId"),
    creativeId: searchParams.get("creativeId"),
    messageContext: firstSearchParam(searchParams, "messageContext", "context"),
  };
}

function firstSearchParam(searchParams: URLSearchParams, ...keys: string[]) {
  for (const key of keys) {
    const value = searchParams.get(key);
    if (value !== null) return value;
  }
  return null;
}
