import type {
  MetaInboxQueueCategoryKey,
  MetaInboxSourceChannelKey,
} from "./meta-inbox-vocabulary.ts";
import { inferSocialBrand, type BrandLabel } from "./social-brand.ts";
import type {
  SocialInboxCommentAction,
  SocialInboxConversation,
  SocialInboxConversationEvent,
  SocialInboxConversationNote,
  SocialInboxCustomerContactMethod,
  SocialInboxCustomerProfile,
  SocialInboxData,
  SocialInboxFirstTouchSource,
  SocialInboxQaScorecard,
  SocialInboxSavedReply,
  SocialInboxSendAttempt,
} from "./social-inbox.ts";

export type MetaInboxQueueDisplayItem = {
  id: string;
  sourceId: string;
  channel: "Facebook" | "Instagram";
  platform: "facebook" | "instagram";
  brand: BrandLabel;
  type: "message" | "comment";
  sender: string;
  preview: string;
  status: "Synced" | "Unread" | "Needs reply";
  time: string;
  timestamp: string | null;
  sourceChannel: MetaInboxSourceChannelKey;
  queueCategoryKey: MetaInboxQueueCategoryKey;
  conversationStatus: SocialInboxConversation["conversation_status"];
  sendEligibility: SocialInboxConversation["send_eligibility"];
  replyWindowExpiresAt: string | null;
  humanAgentWindowExpiresAt: string | null;
  routingExplanation: string | null;
  routingConfidence: number | null;
  inboxConversation: SocialInboxConversation | null;
  profile: SocialInboxCustomerProfile | null;
  contactMethods: SocialInboxCustomerContactMethod[];
  firstTouch: SocialInboxFirstTouchSource | null;
  sendAttempts: SocialInboxSendAttempt[];
  commentActions: SocialInboxCommentAction[];
  conversationEvents: SocialInboxConversationEvent[];
  savedReplies: SocialInboxSavedReply[];
  notes: SocialInboxConversationNote[];
  qaScorecards: SocialInboxQaScorecard[];
};

export type MetaInboxMobileConversationItem = MetaInboxQueueDisplayItem & {
  href: string;
  legacySourceHref: string | null;
};

export function buildMetaInboxQueueItems(data: SocialInboxData): MetaInboxQueueDisplayItem[] {
  const context = buildQueueContext(data);
  const items = data.inboxConversations.map((conversation) =>
    itemFromConversation(conversation, data, context),
  );

  const normalizedThreadKeys = new Set(
    data.inboxConversations
      .map((conversation) => historyKey(conversation.platform, conversation.platform_thread_id))
      .filter(Boolean) as string[],
  );
  const normalizedParticipantKeys = new Set(
    data.inboxConversations
      .map((conversation) =>
        participantKey(conversation.platform, conversation.page_id, conversation.participant_id),
      )
      .filter(Boolean) as string[],
  );
  const normalizedCommentKeys = new Set(
    data.inboxConversations
      .map((conversation) => historyKey(conversation.platform, conversation.source_id))
      .filter(Boolean) as string[],
  );

  const rawThreadFallbacks = dedupeRawThreadsByParticipant(
    data.threads.filter((thread) => {
      if (normalizedThreadKeys.has(historyKey(thread.platform, thread.thread_id))) return false;
      const pKey = participantKey(thread.platform, thread.page_id, thread.participant_id);
      if (pKey && normalizedParticipantKeys.has(pKey)) return false;
      return true;
    }),
  ).map((thread) => itemFromRawThread(thread));
  const rawCommentFallbacks = data.comments
    .filter((comment) => !normalizedCommentKeys.has(historyKey(comment.platform, comment.comment_id)))
    .map((comment) => itemFromRawComment(comment));

  return [...items, ...rawThreadFallbacks, ...rawCommentFallbacks].sort((a, b) =>
    String(b.timestamp || "").localeCompare(String(a.timestamp || "")),
  );
}

function participantKey(
  platform: string,
  pageId: string | null | undefined,
  participantId: string | null | undefined,
): string | null {
  if (!platform || !pageId || !participantId) return null;
  return `${platform}:${pageId}:${participantId}`;
}

function dedupeRawThreadsByParticipant<T extends SocialInboxData["threads"][number]>(
  threads: T[],
): T[] {
  const byKey = new Map<string, T>();
  const noKey: T[] = [];
  for (const thread of threads) {
    const key = participantKey(thread.platform, thread.page_id, thread.participant_id);
    if (!key) {
      noKey.push(thread);
      continue;
    }
    const existing = byKey.get(key);
    if (!existing) {
      byKey.set(key, thread);
      continue;
    }
    // Prefer the thread with a non-null participant_name. If both have one or
    // neither does, prefer the most recent by last_message_at.
    if (!existing.participant_name && thread.participant_name) {
      byKey.set(key, thread);
      continue;
    }
    if (existing.participant_name && !thread.participant_name) continue;
    const existingTs = String(existing.last_message_at || "");
    const candidateTs = String(thread.last_message_at || "");
    if (candidateTs > existingTs) byKey.set(key, thread);
  }
  return [...byKey.values(), ...noKey];
}

export function buildMetaInboxMobileConversationItems(
  data: SocialInboxData,
): MetaInboxMobileConversationItem[] {
  return buildMetaInboxQueueItems(data).map((item) => {
    const legacySourceHref = legacyHrefForQueueItem(item);
    return {
      ...item,
      href: item.inboxConversation
        ? `/m/inbox/${encodeURIComponent(item.inboxConversation.id)}`
        : legacySourceHref || "/m/inbox",
      legacySourceHref,
    };
  });
}

function buildQueueContext(data: SocialInboxData) {
  const profileById = new Map(data.customerProfiles.map((profile) => [profile.id, profile]));
  const contactMethodsByProfileId = new Map<string, SocialInboxCustomerContactMethod[]>();
  for (const contactMethod of data.customerContactMethods || []) {
    if (contactMethod.deleted_at) continue;
    const existing = contactMethodsByProfileId.get(contactMethod.customer_profile_id) || [];
    existing.push(contactMethod);
    contactMethodsByProfileId.set(contactMethod.customer_profile_id, existing);
  }

  return {
    profileById,
    contactMethodsByProfileId,
    firstTouchByConversationId: new Map(
      data.firstTouchSources.map((source) => [source.conversation_id, source]),
    ),
    sendAttemptsByConversationId: groupByConversationId(data.sendAttempts || []),
    commentActionsByConversationId: groupByConversationId(data.commentActions || []),
    eventsByConversationId: groupByConversationId(data.conversationEvents || []),
    notesByConversationId: groupByConversationId((data.notes || []).filter((note) => !note.deleted_at)),
    qaScorecardsByConversationId: groupByConversationId(
      (data.qaScorecards || []).filter((scorecard) => !scorecard.deleted_at),
    ),
    threadByKey: new Map(
      data.threads.map((thread) => [historyKey(thread.platform, thread.thread_id), thread]),
    ),
    commentByKey: new Map(
      data.comments.map((comment) => [historyKey(comment.platform, comment.comment_id), comment]),
    ),
  };
}

function itemFromConversation(
  conversation: SocialInboxConversation,
  data: SocialInboxData,
  context: ReturnType<typeof buildQueueContext>,
): MetaInboxQueueDisplayItem {
  const type = conversation.source_type === "public_comment" ? "comment" : "message";
  const channel = conversation.platform === "instagram" ? "Instagram" : "Facebook";
  const sourceId =
    type === "comment"
      ? conversation.source_id || conversation.id
      : conversation.platform_thread_id || conversation.source_id || conversation.id;
  const rawThread = conversation.platform_thread_id
    ? context.threadByKey.get(historyKey(conversation.platform, conversation.platform_thread_id))
    : null;
  const rawComment = conversation.source_id
    ? context.commentByKey.get(historyKey(conversation.platform, conversation.source_id))
    : null;
  const profile = conversation.customer_profile_id
    ? context.profileById.get(conversation.customer_profile_id) || null
    : null;

  return {
    id: `conversation:${conversation.id}`,
    sourceId,
    channel,
    platform: conversation.platform,
    brand: inferSocialBrand(conversation.page_id || rawThread?.page_id || rawComment?.page_id, conversation.ig_user_id || rawThread?.ig_user_id || rawComment?.ig_user_id),
    type,
    sender:
      profile?.display_name ||
      profile?.username ||
      rawThread?.participant_name ||
      rawComment?.author_name ||
      profile?.profile_reference ||
      `${channel} ${type === "comment" ? "Comment" : "Conversation"}`,
    preview:
      rawThread?.snippet ||
      rawComment?.body ||
      (type === "comment" ? "Comment history not synced yet" : "Conversation history not synced yet"),
    status: conversation.needs_reply
      ? "Needs reply"
      : rawThread && rawThread.unread_count > 0
        ? "Unread"
        : "Synced",
    time: formatDateLabel(
      conversation.last_activity_at ||
        rawThread?.last_message_at ||
        rawThread?.last_synced_at ||
        rawComment?.created_time ||
        rawComment?.last_synced_at,
    ),
    timestamp:
      conversation.last_activity_at ||
      rawThread?.last_message_at ||
      rawThread?.last_synced_at ||
      rawComment?.created_time ||
      rawComment?.last_synced_at ||
      null,
    sourceChannel: conversation.source_channel,
    queueCategoryKey: conversation.queue_category_key,
    conversationStatus: conversation.conversation_status,
    sendEligibility: conversation.send_eligibility,
    replyWindowExpiresAt: conversation.reply_window_expires_at,
    humanAgentWindowExpiresAt: conversation.human_agent_window_expires_at,
    routingExplanation: conversation.routing_explanation,
    routingConfidence: conversation.routing_confidence,
    inboxConversation: conversation,
    profile,
    contactMethods: profile ? context.contactMethodsByProfileId.get(profile.id) || [] : [],
    firstTouch: context.firstTouchByConversationId.get(conversation.id) || null,
    sendAttempts: context.sendAttemptsByConversationId.get(conversation.id) || [],
    commentActions: context.commentActionsByConversationId.get(conversation.id) || [],
    conversationEvents: context.eventsByConversationId.get(conversation.id) || [],
    savedReplies: savedRepliesForConversation(data.savedReplies || [], conversation),
    notes: context.notesByConversationId.get(conversation.id) || [],
    qaScorecards: context.qaScorecardsByConversationId.get(conversation.id) || [],
  };
}

function itemFromRawThread(
  thread: SocialInboxData["threads"][number],
): MetaInboxQueueDisplayItem {
  const channel = thread.platform === "instagram" ? "Instagram" : "Facebook";
  return {
    id: `thread:${thread.platform}:${thread.thread_id}`,
    sourceId: thread.thread_id,
    channel,
    platform: thread.platform,
    brand: inferSocialBrand(thread.page_id, thread.ig_user_id),
    type: "message",
    sender: thread.participant_name || `${channel} Conversation`,
    preview: thread.snippet || `${thread.message_count} synced message(s)`,
    status: thread.unread_count > 0 ? "Unread" : "Synced",
    time: formatDateLabel(thread.last_message_at || thread.last_synced_at),
    timestamp: thread.last_message_at || thread.last_synced_at,
    sourceChannel: fallbackSourceChannel(thread.platform, "message"),
    queueCategoryKey: "uncategorized_needs_review",
    conversationStatus: "new_inquiry",
    sendEligibility: "unknown",
    replyWindowExpiresAt: null,
    humanAgentWindowExpiresAt: null,
    routingExplanation: null,
    routingConfidence: null,
    inboxConversation: null,
    profile: null,
    contactMethods: [],
    firstTouch: null,
    sendAttempts: [],
    commentActions: [],
    conversationEvents: [],
    savedReplies: [],
    notes: [],
    qaScorecards: [],
  };
}

function itemFromRawComment(
  comment: SocialInboxData["comments"][number],
): MetaInboxQueueDisplayItem {
  const channel = comment.platform === "instagram" ? "Instagram" : "Facebook";
  return {
    id: `comment:${comment.platform}:${comment.comment_id}`,
    sourceId: comment.comment_id,
    channel,
    platform: comment.platform,
    brand: inferSocialBrand(comment.page_id, comment.ig_user_id),
    type: "comment",
    sender: comment.author_name || `${channel} Comment`,
    preview: comment.body || "Comment text unavailable",
    status: "Needs reply",
    time: formatDateLabel(comment.created_time || comment.last_synced_at),
    timestamp: comment.created_time || comment.last_synced_at,
    sourceChannel: fallbackSourceChannel(comment.platform, "comment"),
    queueCategoryKey: "uncategorized_needs_review",
    conversationStatus: "new_inquiry",
    sendEligibility: "unknown",
    replyWindowExpiresAt: null,
    humanAgentWindowExpiresAt: null,
    routingExplanation: null,
    routingConfidence: null,
    inboxConversation: null,
    profile: null,
    contactMethods: [],
    firstTouch: null,
    sendAttempts: [],
    commentActions: [],
    conversationEvents: [],
    savedReplies: [],
    notes: [],
    qaScorecards: [],
  };
}

function savedRepliesForConversation(
  savedReplies: SocialInboxSavedReply[],
  conversation: SocialInboxConversation,
) {
  return savedReplies
    .filter((savedReply) => {
      if (!savedReply.active) return false;
      if (savedReply.approval_status !== "approved" && savedReply.visibility !== "personal") {
        return false;
      }
      if (savedReply.language !== "en") return false;
      if (
        savedReply.queue_category_key &&
        savedReply.queue_category_key !== conversation.queue_category_key
      ) {
        return false;
      }
      if (savedReply.source_channel && savedReply.source_channel !== conversation.source_channel) {
        return false;
      }
      if (savedReply.lead_quality && savedReply.lead_quality !== conversation.lead_quality) {
        return false;
      }
      return true;
    })
    .sort((a, b) => {
      const specificity = savedReplySpecificity(b, conversation) - savedReplySpecificity(a, conversation);
      if (specificity !== 0) return specificity;
      if (a.visibility !== b.visibility) return a.visibility === "personal" ? -1 : 1;
      return String(b.updated_at || b.created_at || "").localeCompare(
        String(a.updated_at || a.created_at || ""),
      );
    });
}

function savedReplySpecificity(
  savedReply: SocialInboxSavedReply,
  conversation: SocialInboxConversation,
) {
  return [
    savedReply.queue_category_key === conversation.queue_category_key,
    savedReply.source_channel === conversation.source_channel,
    Boolean(savedReply.lead_quality && savedReply.lead_quality === conversation.lead_quality),
  ].filter(Boolean).length;
}

function fallbackSourceChannel(
  platform: "facebook" | "instagram",
  type: "message" | "comment",
): MetaInboxSourceChannelKey {
  if (type === "comment") {
    return platform === "facebook" ? "facebook_public_comment" : "instagram_public_comment";
  }
  return platform === "facebook" ? "facebook_message" : "instagram_message";
}

function formatDateLabel(value: string | null | undefined) {
  if (!value) return "No date";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "No date";
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}

function groupByConversationId<T extends { conversation_id: string }>(items: readonly T[]) {
  const grouped = new Map<string, T[]>();
  for (const item of items) {
    const existing = grouped.get(item.conversation_id) || [];
    existing.push(item);
    grouped.set(item.conversation_id, existing);
  }
  return grouped;
}

function historyKey(platform: string | null | undefined, id: string | null | undefined) {
  return platform && id ? `${platform}:${id}` : "";
}

function legacyHrefForQueueItem(item: MetaInboxQueueDisplayItem) {
  if (!item.sourceId) return null;
  const prefix = item.type === "comment" ? "c" : "t";
  return `/m/inbox/${prefix}-${encodeURIComponent(item.sourceId)}`;
}
