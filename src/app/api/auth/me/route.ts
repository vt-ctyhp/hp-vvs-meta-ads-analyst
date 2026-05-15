import { getAccessProfileFromRequest } from "@/lib/app-auth";
import { jsonError } from "@/lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    return Response.json(await getAccessProfileFromRequest(request));
  } catch (error) {
    return jsonError(error);
  }
}
