"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import type { Room } from "@/lib/permission-routing";
import { ROOM_PATHS } from "@/lib/permission-routing";

type Props = {
  /** Rooms visible to the current user, in display order. */
  rooms: Room[];
};

const ROOM_LABEL: Record<Room, string> = {
  optimize: "Optimize",
  convert: "Convert",
  operate: "Operate",
};

const ROOM_TAGLINE: Record<Room, string> = {
  optimize: "Spot what's working and what's failing.",
  convert: "Turn customer interest into bookings.",
  operate: "Keep the pipes flowing.",
};

export function WorkspaceNav({ rooms }: Props) {
  const pathname = usePathname() ?? "";

  return (
    <nav
      aria-label="Workspace rooms"
      className="flex items-center gap-1 text-sm font-medium"
    >
      {rooms.map((room) => {
        const href = ROOM_PATHS[room];
        const isActive = pathname === href || pathname.startsWith(`${href}/`);
        return (
          <Link
            key={room}
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
          </Link>
        );
      })}
    </nav>
  );
}
