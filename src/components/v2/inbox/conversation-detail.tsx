"use client";

import Link from "next/link";

import { ReplyComposer } from "@/components/v2/inbox/reply-composer";
import type { SocialInboxMessage } from "@/lib/social-inbox";

/**
 * Conversation detail surface — shared between desktop Convert room
 * (Phase 6 follow-up) and the mobile inbox shell (Phase 8).
 *
 * Renders the message thread (or single comment), a customer card with
 * any joinable attribution context, and the reply composer.
 */

type Props = {
  kind: "thread" | "comment";
  platform: "facebook" | "instagram";
  sourceId: string;
  brand: "HP" | "VVS" | "Unassigned";
  participantName: string | null;
  participantEmail?: string | null;
  messages: SocialInboxMessage[];
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
  kind,
  platform,
  sourceId,
  brand,
  participantName,
  participantEmail,
  messages,
  commentBody,
  commentAt,
  canSend,
  backHref,
}: Props) {
  return (
    <div className="space-y-4">
      <header className="flex items-center gap-3 rounded-xl border border-stone-200 bg-white px-4 py-3">
        <Link
          href={backHref}
          className="inline-flex h-9 items-center rounded-full border border-stone-300 bg-white px-3 text-xs font-medium text-stone-800 hover:bg-stone-50"
          aria-label="Back to inbox"
        >
          ← Back
        </Link>
        <div className="min-w-0 flex-1">
          <p className="line-clamp-1 text-sm font-medium text-stone-900">
            {participantName ?? "Unknown"}
          </p>
          <p className="text-[11px] text-stone-500">
            {platform.toUpperCase()} · {kind === "thread" ? "DM thread" : "Comment"}
            {participantEmail ? ` · ${participantEmail}` : ""}
          </p>
        </div>
      </header>

      <section
        aria-label="Messages"
        className="space-y-2 rounded-xl border border-stone-200 bg-white p-3"
      >
        {kind === "comment" ? (
          <Bubble
            direction="inbound"
            text={commentBody ?? ""}
            sentAt={commentAt ?? null}
            senderName={participantName}
          />
        ) : messages.length === 0 ? (
          <p className="px-2 py-6 text-center text-sm text-stone-500">
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
        platform={platform}
        sourceType={kind === "thread" ? "message" : "comment"}
        sourceId={sourceId}
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
          "max-w-[80%] rounded-2xl px-3 py-2 text-sm",
          outbound
            ? "rounded-br-md bg-stone-900 text-stone-50"
            : "rounded-bl-md bg-stone-100 text-stone-900",
        ].join(" ")}
      >
        {!outbound && senderName ? (
          <p className="pb-0.5 text-[10px] uppercase tracking-wider text-stone-500">
            {senderName}
          </p>
        ) : null}
        <p className="whitespace-pre-wrap">{text}</p>
        <p
          className={[
            "pt-1 text-[10px]",
            outbound ? "text-stone-300" : "text-stone-500",
          ].join(" ")}
        >
          {sentAt ? MSG_FMT.format(new Date(sentAt)) : ""}
        </p>
      </div>
    </div>
  );
}
