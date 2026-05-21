/**
 * Workspace layout for the 3-room IA (/optimize, /convert, /operate).
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
import { hasPermission } from "@/lib/access-control";
import { resolveLandingPath, roomsForRoles } from "@/lib/permission-routing";
import { getServerAccessProfile } from "@/lib/server-route-auth";

export const dynamic = "force-dynamic";

export default async function WorkspaceLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const profile = await getServerAccessProfile();

  if (!profile?.authenticated) {
    // /sign-in is the PRD-canonical name. /login is the route that exists today.
    // Phase 10/12 swaps the route name; until then, redirect to /login.
    redirect("/login?next=/optimize");
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

  return (
    <div className="min-h-screen bg-[#F8F4EE] text-stone-900">
      <header className="sticky top-0 z-30 border-b border-stone-200 bg-white/85 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-7xl items-center gap-4 px-6">
          <a
            href={rooms.includes("optimize") ? "/optimize" : `/${rooms[0]}`}
            className="font-[family-name:var(--font-title)] text-lg font-medium tracking-tight"
          >
            HP / VVS
          </a>
          <WorkspaceNav rooms={rooms} />
          <div className="ml-auto flex items-center gap-2">
            {hasPermission(profile.roles, "view_dashboard") ? (
              <CommandPaletteTrigger />
            ) : null}
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

function CommandPaletteTrigger() {
  // Phase 9 wires the full cmdk palette. For now this is a visual placeholder
  // matching the same hit area + keyboard hint slot the eventual palette will
  // claim, so we don't have to relayout when Phase 9 lands.
  return (
    <button
      type="button"
      title="Ask anything · Cmd+K (coming soon)"
      disabled
      className="hidden h-10 items-center gap-2 rounded-full border border-stone-300 bg-white px-3 text-xs text-stone-500 opacity-60 sm:inline-flex"
    >
      <span>Ask anything…</span>
      <kbd className="rounded border border-stone-300 bg-stone-50 px-1 py-0.5 text-[10px] font-medium text-stone-500">
        ⌘K
      </kbd>
    </button>
  );
}
