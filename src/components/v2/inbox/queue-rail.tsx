"use client";

import { Search } from "lucide-react";
import type { ReactNode } from "react";

import type { SocialInboxData } from "../../../lib/social-inbox.ts";
import type { MetaInboxQueueDisplayItem } from "../../../lib/meta-inbox-queue-view.ts";
import {
  META_INBOX_QUEUE_CATEGORIES,
  metaInboxVocabularyLabel,
  type MetaInboxQueueCategoryKey,
} from "../../../lib/meta-inbox-vocabulary.ts";
import type { QueueCategoryFilter } from "./use-inbox-filters.ts";

type QueueCategoryOption = (typeof META_INBOX_QUEUE_CATEGORIES)[number];

export function QueueRail({
  queue,
  selectedId,
  query,
  onQueryChange,
  queueCategoryFilter,
  onQueueCategoryChange,
  queueCategories,
  onSelect,
  now,
  legacyFilterChrome = null,
}: {
  queue: MetaInboxQueueDisplayItem[];
  selectedId: string | null;
  query: string;
  onQueryChange: (value: string) => void;
  queueCategoryFilter: QueueCategoryFilter;
  onQueueCategoryChange: (value: QueueCategoryFilter) => void;
  queueCategories: readonly QueueCategoryOption[];
  onSelect: (item: MetaInboxQueueDisplayItem) => void;
  now?: Date | number;
  legacyFilterChrome?: ReactNode;
}) {
  return (
    <aside
      data-component="queue-rail"
      className="flex min-h-[720px] min-w-0 flex-col bg-hp-card"
    >
      <div className="border-b border-hp-rule p-4">
        <div className="mb-3 flex items-center justify-between gap-3">
          <span className="text-[11px] uppercase tracking-[0.14em] text-hp-muted">
            Unified Queue
          </span>
          <span className="text-[11px] text-hp-muted oldstyle-nums">
            {queue.length} {queue.length === 1 ? "conversation" : "conversations"} · Sorted by age
          </span>
        </div>

        <label className="flex h-10 items-center gap-2 border border-hp-rule bg-hp-foundation px-3 focus-within:border-hp-ink">
          <Search size={15} className="shrink-0 text-hp-muted" />
          <input
            aria-label="Search conversations"
            value={query}
            onChange={(event) => onQueryChange(event.target.value)}
            placeholder="Search sender, handle, ad, or thread"
            className="min-w-0 flex-1 bg-transparent text-sm text-hp-ink outline-none placeholder:text-hp-muted"
          />
        </label>

        <label className="mt-3 grid gap-1.5">
          <span className="text-[10px] uppercase tracking-[0.14em] text-hp-muted">Queue</span>
          <select
            aria-label="Queue category"
            value={queueCategoryFilter}
            onChange={(event) => onQueueCategoryChange(event.target.value as QueueCategoryFilter)}
            className="h-10 w-full border border-hp-rule bg-hp-foundation px-3 text-sm text-hp-ink outline-none transition-colors focus:border-hp-ink"
          >
            <option value="all">All categories</option>
            {queueCategories.map((category) => (
              <option key={category.key} value={category.key}>
                {category.label}
              </option>
            ))}
          </select>
        </label>

        {legacyFilterChrome}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {queue.length ? (
          queue.map((item) => (
            <QueueRow
              key={item.id}
              item={item}
              active={selectedId === item.id}
              now={now}
              onSelect={() => onSelect(item)}
            />
          ))
        ) : (
          <div className="p-8 text-center">
            <div className="mx-auto flex h-12 w-12 items-center justify-center border border-hp-rule text-hp-muted">
              <Search size={18} />
            </div>
            <h2 className="mt-4 font-title text-2xl text-hp-ink">No conversations match.</h2>
            <p className="mt-2 text-sm leading-6 text-hp-muted">
              Adjust the queue category or search to widen the rail.
            </p>
          </div>
        )}
      </div>
    </aside>
  );
}

export function QueueRow({
  item,
  active,
  onSelect,
  now,
}: {
  item: MetaInboxQueueDisplayItem;
  active: boolean;
  onSelect: () => void;
  now?: Date | number;
}) {
  const needsReply = isNeedsReply(item);
  const overSla = queueItemIsOverSla(item, now);
  const showNeedsReplyLabel = needsReply && !overSla;
  const visualMode = active ? "active" : needsReply ? "needs-reply" : "default";
  const labelTone = overSla ? "warning" : showNeedsReplyLabel ? "pink" : "none";
  const kind = item.type === "comment" ? "Cmt" : "Msg";
  const platform = item.platform === "instagram" ? "IG" : "FB";
  const categoryLabel = metaInboxVocabularyLabel(
    META_INBOX_QUEUE_CATEGORIES,
    item.queueCategoryKey,
  );

  return (
    <button
      type="button"
      data-component="queue-row"
      data-active={active ? "true" : "false"}
      data-visual-mode={visualMode}
      data-over-sla={overSla ? "true" : "false"}
      data-label-tone={labelTone}
      onClick={onSelect}
      className={[
        "w-full border-b border-hp-rule p-4 text-left transition-colors",
        active
          ? "bg-hp-ink text-hp-foundation hover:bg-hp-ink"
          : needsReply
            ? "bg-hp-pink/[0.06] text-hp-body hover:bg-hp-inset"
            : "bg-hp-card text-hp-body hover:bg-hp-inset",
      ].join(" ")}
    >
      <div className="grid grid-cols-[1.75rem_minmax(0,1fr)_auto] items-start gap-3">
        <div
          data-avatar-initials={senderInitials(item.sender)}
          className={[
            "flex h-7 w-7 shrink-0 items-center justify-center border text-[10px] uppercase tracking-[0.08em]",
            active ? "border-hp-foundation/40 text-hp-foundation" : "border-hp-rule text-hp-muted",
          ].join(" ")}
          aria-hidden="true"
        >
          {senderInitials(item.sender)}
        </div>

        <div className="min-w-0">
          <div
            className={[
              "text-[10px] uppercase tracking-[0.14em]",
              active ? "text-hp-foundation/70" : "text-hp-muted",
            ].join(" ")}
          >
            {platform} {kind}
          </div>
          <div
            className={[
              "mt-1 font-title text-[15px] leading-tight",
              active ? "text-hp-foundation" : "text-hp-ink",
            ].join(" ")}
          >
            {item.sender}
          </div>
          <p
            className={[
              "mt-1 line-clamp-2 text-sm leading-5",
              active ? "text-hp-foundation/80" : "text-hp-body",
            ].join(" ")}
          >
            {item.preview}
          </p>
          <span
            className={[
              "mt-3 inline-flex max-w-full border px-2 py-1 text-[10px] uppercase leading-none tracking-[0.14em]",
              active
                ? "border-hp-foundation/40 text-hp-foundation/80"
                : "border-hp-rule text-hp-muted",
            ].join(" ")}
          >
            {item.brand} · {categoryLabel}
          </span>
        </div>

        <div className="flex shrink-0 flex-col items-end gap-2 text-right">
          <span
            className={[
              "text-[10px] uppercase tracking-[0.14em] lining-nums",
              active
                ? "text-hp-foundation/70"
                : overSla
                  ? "text-signal-warning"
                  : "text-hp-muted",
            ].join(" ")}
          >
            {item.time}
          </span>
          {overSla ? (
            <span
              className={[
                "text-[10px] uppercase tracking-[0.14em]",
                active ? "text-hp-foundation" : "text-signal-warning",
              ].join(" ")}
            >
              ↑ Over SLA
            </span>
          ) : showNeedsReplyLabel ? (
            <span
              className={[
                "text-[10px] uppercase tracking-[0.14em]",
                active ? "text-hp-foundation" : "text-hp-pink",
              ].join(" ")}
            >
              Needs reply
            </span>
          ) : null}
        </div>
      </div>
    </button>
  );
}

export function visibleQueueCategories(
  data: Pick<SocialInboxData, "queueAccess">,
): readonly QueueCategoryOption[] {
  if (data.queueAccess.mode !== "team") return META_INBOX_QUEUE_CATEGORIES;

  const allowed = new Set(data.queueAccess.allowedQueueCategoryKeys);
  return META_INBOX_QUEUE_CATEGORIES.filter((category) =>
    allowed.has(category.key as MetaInboxQueueCategoryKey),
  );
}

export function queueItemIsOverSla(
  item: MetaInboxQueueDisplayItem,
  now: Date | number = Date.now(),
) {
  if (!isNeedsReply(item)) return false;

  const sourceTime =
    item.inboxConversation?.latest_inbound_at ||
    item.inboxConversation?.last_activity_at ||
    item.timestamp;
  const sourceMs = Date.parse(String(sourceTime || ""));
  const nowMs = typeof now === "number" ? now : now.getTime();
  if (!Number.isFinite(sourceMs) || !Number.isFinite(nowMs) || sourceMs > nowMs) return false;

  return nowMs - sourceMs >= 24 * 60 * 60 * 1000;
}

function isNeedsReply(item: MetaInboxQueueDisplayItem) {
  return item.conversationStatus === "needs_reply" || item.status === "Needs reply";
}

function senderInitials(sender: string) {
  const parts = sender
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  const initials = parts.slice(0, 2).map((part) => part[0]?.toUpperCase() || "");
  return initials.join("") || "??";
}
