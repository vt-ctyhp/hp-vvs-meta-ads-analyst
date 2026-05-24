import { redirect } from "next/navigation";

import { resolveLandingPath } from "@/lib/permission-routing";
import { getServerAccessProfile } from "@/lib/server-route-auth";

export const dynamic = "force-dynamic";

/**
 * Root entry — Phase 12 cutover landing.
 *
 * Routes every authenticated user to the room their roles open by default:
 *   - Admin / Marketing / read-only      → /analyst
 *   - Sales-frontline                    → /m/inbox
 *   - View-inbox-only roles              → /m/inbox
 *   - No roles                           → /no-access
 *
 * Unauthenticated visitors are pushed to /login with a `next=/` hint so the
 * resolver runs again after they sign in. (The hint is `/` itself rather
 * than a specific room so we don't have to know the user's role yet.)
 *
 * This page never renders UI — every code path ends in a redirect.
 */
export default async function Root() {
  const profile = await getServerAccessProfile();

  if (!profile?.authenticated) {
    redirect("/login?next=%2F");
  }

  if (!profile.active || profile.missingAppProfile) {
    redirect("/no-access");
  }

  redirect(resolveLandingPath(profile.roles));
}
