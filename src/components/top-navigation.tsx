"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  BarChart3,
  Brain,
  Database,
  Gauge,
  Inbox,
  MousePointerClick,
  Users,
} from "lucide-react";
import { useEffect, useState } from "react";

import { APP_NAV_ROUTES } from "@/lib/app-routes";
import { type AppPermission } from "@/lib/access-control";
import { AUTH } from "@/lib/glossary";
import { createBrowserClient } from "@/lib/supabase";

const NAV_ICONS: Record<string, typeof BarChart3> = {
  "/": BarChart3,
  "/creative-analysis": Gauge,
  "/analysis": Brain,
  "/website-funnel": MousePointerClick,
  "/inbox": Inbox,
  "/admin/backfill": Database,
  "/users": Users,
};

type AccessProfile = {
  authenticated: boolean;
  email: string | null;
  fullName: string | null;
  permissions: AppPermission[];
};

export function TopNavigation() {
  const pathname = usePathname();
  const [profile, setProfile] = useState<AccessProfile | null>(null);
  const isPublicAuthPath = pathname === "/login" || pathname === "/no-access";

  useEffect(() => {
    let mounted = true;

    if (isPublicAuthPath) {
      return () => {
        mounted = false;
      };
    }

    const supabase = createBrowserClient();

    async function loadProfile() {
      const { data } = await supabase.auth.getSession();
      const token = data.session?.access_token;

      const response = await fetch("/api/auth/me", {
        headers: token ? { authorization: `Bearer ${token}` } : undefined,
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
  }, [isPublicAuthPath]);

  async function signOut() {
    const supabase = createBrowserClient();
    await fetch("/api/auth/session", { method: "DELETE" }).catch(() => null);
    await supabase.auth.signOut();
    setProfile({ authenticated: false, email: null, fullName: null, permissions: [] });
    window.location.assign("/login");
  }

  if (isPublicAuthPath || !profile?.authenticated) {
    return null;
  }

  const visibleNavItems = APP_NAV_ROUTES.filter((item) =>
    profile.permissions.includes(item.permission),
  );

  return (
    <nav className="relative z-50 border-b border-hp-rule bg-hp-card/90 text-hp-body">
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
            const Icon = NAV_ICONS[item.href];
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
          <button
            onClick={signOut}
            className="flex h-10 items-center px-2 text-sm text-hp-muted underline-offset-4 transition-colors hover:text-hp-ink hover:underline"
          >
            {AUTH.signOut}
          </button>
        </div>
      </div>
    </nav>
  );
}
