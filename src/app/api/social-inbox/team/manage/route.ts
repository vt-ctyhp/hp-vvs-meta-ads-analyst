import { AuthorizationError, requirePermissionFromRequest } from "@/lib/app-auth";
import { jsonError } from "@/lib/http";
import {
  addTeamMember,
  createTeam,
  deleteTeam,
  loadTeamAdminData,
  removeTeamMember,
  setMemberRole,
  setTeamCoverage,
  type TeamAdminProfile,
} from "@/lib/inbox-team-admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function requireAdmin(request: Request): Promise<TeamAdminProfile> {
  const profile = await requirePermissionFromRequest(request, "manage_inbox_state");
  if (!profile.roles.includes("admin")) {
    throw new AuthorizationError("Admin access required to manage teams.", 403);
  }
  return { appUserId: profile.appUserId, roles: profile.roles };
}

export async function GET(request: Request) {
  try {
    const profile = await requireAdmin(request);
    return Response.json(await loadTeamAdminData(profile));
  } catch (error) {
    return jsonError(error);
  }
}

export async function POST(request: Request) {
  try {
    const profile = await requireAdmin(request);
    const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
    if (!body || typeof body !== "object") {
      throw Object.assign(new Error("Request body must be a JSON object."), { status: 400 });
    }
    const str = (v: unknown) => (typeof v === "string" ? v : "");
    const role = body.role === "lead" ? "lead" : "member";

    switch (body.action) {
      case "create_team":
        await createTeam(profile, str(body.name));
        break;
      case "delete_team":
        await deleteTeam(profile, str(body.teamId));
        break;
      case "add_member":
        await addTeamMember(profile, {
          teamId: str(body.teamId),
          appUserId: str(body.appUserId),
          role,
        });
        break;
      case "remove_member":
        await removeTeamMember(profile, {
          teamId: str(body.teamId),
          appUserId: str(body.appUserId),
        });
        break;
      case "set_member_role":
        await setMemberRole(profile, {
          teamId: str(body.teamId),
          appUserId: str(body.appUserId),
          role,
        });
        break;
      case "set_coverage":
        await setTeamCoverage(profile, {
          teamId: str(body.teamId),
          categoryKeys: Array.isArray(body.categoryKeys) ? body.categoryKeys.map(String) : [],
        });
        break;
      default:
        throw Object.assign(new Error("Unknown action."), { status: 400 });
    }

    // Return fresh state so the client can re-render without a second round-trip.
    return Response.json(await loadTeamAdminData(profile));
  } catch (error) {
    return jsonError(error);
  }
}
