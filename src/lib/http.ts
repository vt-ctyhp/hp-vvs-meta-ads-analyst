import { NextResponse } from "next/server";

import { AuthorizationError } from "./app-auth";
import { ConfigurationError } from "./env";
import { safeErrorMessage } from "./error-message";

export { safeErrorMessage };

export function jsonError(error: unknown, status = 500) {
  if (error instanceof AuthorizationError) {
    return NextResponse.json({ error: error.message }, { status: error.status });
  }

  if (error instanceof ConfigurationError) {
    return NextResponse.json(
      {
        error: error.message,
        missing: error.missing,
      },
      { status: 400 },
    );
  }

  return NextResponse.json({ error: safeErrorMessage(error) }, { status });
}

export function isAuthorizedCronRequest(request: Request) {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) return false;

  const authHeader = request.headers.get("authorization");
  const cronHeader = request.headers.get("x-cron-secret");
  return authHeader === `Bearer ${cronSecret}` || cronHeader === cronSecret;
}
