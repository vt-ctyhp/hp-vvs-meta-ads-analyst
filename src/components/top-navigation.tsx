"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  BarChart3,
  Brain,
  ClipboardCheck,
  Database,
  Gauge,
  Inbox,
  LineChart as LineChartIcon,
  MousePointerClick,
  Target,
  Users,
  X,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";

import {
  APP_NAV_ROUTES,
  APP_ROUTE_GROUP_ORDER,
  type AppRoute,
} from "@/lib/app-routes";
import { type AppPermission, type UserRole } from "@/lib/access-control";
import { AUTH } from "@/lib/glossary";
import { createBrowserClient } from "@/lib/supabase";
import type { SystemHealthSnapshot } from "@/lib/system-health";

const NAV_ICONS: Record<string, typeof BarChart3> = {
  "/": BarChart3,
  "/analyst": LineChartIcon,
  "/review": ClipboardCheck,
  "/outcomes": Target,
  "/creative-analysis": Gauge,
  "/analysis": Brain,
  "/website-funnel": MousePointerClick,
  "/inbox": Inbox,
  "/admin/backfill": Database,
  "/users": Users,
};

const SYSTEM_HEALTH_POLL_MS = 90_000;

type AccessProfile = {
  authenticated: boolean;
  email: string | null;
  fullName: string | null;
  initials: string | null;
  roles: UserRole[];
  permissions: AppPermission[];
};

export function TopNavigation() {
  const pathname = usePathname();
  const [profile, setProfile] = useState<AccessProfile | null>(null);
  const [health, setHealth] = useState<SystemHealthSnapshot | null>(null);
  const [openMenu, setOpenMenu] = useState<"health" | "identity" | null>(null);
  const closeMenu = () => setOpenMenu(null);
  const isPublicAuthPath =
    pathname === "/login" || pathname === "/sign-in" || pathname === "/no-access";
  // The 3-room workspace IA (v2) renders its own shell. Hide the legacy nav on
  // those routes so we don't show double chrome. The sales mobile shell is
  // also self-contained.
  const isV2Path =
    pathname === "/optimize" ||
    pathname.startsWith("/optimize/") ||
    pathname === "/convert" ||
    pathname.startsWith("/convert/") ||
    pathname === "/operate" ||
    pathname.startsWith("/operate/") ||
    pathname.startsWith("/m/");
  if (isV2Path) return null;

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

  useEffect(() => {
    if (!profile?.authenticated) return;
    let mounted = true;
    async function load() {
      try {
        const response = await fetch("/api/system-health", { cache: "no-store" });
        if (!response.ok) return;
        const payload = (await response.json()) as SystemHealthSnapshot;
        if (mounted) setHealth(payload);
      } catch {
        // Silent: shell indicator stays in last-known state.
      }
    }
    void load();
    const interval = window.setInterval(load, SYSTEM_HEALTH_POLL_MS);
    return () => {
      mounted = false;
      window.clearInterval(interval);
    };
  }, [profile?.authenticated]);

  useEffect(() => {
    if (!openMenu) return;
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") closeMenu();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [openMenu]);

  async function signOut() {
    const supabase = createBrowserClient();
    await fetch("/api/auth/session", { method: "DELETE" }).catch(() => null);
    await supabase.auth.signOut();
    setProfile({
      authenticated: false,
      email: null,
      fullName: null,
      initials: null,
      roles: [],
      permissions: [],
    });
    setHealth(null);
    window.location.assign("/login");
  }

  if (isPublicAuthPath || !profile?.authenticated) {
    return null;
  }

  const visibleNavItems = APP_NAV_ROUTES.filter((item) =>
    profile.permissions.includes(item.permission),
  );

  // Group items by their declared group, preserving APP_NAV_ROUTES order
  // within each group. Empty groups (user has no permission in them) are
  // dropped so we don't render a phantom separator next to nothing.
  const groupedNavItems = APP_ROUTE_GROUP_ORDER.map((group) => ({
    group,
    items: visibleNavItems.filter((item) => item.group === group),
  })).filter((bucket) => bucket.items.length > 0);

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

        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
          {groupedNavItems.map((bucket, bucketIndex) => (
            <div key={bucket.group} className="flex flex-wrap items-center gap-1.5">
              {bucketIndex > 0 ? (
                <span
                  aria-hidden
                  className="mx-1 hidden h-5 w-px self-center bg-hp-rule lg:inline-block"
                />
              ) : null}
              {bucket.items.map((item) => (
                <NavLink
                  key={item.href}
                  item={item}
                  pathname={pathname}
                />
              ))}
            </div>
          ))}

          <span aria-hidden className="hidden flex-1 lg:block" />

          <HealthIndicator
            health={health}
            open={openMenu === "health"}
            onToggle={() => setOpenMenu(openMenu === "health" ? null : "health")}
            onClose={closeMenu}
          />
          <IdentityMenu
            profile={profile}
            open={openMenu === "identity"}
            onToggle={() => setOpenMenu(openMenu === "identity" ? null : "identity")}
            onClose={closeMenu}
            onSignOut={signOut}
          />
        </div>
      </div>
    </nav>
  );
}

function NavLink({
  item,
  pathname,
}: {
  item: AppRoute;
  pathname: string;
}) {
  const Icon = NAV_ICONS[item.href];
  const isActive =
    item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
  const isPlaceholder = item.placeholder === true;

  return (
    <Link
      key={item.href}
      href={item.href}
      aria-current={isActive ? "page" : undefined}
      title={isPlaceholder ? `${item.label} — coming soon` : undefined}
      className={`flex h-9 items-center gap-1.5 border px-3 text-[11px] uppercase tracking-[0.14em] transition-colors duration-150 ${
        isActive
          ? "border-hp-ink bg-hp-ink text-hp-foundation"
          : isPlaceholder
            ? "border-dashed border-hp-rule text-hp-muted hover:border-hp-ink hover:text-hp-body"
            : "border-hp-rule text-hp-body hover:border-hp-ink hover:bg-hp-inset"
      }`}
    >
      {Icon ? <Icon size={13} aria-hidden /> : null}
      <span>{item.label}</span>
      {isPlaceholder ? (
        <span
          aria-hidden
          className={`ml-1 border px-1 py-px text-[9px] tracking-[0.12em] ${
            isActive
              ? "border-hp-foundation/40 text-hp-foundation/80"
              : "border-hp-muted/40 text-hp-muted"
          }`}
        >
          Soon
        </span>
      ) : null}
    </Link>
  );
}

// ── Health indicator ────────────────────────────────────────────────────────

function HealthIndicator({
  health,
  open,
  onToggle,
  onClose,
}: {
  health: SystemHealthSnapshot | null;
  open: boolean;
  onToggle: () => void;
  onClose: () => void;
}) {
  const status = health?.status ?? "ok";
  const ringRef = useRef<HTMLDivElement | null>(null);
  const dotColor =
    status === "critical"
      ? "bg-[#8D2E2E]"
      : status === "warning"
        ? "bg-[#8B5B19]"
        : "bg-[#245D4D]";
  const tooltip =
    status === "critical"
      ? "System issue — needs attention"
      : status === "warning"
        ? "System warning"
        : "All systems operational";

  return (
    <div ref={ringRef} className="relative">
      <button
        type="button"
        onClick={onToggle}
        title={tooltip}
        aria-haspopup="dialog"
        aria-expanded={open}
        className="flex h-10 items-center gap-2 border border-hp-rule px-3 text-[11px] uppercase tracking-[0.14em] text-hp-body transition-colors duration-150 hover:border-hp-ink hover:bg-hp-inset"
      >
        <span aria-hidden className={`h-2 w-2 rounded-full ${dotColor}`} />
        <span>Health</span>
      </button>
      {open ? <HealthPanel health={health} onClose={onClose} /> : null}
    </div>
  );
}

function HealthPanel({
  health,
  onClose,
}: {
  health: SystemHealthSnapshot | null;
  onClose: () => void;
}) {
  return (
    <div
      role="dialog"
      aria-label="System health"
      className="absolute right-0 top-12 z-50 w-[360px] border border-hp-rule bg-hp-card shadow-[0_8px_24px_rgba(42,39,37,0.08)]"
    >
      <header className="flex items-start justify-between border-b border-hp-rule px-5 py-4">
        <div>
          <div className="text-[10px] uppercase tracking-[0.14em] text-hp-muted">
            System Health
          </div>
          <div className="mt-1 font-body text-sm text-hp-ink">
            {health
              ? statusHeadline(health.status)
              : "Checking system state…"}
          </div>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="text-hp-muted transition-colors hover:text-hp-ink"
        >
          <X size={14} />
        </button>
      </header>
      <div className="max-h-[60vh] overflow-y-auto px-5 py-4">
        {health?.latestSync.at ? (
          <p className="text-xs text-hp-muted">
            Last sync {formatRelative(health.latestSync.at)} ·{" "}
            <span className="text-hp-body">{health.latestSync.status ?? "—"}</span>
            {health.latestSync.trigger ? ` · ${health.latestSync.trigger}` : ""}
          </p>
        ) : (
          <p className="text-xs text-hp-muted">No sync history yet.</p>
        )}

        {health && health.issues.length === 0 ? (
          <p className="mt-4 text-sm text-hp-ink">
            All tracked signals are healthy. Nothing requires attention right now.
          </p>
        ) : null}

        {health?.issues.length ? (
          <ul className="mt-4 space-y-3">
            {health.issues.map((issue) => (
              <li
                key={`${issue.level}-${issue.title}`}
                className="border-l-[3px] pl-3"
                style={{
                  borderColor: issue.level === "critical" ? "#8D2E2E" : "#8B5B19",
                }}
              >
                <div className="text-[10px] uppercase tracking-[0.14em] text-hp-muted">
                  {issue.level === "critical" ? "Critical" : "Warning"}
                </div>
                <div className="mt-1 text-sm font-body text-hp-ink">{issue.title}</div>
                <div className="mt-1 text-xs leading-5 text-hp-body">{issue.detail}</div>
                {issue.link ? (
                  <Link
                    href={issue.link.href}
                    onClick={onClose}
                    className="mt-2 inline-block text-[11px] uppercase tracking-[0.14em] text-hp-ink underline-offset-4 hover:underline"
                  >
                    {issue.link.label} →
                  </Link>
                ) : null}
              </li>
            ))}
          </ul>
        ) : null}
      </div>
    </div>
  );
}

function statusHeadline(status: SystemHealthSnapshot["status"]) {
  if (status === "critical") return "Action required";
  if (status === "warning") return "One or more warnings";
  return "All systems operational";
}

function formatRelative(iso: string) {
  const diffMs = Date.now() - new Date(iso).getTime();
  const minutes = Math.round(diffMs / 60000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  return `${days}d ago`;
}

// ── Identity menu ───────────────────────────────────────────────────────────

function IdentityMenu({
  profile,
  open,
  onToggle,
  onClose,
  onSignOut,
}: {
  profile: AccessProfile;
  open: boolean;
  onToggle: () => void;
  onClose: () => void;
  onSignOut: () => Promise<void>;
}) {
  const initials = profile.initials || deriveInitials(profile.fullName, profile.email);
  return (
    <div className="relative">
      <button
        type="button"
        onClick={onToggle}
        aria-haspopup="dialog"
        aria-expanded={open}
        title={profile.fullName || profile.email || "Account"}
        className="flex h-10 items-center gap-2 border border-hp-rule px-3 text-[11px] uppercase tracking-[0.14em] text-hp-body transition-colors duration-150 hover:border-hp-ink hover:bg-hp-inset"
      >
        <span
          aria-hidden
          className="flex h-6 w-6 items-center justify-center bg-hp-ink text-[10px] uppercase tracking-[0.06em] text-hp-foundation"
        >
          {initials}
        </span>
        <span className="hidden max-w-[140px] truncate sm:inline">
          {profile.fullName || profile.email}
        </span>
      </button>
      {open ? (
        <div
          role="dialog"
          aria-label="Account"
          className="absolute right-0 top-12 z-50 w-[280px] border border-hp-rule bg-hp-card shadow-[0_8px_24px_rgba(42,39,37,0.08)]"
        >
          <header className="flex items-start justify-between border-b border-hp-rule px-5 py-4">
            <div className="min-w-0">
              <div className="text-[10px] uppercase tracking-[0.14em] text-hp-muted">
                Signed in as
              </div>
              <div className="mt-1 truncate font-body text-sm text-hp-ink">
                {profile.fullName || "—"}
              </div>
              <div className="truncate text-xs text-hp-muted">{profile.email || ""}</div>
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close"
              className="text-hp-muted transition-colors hover:text-hp-ink"
            >
              <X size={14} />
            </button>
          </header>
          {profile.roles.length ? (
            <div className="border-b border-hp-rule px-5 py-3">
              <div className="text-[10px] uppercase tracking-[0.14em] text-hp-muted">Roles</div>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {profile.roles.map((role) => (
                  <span
                    key={role}
                    className="border border-hp-rule px-2 py-0.5 text-[10px] uppercase tracking-[0.14em] text-hp-body"
                  >
                    {role}
                  </span>
                ))}
              </div>
            </div>
          ) : null}
          <button
            type="button"
            onClick={() => {
              onClose();
              void onSignOut();
            }}
            className="block w-full px-5 py-3 text-left text-[11px] uppercase tracking-[0.14em] text-hp-body transition-colors duration-150 hover:bg-hp-inset hover:text-hp-ink"
          >
            {AUTH.signOut}
          </button>
        </div>
      ) : null}
    </div>
  );
}

function deriveInitials(fullName: string | null, email: string | null) {
  const source = (fullName || email || "?").trim();
  if (!source) return "?";
  const parts = source.split(/\s+/);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}
