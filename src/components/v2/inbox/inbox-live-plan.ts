export type InboxChangePing = {
  conversationId?: string | null;
  kind?: "conversation" | "event";
};

export type InboxRefetchPlan = {
  queue: boolean;
  thread: boolean;
};

/**
 * Decide what to refetch when a broadcast ping arrives.
 *
 * The queue is always refreshed — it is cheap and is the only place new conversations,
 * re-ordering, and assignment/status changes surface. The open thread is refreshed only when
 * the ping names the conversation the user is currently viewing, or when the ping carries no
 * id (defensive: refresh the open thread too rather than miss an update).
 */
export function planInboxRefetch(
  ping: InboxChangePing,
  selectedConversationId: string | null,
): InboxRefetchPlan {
  const id = ping.conversationId ?? null;
  const thread =
    selectedConversationId !== null && (id === null || id === selectedConversationId);
  return { queue: true, thread };
}
