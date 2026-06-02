// Append-only audit log of raw Meta webhook deliveries.
//
// Meta delivers click-to-Messenger ad attribution (the `referral` object) only
// once, on the realtime webhook -- it is NOT re-fetchable via the Graph
// Conversations API. When a delivery is missed or fails we otherwise keep no
// record of what Meta actually sent, so we cannot distinguish "Meta never sent
// it" from "we dropped it". `recordWebhookEvent` captures every delivery at the
// edge; `buildWebhookEventLogRow` is the pure row builder (unit-tested).

import { createAdsAnalystClient } from "./ads-analyst-db.ts";
import { withActiveMetaInboxEnvironment } from "./meta-inbox-environment.ts";

type JsonRecord = Record<string, unknown>;

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

/** Count messaging events that carry a referral, at either path Meta uses. */
function countReferralEvents(payload: JsonRecord): number {
  let count = 0;
  for (const entry of asArray(payload.entry)) {
    if (!isRecord(entry)) continue;
    const events = [...asArray(entry.messaging), ...asArray(entry.standby)];
    for (const event of events) {
      if (!isRecord(event)) continue;
      const message = isRecord(event.message) ? event.message : null;
      if (isRecord(event.referral) || (message && isRecord(message.referral))) {
        count += 1;
      }
    }
  }
  return count;
}

function countEntries(payload: JsonRecord): number {
  return asArray(payload.entry).length;
}

export type WebhookIngestResult = {
  messages?: number;
  comments?: number;
  referrals?: number;
};

export type BuildWebhookEventLogRowInput = {
  payload: JsonRecord;
  signatureValid: boolean;
  result?: WebhookIngestResult | null;
  error?: string | null;
};

export function buildWebhookEventLogRow(input: BuildWebhookEventLogRowInput): JsonRecord {
  const { payload, signatureValid, result, error } = input;
  return {
    object: typeof payload.object === "string" ? payload.object : null,
    signature_valid: signatureValid,
    entry_count: countEntries(payload),
    referral_count: countReferralEvents(payload),
    message_count: typeof result?.messages === "number" ? result.messages : null,
    comment_count: typeof result?.comments === "number" ? result.comments : null,
    payload,
    result: result ?? null,
    error: error ?? null,
  };
}

/**
 * Best-effort insert of one webhook delivery. Never throws: logging must not
 * break the Meta ack (a slow/failed ack triggers Meta retries and, worse, can
 * disable the subscription). On failure we log and move on.
 */
export async function recordWebhookEvent(input: BuildWebhookEventLogRowInput): Promise<void> {
  try {
    const row = withActiveMetaInboxEnvironment(buildWebhookEventLogRow(input));
    const supabase = createAdsAnalystClient("ingest") as unknown as {
      from: (table: string) => { insert: (row: JsonRecord) => Promise<{ error: unknown }> };
    };
    const { error } = await supabase.from("meta_webhook_events").insert(row);
    if (error) console.error("recordWebhookEvent insert failed", error);
  } catch (loggingError) {
    console.error("recordWebhookEvent failed", loggingError);
  }
}
