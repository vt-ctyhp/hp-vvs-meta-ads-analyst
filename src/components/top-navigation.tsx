"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  BarChart3,
  Brain,
  Database,
  Gauge,
  Inbox,
  LogIn,
  Users,
} from "lucide-react";
import { useEffect, useState } from "react";

import { type AppPermission } from "@/lib/access-control";
import { createBrowserClient } from "@/lib/supabase";

const NAV_ITEMS = [
  { href: "/", label: "Dashboard", icon: BarChart3, permission: "view_dashboard" },
  {
    href: "/creative-analysis",
    label: "Creative Analysis",
    icon: Gauge,
    permission: "view_creative_analysis",
  },
  { href: "/analysis", label: "AI Analysis", icon: Brain, permission: "view_ai_analysis" },
  { href: "/inbox", label: "Inbox", icon: Inbox, permission: "view_inbox" },
  { href: "/admin/backfill", label: "Backfill", icon: Database, permission: "view_backfill" },
  { href: "/users", label: "Users", icon: Users, permission: "view_users" },
] satisfies Array<{
  href: string;
  label: string;
  icon: typeof BarChart3;
  permission: AppPermission;
}>;

type AccessProfile = {
  authenticated: boolean;
  email: string | null;
  fullName: string | null;
  permissions: AppPermission[];
};

export function TopNavigation() {
  const pathname = usePathname();
  const [profile, setProfile] = useState<AccessProfile | null>(null);

  useEffect(() => {
    let mounted = true;
    const supabase = createBrowserClient();

    async function loadProfile() {
      const { data } = await supabase.auth.getSession();
      const token = data.session?.access_token;
      if (!token) {
        if (mounted) {
          setProfile({
            authenticated: false,
            email: null,
            fullName: null,
            permissions: [],
          });
        }
        return;
      }

      const response = await fetch("/api/auth/me", {
        headers: { authorization: `Bearer ${token}` },
      });
      const payload = await response.json().catch(() => null);
      if (mounted && payload) setProfile(payload);
    }

    void loadProfile();
    const subscription = supabase.auth.onAuthStateChange(() => {
      void loadProfile();
    });

    return () => {
      mounted = false;
      subscription.data.subscription.unsubscribe();
    };
  }, []);

  async function signOut() {
    const supabase = createBrowserClient();
    await supabase.auth.signOut();
    setProfile({ authenticated: false, email: null, fullName: null, permissions: [] });
    window.location.assign("/login");
  }

  const visibleNavItems = profile?.authenticated
    ? NAV_ITEMS.filter((item) => profile.permissions.includes(item.permission))
    : [];

  return (
    <nav className="border-b border-hp-rule bg-hp-card/90 text-hp-body">
      <div className="mx-auto flex max-w-7xl flex-col gap-3 px-4 py-3 md:flex-row md:items-center md:justify-between md:px-8">
        <Link href="/" className="min-w-0">
          <div className="text-[10px] uppercase tracking-[0.18em] text-hp-muted">
            HP/VVS Meta Ads
          </div>
          <div className="mt-1 font-title text-xl leading-none text-hp-ink">
            AI Analyst
          </div>
        </Link>

        <div className="flex flex-wrap items-center gap-2">
          {visibleNavItems.map((item) => {
            const Icon = item.icon;
            const isActive =
              item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={isActive ? "page" : undefined}
                className={`flex h-10 items-center gap-2 border px-4 text-[11px] uppercase tracking-[0.14em] transition-colors ${
                  isActive
                    ? "border-hp-ink bg-hp-ink text-hp-foundation"
                    : "border-hp-rule text-hp-body hover:border-hp-ink hover:bg-hp-inset"
                }`}
              >
                <Icon size={15} />
                {item.label}
              </Link>
            );
          })}
          {profile?.authenticated ? (
            <button
              onClick={signOut}
              className="flex h-10 items-center px-2 text-sm text-hp-muted underline-offset-4 transition-colors hover:text-hp-ink hover:underline"
            >
              Sign out
            </button>
          ) : (
            <Link
              href={`/login?next=${encodeURIComponent(pathname || "/")}`}
              className={`flex h-10 items-center gap-2 border px-4 text-[11px] uppercase tracking-[0.14em] transition-colors ${
                pathname.startsWith("/login")
                  ? "border-hp-ink bg-hp-ink text-hp-foundation"
                  : "border-hp-rule text-hp-body hover:border-hp-ink hover:bg-hp-inset"
              }`}
            >
              <LogIn size={15} />
              Sign In
            </Link>
          )}
        </div>
      </div>
    </nav>
  );
}
