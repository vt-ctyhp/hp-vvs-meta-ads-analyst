import { NextResponse } from "next/server";

import { AUTH_ACCESS_COOKIE, getAccessProfileForToken } from "@/lib/app-auth";
import { getPostLoginDestination, hasInternalAppAccess } from "@/lib/app-routes";
import { jsonError } from "@/lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DEFAULT_ACCESS_MAX_AGE = 60 * 60;
const MAX_ACCESS_MAX_AGE = 60 * 60 * 24;

type SessionBody = {
  accessToken?: string;
  expiresAt?: number | null;
  expiresIn?: number | null;
  next?: string | null;
};

export async function POST(request: Request) {
  try {
    const body = (await request.json().catch(() => ({}))) as SessionBody;
    const accessToken = body.accessToken?.trim();

    if (!accessToken) {
      return clearSessionResponse("A valid sign-in session is required.", 400);
    }

    const profile = await getAccessProfileForToken(accessToken);
    if (!profile.authenticated) {
      return clearSessionResponse("Sign in is required.", 401);
    }

    if (!hasInternalAppAccess(profile)) {
      return clearSessionResponse("Your account does not have access to this app.", 403);
    }

    const destination = getPostLoginDestination(profile, body.next);
    if (!destination) {
      return clearSessionResponse("Your account does not have access to this app.", 403);
    }

    const response = NextResponse.json({ destination, profile });
    response.cookies.set(AUTH_ACCESS_COOKIE, accessToken, {
      httpOnly: true,
      maxAge: accessMaxAge(body),
      path: "/",
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
    });

    return response;
  } catch (error) {
    return jsonError(error);
  }
}

export async function DELETE() {
  return clearSessionResponse(null, 200);
}

function clearSessionResponse(error: string | null, status: number) {
  const response = NextResponse.json(error ? { error } : { ok: true }, { status });
  response.cookies.set(AUTH_ACCESS_COOKIE, "", {
    httpOnly: true,
    maxAge: 0,
    path: "/",
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
  });
  return response;
}

function accessMaxAge(body: SessionBody) {
  if (Number.isFinite(body.expiresAt)) {
    const seconds = Math.floor(Number(body.expiresAt) - Date.now() / 1000);
    if (seconds > 0) return Math.min(seconds, MAX_ACCESS_MAX_AGE);
  }

  if (Number.isFinite(body.expiresIn) && Number(body.expiresIn) > 0) {
    return Math.min(Number(body.expiresIn), MAX_ACCESS_MAX_AGE);
  }

  return DEFAULT_ACCESS_MAX_AGE;
}
