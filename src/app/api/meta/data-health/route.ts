import { isAuthorizedCronRequest, jsonError } from "@/lib/http";
import { getMetaDataHealth } from "@/lib/meta-data-health";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

export async function GET(request: Request) {
  if (!isAuthorizedCronRequest(request)) {
    return Response.json({ error: "Unauthorized data health request" }, { status: 401 });
  }

  try {
    const url = new URL(request.url);
    return Response.json(await getMetaDataHealth({ compareMonth: url.searchParams.get("compareMonth") }));
  } catch (error) {
    return jsonError(error);
  }
}
