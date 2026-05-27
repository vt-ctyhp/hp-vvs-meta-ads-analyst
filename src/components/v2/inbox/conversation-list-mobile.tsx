"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

import type { MetaInboxMobileConversationItem } from "@/lib/meta-inbox-queue-view";

/**
 * Mobile conversation list — full-screen card list with search.
 *
 * Each row links to /m/inbox/<id> for the detail view. Needs-reply
 * rows show the action marker.
 *
 * Search is client-side over name + body. Server-side full-text search
 * is a Phase 11 polish.
 */

type Props = {
  items: MetaInboxMobileConversationItem[];
};

export function ConversationListMobile({ items: conversations }: Props) {
  const [query, setQuery] = useState("");

  const items = useMemo<MetaInboxMobileConversationItem[]>(() => {
    const q = query.trim().toLowerCase();
    const filtered = q
      ? conversations.filter(
          (item) =>
            item.sender.toLowerCase().includes(q) ||
            item.preview.toLowerCase().includes(q) ||
            item.queueCategoryKey.toLowerCase().includes(q) ||
            item.sourceChannel.toLowerCase().includes(q),
        )
      : conversations;
    return filtered.sort((a, b) => {
      const aTime = a.timestamp ? Date.parse(a.timestamp) : 0;
      const bTime = b.timestamp ? Date.parse(b.timestamp) : 0;
      return bTime - aTime;
    });
  }, [conversations, query]);

  return (
    <div className="space-y-3">
      <div className="sticky top-14 z-20 -mx-4 border-b border-hp-rule bg-hp-foundation/95 px-4 py-2 backdrop-blur">
        <input
          type="search"
          placeholder="Search by name or message…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="h-11 w-full border border-hp-rule bg-hp-card px-4 text-sm text-hp-ink placeholder:text-hp-muted focus:border-hp-pink focus:outline-none"
        />
      </div>

      {items.length === 0 ? (
        <div className="border border-dashed border-hp-rule bg-hp-card/60 px-4 py-10 text-center text-sm text-hp-muted">
          {query ? "No matches." : "Inbox is clear."}
        </div>
      ) : (
        <ul className="space-y-2">
          {items.map((item) => (
            <li key={item.href}>
              <Link
                href={item.href}
                className={`relative block border border-hp-rule bg-hp-card px-4 py-3 transition-colors hover:bg-hp-inset ${
                  item.status === "Needs reply" ? "pl-[18px]" : ""
                }`}
              >
                {item.status === "Needs reply" ? (
                  <span aria-hidden className="absolute top-0 bottom-0 left-0 w-[3px] bg-hp-pink" />
                ) : null}
                <div className="flex items-start gap-3">
                  <PlatformBadge
                    platform={item.platform}
                    kind={item.type}
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="line-clamp-1 font-[family-name:var(--font-title)] text-base font-medium text-hp-ink">
                        {item.sender}
                      </span>
                      <span className="ml-auto text-[10px] tabular-nums text-hp-muted">
                        {relTime(item.timestamp)}
                      </span>
                    </div>
                    <p className="line-clamp-2 pt-0.5 text-[13px] text-hp-body">
                      {item.preview}
                    </p>
                    {item.status === "Needs reply" ? (
                      <span className="mt-1 inline-flex h-[22px] items-center bg-hp-pink px-2 text-[10px] font-medium text-hp-foundation">
                        Needs reply
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
  kind: "message" | "comment";
}) {
  const platformLabel = platform === "facebook" ? "FB" : "IG";
  const platformStyle = platformBadgeStyle(platform, kind);

  return (
    <div className="flex flex-col items-center gap-0.5">
      <span
        className={`inline-flex h-7 w-7 items-center justify-center border text-[9px] font-semibold ${platformStyle}`}
      >
        {platformLabel}
      </span>
      <span className="text-[9px] uppercase tracking-[0.14em] text-hp-muted">
        {kind === "message" ? "Msg" : "Cmt"}
      </span>
    </div>
  );
}

function platformBadgeStyle(platform: string, kind: "message" | "comment") {
  if (kind === "comment") {
    return "border-hp-rule bg-hp-inset text-hp-muted";
  }
  return platform === "facebook"
    ? "border-signal-info bg-signal-info-bg text-signal-info"
    : "border-hp-pink bg-hp-card text-hp-pink";
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
