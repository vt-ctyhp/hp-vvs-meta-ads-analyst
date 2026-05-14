import { NextResponse } from "next/server";

import { ConfigurationError } from "./env";

export function jsonError(error: unknown, status = 500) {
  if (error instanceof ConfigurationError) {
    return NextResponse.json(
      {
        error: error.message,
        missing: error.missing,
      },
      { status: 400 },
    );
  }

  const message = error instanceof Error ? error.message : String(error);
  return NextResponse.json({ error: message }, { status });
}

export function isAuthorizedCronRequest(request: Request) {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) return false;

  const authHeader = request.headers.get("authorization");
  const cronHeader = request.headers.get("x-cron-secret");
  return authHeader === `Bearer ${cronSecret}` || cronHeader === cronSecret;
}
