/**
 * Sales mobile inbox shell — /m/inbox/*
 *
 * No workspace nav, no room switching. Just a slim top bar with brand,
 * identity menu, sign-out. Designed for phone-first use; the same layout
 * works on tablet and desktop with more horizontal whitespace.
 *
 * Auth: anyone with view_inbox can reach this shell. It renders its own
 * slim chrome and is independent of the workspace nav.
 */

import { redirect } from "next/navigation";

import { IdentityMenu } from "@/components/v2/identity-menu";
import { hasPermission } from "@/lib/access-control";
import { getServerAccessProfile } from "@/lib/server-route-auth";

export const dynamic = "force-dynamic";

export default async function MobileInboxLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const profile = await getServerAccessProfile();
  if (!profile?.authenticated) {
    redirect("/login?next=/m/inbox");
  }
  if (!profile.active || profile.missingAppProfile) {
    redirect("/no-access");
  }
  if (!hasPermission(profile.roles, "view_inbox")) {
    redirect("/no-access");
  }

  return (
    <div className="min-h-screen text-hp-body">
      <header className="sticky top-0 z-30 border-b border-hp-rule bg-hp-card/90 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-3xl items-center gap-3 px-4">
          <span className="font-[family-name:var(--font-title)] text-2xl font-medium tracking-tight text-hp-ink">
            Inbox
          </span>
          <div className="ml-auto">
            <IdentityMenu
              email={profile.email}
              fullName={profile.fullName}
              initials={profile.initials}
              roles={profile.roles}
              compact
            />
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-3xl px-4 py-4">{children}</main>
    </div>
  );
}
