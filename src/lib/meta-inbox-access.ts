import type { SocialInboxData } from "./social-inbox.ts";
import type { MetaInboxQueueCategoryKey } from "./meta-inbox-vocabulary.ts";

export type MetaInboxAccessProfile = {
  appUserId: string | null;
  roles: readonly string[];
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
      firstTouchSources: [],
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
  const threadIds = new Set(
    inboxConversations
      .map((conversation) => conversation.platform_thread_id)
      .filter(Boolean) as string[],
  );
  const sourceIds = new Set(
    inboxConversations
      .map((conversation) => conversation.source_id)
      .filter(Boolean) as string[],
  );

  return {
    ...data,
    inboxConversations,
    customerProfiles: data.customerProfiles.filter((profile) => profileIds.has(profile.id)),
    firstTouchSources: data.firstTouchSources.filter((source) =>
      conversationIds.has(source.conversation_id),
    ),
    threads: data.threads.filter((thread) => threadIds.has(thread.thread_id)),
    messages: data.messages.filter((message) => threadIds.has(message.thread_id)),
    comments: data.comments.filter(
      (comment) =>
        sourceIds.has(comment.comment_id) ||
        Boolean(comment.parent_comment_id && sourceIds.has(comment.parent_comment_id)),
    ),
  };
}
