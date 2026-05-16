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
    const message = error instanceof Error ? error.message : String(error);
    const status = message.includes("Origin is not allowed") ? 403 : 500;
    return NextResponse.json({ error: message, ok: false }, { headers, status });
  }
}
