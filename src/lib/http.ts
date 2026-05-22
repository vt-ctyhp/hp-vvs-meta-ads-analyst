import { NextResponse } from "next/server";

import { AuthorizationError } from "./app-auth";
export { isAuthorizedCronRequest } from "./cron-auth";
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
