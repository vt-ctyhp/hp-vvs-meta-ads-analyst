// src/app/api/cron/inbox-auto-assign/route.ts
import { isAuthorizedCronRequest, jsonError } from "@/lib/http";
import { runInboxAutoAssignSweep } from "@/lib/inbox-auto-assign-worker";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

/**
 * Round-robin auto-assign sweep. Assigns unassigned + confidently-categorized
 * conversations to on-shift coverers as the team comes online. Idempotent:
 * only ever acts on currently-unassigned rows.
 */
async function handle(request: Request) {
  if (!isAuthorizedCronRequest(request)) {
    return Response.json({ error: "Unauthorized cron request" }, { status: 401 });
  }
  try {
    return Response.json(await runInboxAutoAssignSweep());
  } catch (error) {
    return jsonError(error);
  }
}

export async function GET(request: Request) {
  return handle(request);
}

export async function POST(request: Request) {
  return handle(request);
}
