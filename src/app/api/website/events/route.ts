import { NextResponse } from "next/server";

import {
  corsHeadersForRequest,
  recordBrowserWebsiteEvent,
} from "@/lib/website-analytics";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function OPTIONS(request: Request) {
  const { headers } = corsHeadersForRequest(request);
  return new Response(null, { headers, status: 204 });
}

export async function POST(request: Request) {
  const { headers } = corsHeadersForRequest(request);

  try {
    const result = await recordBrowserWebsiteEvent(
      await request.json().catch(() => null),
      request,
    );

    if (!result.ok) {
      return NextResponse.json(result, { headers, status: 400 });
    }

    return NextResponse.json(result, { headers });
  } catch (error) {
    const message = readableErrorMessage(error);
    const status = message.includes("Origin is not allowed") ? 403 : 500;
    return NextResponse.json({ error: message, ok: false }, { headers, status });
  }
}

function readableErrorMessage(error: unknown) {
  if (error instanceof Error) return error.message;
  if (!error || typeof error !== "object") return String(error);

  const fields = error as {
    code?: unknown;
    details?: unknown;
    hint?: unknown;
    message?: unknown;
  };
  const parts = [fields.message, fields.details, fields.hint, fields.code]
    .filter((value): value is string => typeof value === "string" && value.trim().length > 0);

  return parts.length ? parts.join(" | ") : JSON.stringify(error);
}
