"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

import type { SocialInboxComment, SocialInboxThread } from "@/lib/social-inbox";

/**
 * Mobile conversation list — full-screen card list with search.
 *
 * Each row links to /m/inbox/<id> for the detail view. Snoozed
 * conversations show a snooze chip; unread DMs show the count.
 *
 * Search is client-side over name + body. Server-side full-text search
 * is a Phase 11 polish.
 */

type Props = {
  threads: SocialInboxThread[];
  comments: SocialInboxComment[];
};

type Item =
  | { kind: "thread"; data: SocialInboxThread; at: string | null; href: string }
  | { kind: "comment"; data: SocialInboxComment; at: string | null; href: string };

export function ConversationListMobile({ threads, comments }: Props) {
  const [query, setQuery] = useState("");

  const items = useMemo<Item[]>(() => {
    const merged: Item[] = [
      ...threads.map<Item>((t) => ({
        kind: "thread",
        data: t,
        at: t.last_message_at,
        href: `/m/inbox/t-${encodeURIComponent(t.thread_id)}`,
      })),
      ...comments.map<Item>((c) => ({
        kind: "comment",
        data: c,
        at: c.created_time,
        href: `/m/inbox/c-${encodeURIComponent(c.comment_id)}`,
      })),
    ];
    const q = query.trim().toLowerCase();
    const filtered = q
      ? merged.filter((item) => {
          if (item.kind === "thread") {
            return (
              item.data.participant_name?.toLowerCase().includes(q) ||
              item.data.snippet?.toLowerCase().includes(q)
            );
          }
          return (
            item.data.author_name?.toLowerCase().includes(q) ||
            item.data.body?.toLowerCase().includes(q)
          );
        })
      : merged;
    return filtered.sort((a, b) => {
      const aTime = a.at ? Date.parse(a.at) : 0;
      const bTime = b.at ? Date.parse(b.at) : 0;
      return bTime - aTime;
    });
  }, [threads, comments, query]);

  return (
    <div className="space-y-3">
      <div className="sticky top-14 z-20 -mx-4 border-b border-stone-200 bg-[#F8F4EE]/95 px-4 py-2 backdrop-blur">
        <input
          type="search"
          placeholder="Search by name or message…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="h-10 w-full rounded-full border border-stone-300 bg-white px-4 text-sm text-stone-800 placeholder:text-stone-400 focus:outline-none focus:ring-2 focus:ring-stone-400"
        />
      </div>

      {items.length === 0 ? (
        <div className="rounded-xl border border-dashed border-stone-300 bg-white/60 px-4 py-10 text-center text-sm text-stone-600">
          {query ? "No matches." : "Inbox is clear."}
        </div>
      ) : (
        <ul className="space-y-2">
          {items.map((item) => (
            <li key={item.href}>
              <Link
                href={item.href}
                className="block rounded-xl border border-stone-200 bg-white px-4 py-3 transition-colors hover:bg-stone-50 active:bg-stone-100"
              >
                <div className="flex items-start gap-3">
                  <PlatformBadge
                    platform={item.data.platform}
                    kind={item.kind}
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="line-clamp-1 text-sm font-medium text-stone-900">
                        {item.kind === "thread"
                          ? item.data.participant_name ?? "Unknown"
                          : item.data.author_name ?? "Comment"}
                      </span>
                      <span className="ml-auto text-[10px] tabular-nums text-stone-500">
                        {relTime(item.at)}
                      </span>
                    </div>
                    <p className="line-clamp-2 pt-0.5 text-[13px] text-stone-700">
                      {item.kind === "thread"
                        ? item.data.snippet ?? ""
                        : item.data.body ?? ""}
                    </p>
                    {item.kind === "thread" && item.data.unread_count > 0 ? (
                      <span className="mt-1 inline-flex h-5 items-center rounded-full bg-[#E14B7B] px-2 text-[10px] font-medium text-white">
                        {item.data.unread_count} unread
                      </span>
                    ) : null}
                  </div>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function PlatformBadge({
  platform,
  kind,
}: {
  platform: string;
  kind: "thread" | "comment";
}) {
  const platformLabel = platform === "facebook" ? "FB" : "IG";
  const platformStyle =
    platform === "facebook"
      ? "border-sky-200 bg-sky-50 text-sky-800"
      : "border-fuchsia-200 bg-fuchsia-50 text-fuchsia-800";
  return (
    <div className="flex flex-col items-center gap-0.5">
      <span
        className={`inline-flex h-6 w-9 items-center justify-center rounded-full border text-[10px] font-semibold ${platformStyle}`}
      >
        {platformLabel}
      </span>
      <span className="text-[9px] uppercase tracking-wider text-stone-500">
        {kind === "thread" ? "DM" : "Cmt"}
      </span>
    </div>
  );
}

function relTime(iso: string | null): string {
  if (!iso) return "—";
  const ms = Date.now() - Date.parse(iso);
  if (!Number.isFinite(ms) || ms < 0) return "now";
  const mins = Math.round(ms / 60_000);
  if (mins < 1) return "now";
  if (mins < 60) return `${mins}m`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.round(hours / 24);
  if (days < 7) return `${days}d`;
  return `${Math.round(days / 7)}w`;
}
