import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import type { AppPermission } from "./access-control";
import {
  AUTH_ACCESS_COOKIE,
  getAccessProfileForToken,
  type AccessProfile,
} from "./app-auth";
import {
  firstPermittedAppPath,
  getPostLoginDestination,
  hasInternalAppAccess,
  normalizeAppNextPath,
} from "./app-routes";

export async function getServerAccessProfile(): Promise<AccessProfile | null> {
  const accessToken = (await cookies()).get(AUTH_ACCESS_COOKIE)?.value;
  if (!accessToken) return null;
  return getAccessProfileForToken(accessToken);
}

export async function requirePagePermission(
  permission: AppPermission,
  currentPath: string,
) {
  const profile = await getServerAccessProfile();

  if (!profile?.authenticated) {
    redirect(loginPath(currentPath));
  }

  if (!hasInternalAppAccess(profile)) {
    redirect("/no-access");
  }

  if (!profile.permissions.includes(permission)) {
    redirect(firstPermittedAppPath(profile.permissions) || "/no-access");
  }

  return profile;
}

export async function redirectAuthenticatedUserFromLogin(requestedNext?: string | null) {
  const profile = await getServerAccessProfile();
  if (!profile?.authenticated) return;

  const destination = getPostLoginDestination(profile, requestedNext);
  redirect(destination || "/no-access");
}

export async function requireNoAccessProfile() {
  const profile = await getServerAccessProfile();

  if (!profile?.authenticated) {
    redirect(loginPath("/"));
  }

  const destination = getPostLoginDestination(profile);
  if (destination) {
    redirect(destination);
  }

  return profile;
}

function loginPath(next: string) {
  const safeNext = normalizeAppNextPath(next) || "/";
  return `/login?next=${encodeURIComponent(safeNext)}`;
}
