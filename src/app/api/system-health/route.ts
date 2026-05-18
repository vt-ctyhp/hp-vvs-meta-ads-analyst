import { AuthorizationError, getAccessProfileFromRequest } from "@/lib/app-auth";
import { hasInternalAppAccess } from "@/lib/app-routes";
import { jsonError } from "@/lib/http";
import { getSystemHealth } from "@/lib/system-health";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const profile = await getAccessProfileFromRequest(request);
    if (!profile.authenticated) {
      throw new AuthorizationError("Sign in is required.", 401);
    }
    if (!hasInternalAppAccess(profile)) {
      throw new AuthorizationError("Your account does not have access to this app.", 403);
    }

    return Response.json(await getSystemHealth(), {
      headers: { "cache-control": "no-store" },
    });
  } catch (error) {
    return jsonError(error);
  }
}
