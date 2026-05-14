import { jsonError } from "@/lib/http";
import { syncMetaAds } from "@/lib/meta";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function POST() {
  try {
    const result = await syncMetaAds("manual");
    return Response.json(result);
  } catch (error) {
    return jsonError(error);
  }
}
