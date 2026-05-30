import { classifyCampaignUmbrella, isCampaignUmbrella } from "./campaign-umbrellas.ts";
import type { CampaignUmbrella } from "./campaign-umbrellas.ts";
import type {
  MetaInboxQueueCategoryKey,
  MetaInboxSourceChannelKey,
} from "./meta-inbox-vocabulary.ts";

export type MetaInboxRawRecord = Record<string, unknown>;

export type MetaInboxRoutingSource = "campaign_umbrella" | "fallback";

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
  routingSource: MetaInboxRoutingSource;
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

export type MetaAdsLookupRow = {
  ad_id: string;
  campaign_id: string | null;
  ad_set_id: string | null;
  creative_id: string | null;
  campaign_name: string | null;
  ad_set_name: string | null;
  /**
   * Pre-resolved campaign umbrella populated by the analyst sync pipeline.
   * Already accounts for manual `campaign_umbrella_overrides` and the
   * inherited-from-campaign fallback chain, so reading this value is the
   * single source of truth shared with the analyst page. Null when the
   * analyst sync has not yet classified this ad.
   */
  campaign_umbrella: string | null;
};

/**
 * Enrich a first-touch source captured from a click-to-Messenger referral
 * (which only carries `ad_id`) with the campaign/adset/creative chain we
 * already sync locally in `meta_ads`. Pure — caller does the supabase lookup
 * and hands the row (or null) to this function.
 *
 * Umbrella resolution prefers the stored `campaign_umbrella` column (which
 * the analyst sync writes after applying overrides + inherited classification)
 * and only falls back to running `classifyCampaignUmbrella` from raw names
 * when the stored value is missing — e.g. a brand-new ad the analyst sync
 * has not classified yet.
 */
export function enrichFirstTouchSourceWithAd(
  source: MetaInboxFirstTouchCandidate,
  adRow: MetaAdsLookupRow | null,
): MetaInboxFirstTouchCandidate {
  if (!adRow) return source;
  const storedUmbrella = isCampaignUmbrella(adRow.campaign_umbrella)
    ? (adRow.campaign_umbrella as CampaignUmbrella)
    : null;
  const resolvedUmbrella =
    storedUmbrella ||
    fallbackClassifyUmbrella(adRow.campaign_name, adRow.ad_set_name);
  return {
    ...source,
    campaignId: source.campaignId || adRow.campaign_id,
    adsetId: source.adsetId || adRow.ad_set_id,
    creativeId: source.creativeId || adRow.creative_id,
    campaignUmbrellaId: source.campaignUmbrellaId || resolvedUmbrella,
  };
}

function fallbackClassifyUmbrella(
  campaignName: string | null,
  adSetName: string | null,
): CampaignUmbrella | null {
  if (!campaignName && !adSetName) return null;
  const result = classifyCampaignUmbrella({ campaignName, adSetName });
  return result.umbrella;
}

/**
 * Re-resolve routing on every conversation in `batch` using the ad lookup
 * map produced after the first-touch sources are persisted. The first
 * normalization pass runs `inferQueueCategory` before the supabase ad
 * lookup has happened, so any conversation tied to a click-to-Messenger ad
 * is initially classified as a fallback. This pass enriches first-touch
 * sources with the analyst-resolved `campaign_umbrella`, then upgrades the
 * conversation routing to `campaign_umbrella` whenever a recognised
 * umbrella maps to a queue. Conversations without a usable umbrella keep
 * the original fallback routing (which already correctly distinguished
 * "has inbound text → general_inquiry" from "no text → needs review").
 */
export function applyCampaignUmbrellaRouting(
  batch: MetaInboxNormalizationBatch,
  adLookup: Map<string, MetaAdsLookupRow>,
): MetaInboxNormalizationBatch {
  const enrichedFirstTouchSources = batch.firstTouchSources.map((source) =>
    source.adId ? enrichFirstTouchSourceWithAd(source, adLookup.get(source.adId) || null) : source,
  );
  const firstTouchByConversation = new Map(
    enrichedFirstTouchSources.map(
      (source) => [source.canonicalConversationKey, source] as const,
    ),
  );

  const conversations = batch.conversations.map((conversation) => {
    const firstTouch = firstTouchByConversation.get(conversation.canonicalConversationKey);
    if (!firstTouch) return conversation;
    const mapped = umbrellaToQueueCategory(firstTouch.campaignUmbrellaId);
    if (!mapped) return conversation;
    return {
      ...conversation,
      queueCategoryKey: mapped,
      routingSource: "campaign_umbrella" as const,
      routingConfidence: 0.85,
      routingExplanation: `Routed by campaign umbrella: ${firstTouch.campaignUmbrellaId}.`,
    };
  });

  return {
    customerProfiles: batch.customerProfiles,
    conversations,
    firstTouchSources: enrichedFirstTouchSources,
  };
}

export type MetaInboxThreadHistoryLoader = (
  platform: string,
  threadId: string,
) => Promise<readonly MetaInboxRawRecord[]>;

const DAY_MS = 24 * 60 * 60 * 1000;
const HUMAN_AGENT_WINDOW_MS = 7 * DAY_MS;

/**
 * Single source of truth for mapping an analyst-side campaign umbrella to an
 * inbox queue. Any umbrella not listed here (currently "Excluded /
 * Non-umbrella" and "Needs review") falls through to general_inquiry.
 *
 * UI-friendly labels for these queues live in
 * META_INBOX_QUEUE_CATEGORIES — this map only deals with internal keys.
 */
const UMBRELLA_TO_QUEUE: Readonly<Record<CampaignUmbrella, MetaInboxQueueCategoryKey | null>> = {
  "Cash for Gold US": "cash_for_gold",
  "Book Appts US": "book_appointment",
  "Facebook US Product": "us_product",
  "Facebook VN Product": "vn_product",
  "US Promotions (WKDS / OOAK)": "us_promotions",
  "VN Promotions (WKDS / OOAK)": "vn_promotions",
  "Excluded / Non-umbrella": null,
  "Needs review": null,
};

export function umbrellaToQueueCategory(
  umbrella: string | null | undefined,
): MetaInboxQueueCategoryKey | null {
  if (!isCampaignUmbrella(umbrella)) return null;
  return UMBRELLA_TO_QUEUE[umbrella as CampaignUmbrella];
}

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

  // A single customer (page + participant) can own more than one raw thread:
  // polling stores a real `t_…` thread with the full inbound history, while a
  // webhook send/echo lands on a synthetic `…:webhook:…` thread. Both resolve
  // to the same canonical key, so we group every raw thread that shares a
  // canonical key and compute ONE conversation from the union of their
  // messages. Computing per raw thread and writing per canonical key (the
  // previous behavior) let whichever raw thread was processed last clobber the
  // timeline — e.g. a lone outbound webhook reply blanking a real inbound
  // history and wrongly closing the reply window.
  const threadGroups = new Map<string, MetaInboxRawRecord[]>();
  for (const thread of input.threads || []) {
    const platform = platformField(thread.platform);
    const threadId = stringField(thread.thread_id);
    if (!threadId) continue;
    const participant = threadParticipant(thread, messagesByThread.get(threadId) || []);
    const canonicalKey = canonicalThreadKey(
      platform,
      {
        pageId: stringField(thread.page_id),
        igUserId: stringField(thread.ig_user_id),
        participantId: participant.participantId,
      },
      threadId,
    );
    const existing = threadGroups.get(canonicalKey);
    if (existing) existing.push(thread);
    else threadGroups.set(canonicalKey, [thread]);
  }

  for (const [canonicalKey, groupThreads] of threadGroups) {
    const primaryThread = pickPrimaryThread(groupThreads, messagesByThread);
    const platform = platformField(primaryThread.platform);
    const threadId = stringField(primaryThread.thread_id);
    const threadMessages = mergeThreadMessages(groupThreads, messagesByThread);
    const participant = threadParticipant(primaryThread, threadMessages);
    const profile = participant.participantId
      ? customerProfile({
          platform,
          pageId: stringField(primaryThread.page_id),
          igUserId: stringField(primaryThread.ig_user_id),
          participantId: participant.participantId,
          displayName: participant.displayName,
          username: participant.username,
          raw: participant.rawProfileJson,
        })
      : null;

    if (profile) profiles.set(profile.profileKey, profile);

    const timeline = messageTimeline(threadMessages, stringField(primaryThread.last_message_at));
    const firstMessage = firstInboundMessage(threadMessages) || threadMessages[0] || null;
    const firstTouch = firstTouchFromMessage(canonicalKey, firstMessage, primaryThread);
    const inboundBodies = threadMessages
      .filter((message) => stringField(message.direction) !== "outbound")
      .map((message) => stringField(message.body));
    const hasInboundText = [stringField(primaryThread.snippet), ...inboundBodies].some(
      (value) => Boolean(value && value.trim()),
    );
    const routing = inferQueueCategory(firstTouch, hasInboundText);
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
      rawThreadId: stringField(primaryThread.id),
      rawCommentId: null,
      pageId: stringField(primaryThread.page_id),
      igUserId: stringField(primaryThread.ig_user_id),
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
    const commentHasText = group.comments.some((comment) => {
      const body = stringField(comment.body);
      return Boolean(body && body.trim());
    });
    const routing = group.rootComment
      ? inferQueueCategory(firstTouch, commentHasText)
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

export async function buildMetaInboxNormalizationBatchWithThreadHistory(
  input: MetaInboxNormalizationInput,
  loadThreadHistory: MetaInboxThreadHistoryLoader,
): Promise<MetaInboxNormalizationBatch> {
  const expanded = await expandMessagesWithThreadHistory(input, loadThreadHistory);
  return buildMetaInboxNormalizationBatch(expanded);
}

async function expandMessagesWithThreadHistory(
  input: MetaInboxNormalizationInput,
  loadThreadHistory: MetaInboxThreadHistoryLoader,
): Promise<MetaInboxNormalizationInput> {
  if (!input.threads?.length) return input;

  const merged = new Map<string, MetaInboxRawRecord>();
  const fallbackKeyByMessage = new Map<MetaInboxRawRecord, string>();

  const keyFor = (message: MetaInboxRawRecord) => {
    const platform = stringField(message.platform);
    const messageId = stringField(message.message_id);
    if (platform && messageId) return `${platform}:${messageId}`;
    const fallback = fallbackKeyByMessage.get(message);
    if (fallback) return fallback;
    const generated = `unkeyed:${fallbackKeyByMessage.size}`;
    fallbackKeyByMessage.set(message, generated);
    return generated;
  };

  for (const thread of input.threads) {
    const platform = stringField(thread.platform);
    const threadId = stringField(thread.thread_id);
    if (!platform || !threadId) continue;
    const loaded = await loadThreadHistory(platform, threadId);
    for (const message of loaded) {
      const key = keyFor(message);
      if (!merged.has(key)) merged.set(key, message);
    }
  }

  for (const message of input.messages || []) {
    const key = keyFor(message);
    merged.set(key, message);
  }

  return { ...input, messages: [...merged.values()] };
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

// When several raw threads share a canonical key, the one with the richest
// message history wins as the conversation's display/identity thread (the real
// polled `t_…` thread over a one-message synthetic `…:webhook:…` thread). Ties
// fall back to most-recent activity, then thread id, for deterministic output.
function pickPrimaryThread(
  threads: readonly MetaInboxRawRecord[],
  messagesByThread: Map<string, MetaInboxRawRecord[]>,
): MetaInboxRawRecord {
  const messageCountFor = (thread: MetaInboxRawRecord) =>
    (messagesByThread.get(stringField(thread.thread_id) || "") || []).length;
  return [...threads].sort((a, b) => {
    const byCount = messageCountFor(b) - messageCountFor(a);
    if (byCount !== 0) return byCount;
    const byActivity = (stringField(b.last_message_at) || "").localeCompare(
      stringField(a.last_message_at) || "",
    );
    if (byActivity !== 0) return byActivity;
    return (stringField(a.thread_id) || "").localeCompare(stringField(b.thread_id) || "");
  })[0];
}

// Union the messages of every raw thread in a canonical group, deduped by
// (platform, message_id) so overlapping history loads don't double-count.
function mergeThreadMessages(
  threads: readonly MetaInboxRawRecord[],
  messagesByThread: Map<string, MetaInboxRawRecord[]>,
): MetaInboxRawRecord[] {
  if (threads.length === 1) {
    return messagesByThread.get(stringField(threads[0].thread_id) || "") || [];
  }
  const merged = new Map<string, MetaInboxRawRecord>();
  let unkeyed = 0;
  for (const thread of threads) {
    const threadMessages = messagesByThread.get(stringField(thread.thread_id) || "") || [];
    for (const message of threadMessages) {
      const platform = stringField(message.platform);
      const messageId = stringField(message.message_id);
      const key = platform && messageId ? `${platform}:${messageId}` : `unkeyed:${unkeyed++}`;
      if (!merged.has(key)) merged.set(key, message);
    }
  }
  return [...merged.values()];
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

/**
 * Routing rule (post-keyword era): if the conversation's first-touch source
 * carries a recognised campaign umbrella, route to the matching queue;
 * otherwise route by presence of message text. We never inspect the message
 * body for keywords — that produced false positives (e.g. auto-replies
 * matching "appointment") and decoupled the inbox queue from the analyst's
 * own campaign rollup.
 *
 * The `firstTouch.campaignUmbrellaId` field is populated by
 * `enrichFirstTouchSourceWithAd` (which reads `meta_ads.campaign_umbrella`,
 * the analyst-resolved value with overrides applied). Until that enrichment
 * runs, this function will route ad-driven threads to the fallback bucket;
 * the caller is expected to invoke `applyCampaignUmbrellaRouting` after the
 * ad lookup completes to settle the final queue.
 */
function inferQueueCategory(
  firstTouch: MetaInboxFirstTouchCandidate,
  hasInboundText: boolean,
): {
  queueCategoryKey: MetaInboxQueueCategoryKey;
  routingSource: MetaInboxRoutingSource;
  routingConfidence: number;
  routingExplanation: string;
} {
  const umbrella = firstTouch.campaignUmbrellaId;
  const mapped = umbrellaToQueueCategory(umbrella);
  if (mapped) {
    return {
      queueCategoryKey: mapped,
      routingSource: "campaign_umbrella" as const,
      routingConfidence: 0.85,
      routingExplanation: `Routed by campaign umbrella: ${umbrella}.`,
    };
  }

  if (hasInboundText) {
    return {
      queueCategoryKey: "general_inquiry",
      routingSource: "fallback" as const,
      routingConfidence: 0.35,
      routingExplanation: umbrella
        ? `Campaign umbrella '${umbrella}' has no queue mapping — routed to General Inquiry.`
        : "No ad attribution captured — routed to General Inquiry.",
    };
  }

  return {
    queueCategoryKey: "uncategorized_needs_review",
    routingSource: "fallback" as const,
    routingConfidence: 0.15,
    routingExplanation: "Missing attribution and message text — needs human review.",
  };
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

function toIsoOrNull(value: unknown): string | null {
  if (typeof value !== "string" || !value) return null;
  const ms = Date.parse(value);
  return Number.isFinite(ms) ? new Date(ms).toISOString() : null;
}

// Compare two (already-canonical ISO) timestamps by instant, returning the
// later (or earlier) of the two and tolerating nulls.
function laterIso(a: string | null, b: string | null): string | null {
  if (!a) return b;
  if (!b) return a;
  return Date.parse(a) >= Date.parse(b) ? a : b;
}

function earlierIso(a: string | null, b: string | null): string | null {
  if (!a) return b;
  if (!b) return a;
  return Date.parse(a) <= Date.parse(b) ? a : b;
}

/**
 * Durable guard for the conversation upsert: a conversation's message timeline
 * only ever grows, so a normalization pass that sees a PARTIAL message set must
 * never regress the stored timeline. The incremental webhook path normalizes a
 * single synthetic-thread message (often an outbound reply with no inbound),
 * which would otherwise blank `latest_inbound_at` and wrongly close the reply
 * window. We merge the freshly-computed row with the stored row — earliest
 * first-inbound, latest of every "latest" field — then recompute the reply
 * window and needs_reply from the merged timeline so eligibility stays honest.
 *
 * Operates on persisted snake_case rows so it can sit directly in the upsert
 * map alongside preserveMetaInboxConversationWorkflowFields.
 */
export function preserveConversationTimeline(
  row: Record<string, unknown>,
  existing: Record<string, unknown>,
  now: Date,
): Record<string, unknown> {
  const firstInboundAt = earlierIso(
    toIsoOrNull(row.first_inbound_at),
    toIsoOrNull(existing.first_inbound_at),
  );
  const latestInboundAt = laterIso(
    toIsoOrNull(row.latest_inbound_at),
    toIsoOrNull(existing.latest_inbound_at),
  );
  const latestOutboundAt = laterIso(
    toIsoOrNull(row.latest_outbound_at),
    toIsoOrNull(existing.latest_outbound_at),
  );
  const lastActivityAt = laterIso(
    toIsoOrNull(row.last_activity_at),
    toIsoOrNull(existing.last_activity_at),
  );
  const replyWindow = replyWindowState(latestInboundAt, now);
  const needsReply = Boolean(
    latestInboundAt && (!latestOutboundAt || laterIso(latestInboundAt, latestOutboundAt) === latestInboundAt),
  );

  return {
    ...row,
    first_inbound_at: firstInboundAt,
    latest_inbound_at: latestInboundAt,
    latest_outbound_at: latestOutboundAt,
    last_activity_at: lastActivityAt,
    reply_window_expires_at: replyWindow.replyWindowExpiresAt,
    human_agent_window_expires_at: replyWindow.humanAgentWindowExpiresAt,
    send_eligibility: replyWindow.sendEligibility,
    needs_reply: needsReply,
  };
}

// Synthetic webhook thread ids are minted as
// `<platform>:webhook:<businessId>:<participantId>` (see meta-webhook-shape).
// They reliably encode the identity, so when the row-level identity is
// unresolved we recover it from the id rather than embedding the raw id into
// the canonical key. Returns null for non-webhook ids or `unknown` sentinels.
function parseWebhookThreadIdentity(
  threadId: string,
): { businessId: string; participantId: string } | null {
  const parts = threadId.split(":");
  if (parts.length !== 4 || parts[1] !== "webhook") return null;
  const businessId = parts[2];
  const participantId = parts[3];
  if (!businessId || businessId === "unknown") return null;
  if (!participantId || participantId === "unknown") return null;
  return { businessId, participantId };
}

// Identity-based canonical key keeps webhook (synthetic thread id) and polling
// (real `t_…` id) on the same conversation row when they describe the same
// participant on the same page. When the row-level identity is incomplete we
// recover it from a synthetic webhook id (which encodes it); only when that
// also fails do we fall back to the raw thread id. Without this recovery, a
// webhook thread normalized before its participant resolves produced a
// malformed `…:message_thread:<platform>:webhook:…` key and a duplicate
// conversation row.
function canonicalThreadKey(
  platform: string,
  identity: { pageId: string | null; igUserId: string | null; participantId: string | null },
  threadId: string,
) {
  let businessId = identity.pageId || identity.igUserId;
  let participantId = identity.participantId;
  if (!businessId || !participantId) {
    const parsed = parseWebhookThreadIdentity(threadId);
    if (parsed) {
      businessId = businessId || parsed.businessId;
      participantId = participantId || parsed.participantId;
    }
  }
  if (businessId && participantId) {
    return `${platform}:message_thread:${businessId}:${participantId}`;
  }
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
