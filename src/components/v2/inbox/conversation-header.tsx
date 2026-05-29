"use client";

import { useEffect, useState } from "react";

import {
  resolveReplyWindowState,
  type ReplyWindowInput,
} from "../../../lib/social-inbox-ui-freshness.ts";
import {
  META_INBOX_QUEUE_CATEGORIES,
  metaInboxVocabularyLabel,
} from "../../../lib/meta-inbox-vocabulary.ts";
import type { MetaInboxQueueDisplayItem } from "../../../lib/meta-inbox-queue-view.ts";

// Resolve assignee names from /api/users once, cached across header mounts so
// switching conversations doesn't refetch. Falls back to the raw id if missing.
let cachedUserNames: Map<string, string> | null = null;
let inflightUserNames: Promise<Map<string, string>> | null = null;
function loadUserNames(): Promise<Map<string, string>> {
  if (cachedUserNames) return Promise.resolve(cachedUserNames);
  if (inflightUserNames) return inflightUserNames;
  inflightUserNames = fetch("/api/users")
    .then((r) => (r.ok ? r.json() : { users: [] }))
    .then((payload: { users?: { id: string; fullName: string | null }[] }) => {
      const map = new Map<string, string>();
      for (const u of payload.users || []) if (u.fullName) map.set(u.id, u.fullName);
      cachedUserNames = map;
      return map;
    })
    .catch(() => new Map<string, string>());
  return inflightUserNames;
}

type ConversationHeaderProps = {
  item: MetaInboxQueueDisplayItem | null;
  now?: Date | number;
  onOpenDetails?: () => void;
  onOpenAudit?: () => void;
  onOpenNotes?: () => void;
  onOpenQa?: () => void;
  onCloseConversation?: () => void;
};

export function ConversationHeader({
  item,
  now,
  onOpenDetails = noop,
  onOpenAudit = noop,
  onOpenNotes = noop,
  onOpenQa = noop,
  onCloseConversation = noop,
}: ConversationHeaderProps) {
  const [userNames, setUserNames] = useState<Map<string, string> | null>(cachedUserNames);
  useEffect(() => {
    let alive = true;
    void loadUserNames().then((map) => {
      if (alive) setUserNames(map);
    });
    return () => {
      alive = false;
    };
  }, []);

  if (!item) {
    return (
      <header
        data-component="conversation-header"
        className="border-b border-hp-rule bg-hp-card p-5"
      >
        <p className="text-[11px] uppercase tracking-[0.14em] text-hp-muted">
          Conversation Detail
        </p>
        <h2 className="mt-2 font-title text-[30px] leading-tight text-hp-ink">
          Select a thread
        </h2>
      </header>
    );
  }

  const categoryLabel = metaInboxVocabularyLabel(
    META_INBOX_QUEUE_CATEGORIES,
    item.queueCategoryKey,
  );
  const kind = item.type === "comment" ? "Comment" : "Message";
  const routingPercent =
    item.routingConfidence === null || item.routingConfidence === undefined
      ? "Routing unavailable"
      : `Routing ${Math.round(item.routingConfidence * 100)}%`;
  const sourcePlatform = platformOf(item.sourceChannel);
  const handle =
    sourcePlatform === "IG" && item.profile?.username ? `@${item.profile.username}` : null;
  const assignedId = item.inboxConversation?.assigned_user_id ?? null;
  const assignment = assignedId
    ? `Assigned to ${userNames?.get(assignedId) || assignedId}`
    : "Unassigned";
  const currentTime = resolveRenderTime(item, now);
  const inboundAge = formatInboundAge(item, currentTime);
  const replyWindow = resolveReplyWindowState(replyWindowInput(item), currentTime).label;

  return (
    <header
      data-component="conversation-header"
      className="border-b border-hp-rule bg-hp-card p-5"
    >
      <div className="flex min-w-0 flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] uppercase tracking-[0.14em] text-hp-muted">
            <span>
              {item.brand} · {item.channel} {kind} · {categoryLabel}
            </span>
            <span className="text-hp-rule">·</span>
            <span className="text-hp-ink">{routingPercent}</span>
            {item.routingExplanation ? (
              <span className="normal-case tracking-normal text-hp-muted">
                - <em>{item.routingExplanation}</em>
              </span>
            ) : null}
          </div>

          <div className="mt-3 flex min-w-0 flex-wrap items-baseline gap-x-3 gap-y-1">
            <h2 className="font-title break-words text-[22px] leading-tight text-hp-ink">
              {item.sender}
            </h2>
            {handle ? (
              <span
                data-handle-platform={sourcePlatform}
                className="text-sm italic leading-5 text-hp-muted"
              >
                {handle}
              </span>
            ) : null}
          </div>

          <p className="mt-2 break-words text-sm leading-6 text-hp-muted">
            {assignment} · {inboundAge} since last inbound · Reply window {replyWindow}
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <DrawerChip label="Details" onClick={onOpenDetails} />
          <DrawerChip label="Audit" onClick={onOpenAudit} />
          <DrawerChip label="Notes" onClick={onOpenNotes} />
          <DrawerChip label="QA" onClick={onOpenQa} />
          <DrawerChip label="Close →" onClick={onCloseConversation} emphasized />
        </div>
      </div>
    </header>
  );
}

function DrawerChip({
  label,
  emphasized = false,
  onClick,
}: {
  label: string;
  emphasized?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={[
        "h-9 border px-3 text-[10px] uppercase tracking-[0.14em] transition-colors",
        emphasized
          ? "border-hp-ink bg-hp-ink text-hp-foundation hover:bg-hp-body"
          : "border-hp-rule bg-hp-card text-hp-ink hover:border-hp-ink hover:bg-hp-inset",
      ].join(" ")}
    >
      {label}
    </button>
  );
}

export function platformOf(sourceChannel: string | null | undefined) {
  if (!sourceChannel) return null;
  if (sourceChannel.startsWith("instagram_")) return "IG";
  if (sourceChannel.startsWith("facebook_")) return "FB";
  return null;
}

function replyWindowInput(item: MetaInboxQueueDisplayItem): ReplyWindowInput {
  return {
    sendEligibility: item.sendEligibility,
    replyWindowExpiresAt: item.replyWindowExpiresAt,
    humanAgentWindowExpiresAt: item.humanAgentWindowExpiresAt,
  };
}

function formatInboundAge(item: MetaInboxQueueDisplayItem, now: Date | number) {
  const inboundAt =
    item.inboxConversation?.latest_inbound_at ||
    item.inboxConversation?.last_activity_at ||
    item.timestamp;
  const inboundMs = Date.parse(String(inboundAt || ""));
  const currentMs = nowMs(now);
  if (!Number.isFinite(inboundMs) || !Number.isFinite(currentMs) || inboundMs > currentMs) {
    return "Unknown";
  }

  const minutes = Math.max(1, Math.ceil((currentMs - inboundMs) / 60_000));
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.ceil(minutes / 60);
  if (hours < 24) return `${hours}h`;
  return `${Math.ceil(hours / 24)}d`;
}

function resolveRenderTime(item: MetaInboxQueueDisplayItem, now: Date | number | undefined) {
  if (now !== undefined) return nowMs(now);
  const fallback =
    Date.parse(String(item.timestamp || item.inboxConversation?.last_activity_at || "")) || 0;
  return Number.isFinite(fallback) ? fallback : 0;
}

function nowMs(now: Date | number) {
  return typeof now === "number" ? now : now.getTime();
}

function noop() {}
