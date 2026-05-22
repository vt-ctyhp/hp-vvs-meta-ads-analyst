import { notFound } from "next/navigation";

import { ConversationDetail } from "@/components/v2/inbox/conversation-detail";
import { hasPermission } from "@/lib/access-control";
import { getServerAccessProfile } from "@/lib/server-route-auth";
import { inferSocialBrand } from "@/lib/social-brand";
import {
  getSocialInboxData,
  type SocialInboxComment,
  type SocialInboxMessage,
  type SocialInboxThread,
} from "@/lib/social-inbox";

export const dynamic = "force-dynamic";

type Params = { conversationId: string };

/**
 * Conversation detail route. URL shape:
 *   /m/inbox/t-<thread_id>   → DM thread + messages
 *   /m/inbox/c-<comment_id>  → public comment (no message history)
 */
export default async function ConversationDetailPage({
  params,
}: {
  params: Promise<Params>;
}) {
  const { conversationId } = await params;
  const decoded = decodeURIComponent(conversationId);

  const profile = await getServerAccessProfile();
  if (!profile?.authenticated) {
    notFound();
  }
  if (!hasPermission(profile.roles, "view_inbox")) {
    notFound();
  }

  const inbox = await getSocialInboxData().catch(() => ({
    threads: [] as SocialInboxThread[],
    messages: [] as SocialInboxMessage[],
    comments: [] as SocialInboxComment[],
    syncRuns: [],
  }));

  const canSend = hasPermission(profile.roles, "send_inbox_reply");

  if (decoded.startsWith("t-")) {
    const threadId = decoded.slice(2);
    const thread = inbox.threads.find((t) => t.thread_id === threadId);
    if (!thread) notFound();
    const messages = inbox.messages
      .filter((m) => m.thread_id === thread.thread_id)
      .sort(
        (a, b) =>
          (a.sent_at ? Date.parse(a.sent_at) : 0) -
          (b.sent_at ? Date.parse(b.sent_at) : 0),
      );
    return (
      <ConversationDetail
        kind="thread"
        platform={thread.platform}
        sourceId={thread.thread_id}
        brand={inferSocialBrand(thread.page_id, thread.ig_user_id)}
        participantName={thread.participant_name ?? null}
        messages={messages}
        canSend={canSend}
        backHref="/m/inbox"
      />
    );
  }

  if (decoded.startsWith("c-")) {
    const commentId = decoded.slice(2);
    const comment = inbox.comments.find((c) => c.comment_id === commentId);
    if (!comment) notFound();
    return (
      <ConversationDetail
        kind="comment"
        platform={comment.platform}
        sourceId={comment.comment_id}
        brand={inferSocialBrand(comment.page_id, comment.ig_user_id)}
        participantName={comment.author_name ?? null}
        messages={[]}
        commentBody={comment.body}
        commentAt={comment.created_time}
        canSend={canSend}
        backHref="/m/inbox"
      />
    );
  }

  notFound();
}
