import { createHmac, timingSafeEqual } from "node:crypto";

import { after } from "next/server";

import { ConfigurationError, getOptionalEnv } from "@/lib/env";
import { jsonError } from "@/lib/http";
import { recordWebhookEvent } from "@/lib/meta-webhook-log";
import { ingestMetaWebhookPayload } from "@/lib/social-inbox";

function safeParsePayload(rawBody: string): Record<string, unknown> {
  try {
    const parsed = JSON.parse(rawBody) as unknown;
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
  } catch {
    // fall through to the unparsed marker below
  }
  return { _unparsed: rawBody.slice(0, 8000) };
}

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const mode = url.searchParams.get("hub.mode");
  const token = url.searchParams.get("hub.verify_token");
  const challenge = url.searchParams.get("hub.challenge");
  const expectedToken = getOptionalEnv("META_WEBHOOK_VERIFY_TOKEN");

  if (!expectedToken) {
    return jsonError(
      new ConfigurationError("Missing META_WEBHOOK_VERIFY_TOKEN", ["META_WEBHOOK_VERIFY_TOKEN"]),
      400,
    );
  }

  if (mode === "subscribe" && token === expectedToken && challenge) {
    return new Response(challenge, { status: 200 });
  }

  return Response.json({ error: "Invalid Meta webhook verification token." }, { status: 403 });
}

export async function POST(request: Request) {
  const rawBody = await request.text();

  if (!isValidMetaSignature(rawBody, request.headers.get("x-hub-signature-256"))) {
    // Audit even rejected deliveries: a wrong/missing signature on a real ad
    // referral is exactly the kind of silent loss this log exists to surface.
    after(() =>
      recordWebhookEvent({
        payload: safeParsePayload(rawBody),
        signatureValid: false,
        error: "Invalid Meta webhook signature.",
      }),
    );
    return Response.json({ error: "Invalid Meta webhook signature." }, { status: 403 });
  }

  try {
    const payload = JSON.parse(rawBody) as Record<string, unknown>;
    const result = await ingestMetaWebhookPayload(payload);
    // Audit + near-real-time auto-assign run AFTER the response so the Meta ack
    // stays fast; both are best-effort.
    after(() => recordWebhookEvent({ payload, signatureValid: true, result }));
    after(async () => {
      try {
        const { runInboxAutoAssignSweep } = await import("@/lib/inbox-auto-assign-worker");
        await runInboxAutoAssignSweep();
      } catch (hookError) {
        console.error("inbox auto-assign webhook hook failed", hookError);
      }
    });
    return Response.json({ ok: true, ...result });
  } catch (error) {
    // Capture the payload of a delivery that failed to ingest -- otherwise the
    // raw event is lost and the failure is unauditable.
    after(() =>
      recordWebhookEvent({
        payload: safeParsePayload(rawBody),
        signatureValid: true,
        error: error instanceof Error ? error.message : String(error),
      }),
    );
    return jsonError(error);
  }
}

function isValidMetaSignature(rawBody: string, signatureHeader: string | null) {
  const appSecret = process.env.META_APP_SECRET;
  if (!appSecret || !signatureHeader?.startsWith("sha256=")) return false;

  const expected = createHmac("sha256", appSecret).update(rawBody).digest("hex");
  const actual = signatureHeader.slice("sha256=".length);
  const expectedBuffer = Buffer.from(expected, "hex");
  const actualBuffer = Buffer.from(actual, "hex");

  if (expectedBuffer.length !== actualBuffer.length) return false;
  return timingSafeEqual(expectedBuffer, actualBuffer);
}
