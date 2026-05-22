import { redirect } from "next/navigation";

import { hasPermission } from "@/lib/access-control";
import { firstPermittedAppPath, hasInternalAppAccess } from "@/lib/app-routes";
import { getServerAccessProfile } from "@/lib/server-route-auth";

export const dynamic = "force-dynamic";

export default async function OperateRedirectPage() {
  const profile = await getServerAccessProfile();

  if (!profile?.authenticated) {
    redirect("/login?next=/operate");
  }

  if (!hasInternalAppAccess(profile)) {
    redirect("/no-access");
  }

  if (hasPermission(profile.roles, "view_backfill") || hasPermission(profile.roles, "manage_backfill")) {
    redirect("/operate/pipelines");
  }

  if (hasPermission(profile.roles, "view_users")) {
    redirect("/operate/users");
  }

  redirect(firstPermittedAppPath(profile.permissions) || "/no-access");
}
