import type { SocialInboxData } from "./social-inbox.ts";
import type { MetaInboxQueueCategoryKey } from "./meta-inbox-vocabulary.ts";

export type MetaInboxAccessProfile = {
  appUserId: string | null;
  roles: readonly string[];
  permissions?: readonly string[];
  // Trusted server-side automation (e.g. the auto-assign sweep). When true, the
  // operational-write gate does not require a linked app user — the write is
  // recorded with a NULL actor_user_id, the v1 marker for a system action.
  system?: boolean;
};

// Used by the auto-assign cron worker. appUserId === null => the workflow records
// actor_user_id = NULL (system marker). system:true lets it pass the operational
// write gate without a linked app user. roles ["admin"] grants full queue access.
export const SYSTEM_INBOX_PROFILE: MetaInboxAccessProfile = {
  appUserId: null,
  roles: ["admin"],
  permissions: ["manage_inbox_state"],
  system: true,
};

export type MetaInboxQueueAccessDecision =
  | {
      mode: "all";
      allowedQueueCategoryKeys: null;
      reason: "full_access_role" | "unscoped_internal_read";
    }
  | {
      mode: "team";
      allowedQueueCategoryKeys: MetaInboxQueueCategoryKey[];
      reason: "team_queue_access";
    }
  | {
      mode: "none";
      allowedQueueCategoryKeys: [];
      reason: "missing_app_user" | "unsupported_role";
    };

const FULL_QUEUE_ACCESS_ROLES = new Set(["admin", "marketing", "executive", "read_only"]);
const TEAM_QUEUE_ACCESS_ROLES = new Set(["sales", "sales_lead"]);
const OPERATIONAL_WRITE_ROLES = new Set(["admin", "sales", "sales_lead"]);
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

class MetaInboxAuthorizationError extends Error {
  status: number;

  constructor(message: string, status = 403) {
    super(message);
    this.name = "AuthorizationError";
    this.status = status;
  }
}

export function metaInboxQueueAccessScopeForProfile(
  profile: MetaInboxAccessProfile | null | undefined,
): MetaInboxQueueAccessDecision {
  if (!profile) {
    return {
      mode: "all",
      allowedQueueCategoryKeys: null,
      reason: "unscoped_internal_read",
    };
  }

  if (profile.roles.some((role) => FULL_QUEUE_ACCESS_ROLES.has(role))) {
    return {
      mode: "all",
      allowedQueueCategoryKeys: null,
      reason: "full_access_role",
    };
  }

  if (profile.roles.some((role) => TEAM_QUEUE_ACCESS_ROLES.has(role))) {
    if (!profile.appUserId) {
      return {
        mode: "none",
        allowedQueueCategoryKeys: [],
        reason: "missing_app_user",
      };
    }

    return {
      mode: "team",
      allowedQueueCategoryKeys: [],
      reason: "team_queue_access",
    };
  }

  return {
    mode: "none",
    allowedQueueCategoryKeys: [],
    reason: "unsupported_role",
  };
}

export function filterSocialInboxDataForQueueAccess(
  data: SocialInboxData,
  access: MetaInboxQueueAccessDecision,
): SocialInboxData {
  if (access.mode === "all") return data;

  const allowedQueues = new Set(access.allowedQueueCategoryKeys);
  if (!allowedQueues.size) {
    return {
      ...data,
      threads: [],
      messages: [],
      comments: [],
      inboxConversations: [],
      customerProfiles: [],
      customerContactMethods: [],
      firstTouchSources: [],
      sendAttempts: [],
      commentActions: [],
      conversationEvents: [],
      savedReplies: [],
      notes: [],
      qaScorecards: [],
    };
  }

  const inboxConversations = data.inboxConversations.filter((conversation) =>
    allowedQueues.has(conversation.queue_category_key),
  );
  const conversationIds = new Set(inboxConversations.map((conversation) => conversation.id));
  const profileIds = new Set(
    inboxConversations
      .map((conversation) => conversation.customer_profile_id)
      .filter(Boolean) as string[],
  );
  const threadKeys = new Set(
    inboxConversations
      .map((conversation) => historyKey(conversation.platform, conversation.platform_thread_id))
      .filter(Boolean) as string[],
  );
  const sourceKeys = new Set(
    inboxConversations
      .map((conversation) => historyKey(conversation.platform, conversation.source_id))
      .filter(Boolean) as string[],
  );

  return {
    ...data,
    inboxConversations,
    customerProfiles: data.customerProfiles.filter((profile) => profileIds.has(profile.id)),
    customerContactMethods: (data.customerContactMethods || []).filter((contactMethod) =>
      profileIds.has(contactMethod.customer_profile_id),
    ),
    firstTouchSources: data.firstTouchSources.filter((source) =>
      conversationIds.has(source.conversation_id),
    ),
    sendAttempts: (data.sendAttempts || []).filter((attempt) =>
      conversationIds.has(attempt.conversation_id),
    ),
    commentActions: (data.commentActions || []).filter((action) =>
      conversationIds.has(action.conversation_id),
    ),
    conversationEvents: (data.conversationEvents || []).filter((event) =>
      conversationIds.has(event.conversation_id),
    ),
    savedReplies: (data.savedReplies || []).filter(
      (savedReply) =>
        !savedReply.queue_category_key || allowedQueues.has(savedReply.queue_category_key),
    ),
    notes: (data.notes || []).filter((note) => conversationIds.has(note.conversation_id)),
    qaScorecards: (data.qaScorecards || []).filter((scorecard) =>
      conversationIds.has(scorecard.conversation_id),
    ),
    threads: data.threads.filter((thread) =>
      hasHistoryKey(threadKeys, thread.platform, thread.thread_id),
    ),
    messages: data.messages.filter((message) =>
      hasHistoryKey(threadKeys, message.platform, message.thread_id),
    ),
    comments: data.comments.filter(
      (comment) =>
        hasHistoryKey(sourceKeys, comment.platform, comment.comment_id) ||
        hasHistoryKey(sourceKeys, comment.platform, comment.parent_comment_id),
    ),
  };
}

export function canReadMetaInboxConversationForQueueAccess(
  conversation: Pick<SocialInboxData["inboxConversations"][number], "queue_category_key">,
  access: MetaInboxQueueAccessDecision,
) {
  if (access.mode === "all") return true;
  if (access.mode === "none") return false;

  return access.allowedQueueCategoryKeys.includes(conversation.queue_category_key);
}

export function assertMetaInboxOperationalWriteAccess(
  profile: MetaInboxAccessProfile | null | undefined,
): asserts profile is MetaInboxAccessProfile {
  const roles = profile?.roles || [];
  if (!roles.some((role) => OPERATIONAL_WRITE_ROLES.has(role))) {
    throw new MetaInboxAuthorizationError(
      "Inbox operational writes require a sales, sales lead, or admin role.",
      403,
    );
  }

  // Trusted system automation writes with a NULL actor and no linked app user.
  if (profile?.system) return;

  if (!profile?.appUserId || !UUID_RE.test(profile.appUserId)) {
    throw new MetaInboxAuthorizationError(
      "A linked app user is required for inbox operational writes.",
      403,
    );
  }
}

export function assertMetaInboxConversationMutationAccess(
  conversation: Pick<SocialInboxData["inboxConversations"][number], "queue_category_key">,
  access: MetaInboxQueueAccessDecision,
  options: { targetQueueCategoryKey?: MetaInboxQueueCategoryKey | null } = {},
) {
  if (!canReadMetaInboxConversationForQueueAccess(conversation, access)) {
    throw new MetaInboxAuthorizationError("You do not have access to this inbox queue.", 403);
  }

  if (
    access.mode === "team" &&
    options.targetQueueCategoryKey &&
    !access.allowedQueueCategoryKeys.includes(options.targetQueueCategoryKey)
  ) {
    throw new MetaInboxAuthorizationError(
      "You do not have access to the target inbox queue.",
      403,
    );
  }
}

function historyKey(platform: string | null | undefined, id: string | null | undefined) {
  const normalizedId = typeof id === "string" ? id.trim() : "";
  if (!normalizedId) return null;
  return `${platform || "unknown"}:${normalizedId}`;
}

function hasHistoryKey(
  keys: Set<string>,
  platform: string | null | undefined,
  id: string | null | undefined,
) {
  const key = historyKey(platform, id);
  return Boolean(key && keys.has(key));
}
