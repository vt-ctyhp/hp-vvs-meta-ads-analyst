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

  const errorStatus = statusCodeFromError(error);
  if (errorStatus) {
    return NextResponse.json({ error: safeErrorMessage(error) }, { status: errorStatus });
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

function statusCodeFromError(error: unknown) {
  const candidate = error as { status?: unknown } | null;
  if (
    candidate &&
    typeof candidate.status === "number" &&
    Number.isInteger(candidate.status) &&
    candidate.status >= 400 &&
    candidate.status <= 599
  ) {
    return candidate.status;
  }

  return null;
}
