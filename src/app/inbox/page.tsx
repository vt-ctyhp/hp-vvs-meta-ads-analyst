import { redirect } from "next/navigation";

import { hasPermission } from "@/lib/access-control";
import { firstPermittedAppPath, hasInternalAppAccess } from "@/lib/app-routes";
import { getServerAccessProfile } from "@/lib/server-route-auth";

export const dynamic = "force-dynamic";

export default async function InboxRedirectPage() {
  const profile = await getServerAccessProfile();

  if (!profile?.authenticated) {
    redirect("/login?next=/inbox");
  }

  if (!hasInternalAppAccess(profile)) {
    redirect("/no-access");
  }

  if (hasPermission(profile.roles, "view_dashboard")) {
    redirect("/convert/inbox");
  }

  if (hasPermission(profile.roles, "view_inbox")) {
    redirect("/m/inbox");
  }

  redirect(firstPermittedAppPath(profile.permissions) || "/no-access");
}
