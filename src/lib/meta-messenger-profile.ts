import { getMetaApiVersion } from "./env.ts";

export type MessengerProfile = {
  displayName: string | null;
  profilePictureUrl: string | null;
};

export type FetchMessengerProfileOptions = {
  fetchFn?: typeof fetch;
  timeoutMs?: number;
};

export function shouldEnrichProfile(row: {
  display_name: string | null;
  profile_picture_url: string | null;
}): boolean {
  return !isMeaningfulString(row.display_name) || !isMeaningfulString(row.profile_picture_url);
}

export type ProfileEnrichmentPatch = {
  display_name?: string;
  profile_picture_url?: string;
};

/**
 * Decide what to write back to a customer profile during enrichment.
 *
 * Name precedence: an existing display name is never overwritten; otherwise a
 * name fetched from the Graph API wins; otherwise fall back to a name the
 * webhook already carried (the thread's participant_name / a message's
 * recipient_name). The fallback matters for click-to-Messenger leads whose
 * PSID Meta refuses to resolve via Graph — without it the inbox would render
 * the raw PSID as the customer's name even when the inbound/echo payload
 * already supplied a usable one. Returns an empty patch when nothing should
 * change, so callers can skip the write.
 */
export function resolveProfileEnrichmentPatch(params: {
  currentDisplayName: string | null;
  currentProfilePictureUrl: string | null;
  fetched: MessengerProfile | null;
  fallbackName: string | null;
}): ProfileEnrichmentPatch {
  const patch: ProfileEnrichmentPatch = {};

  if (!isMeaningfulString(params.currentDisplayName)) {
    const fetchedName = params.fetched?.displayName ?? null;
    if (isMeaningfulString(fetchedName)) {
      patch.display_name = fetchedName.trim();
    } else if (isMeaningfulString(params.fallbackName)) {
      patch.display_name = params.fallbackName.trim();
    }
  }

  if (!isMeaningfulString(params.currentProfilePictureUrl)) {
    const fetchedPicture = params.fetched?.profilePictureUrl ?? null;
    if (isMeaningfulString(fetchedPicture)) {
      patch.profile_picture_url = fetchedPicture.trim();
    }
  }

  return patch;
}

/**
 * Parse `/me/conversations?user_id=...` Graph response and pull the participant
 * whose id matches `participantId`. Returns null when no participant matches.
 *
 * This endpoint is used as a fallback when the direct `/{psid}?fields=name,profile_pic`
 * lookup is rejected by Facebook (the common case post-2018).
 */
export function parseConversationsParticipantResponse(
  value: unknown,
  participantId: string,
): MessengerProfile | null {
  if (!isRecord(value)) return null;
  if ("error" in value) return null;
  const data = (value as { data?: unknown }).data;
  if (!Array.isArray(data)) return null;
  for (const conversation of data) {
    if (!isRecord(conversation)) continue;
    const participants = isRecord(conversation.participants)
      ? (conversation.participants as { data?: unknown }).data
      : undefined;
    const senders = isRecord(conversation.senders)
      ? (conversation.senders as { data?: unknown }).data
      : undefined;
    const candidates: unknown[] = [];
    if (Array.isArray(participants)) candidates.push(...participants);
    if (Array.isArray(senders)) candidates.push(...senders);
    for (const candidate of candidates) {
      if (!isRecord(candidate)) continue;
      const id = stringField(candidate.id);
      if (id !== participantId) continue;
      const displayName = stringField(candidate.name);
      if (!displayName) continue;
      return { displayName, profilePictureUrl: null };
    }
  }
  return null;
}

export function parseMessengerProfileResponse(value: unknown): MessengerProfile | null {
  if (!isRecord(value)) return null;
  if ("error" in value) return null;

  const directName = stringField(value.name);
  const firstName = stringField(value.first_name);
  const lastName = stringField(value.last_name);
  const composed = [firstName, lastName].filter(Boolean).join(" ").trim() || null;
  const displayName = directName || composed;
  const profilePictureUrl = stringField(value.profile_pic);

  if (!displayName && !profilePictureUrl) return null;
  return { displayName, profilePictureUrl };
}

export async function fetchMessengerProfile(
  participantId: string,
  pageAccessToken: string,
  options: FetchMessengerProfileOptions = {},
): Promise<MessengerProfile | null> {
  const trimmedId = participantId?.trim();
  const trimmedToken = pageAccessToken?.trim();
  if (!trimmedId || !trimmedToken) return null;

  const fetchFn = options.fetchFn || fetch;
  const timeoutMs = options.timeoutMs ?? 10000;

  // Step 1: try the direct profile endpoint. Often refused by Meta post-2018
  // because pages need an active conversation policy grant to read it. Returns
  // null silently on refusal so we can try the conversations fallback below.
  const direct = await callGraph(
    `${getMetaApiVersion()}/${encodeURIComponent(trimmedId)}`,
    { fields: "name,profile_pic", access_token: trimmedToken },
    fetchFn,
    timeoutMs,
    (json) => parseMessengerProfileResponse(json),
  );
  if (direct) return direct;

  // Step 2: fall back to /me/conversations?user_id=... — this works when the
  // page has an active thread with the user even if the direct endpoint is
  // refused, because the participants are exposed in the conversation context.
  return callGraph(
    `${getMetaApiVersion()}/me/conversations`,
    {
      user_id: trimmedId,
      fields: "participants,senders,id",
      access_token: trimmedToken,
    },
    fetchFn,
    timeoutMs,
    (json) => parseConversationsParticipantResponse(json, trimmedId),
  );
}

async function callGraph<T>(
  path: string,
  params: Record<string, string>,
  fetchFn: typeof fetch,
  timeoutMs: number,
  parser: (json: unknown) => T | null,
): Promise<T | null> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const url = new URL(`https://graph.facebook.com/${path}`);
    for (const [key, value] of Object.entries(params)) {
      if (value) url.searchParams.set(key, value);
    }
    const response = await fetchFn(url.toString(), {
      cache: "no-store",
      signal: controller.signal,
    });
    if (!response.ok) return null;
    const json = (await response.json()) as unknown;
    return parser(json);
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

function stringField(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function isMeaningfulString(value: string | null): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}
