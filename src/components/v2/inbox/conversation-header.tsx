"use client";

import {
  META_INBOX_QUEUE_CATEGORIES,
  metaInboxVocabularyLabel,
} from "../../../lib/meta-inbox-vocabulary.ts";
import type { MetaInboxQueueDisplayItem } from "../../../lib/meta-inbox-queue-view.ts";
import { useInboxUserNames } from "./use-inbox-user-names.ts";

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
  const userNames = useInboxUserNames();

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
  const sourcePlatform = platformOf(item.sourceChannel);
  const handle =
    sourcePlatform === "IG" && item.profile?.username ? `@${item.profile.username}` : null;
  const assignedId = item.inboxConversation?.assigned_user_id ?? null;
  const assignment = assignedId
    ? `Assigned to ${userNames?.get(assignedId) || assignedId}`
    : "Unassigned";
  const currentTime = resolveRenderTime(item, now);
  const inboundAge = formatInboundAge(item, currentTime);

  return (
    <header
      data-component="conversation-header"
      className="border-b border-hp-rule bg-hp-card p-5"
    >
      <div className="flex min-w-0 flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
        <div className="min-w-0">
          <p className="truncate text-[11px] uppercase tracking-[0.14em] text-hp-muted">
            {item.brand} · {item.channel} {kind} · {categoryLabel}
          </p>

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
            {assignment} · {inboundAge} since last inbound
          </p>
        </div>

        {/* Inspector panels as one segmented strip, with Close as the decisive
            primary beneath it. A fixed-width action column keeps the eyebrow on
            one line. */}
        <div className="flex shrink-0 flex-col items-end gap-3">
          <div className="flex divide-x divide-hp-rule border border-hp-rule">
            <DrawerTab label="Profile" onClick={onOpenDetails} />
            <DrawerTab label="Notes" onClick={onOpenNotes} />
            <DrawerTab label="History" onClick={onOpenAudit} />
            <DrawerTab label="Quality" onClick={onOpenQa} />
          </div>
          <button
            type="button"
            onClick={onCloseConversation}
            className="h-10 border border-hp-ink bg-hp-ink px-4 text-[10px] uppercase tracking-[0.14em] text-hp-foundation transition-colors hover:bg-hp-body"
          >
            Close →
          </button>
        </div>
      </div>
    </header>
  );
}

function DrawerTab({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="h-9 bg-hp-card px-3 text-[10px] uppercase tracking-[0.14em] text-hp-ink transition-colors hover:bg-hp-inset"
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
