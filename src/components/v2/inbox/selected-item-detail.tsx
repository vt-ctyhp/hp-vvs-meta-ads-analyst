import { Camera, MessageCircle } from "lucide-react";

import type { MetaInboxQueueDisplayItem } from "../../../lib/meta-inbox-queue-view.ts";
import type {
  SocialInboxComment,
  SocialInboxMessage,
  SocialInboxPresence,
} from "../../../lib/social-inbox.ts";
import { formatDateLabel, type ConversationHistoryLoadState } from "./inbox-client-state.ts";
import { HistoryStatusStrip } from "./history-status-strip.tsx";
import { MessageAttachmentList } from "./message-attachment-list.tsx";
import { PresenceCollisionBanner } from "./presence-collision-banner.tsx";

export function SelectedItemDetail({
  item,
  messages,
  comments,
  presences,
  historyState,
  onLoadOlderHistory,
}: {
  item: MetaInboxQueueDisplayItem;
  messages: SocialInboxMessage[];
  comments: SocialInboxComment[];
  presences: SocialInboxPresence[];
  historyState: ConversationHistoryLoadState | null;
  onLoadOlderHistory: (() => void) | null;
}) {
  if (item.type === "comment") {
    const rootComment =
      comments.find((comment) => comment.comment_id === item.sourceId) ||
      comments.find((comment) => !comment.parent_comment_id) ||
      null;
    const replyComments = comments.filter((comment) => comment.id !== rootComment?.id);

    return (
      <div className="max-h-[560px] min-h-[420px] overflow-y-auto border border-hp-rule p-5">
        <PresenceCollisionBanner presences={presences} />
        <HistoryStatusStrip
          historyState={historyState}
          onLoadOlderHistory={onLoadOlderHistory}
        />
        <div className="mb-4 flex items-center gap-2 text-[11px] uppercase tracking-[0.14em] text-hp-muted">
          <Camera size={15} />
          {item.brand} · {item.channel} Comment
        </div>
        <p className="whitespace-pre-wrap break-words text-lg leading-8 text-hp-ink">
          {rootComment?.body || item.preview}
        </p>
        <div className="mt-5 grid gap-3 border-t border-hp-rule pt-4 text-sm text-hp-muted sm:grid-cols-2">
          <div>Author: {rootComment?.author_name || item.sender}</div>
          <div>Created: {formatDateLabel(rootComment?.created_time || item.timestamp)}</div>
          <div>Likes: {rootComment?.like_count || 0}</div>
          <div>Replies: {Math.max(rootComment?.reply_count || 0, replyComments.length)}</div>
        </div>
        {rootComment?.content_permalink ? (
          <a
            href={rootComment.content_permalink}
            target="_blank"
            rel="noreferrer"
            className="mt-5 inline-flex border border-hp-rule px-4 py-2 text-[11px] uppercase tracking-[0.14em] text-hp-ink hover:bg-hp-inset"
          >
            Open on Meta
          </a>
        ) : null}
        {replyComments.length ? (
          <div className="mt-6 space-y-3 border-t border-hp-rule pt-4">
            <div className="text-[10px] uppercase tracking-[0.14em] text-hp-muted">
              Comment Replies
            </div>
            {replyComments.map((reply) => (
              <div key={reply.id} className="border border-hp-rule bg-hp-inset p-3">
                <div className="mb-2 text-[10px] uppercase tracking-[0.14em] text-hp-muted">
                  {reply.author_name || "Unknown"} · {formatDateLabel(reply.created_time)}
                </div>
                <p className="whitespace-pre-wrap break-words text-sm leading-6 text-hp-body">
                  {reply.body || "Reply text unavailable"}
                </p>
              </div>
            ))}
          </div>
        ) : null}
      </div>
    );
  }

  return (
    <div className="max-h-[560px] min-h-[420px] overflow-y-auto border border-dashed border-hp-rule p-5">
      <PresenceCollisionBanner presences={presences} />
      <HistoryStatusStrip
        historyState={historyState}
        onLoadOlderHistory={onLoadOlderHistory}
      />
      {messages.length ? (
        <div className="space-y-4">
          {messages.map((message) => (
            <div
              key={message.id}
              className={`max-w-[82%] border p-4 ${
                message.direction === "outbound"
                  ? "ml-auto border-hp-ink bg-hp-ink text-hp-foundation"
                  : "border-hp-rule bg-hp-inset text-hp-body"
              }`}
            >
              <div className="mb-2 text-[10px] uppercase tracking-[0.14em] opacity-70">
                {message.sender_name || message.direction} · {formatDateLabel(message.sent_at)}
              </div>
              {message.body ? (
                <p className="whitespace-pre-wrap break-words text-sm leading-6">
                  {message.body}
                </p>
              ) : message.attachments.length ? null : (
                <p className="whitespace-pre-wrap break-words text-sm leading-6">
                  Unsupported message
                </p>
              )}
              {message.attachments.length ? (
                <MessageAttachmentList
                  attachments={message.attachments}
                  tone={message.direction === "outbound" ? "dark" : "light"}
                />
              ) : null}
            </div>
          ))}
        </div>
      ) : (
        <div className="flex min-h-[360px] items-center justify-center text-center">
          <div>
            <div className="mx-auto flex h-14 w-14 items-center justify-center border border-hp-rule text-hp-muted">
              <MessageCircle size={20} />
            </div>
            <h3 className="mt-5 font-title text-3xl text-hp-ink">
              {historyState?.status === "loading" ? "Loading known history" : "Thread detected"}
            </h3>
            <p className="mx-auto mt-3 max-w-lg text-sm leading-6 text-hp-muted">
              {historyState?.status === "error"
                ? "Known history could not load. Current conversation source and reply tools stay visible."
                : "Meta returned this conversation thread. If message bodies are blank after sync, webhook delivery receives new messages as they arrive."}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
