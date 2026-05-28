import { AuthorizationError, requirePermissionFromRequest } from "@/lib/app-auth";
import { jsonError } from "@/lib/http";
import {
  loadInboxTeamScheduleSettings,
  saveInboxTeamScheduleSettings,
  type SchedulePatchEntry,
} from "@/lib/inbox-team-schedules";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const profile = await requirePermissionFromRequest(request, "manage_inbox_state");
    if (!profile.teamLead && !profile.roles.includes("admin")) {
      throw new AuthorizationError("Team lead or admin access required.", 403);
    }
    const data = await loadInboxTeamScheduleSettings({
      appUserId: profile.appUserId,
      roles: profile.roles,
      teamLead: profile.teamLead,
      teamUserIds: profile.teamUserIds,
    });
    return Response.json({ members: data });
  } catch (error) {
    return jsonError(error);
  }
}

export async function PATCH(request: Request) {
  try {
    const profile = await requirePermissionFromRequest(request, "manage_inbox_state");
    if (!profile.teamLead && !profile.roles.includes("admin")) {
      throw new AuthorizationError("Team lead or admin access required.", 403);
    }

    // Parse and validate body manually — parseJsonObjectBody doesn't support
    // object-array fields (only stringArray), so we validate inline.
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      throw Object.assign(new Error("Malformed JSON body."), { status: 400 });
    }
    if (typeof body !== "object" || body === null || Array.isArray(body)) {
      throw Object.assign(new Error("Request body must be a JSON object."), { status: 400 });
    }
    const b = body as Record<string, unknown>;

    // appUserId — required string
    if (typeof b.appUserId !== "string" || !b.appUserId) {
      throw Object.assign(new Error("appUserId is required."), { status: 400 });
    }

    // autoAssignEligible — optional boolean
    if ("autoAssignEligible" in b && b.autoAssignEligible !== undefined) {
      if (typeof b.autoAssignEligible !== "boolean") {
        throw Object.assign(new Error("autoAssignEligible must be a boolean."), { status: 400 });
      }
    }

    // schedules — optional array of { weekday, startTime, endTime }
    let schedules: SchedulePatchEntry[] | undefined;
    if ("schedules" in b && b.schedules !== undefined) {
      if (!Array.isArray(b.schedules)) {
        throw Object.assign(new Error("schedules must be an array."), { status: 400 });
      }
      schedules = [];
      for (const entry of b.schedules) {
        if (typeof entry !== "object" || entry === null) {
          throw Object.assign(new Error("Each schedule entry must be an object."), { status: 400 });
        }
        const e = entry as Record<string, unknown>;
        if (!Number.isInteger(e.weekday) || (e.weekday as number) < 0 || (e.weekday as number) > 6) {
          throw Object.assign(new Error("weekday must be an integer 0-6."), { status: 400 });
        }
        if (e.startTime !== null && e.startTime !== undefined && typeof e.startTime !== "string") {
          throw Object.assign(new Error("startTime must be a string or null."), { status: 400 });
        }
        if (e.endTime !== null && e.endTime !== undefined && typeof e.endTime !== "string") {
          throw Object.assign(new Error("endTime must be a string or null."), { status: 400 });
        }
        schedules.push({
          weekday: e.weekday as number,
          startTime: (e.startTime as string | null | undefined) ?? null,
          endTime: (e.endTime as string | null | undefined) ?? null,
        });
      }
    }

    await saveInboxTeamScheduleSettings(
      {
        appUserId: profile.appUserId,
        roles: profile.roles,
        teamLead: profile.teamLead,
        teamUserIds: profile.teamUserIds,
      },
      {
        appUserId: b.appUserId as string,
        autoAssignEligible:
          typeof b.autoAssignEligible === "boolean" ? b.autoAssignEligible : undefined,
        schedules,
      },
    );

    return Response.json({ ok: true });
  } catch (error) {
    return jsonError(error);
  }
}
