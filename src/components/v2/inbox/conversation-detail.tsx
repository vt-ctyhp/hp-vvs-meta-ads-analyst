"use client";

import Link from "next/link";

import { ReplyComposer } from "@/components/v2/inbox/reply-composer";
import type { SocialInboxComment, SocialInboxMessage } from "@/lib/social-inbox";

/**
 * Conversation detail surface — shared between desktop Convert room
 * (Phase 6 follow-up) and the mobile inbox shell (Phase 8).
 *
 * Renders the message thread (or single comment), a customer card with
 * any joinable attribution context, and the reply composer.
 */

type Props = {
  conversationId: string;
  kind: "thread" | "comment";
  platform: "facebook" | "instagram";
  brand: "HP" | "VVS" | "Unassigned";
  participantName: string | null;
  participantEmail?: string | null;
  messages: SocialInboxMessage[];
  comments?: SocialInboxComment[];
  /** For comments, render the comment body as the single message. */
  commentBody?: string | null;
  commentAt?: string | null;
  canSend: boolean;
  backHref: string;
};

const MSG_FMT = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
});

export function ConversationDetail({
  conversationId,
  kind,
  platform,
  brand,
  participantName,
  participantEmail,
  messages,
  comments = [],
  commentBody,
  commentAt,
  canSend,
  backHref,
}: Props) {
  return (
    <div className="space-y-4">
      <header className="flex items-center gap-3 border border-hp-rule bg-hp-card px-4 py-3">
        <Link
          href={backHref}
          className="inline-flex h-9 items-center border border-hp-ink bg-transparent px-3 text-[10px] uppercase tracking-[0.14em] text-hp-ink hover:bg-hp-ink hover:text-hp-foundation"
          aria-label="Back to inbox"
        >
          ← Back
        </Link>
        <div className="min-w-0 flex-1">
          <p className="line-clamp-1 font-[family-name:var(--font-title)] text-base text-hp-ink">
            {participantName ?? "Unknown"}
          </p>
          <p className="text-[10px] uppercase tracking-[0.14em] text-hp-muted">
            {platform.toUpperCase()} · {kind === "thread" ? "Conversation" : "Comment"}
            {participantEmail ? ` · ${participantEmail}` : ""}
          </p>
        </div>
      </header>

      <section
        aria-label="Messages"
        className="space-y-3 border border-hp-rule bg-hp-card p-4"
      >
        {kind === "comment" ? (
          comments.length > 0 ? (
            comments.map((comment) => (
              <Bubble
                key={comment.id}
                direction="inbound"
                text={comment.body ?? ""}
                sentAt={comment.created_time}
                senderName={comment.author_name ?? participantName}
              />
            ))
          ) : (
            <Bubble
              direction="inbound"
              text={commentBody ?? ""}
              sentAt={commentAt ?? null}
              senderName={participantName}
            />
          )
        ) : messages.length === 0 ? (
          <p className="px-2 py-6 text-center text-sm text-hp-muted">
            No messages yet for this thread. Trigger an inbox sync to fetch
            history.
          </p>
        ) : (
          messages.map((msg) => (
            <Bubble
              key={msg.id}
              direction={msg.direction}
              text={msg.body ?? ""}
              sentAt={msg.sent_at}
              senderName={msg.sender_name}
            />
          ))
        )}
      </section>

      <ReplyComposer
        conversationId={conversationId}
        brand={brand}
        canSend={canSend}
      />
    </div>
  );
}

function Bubble({
  direction,
  text,
  sentAt,
  senderName,
}: {
  direction: "inbound" | "outbound" | "unknown";
  text: string;
  sentAt: string | null;
  senderName: string | null;
}) {
  const outbound = direction === "outbound";
  return (
    <div className={`flex ${outbound ? "justify-end" : "justify-start"}`}>
      <div
        className={[
          "max-w-[80%] border px-3 py-2 text-sm",
          outbound
            ? "border-hp-ink bg-hp-ink text-hp-foundation"
            : "border-hp-rule bg-hp-inset text-hp-ink",
        ].join(" ")}
      >
        {!outbound && senderName ? (
          <p className="pb-0.5 text-[10px] uppercase tracking-[0.14em] text-hp-muted">
            {senderName}
          </p>
        ) : null}
        <p className="whitespace-pre-wrap">{text}</p>
        <p
          className={[
            "pt-1 text-[10px]",
            outbound ? "text-hp-foundation/60" : "text-hp-muted",
          ].join(" ")}
        >
          {sentAt ? MSG_FMT.format(new Date(sentAt)) : ""}
        </p>
      </div>
    </div>
  );
}
