import { jsonError } from "@/lib/http";
import { getSocialInboxData } from "@/lib/social-inbox";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    return Response.json(await getSocialInboxData());
  } catch (error) {
    return jsonError(error);
  }
}
