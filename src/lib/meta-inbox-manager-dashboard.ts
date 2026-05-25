import {
  META_INBOX_OUTCOMES,
  META_INBOX_QUEUE_CATEGORIES,
  META_INBOX_SOURCE_CHANNELS,
  metaInboxVocabularyLabel,
  type MetaInboxOutcomeKey,
  type MetaInboxQueueCategoryKey,
  type MetaInboxSourceChannelKey,
} from "./meta-inbox-vocabulary.ts";
import type { SocialInboxData } from "./social-inbox.ts";

type Conversation = SocialInboxData["inboxConversations"][number];
type FirstTouchSource = SocialInboxData["firstTouchSources"][number];
type Message = SocialInboxData["messages"][number];
type SendAttempt = SocialInboxData["sendAttempts"][number];
type CommentAction = SocialInboxData["commentActions"][number];
type QaScorecard = SocialInboxData["qaScorecards"][number];

type DashboardInputData = Pick<
  SocialInboxData,
  "inboxConversations" | "sendAttempts" | "firstTouchSources" | "qaScorecards"
> &
  Partial<Pick<SocialInboxData, "messages" | "commentActions">>;

export type MetaInboxManagerDashboardMetric = {
  totalConversations: number;
  needsReply: number;
  unassigned: number;
  missedFollowUps: number;
  staleConversations: number;
  failedSends: number;
  retryBacklog: number;
  missingLeadQuality: number;
  closeoutIncomplete: number;
  qaScorecardsReviewed: number;
  averageQaScore: number | null;
  labelCompletenessPercent: number | null;
  averageFirstResponseMinutes: number | null;
  medianFirstResponseMinutes: number | null;
};

export type MetaInboxManagerDashboardAgeBucketKey =
  | "under_1h"
  | "one_to_four_h"
  | "four_to_twentyfour_h"
  | "over_24h"
  | "unknown";

export type MetaInboxManagerDashboardAgeBucket = {
  key: MetaInboxManagerDashboardAgeBucketKey;
  label: string;
  count: number;
};

export type MetaInboxManagerDashboardQueueRow = {
  queueCategoryKey: MetaInboxQueueCategoryKey;
  label: string;
  totalConversations: number;
  needsReply: number;
  missedFollowUps: number;
  failedSends: number;
};

export type MetaInboxManagerDashboardAssigneeRow = {
  assigneeUserId: string | null;
  label: string;
  totalConversations: number;
  needsReply: number;
  missedFollowUps: number;
  failedSends: number;
  averageFirstResponseMinutes: number | null;
};

export type MetaInboxManagerDashboardSourceRow = {
  sourceChannelKey: MetaInboxSourceChannelKey;
  label: string;
  totalConversations: number;
  needsReply: number;
  failedSends: number;
  averageFirstResponseMinutes: number | null;
};

export type MetaInboxManagerDashboardOutcomeRow = {
  outcomeKey: MetaInboxOutcomeKey;
  label: string;
  count: number;
};

export type MetaInboxManagerDashboardAttributionRow = {
  key: string;
  label: string;
  totalConversations: number;
  needsReply: number;
  failedSends: number;
  averageFirstResponseMinutes: number | null;
  averageAttributionConfidence: number | null;
};

export type MetaInboxManagerDashboard = {
  generatedAt: string;
  range: {
    label: string;
    startAt: string;
    endAt: string;
    days: number;
  };
  metrics: MetaInboxManagerDashboardMetric;
  responseAgeBuckets: MetaInboxManagerDashboardAgeBucket[];
  byQueue: MetaInboxManagerDashboardQueueRow[];
  byAssignee: MetaInboxManagerDashboardAssigneeRow[];
  bySourceChannel: MetaInboxManagerDashboardSourceRow[];
  byOutcome: MetaInboxManagerDashboardOutcomeRow[];
  byCampaignUmbrella: MetaInboxManagerDashboardAttributionRow[];
  byAd: MetaInboxManagerDashboardAttributionRow[];
  byCreative: MetaInboxManagerDashboardAttributionRow[];
};

type DashboardOptions = {
  now?: string | Date;
  days?: number | null;
  filters?: MetaInboxManagerDashboardFilters;
};

export type MetaInboxManagerDashboardFilters = {
  assignedUserId?: string | null;
  assignedTeamId?: string | null;
  queueCategoryKey?: MetaInboxQueueCategoryKey | "all" | string | null;
  sourceChannel?: MetaInboxSourceChannelKey | "all" | string | null;
  campaignUmbrellaId?: string | null;
  adId?: string | null;
  creativeId?: string | null;
  messageContext?: string | null;
};

export function buildMetaInboxManagerDashboard(
  data: DashboardInputData,
  options: DashboardOptions = {},
): MetaInboxManagerDashboard {
  const now = normalizeDate(options.now);
  const days = normalizeDays(options.days);
  const endAt = now.toISOString();
  const startAt = new Date(now.getTime() - days * 24 * 60 * 60 * 1000).toISOString();
  const startTime = Date.parse(startAt);
  const endTime = Date.parse(endAt);

  const firstTouchByConversationId = new Map(
    (data.firstTouchSources || []).map((source) => [source.conversation_id, source]),
  );
  const conversations = data.inboxConversations
    .filter((conversation) => isConversationInRange(conversation, startTime, endTime))
    .filter((conversation) =>
      conversationMatchesDashboardFilters(
        conversation,
        firstTouchByConversationId.get(conversation.id) || null,
        options.filters,
      ),
    );
  const conversationIds = new Set(conversations.map((conversation) => conversation.id));
  const sendAttempts = (data.sendAttempts || []).filter((attempt) =>
    conversationIds.has(attempt.conversation_id),
  );
  const commentActions = (data.commentActions || []).filter((action) =>
    conversationIds.has(action.conversation_id),
  );
  const qaScorecards = (data.qaScorecards || []).filter((scorecard) =>
    conversationIds.has(scorecard.conversation_id) && !scorecard.deleted_at,
  );
  const failedAttempts = sendAttempts.filter(
    (attempt) => attempt.status === "failed_retryable" || attempt.status === "failed_terminal",
  );
  const retryBacklog = failedAttempts.filter((attempt) => attempt.status === "failed_retryable");
  const failedAttemptsByConversationId = groupSendAttemptsByConversationId(failedAttempts);
  const firstResponseAtByConversationId = buildFirstResponseAtByConversationId(
    conversations,
    data.messages || [],
    sendAttempts,
    commentActions,
  );
  const responseTimes = conversations
    .map((conversation) => firstResponseMinutes(conversation, firstResponseAtByConversationId))
    .filter((value): value is number => value !== null && value >= 0);
  const labelCompleteCount = conversations.filter(hasCompleteLeadLabel).length;

  return {
    generatedAt: endAt,
    range: {
      label: `Last ${days} days`,
      startAt,
      endAt,
      days,
    },
    metrics: {
      totalConversations: conversations.length,
      needsReply: conversations.filter((conversation) => conversation.needs_reply).length,
      unassigned: conversations.filter((conversation) => !conversation.assigned_user_id).length,
      missedFollowUps: conversations.filter((conversation) =>
        isMissedFollowUp(conversation.follow_up_at, conversation.conversation_status, endTime),
      ).length,
      staleConversations: conversations.filter((conversation) =>
        isStaleConversation(conversation, endTime),
      ).length,
      failedSends: failedAttempts.length,
      retryBacklog: retryBacklog.length,
      missingLeadQuality: conversations.filter((conversation) => !conversation.lead_quality).length,
      closeoutIncomplete: conversations.filter(isCloseoutIncomplete).length,
      qaScorecardsReviewed: qaScorecards.length,
      averageQaScore: averageQaScore(qaScorecards),
      labelCompletenessPercent: conversations.length
        ? Math.round((labelCompleteCount / conversations.length) * 100)
        : null,
      averageFirstResponseMinutes: average(responseTimes),
      medianFirstResponseMinutes: median(responseTimes),
    },
    responseAgeBuckets: buildResponseAgeBuckets(conversations, endTime),
    byQueue: META_INBOX_QUEUE_CATEGORIES.map((category) => {
      const queueConversations = conversations.filter(
        (conversation) => conversation.queue_category_key === category.key,
      );

      return {
        queueCategoryKey: category.key,
        label: metaInboxVocabularyLabel(META_INBOX_QUEUE_CATEGORIES, category.key),
        totalConversations: queueConversations.length,
        needsReply: queueConversations.filter((conversation) => conversation.needs_reply).length,
        missedFollowUps: queueConversations.filter((conversation) =>
          isMissedFollowUp(conversation.follow_up_at, conversation.conversation_status, endTime),
        ).length,
        failedSends: countFailedSends(queueConversations, failedAttemptsByConversationId),
      };
    }).filter((row) => row.totalConversations || row.failedSends),
    byAssignee: buildAssigneeRows(
      conversations,
      failedAttemptsByConversationId,
      firstResponseAtByConversationId,
      endTime,
    ),
    bySourceChannel: META_INBOX_SOURCE_CHANNELS.map((channel) => {
      const sourceConversations = conversations.filter(
        (conversation) => conversation.source_channel === channel.key,
      );
      return {
        sourceChannelKey: channel.key,
        label: metaInboxVocabularyLabel(META_INBOX_SOURCE_CHANNELS, channel.key),
        totalConversations: sourceConversations.length,
        needsReply: sourceConversations.filter((conversation) => conversation.needs_reply).length,
        failedSends: countFailedSends(sourceConversations, failedAttemptsByConversationId),
        averageFirstResponseMinutes: averageResponseMinutes(
          sourceConversations,
          firstResponseAtByConversationId,
        ),
      };
    }).filter((row) => row.totalConversations || row.failedSends),
    byOutcome: META_INBOX_OUTCOMES.map((outcome) => ({
      outcomeKey: outcome.key,
      label: metaInboxVocabularyLabel(META_INBOX_OUTCOMES, outcome.key),
      count: conversations.filter((conversation) => conversation.inbox_outcome === outcome.key)
        .length,
    })).filter((row) => row.count),
    byCampaignUmbrella: buildAttributionRows(
      conversations,
      firstTouchByConversationId,
      failedAttemptsByConversationId,
      firstResponseAtByConversationId,
      (source) => source.campaign_umbrella_id || null,
      (source) => source.campaign_umbrella_id || source.ref || null,
      "Unattributed",
    ),
    byAd: buildAttributionRows(
      conversations,
      firstTouchByConversationId,
      failedAttemptsByConversationId,
      firstResponseAtByConversationId,
      (source) => source.ad_id || null,
      (source) => attributionLabel("Ad", source.ad_id, source.ref),
      null,
    ),
    byCreative: buildAttributionRows(
      conversations,
      firstTouchByConversationId,
      failedAttemptsByConversationId,
      firstResponseAtByConversationId,
      (source) => source.creative_id || null,
      (source) => attributionLabel("Creative", source.creative_id, source.ref),
      null,
    ),
  };
}

function normalizeDate(value: string | Date | null | undefined) {
  if (value instanceof Date && Number.isFinite(value.getTime())) return value;
  if (typeof value === "string") {
    const parsed = new Date(value);
    if (Number.isFinite(parsed.getTime())) return parsed;
  }
  return new Date();
}

function normalizeDays(value: number | null | undefined) {
  if (!Number.isFinite(value)) return 7;
  return Math.min(31, Math.max(1, Math.floor(Number(value))));
}

function isConversationInRange(conversation: Conversation, startTime: number, endTime: number) {
  const candidates = [
    conversation.last_activity_at,
    conversation.latest_inbound_at,
    conversation.first_inbound_at,
    conversation.follow_up_at,
  ];
  return candidates.some((value) => {
    const time = Date.parse(String(value || ""));
    return Number.isFinite(time) && time >= startTime && time <= endTime;
  });
}

function conversationMatchesDashboardFilters(
  conversation: Conversation,
  firstTouch: FirstTouchSource | null,
  filters: MetaInboxManagerDashboardFilters | null | undefined,
) {
  const assignedUserId = normalizedFilterValue(filters?.assignedUserId);
  if (assignedUserId && conversation.assigned_user_id !== assignedUserId) return false;

  const assignedTeamId = normalizedFilterValue(filters?.assignedTeamId);
  if (assignedTeamId && conversation.assigned_team_id !== assignedTeamId) return false;

  const queueCategoryKey = normalizedFilterValue(filters?.queueCategoryKey);
  if (queueCategoryKey && conversation.queue_category_key !== queueCategoryKey) return false;

  const sourceChannel = normalizedFilterValue(filters?.sourceChannel);
  if (sourceChannel && conversation.source_channel !== sourceChannel) return false;

  const campaignUmbrellaId = normalizedFilterValue(filters?.campaignUmbrellaId);
  if (campaignUmbrellaId && firstTouch?.campaign_umbrella_id !== campaignUmbrellaId) {
    return false;
  }

  const adId = normalizedFilterValue(filters?.adId);
  if (adId && firstTouch?.ad_id !== adId) return false;

  const creativeId = normalizedFilterValue(filters?.creativeId);
  if (creativeId && firstTouch?.creative_id !== creativeId) return false;

  const messageContext = normalizedFilterValue(filters?.messageContext);
  if (
    messageContext &&
    !conversationMatchesMessageContext(conversation, firstTouch, messageContext)
  ) {
    return false;
  }

  return true;
}

function normalizedFilterValue(value: string | null | undefined) {
  const normalized = typeof value === "string" ? value.trim() : "";
  if (!normalized || normalized === "all") return null;
  return normalized;
}

function conversationMatchesMessageContext(
  conversation: Conversation,
  firstTouch: FirstTouchSource | null,
  messageContext: string,
) {
  return [
    conversation.source_type,
    conversation.source_id,
    conversation.platform_thread_id,
    conversation.parent_content_id,
    firstTouch?.first_message_id,
    firstTouch?.ref,
    firstTouch?.source_post_id,
    firstTouch?.source_media_id,
    firstTouch?.source_comment_id,
    firstTouch?.source_product_id,
    firstTouch?.source_permalink,
  ].some((value) => value === messageContext);
}

function isMissedFollowUp(
  followUpAt: string | null,
  status: Conversation["conversation_status"],
  nowTime: number,
) {
  if (status === "closed" || status === "lost_lead") return false;
  const time = Date.parse(String(followUpAt || ""));
  return Number.isFinite(time) && time < nowTime;
}

function isCloseoutIncomplete(conversation: Conversation) {
  const isFinal =
    conversation.conversation_status === "closed" ||
    conversation.conversation_status === "lost_lead" ||
    conversation.inbox_outcome !== "no_outcome_yet";
  if (!isFinal) return false;

  if (!conversation.lead_quality) return true;
  if (!conversation.lead_quality_reason_tags.length) return true;
  if (conversation.inbox_outcome === "no_outcome_yet") return true;
  if (
    (conversation.conversation_status === "lost_lead" || conversation.inbox_outcome === "lost") &&
    !conversation.inbox_lost_reason
  ) {
    return true;
  }
  return false;
}

function isStaleConversation(conversation: Conversation, nowTime: number) {
  if (isFinalConversation(conversation)) return false;
  const age = responseAgeMinutes(conversation, nowTime);
  return age !== null && age >= 48 * 60;
}

function isFinalConversation(conversation: Conversation) {
  return (
    conversation.conversation_status === "closed" ||
    conversation.conversation_status === "lost_lead" ||
    conversation.inbox_outcome !== "no_outcome_yet"
  );
}

function hasCompleteLeadLabel(conversation: Conversation) {
  return Boolean(conversation.lead_quality && conversation.lead_quality_reason_tags.length);
}

function buildResponseAgeBuckets(
  conversations: Conversation[],
  nowTime: number,
): MetaInboxManagerDashboardAgeBucket[] {
  const buckets: MetaInboxManagerDashboardAgeBucket[] = [
    { key: "under_1h", label: "< 1h", count: 0 },
    { key: "one_to_four_h", label: "1-4h", count: 0 },
    { key: "four_to_twentyfour_h", label: "4-24h", count: 0 },
    { key: "over_24h", label: "> 24h", count: 0 },
    { key: "unknown", label: "Unknown", count: 0 },
  ];
  const bucketByKey = new Map(buckets.map((bucket) => [bucket.key, bucket]));

  for (const conversation of conversations) {
    if (!conversation.needs_reply) continue;
    const age = responseAgeMinutes(conversation, nowTime);
    const key =
      age === null
        ? "unknown"
        : age < 60
          ? "under_1h"
          : age < 4 * 60
            ? "one_to_four_h"
            : age < 24 * 60
              ? "four_to_twentyfour_h"
              : "over_24h";
    bucketByKey.get(key)!.count += 1;
  }

  return buckets;
}

function buildAssigneeRows(
  conversations: Conversation[],
  failedAttemptsByConversationId: Map<string, SendAttempt[]>,
  firstResponseAtByConversationId: Map<string, string>,
  nowTime: number,
): MetaInboxManagerDashboardAssigneeRow[] {
  const conversationsByAssignee = new Map<string, Conversation[]>();
  for (const conversation of conversations) {
    const key = conversation.assigned_user_id || "unassigned";
    conversationsByAssignee.set(key, [
      ...(conversationsByAssignee.get(key) || []),
      conversation,
    ]);
  }

  return Array.from(conversationsByAssignee.entries())
    .map(([key, assigneeConversations]) => ({
      assigneeUserId: key === "unassigned" ? null : key,
      label: key === "unassigned" ? "Unassigned" : `${key.slice(0, 8)}...`,
      totalConversations: assigneeConversations.length,
      needsReply: assigneeConversations.filter((conversation) => conversation.needs_reply).length,
      missedFollowUps: assigneeConversations.filter((conversation) =>
        isMissedFollowUp(conversation.follow_up_at, conversation.conversation_status, nowTime),
      ).length,
      failedSends: countFailedSends(assigneeConversations, failedAttemptsByConversationId),
      averageFirstResponseMinutes: averageResponseMinutes(
        assigneeConversations,
        firstResponseAtByConversationId,
      ),
    }))
    .sort((a, b) => {
      if (b.needsReply !== a.needsReply) return b.needsReply - a.needsReply;
      if (b.totalConversations !== a.totalConversations) {
        return b.totalConversations - a.totalConversations;
      }
      return a.label.localeCompare(b.label);
    });
}

function buildAttributionRows(
  conversations: Conversation[],
  firstTouchByConversationId: Map<string, FirstTouchSource>,
  failedAttemptsByConversationId: Map<string, SendAttempt[]>,
  firstResponseAtByConversationId: Map<string, string>,
  keyForSource: (source: FirstTouchSource) => string | null,
  labelForSource: (source: FirstTouchSource) => string | null,
  missingLabel: string | null,
): MetaInboxManagerDashboardAttributionRow[] {
  const groups = new Map<
    string,
    {
      label: string;
      conversations: Conversation[];
      confidenceValues: number[];
    }
  >();

  for (const conversation of conversations) {
    const source = firstTouchByConversationId.get(conversation.id) || null;
    const key = source ? keyForSource(source) : null;
    if (!key && !missingLabel) continue;

    const groupKey = key || "unattributed";
    const existing = groups.get(groupKey) || {
      label: source ? labelForSource(source) || groupKey : missingLabel || groupKey,
      conversations: [],
      confidenceValues: [],
    };
    existing.conversations.push(conversation);
    if (source?.attribution_confidence !== null && source?.attribution_confidence !== undefined) {
      existing.confidenceValues.push(source.attribution_confidence);
    }
    groups.set(groupKey, existing);
  }

  return Array.from(groups.entries())
    .map(([key, group]) => ({
      key,
      label: group.label,
      totalConversations: group.conversations.length,
      needsReply: group.conversations.filter((conversation) => conversation.needs_reply).length,
      failedSends: countFailedSends(group.conversations, failedAttemptsByConversationId),
      averageFirstResponseMinutes: averageResponseMinutes(
        group.conversations,
        firstResponseAtByConversationId,
      ),
      averageAttributionConfidence: averageDecimal(group.confidenceValues),
    }))
    .sort((a, b) => {
      if (b.needsReply !== a.needsReply) return b.needsReply - a.needsReply;
      if (b.totalConversations !== a.totalConversations) {
        return b.totalConversations - a.totalConversations;
      }
      if (b.failedSends !== a.failedSends) return b.failedSends - a.failedSends;
      return a.label.localeCompare(b.label);
    });
}

function attributionLabel(prefix: string, id: string | null, ref: string | null) {
  if (!id) return null;
  const short = shortMetaId(id);
  return ref ? `${ref} · ${short}` : `${prefix} ${short}`;
}

function shortMetaId(value: string) {
  if (value.length <= 18) return value;
  return `${value.slice(0, 6)}...${value.slice(-4)}`;
}

function groupSendAttemptsByConversationId(sendAttempts: SendAttempt[]) {
  const grouped = new Map<string, SendAttempt[]>();
  for (const attempt of sendAttempts) {
    grouped.set(attempt.conversation_id, [
      ...(grouped.get(attempt.conversation_id) || []),
      attempt,
    ]);
  }
  return grouped;
}

function countFailedSends(
  conversations: Conversation[],
  failedAttemptsByConversationId: Map<string, SendAttempt[]>,
) {
  return conversations.reduce(
    (count, conversation) => count + (failedAttemptsByConversationId.get(conversation.id)?.length || 0),
    0,
  );
}

function buildFirstResponseAtByConversationId(
  conversations: Conversation[],
  messages: Message[],
  sendAttempts: SendAttempt[],
  commentActions: CommentAction[],
) {
  const conversationById = new Map(conversations.map((conversation) => [conversation.id, conversation]));
  const conversationIdsByThreadKey = new Map<string, string[]>();
  const firstResponseAtByConversationId = new Map<string, string>();

  for (const conversation of conversations) {
    for (const key of conversationThreadKeys(conversation)) {
      conversationIdsByThreadKey.set(key, [
        ...(conversationIdsByThreadKey.get(key) || []),
        conversation.id,
      ]);
    }
  }

  for (const message of messages) {
    if (message.direction !== "outbound" || !message.sent_at) continue;
    const threadKey = historyKey(message.platform, message.thread_id);
    if (!threadKey) continue;
    const conversationIds = conversationIdsByThreadKey.get(threadKey) || [];
    for (const conversationId of conversationIds) {
      recordFirstResponseAt(
        firstResponseAtByConversationId,
        conversationById.get(conversationId) || null,
        message.sent_at,
      );
    }
  }

  for (const attempt of sendAttempts) {
    if (attempt.status !== "sent" || !attempt.sent_at) continue;
    recordFirstResponseAt(
      firstResponseAtByConversationId,
      conversationById.get(attempt.conversation_id) || null,
      attempt.sent_at,
    );
  }

  for (const action of commentActions) {
    if (
      action.status !== "succeeded" ||
      !action.completed_at ||
      (action.action_type !== "public_reply" && action.action_type !== "private_reply")
    ) {
      continue;
    }
    recordFirstResponseAt(
      firstResponseAtByConversationId,
      conversationById.get(action.conversation_id) || null,
      action.completed_at,
    );
  }

  return firstResponseAtByConversationId;
}

function conversationThreadKeys(conversation: Conversation) {
  if (conversation.source_type !== "message_thread" && conversation.source_type !== "private_reply") {
    return [];
  }

  return [conversation.platform_thread_id, conversation.source_id]
    .map((id) => historyKey(conversation.platform, id))
    .filter((key): key is string => Boolean(key));
}

function historyKey(platform: string | null | undefined, id: string | null | undefined) {
  const normalizedId = typeof id === "string" ? id.trim() : "";
  if (!normalizedId) return null;
  return `${platform || "unknown"}:${normalizedId}`;
}

function recordFirstResponseAt(
  firstResponseAtByConversationId: Map<string, string>,
  conversation: Conversation | null,
  responseAt: string,
) {
  if (!conversation?.first_inbound_at) return;
  const minutes = minutesBetween(conversation.first_inbound_at, responseAt);
  if (minutes === null || minutes < 0) return;

  const existing = firstResponseAtByConversationId.get(conversation.id);
  if (!existing || Date.parse(responseAt) < Date.parse(existing)) {
    firstResponseAtByConversationId.set(conversation.id, responseAt);
  }
}

function firstResponseMinutes(
  conversation: Conversation,
  firstResponseAtByConversationId: Map<string, string>,
) {
  return minutesBetween(
    conversation.first_inbound_at,
    firstResponseAtByConversationId.get(conversation.id) || conversation.latest_outbound_at,
  );
}

function averageResponseMinutes(
  conversations: Conversation[],
  firstResponseAtByConversationId: Map<string, string>,
) {
  return average(
    conversations
      .map((conversation) => firstResponseMinutes(conversation, firstResponseAtByConversationId))
      .filter((value): value is number => value !== null && value >= 0),
  );
}

function averageQaScore(scorecards: QaScorecard[]) {
  return averageDecimal(
    scorecards
      .map((scorecard) => scorecard.overall_score)
      .filter((value): value is number => Number.isFinite(value) && value > 0),
  );
}

function responseAgeMinutes(conversation: Conversation, nowTime: number) {
  const inboundTime = Date.parse(
    String(
      conversation.latest_inbound_at ||
        conversation.last_activity_at ||
        conversation.first_inbound_at ||
        "",
    ),
  );
  if (!Number.isFinite(inboundTime) || inboundTime > nowTime) return null;
  return Math.round((nowTime - inboundTime) / 60_000);
}

function minutesBetween(start: string | null, end: string | null) {
  const startTime = Date.parse(String(start || ""));
  const endTime = Date.parse(String(end || ""));
  if (!Number.isFinite(startTime) || !Number.isFinite(endTime)) return null;
  if (endTime < startTime) return null;
  return Math.round((endTime - startTime) / 60_000);
}

function average(values: number[]) {
  if (!values.length) return null;
  return Math.round(values.reduce((sum, value) => sum + value, 0) / values.length);
}

function averageDecimal(values: number[]) {
  if (!values.length) return null;
  return Math.round((values.reduce((sum, value) => sum + value, 0) / values.length) * 100) / 100;
}

function median(values: number[]) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  if (sorted.length % 2) return sorted[middle];
  return Math.round((sorted[middle - 1] + sorted[middle]) / 2);
}
