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
  ],
  convert: [
    { href: "/convert", label: "Convert Home", permission: "view_dashboard" },
    { href: "/convert/inbox", label: "Inbox", permission: "view_inbox" },
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
      className="flex items-center gap-1 text-sm font-medium"
    >
      {rooms.map((room) => {
        const visibleItems = ROOM_ITEMS[room].filter((item) =>
          permissions.includes(item.permission),
        );
        const href = visibleItems[0]?.href ?? ROOM_PATHS[room];
        const isActive =
          visibleItems.some((item) => pathname === item.href || pathname.startsWith(`${item.href}/`)) ||
          ROOM_ACTIVE_PREFIXES[room].some(
            (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
          );
        return (
          <div key={room} className="group relative">
            <Link
              href={href}
              aria-current={isActive ? "page" : undefined}
              title={ROOM_TAGLINE[room]}
              className={[
                "inline-flex h-10 items-center gap-2 rounded-full px-4 transition-colors",
                isActive
                  ? "bg-[var(--workspace-accent,#E14B7B)] text-white shadow-sm"
                  : "text-stone-700 hover:bg-stone-200/70 hover:text-stone-900",
              ].join(" ")}
            >
              <span>{ROOM_LABEL[room]}</span>
              <ChevronDown size={14} aria-hidden />
            </Link>
            {visibleItems.length ? (
              <div className="invisible absolute left-0 top-full z-50 mt-2 w-56 rounded-lg border border-stone-200 bg-white p-1 opacity-0 shadow-lg transition group-hover:visible group-hover:opacity-100 group-focus-within:visible group-focus-within:opacity-100">
                {visibleItems.map((item) => {
                  const itemActive =
                    pathname === item.href || pathname.startsWith(`${item.href}/`);
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      aria-current={itemActive ? "page" : undefined}
                      className={[
                        "block rounded-md px-3 py-2 text-sm transition-colors",
                        itemActive
                          ? "bg-stone-900 text-stone-50"
                          : "text-stone-700 hover:bg-stone-100 hover:text-stone-950",
                      ].join(" ")}
                    >
                      {item.label}
                    </Link>
                  );
                })}
              </div>
            ) : null}
          </div>
        );
      })}
    </nav>
  );
}
