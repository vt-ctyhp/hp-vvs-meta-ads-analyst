import { NextResponse } from "next/server";

import {
  AUTH_ACCESS_COOKIE,
  getLocalTestAccessProfileForToken,
  getLocalTestAccessToken,
  isLocalTestAuthEnabled,
  validateLocalTestCredentials,
} from "@/lib/app-auth";
import { getPostLoginDestination, hasInternalAppAccess } from "@/lib/app-routes";
import { jsonError } from "@/lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const LOCAL_TEST_ACCESS_MAX_AGE = 60 * 60;

type LocalTestSessionBody = {
  email?: string | null;
  password?: string | null;
  next?: string | null;
};

export async function POST(request: Request) {
  try {
    if (!isLocalTestAuthEnabled()) {
      return NextResponse.json({ error: "Local test auth is disabled." }, { status: 404 });
    }

    const body = (await request.json().catch(() => ({}))) as LocalTestSessionBody;
    const email = body.email?.trim() || "";
    const password = body.password || "";

    if (!validateLocalTestCredentials(email, password)) {
      return NextResponse.json({ error: "Invalid local test credentials." }, { status: 401 });
    }

    const accessToken = getLocalTestAccessToken();
    const profile = getLocalTestAccessProfileForToken(accessToken);

    if (!profile?.authenticated || !hasInternalAppAccess(profile)) {
      return NextResponse.json(
        { error: "Local test profile does not have access to this app." },
        { status: 403 },
      );
    }

    const destination = getPostLoginDestination(profile, body.next);
    if (!destination) {
      return NextResponse.json(
        { error: "Local test profile does not have access to this app." },
        { status: 403 },
      );
    }

    const response = NextResponse.json({ destination, profile });
    response.cookies.set(AUTH_ACCESS_COOKIE, accessToken, {
      httpOnly: true,
      maxAge: LOCAL_TEST_ACCESS_MAX_AGE,
      path: "/",
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
    });

    return response;
  } catch (error) {
    return jsonError(error);
  }
}
