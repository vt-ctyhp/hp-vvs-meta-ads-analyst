import { notFound } from "next/navigation";

import { ConversationDetail } from "@/components/v2/inbox/conversation-detail";
import { hasPermission } from "@/lib/access-control";
import { getServerAccessProfile } from "@/lib/server-route-auth";
import { inferSocialBrand } from "@/lib/social-brand";
import { getSocialInboxConversationHistory } from "@/lib/social-inbox";

export const dynamic = "force-dynamic";

type Params = { conversationId: string };

/**
 * Conversation detail route. URL shape:
 *   /m/inbox/<conversation_id> → normalized inbox conversation + known history
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

  const canSend = hasPermission(profile.roles, "send_inbox_reply");
  const history = await getSocialInboxConversationHistory(decoded, profile, { pageSize: 100 }).catch(
    () => null,
  );
  if (!history) notFound();

  const conversation = history.conversation;
  const kind = conversation.source_type === "public_comment" ? "comment" : "thread";
  const firstComment = history.comments[0] || null;

  return (
    <div className="mx-auto max-w-3xl">
      <ConversationDetail
      conversationId={conversation.id}
      kind={kind}
      platform={conversation.platform}
      brand={inferSocialBrand(conversation.page_id, conversation.ig_user_id)}
      participantName={firstComment?.author_name || conversation.participant_id || null}
      messages={history.messages}
      comments={history.comments}
      commentBody={firstComment?.body || null}
      commentAt={firstComment?.created_time || null}
      canSend={canSend}
      backHref="/m/inbox"
    />
    </div>
  );
}
