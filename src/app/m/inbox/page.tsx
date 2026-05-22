import { ConversationListMobile } from "@/components/v2/inbox/conversation-list-mobile";
import { hasPermission } from "@/lib/access-control";
import { getServerAccessProfile } from "@/lib/server-route-auth";
import { getSocialInboxData } from "@/lib/social-inbox";

export const dynamic = "force-dynamic";

export default async function MobileInboxIndex() {
  // Layout already enforced authentication + view_inbox. We re-derive the
  // profile here just for the status sentence (oldest waiting, snoozed count).
  const profile = await getServerAccessProfile();
  const inbox = await getSocialInboxData().catch((e) => {
    console.error("[m/inbox] getSocialInboxData failed:", e);
    return { threads: [], messages: [], comments: [], syncRuns: [] };
  });

  const waiting = inbox.threads.filter((t) => (t.unread_count || 0) > 0).length;
  const oldestUnread = inbox.threads
    .filter((t) => (t.unread_count || 0) > 0 && t.last_message_at)
    .map((t) => Date.parse(t.last_message_at as string))
    .sort((a, b) => a - b)[0];
  const oldestRel = oldestUnread ? relTime(new Date(oldestUnread).toISOString()) : "—";

  const sentence =
    inbox.threads.length === 0 && inbox.comments.length === 0
      ? "No conversations in this environment yet."
      : waiting > 0
        ? `${waiting} waiting. Oldest ${oldestRel}.`
        : `Inbox clear (${inbox.threads.length} thread${inbox.threads.length === 1 ? "" : "s"} synced).`;

  const canSendReplies =
    profile && hasPermission(profile.roles, "send_inbox_reply");

  return (
    <div className="space-y-4">
      <header className="border border-hp-rule bg-hp-card px-4 py-4">
        <p className="font-[family-name:var(--font-title)] text-lg leading-snug text-hp-ink">{sentence}</p>
        <p className="mt-2 text-[11px] uppercase tracking-[0.14em] text-hp-muted">
          {canSendReplies
            ? "Tap a conversation to draft and send a reply."
            : "Read-only access — sending replies needs send_inbox_reply permission."}
        </p>
      </header>

      <ConversationListMobile
        threads={inbox.threads}
        comments={inbox.comments}
      />
    </div>
  );
}

function relTime(iso: string): string {
  const ms = Date.now() - Date.parse(iso);
  if (!Number.isFinite(ms) || ms < 0) return "just now";
  const mins = Math.round(ms / 60_000);
  if (mins < 60) return `${mins} min ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}
