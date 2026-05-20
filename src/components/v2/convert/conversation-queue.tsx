"use client";

import { useMemo, useState } from "react";

import type { SocialInboxThread, SocialInboxComment } from "@/lib/social-inbox";

/**
 * Conversation queue for the Convert room.
 *
 * Merges social inbox threads (DMs) and comments into a single sorted
 * list. Each row shows platform badge, customer/author name, message
 * preview, unread chip, and age.
 *
 * Click a row → in v1 just highlights it. The full conversation detail
 * + AI reply composer lands with Phase 8 (mobile inbox shell) which
 * reuses these primitives.
 */

type Props = {
  threads: SocialInboxThread[];
  comments: SocialInboxComment[];
};

type Item =
  | { kind: "thread"; data: SocialInboxThread; at: string | null }
  | { kind: "comment"; data: SocialInboxComment; at: string | null };

export function ConversationQueue({ threads, comments }: Props) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [query, setQuery] = useState("");

  const items = useMemo<Item[]>(() => {
    const merged: Item[] = [
      ...threads.map<Item>((t) => ({ kind: "thread", data: t, at: t.last_message_at })),
      ...comments.map<Item>((c) => ({ kind: "comment", data: c, at: c.created_time })),
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
    <section
      aria-label="Conversation queue"
      className="overflow-hidden rounded-xl border border-stone-200 bg-white"
    >
      <header className="flex items-center gap-2 border-b border-stone-200 bg-stone-50 px-3 py-2">
        <span className="text-[10px] uppercase tracking-wider text-stone-600">
          Conversations
        </span>
        <input
          type="search"
          placeholder="Search by name or text…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="ml-auto h-8 w-56 rounded-md border border-stone-300 bg-white px-2 text-xs text-stone-800 focus:outline-none focus:ring-2 focus:ring-stone-400"
        />
        <span className="text-[11px] text-stone-500 tabular-nums">{items.length}</span>
      </header>
      {items.length === 0 ? (
        <p className="px-4 py-8 text-center text-sm text-stone-600">
          {query
            ? "No matches."
            : "No conversations in this environment yet. Trigger an inbox sync from Operate."}
        </p>
      ) : (
        <ul className="max-h-[520px] divide-y divide-stone-100 overflow-auto">
          {items.map((item) => {
            const id =
              item.kind === "thread"
                ? `t:${item.data.id}`
                : `c:${item.data.id}`;
            const isActive = id === selectedId;
            return (
              <li key={id}>
                <button
                  type="button"
                  onClick={() => setSelectedId(id)}
                  className={[
                    "flex w-full items-start gap-3 px-3 py-2 text-left transition-colors",
                    isActive ? "bg-stone-100" : "hover:bg-stone-50",
                  ].join(" ")}
                >
                  <PlatformBadge
                    platform={item.kind === "thread" ? item.data.platform : item.data.platform}
                    kind={item.kind}
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="line-clamp-1 text-sm font-medium text-stone-900">
                        {item.kind === "thread"
                          ? item.data.participant_name ?? "Unknown"
                          : item.data.author_name ?? "Comment"}
                      </span>
                      {item.kind === "thread" && item.data.unread_count > 0 ? (
                        <span className="inline-flex h-5 items-center rounded-full bg-[#E14B7B] px-2 text-[10px] font-medium text-white">
                          {item.data.unread_count}
                        </span>
                      ) : null}
                      <span className="ml-auto text-[10px] text-stone-500 tabular-nums">
                        {relTime(item.at)}
                      </span>
                    </div>
                    <p className="line-clamp-2 text-[11px] text-stone-600">
                      {item.kind === "thread"
                        ? item.data.snippet ?? ""
                        : item.data.body ?? ""}
                    </p>
                  </div>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </section>
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
        className={`inline-flex h-5 w-7 items-center justify-center rounded-full border text-[10px] font-semibold ${platformStyle}`}
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
