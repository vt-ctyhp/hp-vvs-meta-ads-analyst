import { NextResponse } from "next/server";

import {
  corsHeadersForRequest,
  isAuthorizedConversionRequest,
  resolveWebsiteAttribution,
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
      { error: "Website attribution endpoint is not authorized.", ok: false },
      { headers, status: 401 },
    );
  }

  try {
    const result = await resolveWebsiteAttribution(await request.json().catch(() => null));
    return NextResponse.json(result, { headers, status: result.ok ? 200 : 400 });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: message, ok: false }, { headers, status: 500 });
  }
}
