"use client";

import { useEffect, useState } from "react";

import type { SocialInboxData } from "../../../lib/social-inbox.ts";
import { getInboxForUser } from "../../../lib/inbox-team-peek.ts";
import { ReadOnlyProvider } from "./read-only-context.tsx";

// v1 read-only peek: loads the teammate's scoped inbox via the lead-gated
// getInboxForUser action and shows a read-only conversation list. Richer
// QueueRail/ConversationDetail reuse with the full client view-model is a
// browser-verified follow-up; the action + authz are the verified core here.
export function TeamMemberPeek({
  userId,
  onClose,
}: {
  userId: string;
  onClose: () => void;
}) {
  const [data, setData] = useState<SocialInboxData | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    getInboxForUser(userId)
      .then((d) => {
        if (active) setData(d);
      })
      .catch((e) => {
        if (active) setError(e instanceof Error ? e.message : "Failed to load.");
      });
    return () => {
      active = false;
    };
  }, [userId]);

  return (
    <ReadOnlyProvider value>
      <aside
        data-component="team-member-peek"
        className="fixed inset-y-0 right-0 z-40 flex w-full max-w-3xl flex-col border-l border-hp-rule bg-hp-foundation shadow-xl"
      >
        <header className="flex items-center justify-between border-b border-hp-rule px-4 py-3">
          <span className="text-[11px] smallcaps text-hp-muted">Read-only peek</span>
          <button
            type="button"
            onClick={onClose}
            className="text-[11px] smallcaps text-hp-ink hover:underline"
          >
            Close
          </button>
        </header>
        <div className="flex-1 overflow-auto p-3">
          {error ? (
            <p className="text-[13px] text-signal-warning">{error}</p>
          ) : !data ? (
            <p className="text-[11px] smallcaps text-hp-muted">Loading…</p>
          ) : data.inboxConversations.length === 0 ? (
            <p className="text-[11px] smallcaps text-hp-muted">No conversations assigned.</p>
          ) : (
            <ul className="divide-y divide-hp-rule-soft">
              {data.inboxConversations.map((c) => (
                <li
                  key={c.id}
                  className="flex items-baseline justify-between gap-3 px-1 py-2 text-[13px]"
                >
                  <span className="min-w-0 truncate text-hp-ink">
                    {c.participant_id ?? "Unknown"}
                    <span className="ml-2 text-[10px] smallcaps text-hp-muted">{c.platform}</span>
                  </span>
                  <span className="shrink-0 text-[10px] smallcaps text-hp-muted">
                    {c.needs_reply ? "needs reply" : c.conversation_status}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </aside>
    </ReadOnlyProvider>
  );
}
