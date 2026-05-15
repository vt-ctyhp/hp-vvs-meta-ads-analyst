import { isAuthorizedCronRequest, jsonError } from "@/lib/http";
import { requirePermissionFromRequest } from "@/lib/app-auth";
import { getMetaDataHealth } from "@/lib/meta-data-health";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const compareMonth = url.searchParams.get("compareMonth");
    const isCronAuthorized = isAuthorizedCronRequest(request);

    if (!isCronAuthorized) {
      if (compareMonth) {
        return Response.json(
          { error: "Operator secret is required for live Meta comparisons." },
          { status: 401 },
        );
      }
      await requirePermissionFromRequest(request, "view_backfill");
    }

    return Response.json(await getMetaDataHealth({ compareMonth }));
  } catch (error) {
    return jsonError(error);
  }
}
