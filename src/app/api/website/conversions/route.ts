import { NextResponse } from "next/server";

import {
  corsHeadersForRequest,
  isAuthorizedConversionRequest,
  recordServerWebsiteConversion,
} from "@/lib/website-analytics";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function OPTIONS(request: Request) {
  const { headers } = corsHeadersForRequest(request);
  return new Response(null, { headers, status: 204 });
}

export async function POST(request: Request) {
  const { headers } = corsHeadersForRequest(request);

  if (!isAuthorizedConversionRequest(request)) {
    return NextResponse.json(
      { error: "Website conversion endpoint is not authorized.", ok: false },
      { headers, status: 401 },
    );
  }

  try {
    const result = await recordServerWebsiteConversion(
      await request.json().catch(() => null),
      request,
    );

    if (!result.ok) {
      return NextResponse.json(result, { headers, status: 400 });
    }

    return NextResponse.json(result, { headers });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: message, ok: false }, { headers, status: 500 });
  }
}
