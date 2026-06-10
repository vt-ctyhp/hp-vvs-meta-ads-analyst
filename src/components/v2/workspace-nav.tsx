"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronDown } from "lucide-react";

import type { AppPermission } from "@/lib/access-control";
import type { Room } from "@/lib/permission-routing";
import { ROOM_PATHS } from "@/lib/permission-routing";

type Props = {
  /** Rooms visible to the current user, in display order. */
  rooms: Room[];
  permissions: readonly AppPermission[];
};

const ROOM_LABEL: Record<Room, string> = {
  analyst: "Analyst",
  convert: "Convert",
  operate: "Operate",
};

const ROOM_TAGLINE: Record<Room, string> = {
  analyst: "Spot what's working and what to analyze next.",
  convert: "Turn customer interest into bookings.",
  operate: "Keep the pipes flowing.",
};

const ROOM_ACTIVE_PREFIXES: Record<Room, string[]> = {
  analyst: ["/analyst", "/analysis"],
  convert: ["/convert"],
  operate: ["/operate"],
};

const ROOM_ITEMS: Record<
  Room,
  Array<{ href: string; label: string; permission: AppPermission }>
> = {
  analyst: [
    { href: "/analyst", label: "Analyst Home", permission: "view_dashboard" },
    {
      href: "/analyst/creative-analysis",
      label: "Creative Analysis",
      permission: "view_creative_analysis",
    },
    { href: "/analysis", label: "AI Analysis", permission: "view_ai_analysis" },
    { href: "/analyst/financial-audit", label: "Financial Audit", permission: "view_dashboard" },
    { href: "/analyst/change-log", label: "Change Log", permission: "view_change_log" },
  ],
  convert: [
    { href: "/convert", label: "Convert Home", permission: "view_dashboard" },
    { href: "/convert/inbox", label: "Inbox", permission: "view_inbox" },
    { href: "/convert/inbox/review", label: "Review", permission: "view_review" },
    { href: "/m/inbox/team", label: "Team", permission: "manage_inbox_state" },
  ],
  operate: [
    { href: "/operate/pipelines", label: "Pipelines", permission: "view_backfill" },
    { href: "/operate/coverage", label: "Coverage", permission: "view_backfill" },
    { href: "/operate/health", label: "Health", permission: "view_backfill" },
    { href: "/operate/users", label: "Users", permission: "view_users" },
  ],
};

export function WorkspaceNav({ rooms, permissions }: Props) {
  const pathname = usePathname() ?? "";

  return (
    <nav
      aria-label="Workspace rooms"
      className="order-last flex w-full min-w-0 items-center gap-1 overflow-x-auto text-sm font-medium md:order-none md:w-auto md:overflow-visible"
    >
      {rooms.map((room) => {
        const visibleItems = ROOM_ITEMS[room].filter((item) =>
          permissions.includes(item.permission),
        );
        const href = visibleItems[0]?.href ?? ROOM_PATHS[room];
        const activeItemHref = visibleItems
          .filter((item) => pathMatches(pathname, item.href))
          .sort((a, b) => b.href.length - a.href.length)[0]?.href;
        const isActive =
          Boolean(activeItemHref) ||
          ROOM_ACTIVE_PREFIXES[room].some(
            (prefix) => pathMatches(pathname, prefix),
          );
        return (
          <div key={room} className="group relative">
            <Link
              href={href}
              aria-current={isActive ? "page" : undefined}
              title={ROOM_TAGLINE[room]}
              className={[
                "inline-flex h-10 items-center gap-2 px-4 transition-colors",
                isActive
                  ? "bg-hp-pink text-hp-foundation"
                  : "text-hp-body hover:bg-hp-inset hover:text-hp-ink",
              ].join(" ")}
            >
              <span>{ROOM_LABEL[room]}</span>
              <ChevronDown size={14} aria-hidden />
            </Link>
            {visibleItems.length ? (
              <div className="absolute left-0 top-full z-50 hidden pt-2 group-hover:block group-focus-within:block">
                <div className="w-56 border border-hp-rule bg-hp-card p-1 shadow-lg">
                  {visibleItems.map((item) => {
                    const itemActive = activeItemHref === item.href;
                    return (
                      <Link
                        key={item.href}
                        href={item.href}
                        aria-current={itemActive ? "page" : undefined}
                        className={[
                          "block px-3 py-2 text-sm transition-colors",
                          itemActive
                            ? "bg-hp-ink text-hp-foundation"
                            : "text-hp-body hover:bg-hp-inset hover:text-hp-ink",
                        ].join(" ")}
                      >
                        {item.label}
                      </Link>
                    );
                  })}
                </div>
              </div>
            ) : null}
          </div>
        );
      })}
    </nav>
  );
}

function pathMatches(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(`${href}/`);
}
