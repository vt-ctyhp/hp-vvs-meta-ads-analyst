import { getMetaApiVersion, getOptionalEnv } from "./env.ts";

export type InstagramMessagingCredentials = {
  igUserId: string;
  accessToken: string;
};

export type InstagramMessagingPage = {
  igUserId: string | null;
};

export function resolveInstagramMessagingCredentialsForPage(
  page: InstagramMessagingPage,
): InstagramMessagingCredentials | null {
  const accessToken = getOptionalEnv("META_INSTAGRAM_ACCESS_TOKEN");
  if (!accessToken) return null;

  const configuredIgUserId = getOptionalEnv("META_INSTAGRAM_USER_ID");
  const pageIgUserId = page.igUserId?.trim() || "";

  const igUserId = configuredIgUserId || pageIgUserId;
  if (!igUserId) return null;

  return { igUserId, accessToken };
}

export function buildInstagramGraphUrl(
  path: string,
  params: Record<string, string | undefined>,
  accessToken: string,
) {
  const url = new URL(
    `https://graph.instagram.com/${getMetaApiVersion()}/${path.replace(/^\//, "")}`,
  );
  url.searchParams.set("access_token", accessToken);
  for (const [key, value] of Object.entries(params)) {
    if (value) url.searchParams.set(key, value);
  }
  return url.toString();
}
