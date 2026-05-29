import type { MetaInboxQueueDisplayItem } from "../../../lib/meta-inbox-queue-view.ts";
import {
  META_INBOX_QUEUE_CATEGORIES,
  metaInboxVocabularyLabel,
} from "../../../lib/meta-inbox-vocabulary.ts";

export function QueueRow({
  item,
  active,
  onSelect,
  now,
  userNames,
}: {
  item: MetaInboxQueueDisplayItem;
  active: boolean;
  onSelect: () => void;
  now?: Date | number;
  userNames?: Map<string, string> | null;
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
  const assignedId = item.inboxConversation?.assigned_user_id ?? null;
  const assigneeName = assignedId ? userNames?.get(assignedId) ?? null : null;

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

          {assignedId ? (
            <span
              className={[
                "inline-flex items-center px-2 py-1 text-[10px] uppercase tracking-[0.14em]",
                active ? "bg-hp-foundation/20 text-hp-foundation" : "bg-hp-inset text-hp-ink",
              ].join(" ")}
            >
              {assigneeName ? assigneeName.split(/\s+/)[0] : "Assigned"}
            </span>
          ) : (
            <span
              className={[
                "inline-flex items-center px-2 py-1 text-[10px] font-bold uppercase tracking-[0.14em]",
                active ? "bg-hp-foundation text-hp-ink" : "bg-hp-ink text-hp-foundation",
              ].join(" ")}
            >
              Unassigned
            </span>
          )}
        </div>
      </div>
    </button>
  );
}

export function queueItemIsOverSla(
  item: MetaInboxQueueDisplayItem,
  now: Date | number = Date.now(),
) {
  if (!isNeedsReply(item)) return false;

  const sourceTime = item.inboxConversation
    ? item.inboxConversation.latest_inbound_at
    : item.status === "Needs reply"
      ? item.timestamp
      : null;
  const sourceMs = Date.parse(String(sourceTime || ""));
  const nowMs = typeof now === "number" ? now : now.getTime();
  if (!Number.isFinite(sourceMs) || !Number.isFinite(nowMs) || sourceMs > nowMs) return false;

  return nowMs - sourceMs >= 24 * 60 * 60 * 1000;
}

function isNeedsReply(item: MetaInboxQueueDisplayItem) {
  if (item.inboxConversation) return item.inboxConversation.needs_reply === true;
  return item.status === "Needs reply";
}

function senderInitials(sender: string) {
  const parts = sender
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  const initials = parts.slice(0, 2).map((part) => part[0]?.toUpperCase() || "");
  return initials.join("") || "??";
}
