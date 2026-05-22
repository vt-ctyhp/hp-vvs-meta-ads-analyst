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
      className="overflow-hidden border border-hp-rule bg-hp-card"
    >
      <header className="flex items-center gap-2 border-b border-hp-rule bg-hp-inset px-4 py-3">
        <span className="text-[10px] uppercase tracking-[0.14em] text-hp-muted">
          Conversations
        </span>
        <input
          type="search"
          placeholder="Search by name or text…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="ml-auto h-8 w-56 border border-hp-rule bg-hp-card px-2 text-xs text-hp-ink focus:border-hp-pink focus:outline-none"
        />
        <span className="text-[11px] text-hp-muted tabular-nums">{items.length}</span>
      </header>
      {items.length === 0 ? (
        <p className="px-4 py-8 text-center text-sm text-hp-muted">
          {query
            ? "No matches."
            : "No conversations in this environment yet. Trigger an inbox sync from Operate."}
        </p>
      ) : (
        <ul className="max-h-[520px] divide-y divide-hp-rule-soft overflow-auto">
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
                    isActive ? "bg-hp-inset" : "hover:bg-hp-inset",
                  ].join(" ")}
                >
                  <PlatformBadge
                    platform={item.kind === "thread" ? item.data.platform : item.data.platform}
                    kind={item.kind}
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="line-clamp-1 font-[family-name:var(--font-title)] text-base text-hp-ink">
                        {item.kind === "thread"
                          ? item.data.participant_name ?? "Unknown"
                          : item.data.author_name ?? "Comment"}
                      </span>
                      {item.kind === "thread" && item.data.unread_count > 0 ? (
                        <span className="inline-flex h-[22px] items-center bg-hp-pink px-2 text-[10px] font-medium text-hp-foundation">
                          {item.data.unread_count}
                        </span>
                      ) : null}
                      <span className="ml-auto text-[10px] text-hp-muted tabular-nums">
                        {relTime(item.at)}
                      </span>
                    </div>
                    <p className="line-clamp-2 text-[11px] text-hp-body">
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
      ? "border-signal-info bg-signal-info-bg text-signal-info"
      : "border-hp-pink bg-hp-card text-hp-pink";
  return (
    <div className="flex flex-col items-center gap-0.5">
      <span
        className={`inline-flex h-6 w-8 items-center justify-center border text-[10px] font-semibold ${platformStyle}`}
      >
        {platformLabel}
      </span>
      <span className="text-[9px] uppercase tracking-[0.14em] text-hp-muted">
        {kind === "thread" ? "Msg" : "Cmt"}
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
