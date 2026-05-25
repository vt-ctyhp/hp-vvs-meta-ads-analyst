/**
 * Workspace layout for the 3-room IA (/analyst, /convert, /operate).
 *
 * Server-side responsibilities:
 *   - Resolve the current user's roles and permissions.
 *   - Redirect unauthenticated users to /sign-in with a `next` hint.
 *   - Redirect authenticated-but-no-access users to /no-access.
 *   - Redirect users whose roles do not include any workspace room to their
 *     correct landing path (e.g. sales-frontline → /m/inbox).
 *   - Render the new shell: workspace nav, health pill, identity menu.
 *
 * Each room page renders its own status sentence + signal strip + body.
 */

import { redirect } from "next/navigation";

import { HealthPill } from "@/components/v2/health-pill";
import { IdentityMenu } from "@/components/v2/identity-menu";
import { WorkspaceNav } from "@/components/v2/workspace-nav";
import { firstWorkspaceHref, resolveLandingPath, roomsForRoles } from "@/lib/permission-routing";
import { getServerAccessProfile } from "@/lib/server-route-auth";

export const dynamic = "force-dynamic";

export default async function WorkspaceLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const profile = await getServerAccessProfile();

  if (!profile?.authenticated) {
    // Defer to the page's own requirePagePermission so the /login?next=…
    // redirect carries the actual originating path. Layouts don't receive
    // the pathname, so we'd otherwise have to hardcode one here.
    return <>{children}</>;
  }

  if (!profile.active || profile.missingAppProfile) {
    redirect("/no-access");
  }

  const rooms = roomsForRoles(profile.roles);
  if (rooms.length === 0) {
    // Sales-frontline or any role with no workspace permissions: send them to
    // the landing path their roles do open (mobile inbox, or no-access).
    redirect(resolveLandingPath(profile.roles));
  }
  const homeHref = firstWorkspaceHref(rooms, profile.permissions);

  return (
    <div className="min-h-screen text-hp-body">
      <header className="sticky top-0 z-30 border-b border-hp-rule bg-hp-card/90 backdrop-blur">
        <div className="mx-auto flex min-h-16 max-w-7xl flex-wrap items-center gap-x-4 gap-y-3 px-4 py-3 md:h-16 md:flex-nowrap md:px-6 md:py-0">
          <a
            href={homeHref}
            className="font-[family-name:var(--font-title)] text-lg font-medium tracking-tight text-hp-ink"
          >
            HP / VVS
          </a>
          <WorkspaceNav rooms={rooms} permissions={profile.permissions} />
          <div className="ml-auto flex shrink-0 items-center gap-2">
            <HealthPill />
            <IdentityMenu
              email={profile.email}
              fullName={profile.fullName}
              initials={profile.initials}
              roles={profile.roles}
            />
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-7xl px-6 py-6">{children}</main>
    </div>
  );
}
