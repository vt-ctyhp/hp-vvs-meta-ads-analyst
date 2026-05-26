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
  if (!participantId?.trim() || !pageAccessToken?.trim()) return null;

  const fetchFn = options.fetchFn || fetch;
  const timeoutMs = options.timeoutMs ?? 10000;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const url = new URL(
      `https://graph.facebook.com/${getMetaApiVersion()}/${encodeURIComponent(participantId.trim())}`,
    );
    url.searchParams.set("fields", "name,profile_pic");
    url.searchParams.set("access_token", pageAccessToken.trim());

    const response = await fetchFn(url.toString(), {
      cache: "no-store",
      signal: controller.signal,
    });
    if (!response.ok) return null;
    const json = (await response.json()) as unknown;
    return parseMessengerProfileResponse(json);
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

function stringField(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function isMeaningfulString(value: string | null): boolean {
  return typeof value === "string" && value.trim().length > 0;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}
