import type {
  MetaInboxQueueCategoryKey,
  MetaInboxSourceChannelKey,
} from "./meta-inbox-vocabulary.ts";

export type MetaInboxRawRecord = Record<string, unknown>;

export type MetaInboxNormalizationInput = {
  threads?: readonly MetaInboxRawRecord[];
  messages?: readonly MetaInboxRawRecord[];
  comments?: readonly MetaInboxRawRecord[];
  now?: Date;
};

export type MetaInboxCustomerProfileCandidate = {
  profileKey: string;
  platform: "facebook" | "instagram";
  pageId: string | null;
  igUserId: string | null;
  participantId: string;
  displayName: string | null;
  username: string | null;
  profilePictureUrl: string | null;
  profileUrl: string | null;
  profileReference: string | null;
  rawProfileJson: MetaInboxRawRecord;
};

export type MetaInboxConversationCandidate = {
  canonicalConversationKey: string;
  customerProfileKey: string | null;
  sourceChannel: MetaInboxSourceChannelKey;
  sourceType: "message_thread" | "public_comment" | "private_reply" | "ad_referral" | "other";
  platform: "facebook" | "instagram";
  rawThreadId: string | null;
  rawCommentId: string | null;
  pageId: string | null;
  igUserId: string | null;
  participantId: string | null;
  platformThreadId: string | null;
  parentContentId: string | null;
  sourceId: string | null;
  firstInboundAt: string | null;
  latestInboundAt: string | null;
  latestOutboundAt: string | null;
  lastActivityAt: string | null;
  needsReply: boolean;
  replyWindowExpiresAt: string | null;
  humanAgentWindowExpiresAt: string | null;
  sendEligibility: "standard_reply_allowed" | "human_agent_allowed" | "expired" | "unknown";
  conversationStatus:
    | "new_inquiry"
    | "needs_reply"
    | "waiting_on_customer"
    | "follow_up_needed"
    | "appointment_scheduled"
    | "closed"
    | "lost_lead";
  queueCategoryKey: MetaInboxQueueCategoryKey;
  routingSource: "attribution_keyword" | "message_keyword" | "fallback";
  routingConfidence: number;
  routingExplanation: string;
};

export type MetaInboxFirstTouchCandidate = {
  canonicalConversationKey: string;
  firstMessageId: string | null;
  firstMessageAt: string | null;
  referralJson: MetaInboxRawRecord;
  adId: string | null;
  adsContextDataJson: MetaInboxRawRecord;
  ref: string | null;
  sourcePostId: string | null;
  sourceMediaId: string | null;
  sourceCommentId: string | null;
  sourceProductId: string | null;
  sourcePermalink: string | null;
  campaignUmbrellaId: string | null;
  campaignId: string | null;
  adsetId: string | null;
  creativeId: string | null;
  attributionMethod: "meta_referral" | "ads_context_data" | "source_payload" | "none";
  attributionConfidence: number;
  rawPayloadJson: MetaInboxRawRecord;
};

export type MetaInboxNormalizationBatch = {
  customerProfiles: MetaInboxCustomerProfileCandidate[];
  conversations: MetaInboxConversationCandidate[];
  firstTouchSources: MetaInboxFirstTouchCandidate[];
};

const DAY_MS = 24 * 60 * 60 * 1000;
const HUMAN_AGENT_WINDOW_MS = 7 * DAY_MS;

const QUEUE_KEYWORDS: Array<{
  queue: MetaInboxQueueCategoryKey;
  keywords: readonly string[];
}> = [
  {
    queue: "cash_for_gold",
    keywords: ["cash for gold", "sell gold", "selling gold", "trade in", "trade-in", "gold buyer"],
  },
  {
    queue: "book_appointment",
    keywords: ["book appointment", "appointment", "schedule", "consultation", "visit"],
  },
  {
    queue: "us_product",
    keywords: ["us product", "u.s. product", "usa product", "united states", "us inventory"],
  },
  {
    queue: "vn_product",
    keywords: ["vn product", "vietnam", "viet nam", "vn inventory"],
  },
  {
    queue: "custom_jewelry",
    keywords: ["custom", "redesign", "cad", "made to order", "made-to-order", "inspiration photo"],
  },
  {
    queue: "repair_service",
    keywords: ["repair", "resize", "resizing", "cleaning", "appraisal", "warranty", "service"],
  },
];

export function buildMetaInboxNormalizationBatch(
  input: MetaInboxNormalizationInput,
): MetaInboxNormalizationBatch {
  const now = input.now || new Date();
  const profiles = new Map<string, MetaInboxCustomerProfileCandidate>();
  const conversations = new Map<string, MetaInboxConversationCandidate>();
  const firstTouchSources = new Map<string, MetaInboxFirstTouchCandidate>();
  const messagesByThread = groupBy(input.messages || [], (message) =>
    stringField(message.thread_id) || "",
  );

  for (const thread of input.threads || []) {
    const platform = platformField(thread.platform);
    const threadId = stringField(thread.thread_id);
    if (!threadId) continue;

    const threadMessages = messagesByThread.get(threadId) || [];
    const participant = threadParticipant(thread, threadMessages);
    const profile = participant.participantId
      ? customerProfile({
          platform,
          pageId: stringField(thread.page_id),
          igUserId: stringField(thread.ig_user_id),
          participantId: participant.participantId,
          displayName: participant.displayName,
          username: participant.username,
          raw: participant.rawProfileJson,
        })
      : null;

    if (profile) profiles.set(profile.profileKey, profile);

    const canonicalKey = canonicalThreadKey(platform, threadId);
    const timeline = messageTimeline(threadMessages, stringField(thread.last_message_at));
    const firstMessage = firstInboundMessage(threadMessages) || threadMessages[0] || null;
    const firstTouch = firstTouchFromMessage(canonicalKey, firstMessage, thread);
    const routing = inferQueueCategory(firstTouch, [
      stringField(thread.snippet),
      ...threadMessages.map((message) => stringField(message.body)),
    ]);
    const replyWindow = replyWindowState(timeline.latestInboundAt, now);
    const needsReply = Boolean(
      timeline.latestInboundAt &&
        (!timeline.latestOutboundAt || timeline.latestInboundAt >= timeline.latestOutboundAt),
    );

    conversations.set(canonicalKey, {
      canonicalConversationKey: canonicalKey,
      customerProfileKey: profile?.profileKey || null,
      sourceChannel: firstTouch.attributionMethod === "none"
        ? platform === "facebook"
          ? "facebook_message"
          : "instagram_message"
        : "ad_referral",
      sourceType: firstTouch.attributionMethod === "none" ? "message_thread" : "ad_referral",
      platform,
      rawThreadId: stringField(thread.id),
      rawCommentId: null,
      pageId: stringField(thread.page_id),
      igUserId: stringField(thread.ig_user_id),
      participantId: participant.participantId,
      platformThreadId: threadId,
      parentContentId: null,
      sourceId: threadId,
      firstInboundAt: timeline.firstInboundAt,
      latestInboundAt: timeline.latestInboundAt,
      latestOutboundAt: timeline.latestOutboundAt,
      lastActivityAt: timeline.lastActivityAt,
      needsReply,
      replyWindowExpiresAt: replyWindow.replyWindowExpiresAt,
      humanAgentWindowExpiresAt: replyWindow.humanAgentWindowExpiresAt,
      sendEligibility: replyWindow.sendEligibility,
      conversationStatus: needsReply
        ? timeline.latestOutboundAt
          ? "needs_reply"
          : "new_inquiry"
        : "waiting_on_customer",
      queueCategoryKey: routing.queueCategoryKey,
      routingSource: routing.routingSource,
      routingConfidence: routing.routingConfidence,
      routingExplanation: routing.routingExplanation,
    });
    firstTouchSources.set(canonicalKey, firstTouch);
  }

  for (const group of publicCommentGroups(input.comments || [])) {
    const primaryComment = group.rootComment || group.comments[0];
    if (!primaryComment) continue;

    let primaryProfileKey: string | null = null;
    for (const comment of group.comments) {
      const commentId = stringField(comment.comment_id);
      if (!commentId) continue;

      const participantId = stringField(comment.author_id) || `comment-author:${commentId}`;
      const raw = recordField(comment.raw_json);
      const profile = customerProfile({
        platform: group.platform,
        pageId: stringField(comment.page_id),
        igUserId: stringField(comment.ig_user_id),
        participantId,
        displayName:
          stringField(comment.author_name) || firstString(raw, ["from.name", "sender_name"]),
        username: firstString(raw, ["from.username", "username", "value.from.username"]),
        raw,
      });
      profiles.set(profile.profileKey, profile);
      if (comment === primaryComment) primaryProfileKey = profile.profileKey;
    }

    const commentTimes = group.comments
      .map((comment) => stringField(comment.created_time))
      .filter(isPresent)
      .sort();
    const canonicalKey = canonicalCommentKey(group.platform, group.rootCommentId);
    const firstInboundAt = commentTimes[0] || null;
    const latestInboundAt = commentTimes[commentTimes.length - 1] || null;
    const firstTouch = firstTouchFromComment(canonicalKey, primaryComment, group.rootCommentId);
    const routing = group.rootComment
      ? inferQueueCategory(firstTouch, [
          ...group.comments.map((comment) => stringField(comment.body)),
          ...group.comments.map((comment) => stringField(comment.content_permalink)),
        ])
      : orphanCommentRouting();
    const replyWindow = replyWindowState(latestInboundAt, now);
    const primaryCommentId = stringField(primaryComment.comment_id) || group.rootCommentId;
    const participantId =
      stringField(primaryComment.author_id) || `comment-author:${primaryCommentId}`;

    conversations.set(canonicalKey, {
      canonicalConversationKey: canonicalKey,
      customerProfileKey: primaryProfileKey,
      sourceChannel:
        group.platform === "facebook" ? "facebook_public_comment" : "instagram_public_comment",
      sourceType: "public_comment",
      platform: group.platform,
      rawThreadId: null,
      rawCommentId: stringField(primaryComment.id),
      pageId: stringField(primaryComment.page_id),
      igUserId: stringField(primaryComment.ig_user_id),
      participantId,
      platformThreadId: null,
      parentContentId: stringField(primaryComment.content_id),
      sourceId: group.rootCommentId,
      firstInboundAt,
      latestInboundAt,
      latestOutboundAt: null,
      lastActivityAt: latestInboundAt,
      needsReply: true,
      replyWindowExpiresAt: replyWindow.replyWindowExpiresAt,
      humanAgentWindowExpiresAt: replyWindow.humanAgentWindowExpiresAt,
      sendEligibility: replyWindow.sendEligibility,
      conversationStatus: "new_inquiry",
      queueCategoryKey: routing.queueCategoryKey,
      routingSource: routing.routingSource,
      routingConfidence: routing.routingConfidence,
      routingExplanation: routing.routingExplanation,
    });
    firstTouchSources.set(canonicalKey, firstTouch);
  }

  return {
    customerProfiles: [...profiles.values()],
    conversations: [...conversations.values()],
    firstTouchSources: [...firstTouchSources.values()],
  };
}

function customerProfile(input: {
  platform: "facebook" | "instagram";
  pageId: string | null;
  igUserId: string | null;
  participantId: string;
  displayName: string | null;
  username: string | null;
  raw: MetaInboxRawRecord;
}): MetaInboxCustomerProfileCandidate {
  const profilePictureUrl = firstString(input.raw, [
    "profile_picture_url",
    "profile_pic",
    "profile_picture",
    "from.profile_picture_url",
    "sender.profile_picture_url",
    "value.from.profile_picture_url",
  ]);
  const profileUrl = firstString(input.raw, [
    "profile_url",
    "profile.link",
    "from.link",
    "sender.link",
    "value.from.link",
  ]);

  return {
    profileKey: [
      input.platform,
      input.pageId || "",
      input.igUserId || "",
      input.participantId,
    ].join(":"),
    platform: input.platform,
    pageId: input.pageId,
    igUserId: input.igUserId,
    participantId: input.participantId,
    displayName: input.displayName,
    username: input.username,
    profilePictureUrl,
    profileUrl,
    profileReference: profileUrl || input.username || input.participantId,
    rawProfileJson: input.raw,
  };
}

function threadParticipant(
  thread: MetaInboxRawRecord,
  messages: readonly MetaInboxRawRecord[],
) {
  const threadRaw = recordField(thread.raw_json);
  const inbound = messages.find((message) => stringField(message.direction) === "inbound");
  const fallback = inbound || messages[0];
  const fallbackRaw = recordField(fallback?.raw_json);

  return {
    participantId:
      stringField(thread.participant_id) ||
      stringField(inbound?.sender_id) ||
      firstString(fallbackRaw, ["sender.id", "from.id", "value.sender_id"]),
    displayName:
      stringField(thread.participant_name) ||
      stringField(inbound?.sender_name) ||
      firstString(fallbackRaw, ["sender.name", "from.name", "value.sender_name"]),
    username: firstString(threadRaw, [
      "participant.username",
      "from.username",
      "sender.username",
      "value.from.username",
    ]) || firstString(fallbackRaw, ["sender.username", "from.username"]),
    rawProfileJson: Object.keys(fallbackRaw).length ? fallbackRaw : threadRaw,
  };
}

function messageTimeline(messages: readonly MetaInboxRawRecord[], fallbackAt: string | null) {
  const inboundTimes = messages
    .filter((message) => stringField(message.direction) === "inbound")
    .map((message) => stringField(message.sent_at))
    .filter(isPresent)
    .sort();
  const outboundTimes = messages
    .filter((message) => stringField(message.direction) === "outbound")
    .map((message) => stringField(message.sent_at))
    .filter(isPresent)
    .sort();
  const allTimes = [...inboundTimes, ...outboundTimes].sort();

  return {
    firstInboundAt: inboundTimes[0] || null,
    latestInboundAt: inboundTimes[inboundTimes.length - 1] || null,
    latestOutboundAt: outboundTimes[outboundTimes.length - 1] || null,
    lastActivityAt: allTimes[allTimes.length - 1] || fallbackAt,
  };
}

function firstInboundMessage(messages: readonly MetaInboxRawRecord[]) {
  return [...messages]
    .filter((message) => stringField(message.direction) === "inbound")
    .sort((a, b) => String(stringField(a.sent_at) || "").localeCompare(String(stringField(b.sent_at) || "")))[0];
}

function firstTouchFromMessage(
  canonicalConversationKey: string,
  message: MetaInboxRawRecord | null,
  thread: MetaInboxRawRecord,
): MetaInboxFirstTouchCandidate {
  const raw = recordField(message?.raw_json);
  const threadRaw = recordField(thread.raw_json);
  const rawPayload = Object.keys(raw).length ? raw : threadRaw;
  const referral = firstRecord(rawPayload, [
    "referral",
    "message.referral",
    "postback.referral",
    "value.referral",
  ]);
  const adsContext = firstRecord(rawPayload, [
    "ads_context_data",
    "message.ads_context_data",
    "referral.ads_context_data",
    "value.ads_context_data",
  ]);
  const adId = firstString(rawPayload, [
    "ad_id",
    "message.ad_id",
    "referral.ad_id",
    "message.referral.ad_id",
    "ads_context_data.ad_id",
    "message.ads_context_data.ad_id",
    "value.ad_id",
  ]);
  const ref = firstString(rawPayload, [
    "ref",
    "message.ref",
    "referral.ref",
    "message.referral.ref",
    "postback.referral.ref",
  ]);

  return {
    canonicalConversationKey,
    firstMessageId: stringField(message?.id),
    firstMessageAt: stringField(message?.sent_at),
    referralJson: referral,
    adId,
    adsContextDataJson: adsContext,
    ref,
    sourcePostId: firstString(rawPayload, ["post_id", "referral.post_id", "value.post_id"]),
    sourceMediaId: firstString(rawPayload, ["media_id", "referral.media_id", "value.media_id"]),
    sourceCommentId: firstString(rawPayload, ["comment_id", "referral.comment_id", "value.comment_id"]),
    sourceProductId: firstString(rawPayload, ["product_id", "referral.product_id", "value.product_id"]),
    sourcePermalink: firstString(rawPayload, [
      "source_permalink",
      "permalink_url",
      "referral.source_url",
      "message.referral.source_url",
      "referral.referer_uri",
      "message.referral.referer_uri",
      "value.permalink_url",
    ]),
    campaignUmbrellaId: null,
    campaignId: firstString(rawPayload, ["campaign_id", "ads_context_data.campaign_id"]),
    adsetId: firstString(rawPayload, ["adset_id", "ad_set_id", "ads_context_data.adset_id"]),
    creativeId: firstString(rawPayload, ["creative_id", "ads_context_data.creative_id"]),
    attributionMethod: adId || ref ? "meta_referral" : Object.keys(adsContext).length ? "ads_context_data" : "none",
    attributionConfidence: adId ? 0.95 : ref || Object.keys(adsContext).length ? 0.75 : 0,
    rawPayloadJson: rawPayload,
  };
}

function firstTouchFromComment(
  canonicalConversationKey: string,
  comment: MetaInboxRawRecord,
  sourceCommentIdOverride?: string | null,
): MetaInboxFirstTouchCandidate {
  const rawPayload = recordField(comment.raw_json);
  const adId = firstString(rawPayload, ["ad_id", "value.ad_id", "ads_context_data.ad_id"]);
  const adsContext = firstRecord(rawPayload, ["ads_context_data", "value.ads_context_data"]);
  const sourceCommentId = sourceCommentIdOverride || stringField(comment.comment_id);

  return {
    canonicalConversationKey,
    firstMessageId: null,
    firstMessageAt: stringField(comment.created_time),
    referralJson: {},
    adId,
    adsContextDataJson: adsContext,
    ref: firstString(rawPayload, ["ref", "value.ref"]),
    sourcePostId: stringField(comment.content_id) || firstString(rawPayload, ["post_id", "value.post_id"]),
    sourceMediaId: firstString(rawPayload, ["media_id", "value.media_id"]),
    sourceCommentId,
    sourceProductId: firstString(rawPayload, ["product_id", "value.product_id"]),
    sourcePermalink: stringField(comment.content_permalink) || firstString(rawPayload, ["permalink_url", "value.permalink_url"]),
    campaignUmbrellaId: null,
    campaignId: firstString(rawPayload, ["campaign_id", "value.campaign_id", "ads_context_data.campaign_id"]),
    adsetId: firstString(rawPayload, ["adset_id", "ad_set_id", "value.adset_id", "ads_context_data.adset_id"]),
    creativeId: firstString(rawPayload, ["creative_id", "value.creative_id", "ads_context_data.creative_id"]),
    attributionMethod: adId ? "source_payload" : Object.keys(adsContext).length ? "ads_context_data" : "none",
    attributionConfidence: adId ? 0.8 : Object.keys(adsContext).length ? 0.65 : 0,
    rawPayloadJson: rawPayload,
  };
}

function publicCommentGroups(comments: readonly MetaInboxRawRecord[]) {
  const groups = new Map<
    string,
    {
      platform: "facebook" | "instagram";
      rootCommentId: string;
      comments: MetaInboxRawRecord[];
      rootComment: MetaInboxRawRecord | null;
    }
  >();

  for (const comment of comments) {
    const platform = platformField(comment.platform);
    const commentId = stringField(comment.comment_id);
    if (!commentId) continue;

    const rootCommentId = rootCommentIdFor(comment);
    const key = `${platform}:${rootCommentId}`;
    const group = groups.get(key) || {
      platform,
      rootCommentId,
      comments: [],
      rootComment: null,
    };

    group.comments.push(comment);
    if (commentId === rootCommentId) group.rootComment = comment;
    groups.set(key, group);
  }

  return [...groups.values()].map((group) => ({
    ...group,
    comments: [...group.comments].sort(
      (a, b) =>
        String(stringField(a.created_time) || "").localeCompare(
          String(stringField(b.created_time) || ""),
        ) ||
        String(stringField(a.comment_id) || "").localeCompare(
          String(stringField(b.comment_id) || ""),
        ),
    ),
  }));
}

function rootCommentIdFor(comment: MetaInboxRawRecord) {
  const commentId = stringField(comment.comment_id);
  const parentCommentId = stringField(comment.parent_comment_id);
  const parentContentId = stringField(comment.content_id);
  if (parentCommentId && parentCommentId !== parentContentId) return parentCommentId;
  return commentId || "";
}

function orphanCommentRouting() {
  return {
    queueCategoryKey: "uncategorized_needs_review" as const,
    routingSource: "fallback" as const,
    routingConfidence: 0.15,
    routingExplanation: "Root comment missing; needs human review.",
  };
}

function inferQueueCategory(
  firstTouch: MetaInboxFirstTouchCandidate,
  textSources: Array<string | null>,
): {
  queueCategoryKey: MetaInboxQueueCategoryKey;
  routingSource: "attribution_keyword" | "message_keyword" | "fallback";
  routingConfidence: number;
  routingExplanation: string;
} {
  const attributionText = [
    firstTouch.ref,
    firstTouch.adId,
    firstTouch.campaignUmbrellaId,
    firstTouch.campaignId,
    firstTouch.adsetId,
    firstTouch.creativeId,
    JSON.stringify(firstTouch.referralJson),
    JSON.stringify(firstTouch.adsContextDataJson),
  ].join(" ").toLowerCase();
  const messageText = textSources.filter(Boolean).join(" ").toLowerCase();
  const attributionMatch = keywordMatch(attributionText);
  const messageMatch = keywordMatch(messageText);

  if (attributionMatch) {
    return {
      queueCategoryKey: attributionMatch.queue,
      routingSource: "attribution_keyword" as const,
      routingConfidence: 0.85,
      routingExplanation: `Matched ${attributionMatch.keyword} from first-touch attribution.`,
    };
  }

  if (messageMatch) {
    return {
      queueCategoryKey: messageMatch.queue,
      routingSource: "message_keyword" as const,
      routingConfidence: 0.6,
      routingExplanation: `Matched ${messageMatch.keyword} from message text.`,
    };
  }

  const fallbackQueue: MetaInboxQueueCategoryKey = messageText.trim()
    ? "general_inquiry"
    : "uncategorized_needs_review";

  return {
    queueCategoryKey: fallbackQueue,
    routingSource: "fallback" as const,
    routingConfidence: messageText.trim() ? 0.35 : 0.15,
    routingExplanation: messageText.trim()
      ? "No locked routing keyword matched; routed to General Inquiry."
      : "Missing source and message routing signals; needs human review.",
  };
}

function keywordMatch(value: string) {
  for (const group of QUEUE_KEYWORDS) {
    const keyword = group.keywords.find((candidate) => value.includes(candidate));
    if (keyword) return { queue: group.queue, keyword };
  }
  return null;
}

function replyWindowState(latestInboundAt: string | null, now: Date) {
  if (!latestInboundAt) {
    return {
      replyWindowExpiresAt: null,
      humanAgentWindowExpiresAt: null,
      sendEligibility: "unknown" as const,
    };
  }

  const inboundAt = new Date(latestInboundAt);
  if (!Number.isFinite(inboundAt.getTime())) {
    return {
      replyWindowExpiresAt: null,
      humanAgentWindowExpiresAt: null,
      sendEligibility: "unknown" as const,
    };
  }

  const replyWindowExpiresAt = new Date(inboundAt.getTime() + DAY_MS);
  const humanAgentWindowExpiresAt = new Date(inboundAt.getTime() + HUMAN_AGENT_WINDOW_MS);
  const nowMs = now.getTime();

  return {
    replyWindowExpiresAt: replyWindowExpiresAt.toISOString(),
    humanAgentWindowExpiresAt: humanAgentWindowExpiresAt.toISOString(),
    sendEligibility: nowMs <= replyWindowExpiresAt.getTime()
      ? "standard_reply_allowed" as const
      : nowMs <= humanAgentWindowExpiresAt.getTime()
        ? "human_agent_allowed" as const
        : "expired" as const,
  };
}

function canonicalThreadKey(platform: string, threadId: string) {
  return `${platform}:message_thread:${threadId}`;
}

function canonicalCommentKey(platform: string, commentId: string) {
  return `${platform}:public_comment:${commentId}`;
}

function platformField(value: unknown): "facebook" | "instagram" {
  return value === "instagram" ? "instagram" : "facebook";
}

function groupBy<T>(items: readonly T[], keyFor: (item: T) => string) {
  const groups = new Map<string, T[]>();
  for (const item of items) {
    const key = keyFor(item);
    if (!key) continue;
    groups.set(key, [...(groups.get(key) || []), item]);
  }
  return groups;
}

function firstString(record: MetaInboxRawRecord, paths: readonly string[]) {
  for (const path of paths) {
    const value = valueAtPath(record, path);
    if (typeof value === "string" && value.trim()) return value.trim();
    if (typeof value === "number" && Number.isFinite(value)) return String(value);
  }
  return null;
}

function firstRecord(record: MetaInboxRawRecord, paths: readonly string[]) {
  for (const path of paths) {
    const value = valueAtPath(record, path);
    if (isRecord(value)) return value;
  }
  return {};
}

function valueAtPath(record: MetaInboxRawRecord, path: string) {
  return path.split(".").reduce<unknown>((value, segment) => {
    if (!isRecord(value)) return undefined;
    return value[segment];
  }, record);
}

function recordField(value: unknown): MetaInboxRawRecord {
  return isRecord(value) ? value : {};
}

function stringField(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function isPresent(value: string | null): value is string {
  return Boolean(value);
}

function isRecord(value: unknown): value is MetaInboxRawRecord {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}
