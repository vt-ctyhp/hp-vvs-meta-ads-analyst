import type {
  SocialInboxComment,
  SocialInboxConversation,
  SocialInboxMessage,
} from "./social-inbox.ts";

export type MetaInboxHistoryCompleteness =
  | "complete_known_history"
  | "partial_known_history"
  | "no_known_history"
  | "source_missing";

export type SocialInboxConversationHistory = {
  conversation: SocialInboxConversation;
  messages: SocialInboxMessage[];
  comments: SocialInboxComment[];
  pageInfo: {
    pageSize: number;
    returned: number;
    knownTotal: number;
    nextCursor: string | null;
    historyCompleteness: MetaInboxHistoryCompleteness;
  };
};

type BuildHistoryInput = {
  messages: readonly SocialInboxMessage[];
  comments: readonly SocialInboxComment[];
};

type BuildHistoryOptions = {
  cursor?: string | null;
  pageSize?: number | null;
};

const DEFAULT_PAGE_SIZE = 50;
const MAX_PAGE_SIZE = 100;

export function hasKnownMessageHistorySource(
  conversation: Pick<SocialInboxConversation, "source_type" | "platform_thread_id">,
): conversation is Pick<SocialInboxConversation, "source_type" | "platform_thread_id"> & {
  platform_thread_id: string;
} {
  return (
    conversation.source_type !== "public_comment" &&
    typeof conversation.platform_thread_id === "string" &&
    conversation.platform_thread_id.trim().length > 0
  );
}

export function buildSocialInboxConversationHistoryPage(
  conversation: SocialInboxConversation,
  input: BuildHistoryInput,
  options: BuildHistoryOptions = {},
): SocialInboxConversationHistory {
  const pageSize = normalizePageSize(options.pageSize);
  const messages = knownMessagesForConversation(conversation, input.messages);
  const comments = knownCommentsForConversation(conversation, input.comments);
  const orderedItems = [
    ...messages.map((message) => ({
      kind: "message" as const,
      id: message.id,
      timestamp: messageTime(message),
      value: message,
    })),
    ...comments.map((comment) => ({
      kind: "comment" as const,
      id: comment.id,
      timestamp: commentTime(comment),
      value: comment,
    })),
  ].sort((a, b) => a.timestamp.localeCompare(b.timestamp) || a.id.localeCompare(b.id));
  const total = orderedItems.length;
  const pageWindow = newestPageWindow(total, pageSize, options.cursor);
  const pagedItems = orderedItems.slice(pageWindow.start, pageWindow.end);
  const pagedMessages: SocialInboxMessage[] = [];
  const pagedComments: SocialInboxComment[] = [];
  for (const item of pagedItems) {
    if (item.kind === "message") {
      pagedMessages.push(item.value);
    } else {
      pagedComments.push(item.value);
    }
  }
  pagedMessages.sort(compareMessages);
  pagedComments.sort(compareComments);

  return {
    conversation,
    messages: pagedMessages,
    comments: pagedComments,
    pageInfo: {
      pageSize,
      returned: pagedMessages.length + pagedComments.length,
      knownTotal: total,
      nextCursor: pageWindow.nextCursor,
      historyCompleteness: historyCompleteness(conversation, total, pageWindow.nextCursor),
    },
  };
}

export function mergeSocialInboxConversationHistory(
  current: SocialInboxConversationHistory,
  older: SocialInboxConversationHistory,
): SocialInboxConversationHistory {
  const messages = uniqueById([...older.messages, ...current.messages]).sort(compareMessages);
  const comments = uniqueById([...older.comments, ...current.comments]).sort(compareComments);

  return {
    conversation: current.conversation,
    messages,
    comments,
    pageInfo: {
      ...older.pageInfo,
      returned: messages.length + comments.length,
      knownTotal: Math.max(current.pageInfo.knownTotal, older.pageInfo.knownTotal),
      nextCursor: older.pageInfo.nextCursor,
      historyCompleteness: older.pageInfo.nextCursor
        ? "partial_known_history"
        : older.pageInfo.knownTotal
          ? "complete_known_history"
          : "no_known_history",
    },
  };
}

function knownMessagesForConversation(
  conversation: SocialInboxConversation,
  messages: readonly SocialInboxMessage[],
) {
  if (!hasKnownMessageHistorySource(conversation)) return [];

  return messages
    .filter(
      (message) =>
        message.platform === conversation.platform &&
        message.thread_id === conversation.platform_thread_id,
    )
    .sort(compareMessages);
}

function knownCommentsForConversation(
  conversation: SocialInboxConversation,
  comments: readonly SocialInboxComment[],
) {
  if (conversation.source_type !== "public_comment" || !conversation.source_id) return [];

  return comments
    .filter(
      (comment) =>
        comment.platform === conversation.platform &&
        (comment.comment_id === conversation.source_id ||
          comment.parent_comment_id === conversation.source_id),
    )
    .sort(compareComments);
}

function newestPageWindow(total: number, pageSize: number, cursor: string | null | undefined) {
  const end = normalizeCursor(cursor, total);
  const start = Math.max(0, end - pageSize);

  return {
    start,
    end,
    nextCursor: start > 0 ? String(start) : null,
  };
}

function normalizeCursor(cursor: string | null | undefined, total: number) {
  if (!cursor) return total;
  const parsed = Number(cursor);
  if (!Number.isFinite(parsed)) return total;
  return Math.max(0, Math.min(total, Math.floor(parsed)));
}

function normalizePageSize(value: number | null | undefined) {
  if (!value || !Number.isFinite(value)) return DEFAULT_PAGE_SIZE;
  return Math.max(1, Math.min(MAX_PAGE_SIZE, Math.floor(value)));
}

function historyCompleteness(
  conversation: SocialInboxConversation,
  total: number,
  nextCursor: string | null,
): MetaInboxHistoryCompleteness {
  if (conversation.source_type !== "public_comment" && !conversation.platform_thread_id) {
    return "source_missing";
  }
  if (conversation.source_type === "public_comment" && !conversation.source_id) {
    return "source_missing";
  }
  if (nextCursor) return "partial_known_history";
  if (!total) return "no_known_history";
  return "complete_known_history";
}

function compareMessages(a: SocialInboxMessage, b: SocialInboxMessage) {
  return messageTime(a).localeCompare(messageTime(b)) || a.id.localeCompare(b.id);
}

function compareComments(a: SocialInboxComment, b: SocialInboxComment) {
  return commentTime(a).localeCompare(commentTime(b)) || a.id.localeCompare(b.id);
}

function messageTime(message: SocialInboxMessage) {
  return message.sent_at || "";
}

function commentTime(comment: SocialInboxComment) {
  return comment.created_time || "";
}

function uniqueById<T extends { id: string }>(items: readonly T[]) {
  const seen = new Set<string>();
  const output: T[] = [];
  for (const item of items) {
    if (seen.has(item.id)) continue;
    seen.add(item.id);
    output.push(item);
  }
  return output;
}
