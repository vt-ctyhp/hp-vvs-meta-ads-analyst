import { randomUUID } from "node:crypto";

import { AuthorizationError } from "./app-auth.ts";
import { ConfigurationError, getMetaApiVersion } from "./env";
import { safeErrorMessage } from "./error-message";
import { getMetaPermissionHealth } from "./meta";
import {
  createAdsAnalystClient,
} from "./ads-analyst-db";
import {
  activeMetaInboxOnConflict,
  getActiveMetaInboxEnvironment,
  scopeActiveMetaInboxEnvironment,
  withActiveMetaInboxEnvironment,
  withActiveMetaInboxEnvironmentRows,
} from "./meta-inbox-environment.ts";
import {
  applyCampaignUmbrellaRouting,
  buildMetaInboxNormalizationBatch,
  buildMetaInboxNormalizationBatchWithThreadHistory,
  umbrellaToQueueCategory,
  type MetaAdsLookupRow,
  type MetaInboxFirstTouchCandidate,
  type MetaInboxNormalizationInput,
  type MetaInboxThreadHistoryLoader,
} from "./meta-inbox-normalization.ts";
import { isCampaignUmbrella } from "./campaign-umbrellas.ts";
import { fetchMessengerProfile, shouldEnrichProfile } from "./meta-messenger-profile.ts";
import { pickLatestNonEmptySnippet } from "./meta-message-snippet.ts";
import {
  assertMetaInboxConversationMutationAccess,
  assertMetaInboxOperationalWriteAccess,
  canReadMetaInboxConversationForQueueAccess,
  filterSocialInboxDataForQueueAccess,
  metaInboxQueueAccessScopeForProfile,
  type MetaInboxAccessProfile,
  type MetaInboxQueueAccessDecision,
} from "./meta-inbox-access.ts";
import {
  buildSocialInboxConversationHistoryPage,
  hasKnownMessageHistorySource,
  type SocialInboxConversationHistory,
} from "./meta-inbox-history.ts";
import {
  resolveMetaInboxCommentActionIdempotency,
  resolveMetaInboxSendAttemptIdempotency,
} from "./meta-inbox-idempotency.ts";
import {
  buildMetaInboxWorkflowMutation,
  type MetaInboxWorkflowPatchInput,
} from "./meta-inbox-workflow.ts";
import {
  buildMetaInboxContactMethodCreate,
  buildMetaInboxContactMethodDelete,
  buildMetaInboxContactMethodUpdate,
  type MetaInboxContactMethodMutationInput,
  type MetaInboxContactMethodRecord,
} from "./meta-inbox-contact-methods.ts";
import {
  normalizeMetaInboxAttachments,
  validateMetaInboxSendAttachments,
  type MetaInboxAttachmentType,
  type MetaInboxNormalizedAttachment,
  type MetaInboxSendAttachmentRow,
} from "./meta-inbox-attachments.ts";
import {
  buildMetaInboxAttachmentUploadRow,
  META_INBOX_ATTACHMENT_BUCKET,
  planMetaInboxAttachmentUpload,
  storagePathForMetaInboxAttachment,
  type MetaInboxAttachmentUploadConversation,
} from "./meta-inbox-attachment-upload.ts";
import {
  isMissingMetaInboxSchemaError,
  normalizeMetaInboxSchemaError,
} from "./meta-inbox-schema.ts";
import { webhookMessageRow as shapeWebhookMessageRow, webhookReferralRow as shapeWebhookReferralRow } from "./meta-webhook-shape.ts";
export { webhookMessageRow, webhookReferralRow } from "./meta-webhook-shape.ts";
import {
  buildMetaInboxCommentActionDraft,
  buildMetaInboxQueueCommentActionUpdate,
  buildMetaInboxRetryCommentActionUpdate,
  type MetaInboxCommentActionInput,
  type MetaInboxCommentActionRecord,
  type MetaInboxCommentActionStatus,
  type MetaInboxCommentActionType,
} from "./meta-inbox-comment-actions.ts";
import {
  buildMetaInboxPresenceHeartbeat,
  filterActiveMetaInboxPresence,
  type MetaInboxPresenceActivity,
  type MetaInboxPresenceInput,
  type MetaInboxPresenceRecord,
} from "./meta-inbox-presence.ts";
import {
  buildMetaInboxSavedReplyCreate,
  buildMetaInboxSavedReplyStatusUpdate,
  canApproveSharedSavedReplies,
  filterMetaInboxSavedRepliesForProfile,
  mapMetaInboxSavedReplyRow,
  type MetaInboxSavedReply,
  type MetaInboxSavedReplyInput,
  type MetaInboxSavedReplyStatusInput,
} from "./meta-inbox-saved-replies.ts";
import {
  buildMetaInboxConversationNoteCreate,
  canCreateManagerCoaching,
  mapMetaInboxConversationNoteRow,
  type MetaInboxConversationNote,
  type MetaInboxConversationNoteInput,
} from "./meta-inbox-notes.ts";
import {
  buildMetaInboxQaScorecardCreate,
  canCreateMetaInboxQaScorecard,
  mapMetaInboxQaScorecardRow,
  type MetaInboxQaScorecard,
  type MetaInboxQaScorecardInput,
} from "./meta-inbox-qa-scorecards.ts";
import {
  buildMetaInboxQueueAttemptUpdate,
  buildMetaInboxRetryAttemptUpdate,
  buildMetaInboxSendAttemptDraft,
  type MetaInboxSendAttemptRecord,
  type MetaInboxSendAttemptStatus,
} from "./meta-inbox-reply-reliability.ts";
import { metaInboxAllowedQueueCategoriesForTeams } from "./meta-inbox-foundation.ts";
import type {
  MetaInboxConversationStatusKey,
  MetaInboxCustomerContactMethodKey,
  MetaInboxLostReasonKey,
  MetaInboxOutcomeKey,
  MetaInboxQueueCategoryKey,
  MetaInboxSourceChannelKey,
} from "./meta-inbox-vocabulary.ts";

type JsonRecord = Record<string, unknown>;

type MetaPaging<T> = {
  data?: T[];
  paging?: {
    next?: string;
  };
  error?: {
    message?: string;
    type?: string;
    code?: number;
    error_subcode?: number;
    is_transient?: boolean;
    fbtrace_id?: string;
  };
};

type DynamicQueryResult = {
  data: JsonRecord[] | null;
  error: Error | null;
};

type DynamicSingleResult = {
  data: JsonRecord | null;
  error: Error | null;
};

type DynamicMaybeSingleResult = {
  data: JsonRecord | null;
  error: Error | null;
};

type DynamicQuery = PromiseLike<DynamicQueryResult> & {
  eq: (column: string, value: string | boolean | number) => DynamicQuery;
  in: (column: string, values: string[]) => DynamicQuery;
  order: (
    column: string,
    options?: { ascending?: boolean; nullsFirst?: boolean },
  ) => DynamicQuery;
  limit: (count: number) => Promise<DynamicQueryResult>;
  range: (from: number, to: number) => Promise<DynamicQueryResult>;
};

type DynamicTable = {
  insert: (row: JsonRecord) => {
    select: (columns: string) => {
      single: () => Promise<DynamicSingleResult>;
    };
  };
  update: (row: JsonRecord) => DynamicUpdateFilterQuery;
  upsert: (
    rows: JsonRecord[],
    options: { onConflict: string; ignoreDuplicates?: boolean },
  ) => {
    select: (columns: string) => Promise<DynamicQueryResult>;
  };
  select: (columns: string) => DynamicQuery;
};

type DynamicUpdateFilterQuery = PromiseLike<{ error: Error | null }> & {
  eq: (column: string, value: string | boolean | number) => DynamicUpdateFilterQuery;
  in: (column: string, values: string[]) => DynamicUpdateFilterQuery;
};

type DynamicConditionalUpdateQuery = {
  eq: (column: string, value: string | boolean | number) => DynamicConditionalUpdateQuery;
  select: (columns: string) => {
    maybeSingle: () => Promise<DynamicMaybeSingleResult>;
  };
};

type DynamicSupabaseClient = {
  from: (table: string) => DynamicTable;
};

type DynamicStorageSupabaseClient = DynamicSupabaseClient & {
  storage: {
    from: (bucket: string) => {
      upload: (
        path: string,
        data: ArrayBuffer | Uint8Array,
        options?: { contentType?: string; upsert?: boolean; cacheControl?: string },
      ) => Promise<{ error: Error | null }>;
      getPublicUrl: (path: string) => { data: { publicUrl: string } };
      remove: (paths: string[]) => Promise<{ error: Error | null }>;
    };
  };
};

type ManagedPage = {
  pageId: string;
  name: string | null;
  accessToken: string;
  igUserId: string | null;
  igUsername: string | null;
  raw: JsonRecord;
};

type ConversationSyncInput = {
  page: ManagedPage;
  platform: "facebook" | "instagram";
  params?: Record<string, string>;
};

type SocialSyncMetrics = {
  pages: number;
  threads: number;
  messages: number;
  comments: number;
};

const MANAGER_DASHBOARD_PAGE_SIZE = 1000;

export type SocialInboxThread = {
  id: string;
  platform: "facebook" | "instagram";
  thread_id: string;
  page_id: string | null;
  ig_user_id: string | null;
  participant_id: string | null;
  participant_name: string | null;
  snippet: string | null;
  message_count: number;
  unread_count: number;
  last_message_at: string | null;
  last_synced_at: string | null;
};

export type SocialInboxMessage = {
  id: string;
  platform: "facebook" | "instagram";
  thread_id: string;
  message_id: string;
  direction: "inbound" | "outbound" | "unknown";
  sender_id: string | null;
  sender_name: string | null;
  recipient_id: string | null;
  recipient_name: string | null;
  body: string | null;
  attachments: MetaInboxNormalizedAttachment[];
  sent_at: string | null;
};

export type SocialInboxComment = {
  id: string;
  platform: "facebook" | "instagram";
  comment_id: string;
  parent_comment_id: string | null;
  page_id: string | null;
  ig_user_id: string | null;
  content_id: string | null;
  content_permalink: string | null;
  author_id: string | null;
  author_name: string | null;
  body: string | null;
  like_count: number;
  reply_count: number;
  created_time: string | null;
  last_synced_at: string | null;
};

export type SocialInboxCustomerProfile = {
  id: string;
  platform: "facebook" | "instagram";
  page_id: string | null;
  ig_user_id: string | null;
  participant_id: string;
  display_name: string | null;
  username: string | null;
  profile_picture_url: string | null;
  profile_url: string | null;
  profile_reference: string | null;
  last_profile_synced_at: string | null;
};

export type SocialInboxCustomerContactMethod = {
  id: string;
  customer_profile_id: string;
  type: MetaInboxCustomerContactMethodKey;
  value_normalized: string;
  value_display: string;
  source: string;
  raw_input: string | null;
  verified_for_matching_at: string | null;
  entered_by: string | null;
  entered_at: string | null;
  deleted_by: string | null;
  deleted_at: string | null;
};

export type SocialInboxConversation = {
  id: string;
  canonical_conversation_key: string;
  source_channel: MetaInboxSourceChannelKey;
  source_type: "message_thread" | "public_comment" | "private_reply" | "ad_referral" | "other";
  platform: "facebook" | "instagram";
  customer_profile_id: string | null;
  page_id: string | null;
  ig_user_id: string | null;
  participant_id: string | null;
  platform_thread_id: string | null;
  parent_content_id: string | null;
  source_id: string | null;
  first_inbound_at: string | null;
  latest_inbound_at: string | null;
  latest_outbound_at: string | null;
  last_activity_at: string | null;
  needs_reply: boolean;
  reply_window_expires_at: string | null;
  human_agent_window_expires_at: string | null;
  send_eligibility: "standard_reply_allowed" | "human_agent_allowed" | "expired" | "unknown";
  conversation_status: MetaInboxConversationStatusKey;
  assigned_team_id: string | null;
  assigned_user_id: string | null;
  follow_up_at: string | null;
  lead_quality: string | null;
  lead_quality_reason_tags: string[];
  inbox_outcome: MetaInboxOutcomeKey;
  inbox_lost_reason: MetaInboxLostReasonKey | null;
  queue_category_key: MetaInboxQueueCategoryKey;
  routing_source: string | null;
  routing_confidence: number | null;
  routing_explanation: string | null;
};

export type SocialInboxFirstTouchSource = {
  id: string;
  conversation_id: string;
  first_message_id: string | null;
  first_message_at: string | null;
  ad_id: string | null;
  ref: string | null;
  source_post_id: string | null;
  source_media_id: string | null;
  source_comment_id: string | null;
  source_product_id: string | null;
  source_permalink: string | null;
  campaign_umbrella_id: string | null;
  campaign_id: string | null;
  adset_id: string | null;
  creative_id: string | null;
  attribution_method: string | null;
  attribution_confidence: number | null;
  /**
   * Best available image URL for the ad creative that originated this
   * conversation. Resolved server-side from two sources in priority
   * order: (1) `ads_context_data_json.photo_url` delivered with the
   * webhook referral, (2) the matching `meta_creatives` row's
   * thumbnail_url / image_url / video_thumbnail_url. Null when neither
   * is available (e.g. organic threads or pre-subscription history).
   */
  creative_image_url: string | null;
  /** Ad title delivered alongside the referral payload, when present. */
  ad_title: string | null;
};

export type SocialInboxSendAttempt = {
  id: string;
  conversation_id: string;
  reply_text: string;
  approved_by: string | null;
  approved_at: string | null;
  status: MetaInboxSendAttemptStatus;
  messaging_type: "RESPONSE" | "MESSAGE_TAG" | null;
  tag: "HUMAN_AGENT" | null;
  attachment_ids: string[];
  meta_send_id: string | null;
  meta_error_message: string | null;
  meta_error_code: number | null;
  meta_error_subcode: number | null;
  meta_trace_id: string | null;
  attempt_count: number;
  next_retry_at: string | null;
  last_attempted_at: string | null;
  sent_at: string | null;
  idempotency_key: string;
  created_at: string | null;
  updated_at: string | null;
};

export type SocialInboxUploadedAttachment = {
  id: string;
  conversation_id: string;
  attachment_type: MetaInboxAttachmentType;
  label: string;
  name: string | null;
  mime_type: string | null;
  media_url: string | null;
  preview_url: string | null;
  size_bytes: number | null;
  is_sendable: boolean;
  created_at: string | null;
};

export type SocialInboxCommentAction = {
  id: string;
  conversation_id: string;
  comment_id: string;
  action_type: MetaInboxCommentActionType;
  message_text: string | null;
  reason_note: string | null;
  requested_by: string | null;
  requested_at: string | null;
  status: MetaInboxCommentActionStatus;
  meta_action_id: string | null;
  meta_error_message: string | null;
  meta_error_code: number | null;
  meta_error_subcode: number | null;
  meta_trace_id: string | null;
  attempt_count: number;
  next_retry_at: string | null;
  last_attempted_at: string | null;
  completed_at: string | null;
  idempotency_key: string;
  created_at: string | null;
  updated_at: string | null;
};

export type SocialInboxConversationEvent = {
  id: string;
  conversation_id: string;
  event_type: string;
  actor_user_id: string | null;
  event_at: string | null;
  previous_value: JsonRecord | null;
  new_value: JsonRecord | null;
  metadata: JsonRecord;
  created_at: string | null;
};

export type SocialInboxPresence = {
  id: string;
  conversation_id: string;
  app_user_id: string;
  display_name: string | null;
  activity: MetaInboxPresenceActivity;
  last_seen_at: string;
  expires_at: string;
};

export type SocialInboxSavedReply = MetaInboxSavedReply;
export type SocialInboxConversationNote = MetaInboxConversationNote;
export type SocialInboxQaScorecard = MetaInboxQaScorecard;

export type SocialInboxSyncRun = {
  id: string;
  trigger: string;
  status: "running" | "success" | "failed" | "partial";
  started_at: string;
  completed_at: string | null;
  metrics: JsonRecord;
  errors: unknown[];
};

export type SocialInboxData = {
  queueAccess: MetaInboxQueueAccessDecision;
  threads: SocialInboxThread[];
  messages: SocialInboxMessage[];
  comments: SocialInboxComment[];
  inboxConversations: SocialInboxConversation[];
  customerProfiles: SocialInboxCustomerProfile[];
  customerContactMethods: SocialInboxCustomerContactMethod[];
  firstTouchSources: SocialInboxFirstTouchSource[];
  sendAttempts: SocialInboxSendAttempt[];
  commentActions: SocialInboxCommentAction[];
  conversationEvents: SocialInboxConversationEvent[];
  savedReplies: SocialInboxSavedReply[];
  notes: SocialInboxConversationNote[];
  qaScorecards: SocialInboxQaScorecard[];
  syncRuns: SocialInboxSyncRun[];
};

export type SocialInboxSyncResult = {
  status: "success" | "partial" | "failed";
  metrics: SocialSyncMetrics;
  errors: string[];
  syncRunId?: string;
};

export type MetaWebhookIngestResult = {
  messages: number;
  comments: number;
  referrals: number;
};

export type { SocialInboxConversationHistory };
export type { MetaInboxWorkflowPatchInput };
export type { MetaInboxContactMethodMutationInput };

export type MetaInboxSendAttemptInput = {
  replyText?: string | null;
  idempotencyKey?: string | null;
  attachmentIds?: string[] | null;
};

export type MetaInboxAttachmentUploadInput = {
  fileName: string;
  contentType?: string | null;
  sizeBytes: number;
  bytes: ArrayBuffer | Uint8Array;
};

export type MetaInboxRetrySendAttemptInput = {
  sendAttemptId?: string | null;
};

export type MetaInboxQueueSendAttemptInput = {
  sendAttemptId?: string | null;
};

export type MetaInboxQueueCommentActionInput = {
  commentActionId?: string | null;
};

export type MetaInboxRetryCommentActionInput = {
  commentActionId?: string | null;
};

export type { MetaInboxCommentActionInput };
export type { MetaInboxPresenceInput };
export type { MetaInboxSavedReplyInput, MetaInboxSavedReplyStatusInput };
export type { MetaInboxConversationNoteInput };
export type { MetaInboxQaScorecardInput };

class MetaSocialGraphError extends Error {
  details?: unknown;

  constructor(message: string, details?: unknown) {
    super(message);
    this.name = "MetaSocialGraphError";
    this.details = details;
  }
}

export async function syncSocialInbox(
  trigger: "manual" | "cron" | "webhook" = "manual",
): Promise<SocialInboxSyncResult> {
  const supabase = dynamicSupabase("worker");
  const runInsert = await supabase
    .from("meta_social_sync_runs")
    .insert(withActiveMetaInboxEnvironment({
      trigger,
      status: "running",
    }))
    .select("id")
    .single();

  if (runInsert.error) throw normalizeMetaInboxSchemaError(runInsert.error);

  const syncRunId = String(runInsert.data?.id || "");
  const metrics: SocialSyncMetrics = {
    pages: 0,
    threads: 0,
    messages: 0,
    comments: 0,
  };
  const errors: string[] = [];

  try {
    await validateSocialInboxPermissions();
    const pages = await fetchManagedPages();
    metrics.pages = pages.length;

    await updateActiveMetaInboxRows(
      supabase,
      "meta_social_sync_runs",
      withActiveMetaInboxEnvironment({ page_ids: pages.map((page) => page.pageId) }),
    )
      .eq("id", syncRunId);

    await upsertPages(pages);

    for (const page of pages) {
      const pageResult = await syncPage(page);
      metrics.threads += pageResult.threads;
      metrics.messages += pageResult.messages;
      metrics.comments += pageResult.comments;
      errors.push(...pageResult.errors);
    }

    const status = errors.length
      ? metrics.threads || metrics.messages || metrics.comments
        ? "partial"
        : "failed"
      : "success";

    await updateActiveMetaInboxRows(
      supabase,
      "meta_social_sync_runs",
      withActiveMetaInboxEnvironment({
        status,
        completed_at: new Date().toISOString(),
        metrics,
        errors,
      }),
    )
      .eq("id", syncRunId);

    return { status, metrics, errors, syncRunId };
  } catch (error) {
    errors.push(errorToMessage(error));
    await updateActiveMetaInboxRows(
      supabase,
      "meta_social_sync_runs",
      withActiveMetaInboxEnvironment({
        status: "failed",
        completed_at: new Date().toISOString(),
        metrics,
        errors,
      }),
    )
      .eq("id", syncRunId);

    return { status: "failed", metrics, errors, syncRunId };
  }
}

export async function getSocialInboxData(
  profile?: MetaInboxAccessProfile | null,
): Promise<SocialInboxData> {
  const supabase = dynamicSupabase("web");
  const queueAccess = await resolveSocialInboxQueueAccess(supabase, profile);
  const [
    threads,
    messages,
    comments,
    inboxConversations,
    customerProfiles,
    customerContactMethods,
    firstTouchSources,
    sendAttempts,
    commentActions,
    conversationEvents,
    savedReplies,
    notes,
    qaScorecards,
    syncRuns,
  ] = await Promise.all([
    selectActiveMetaInboxRows(supabase, "meta_social_threads")
      .order("last_message_at", { ascending: false, nullsFirst: false })
      .limit(100),
    selectActiveMetaInboxRows(supabase, "meta_social_messages")
      .order("sent_at", { ascending: false, nullsFirst: false })
      .limit(300),
    selectActiveMetaInboxRows(supabase, "meta_social_comments")
      .order("created_time", { ascending: false, nullsFirst: false })
      .limit(150),
    selectInboxConversationsForQueueAccess(supabase, queueAccess),
    selectActiveMetaInboxRows(supabase, "meta_inbox_customer_profiles")
      .order("updated_at", { ascending: false, nullsFirst: false })
      .limit(250),
    selectActiveMetaInboxRows(supabase, "meta_inbox_customer_contact_methods")
      .order("updated_at", { ascending: false, nullsFirst: false })
      .limit(500),
    selectActiveMetaInboxRows(supabase, "meta_inbox_first_touch_sources")
      .order("updated_at", { ascending: false, nullsFirst: false })
      .limit(250),
    selectSendAttemptsForQueueAccess(supabase, queueAccess),
    selectCommentActionsForQueueAccess(supabase, queueAccess),
    selectConversationEventsForQueueAccess(supabase, queueAccess),
    selectActiveMetaInboxRows(supabase, "meta_inbox_saved_replies")
      .order("updated_at", { ascending: false, nullsFirst: false })
      .limit(250),
    selectNotesForQueueAccess(supabase, queueAccess),
    selectQaScorecardsForQueueAccess(supabase, queueAccess),
    selectActiveMetaInboxRows(supabase, "meta_social_sync_runs")
      .order("started_at", { ascending: false })
      .limit(5),
  ]);

  for (const result of [
    threads,
    messages,
    comments,
    inboxConversations,
    customerProfiles,
    customerContactMethods,
    firstTouchSources,
    sendAttempts,
    commentActions,
    conversationEvents,
    savedReplies,
    notes,
    qaScorecards,
    syncRuns,
  ]) {
    if (result.error) throw normalizeMetaInboxSchemaError(result.error);
  }

  const firstTouchSourcesResolved = await resolveCreativeImageUrls(
    rows<JsonRecord>(firstTouchSources.data).map(mapFirstTouchSource),
    supabase,
  );

  return filterSocialInboxDataForQueueAccess({
    queueAccess,
    threads: rows<JsonRecord>(threads.data).map(mapThread),
    messages: rows<JsonRecord>(messages.data).map(mapMessage),
    comments: rows<JsonRecord>(comments.data).map(mapComment),
    inboxConversations: rows<JsonRecord>(inboxConversations.data).map(mapInboxConversation),
    customerProfiles: rows<JsonRecord>(customerProfiles.data).map(mapCustomerProfile),
    customerContactMethods: rows<JsonRecord>(customerContactMethods.data).map(mapContactMethod),
    firstTouchSources: firstTouchSourcesResolved,
    sendAttempts: rows<JsonRecord>(sendAttempts.data).map(mapSendAttempt),
    commentActions: rows<JsonRecord>(commentActions.data).map(mapCommentAction),
    conversationEvents: rows<JsonRecord>(conversationEvents.data).map(mapConversationEvent),
    savedReplies: filterMetaInboxSavedRepliesForProfile(
      rows<JsonRecord>(savedReplies.data).map(mapSavedReply),
      {
        appUserId: profile?.appUserId || null,
        roles: profile?.roles || [],
      },
    ),
    notes: rows<JsonRecord>(notes.data).map(mapConversationNote),
    qaScorecards: rows<JsonRecord>(qaScorecards.data).map(mapQaScorecard),
    syncRuns: rows<JsonRecord>(syncRuns.data).map(mapSyncRun),
  }, queueAccess);
}

export async function getSocialInboxManagerDashboardData(
  profile?: MetaInboxAccessProfile | null,
): Promise<SocialInboxData> {
  const supabase = dynamicSupabase("web");
  const queueAccess = await resolveSocialInboxQueueAccess(supabase, profile);
  const inboxConversationRows = await selectAllInboxConversationsForQueueAccess(
    supabase,
    queueAccess,
  );
  const inboxConversations = inboxConversationRows.map(mapInboxConversation);
  const conversationIds = uniqueStrings(
    inboxConversations.map((conversation) => conversation.id),
  );

  if (!conversationIds.length) {
    return {
      ...emptySocialInboxData(),
      queueAccess,
    };
  }

  const [
    messageRows,
    firstTouchSourceRows,
    sendAttemptRows,
    commentActionRows,
    qaScorecardRows,
  ] = await Promise.all([
    selectMessagesForDashboardConversations(supabase, inboxConversations),
    selectAllActiveMetaInboxRowsForConversationIds(
      supabase,
      "meta_inbox_first_touch_sources",
      conversationIds,
      "updated_at",
    ),
    selectAllActiveMetaInboxRowsForConversationIds(
      supabase,
      "meta_inbox_send_attempts",
      conversationIds,
      "created_at",
    ),
    selectAllActiveMetaInboxRowsForConversationIds(
      supabase,
      "meta_inbox_comment_actions",
      conversationIds,
      "created_at",
    ),
    selectAllActiveMetaInboxRowsForConversationIds(
      supabase,
      "meta_inbox_qa_scorecards",
      conversationIds,
      "created_at",
    ),
  ]);

  const firstTouchSources = await resolveCreativeImageUrls(
    firstTouchSourceRows.map(mapFirstTouchSource),
    supabase,
  );

  return filterSocialInboxDataForQueueAccess({
    ...emptySocialInboxData(),
    queueAccess,
    messages: messageRows.map(mapMessage),
    inboxConversations,
    firstTouchSources,
    sendAttempts: sendAttemptRows.map(mapSendAttempt),
    commentActions: commentActionRows.map(mapCommentAction),
    qaScorecards: qaScorecardRows.map(mapQaScorecard),
  }, queueAccess);
}

export async function getSocialInboxConversationHistory(
  conversationId: string,
  profile: MetaInboxAccessProfile,
  options: { cursor?: string | null; pageSize?: number | null } = {},
): Promise<SocialInboxConversationHistory | null> {
  const supabase = dynamicSupabase("web");
  const queueAccess = await resolveSocialInboxQueueAccess(supabase, profile);
  const conversationResult = await selectActiveMetaInboxRows(
    supabase,
    "meta_inbox_conversations",
  )
    .eq("id", conversationId)
    .limit(1);
  if (conversationResult.error) throw normalizeMetaInboxSchemaError(conversationResult.error);

  const conversationRow = rows<JsonRecord>(conversationResult.data)[0];
  if (!conversationRow) return null;

  const conversation = mapInboxConversation(conversationRow);
  if (!canReadMetaInboxConversationForQueueAccess(conversation, queueAccess)) {
    throw new AuthorizationError("You do not have access to this inbox queue.", 403);
  }

  const [messages, comments] = await Promise.all([
    selectKnownMessagesForConversation(supabase, conversation),
    selectKnownCommentsForConversation(supabase, conversation),
  ]);

  return buildSocialInboxConversationHistoryPage(
    conversation,
    {
      messages,
      comments,
    },
    {
      cursor: options.cursor,
      pageSize: options.pageSize,
    },
  );
}

export async function updateSocialInboxConversationWorkflow(
  conversationId: string,
  profile: MetaInboxAccessProfile,
  input: MetaInboxWorkflowPatchInput,
): Promise<{ conversation: SocialInboxConversation; events: JsonRecord[] }> {
  const supabase = dynamicSupabase("web");
  const queueAccess = await resolveSocialInboxMutationAccess(supabase, profile);
  const conversationResult = await selectActiveMetaInboxRows(
    supabase,
    "meta_inbox_conversations",
  )
    .eq("id", conversationId)
    .limit(1);
  if (conversationResult.error) throw normalizeMetaInboxSchemaError(conversationResult.error);

  const conversationRow = rows<JsonRecord>(conversationResult.data)[0];
  if (!conversationRow) return missingConversation();

  const conversation = mapInboxConversation(conversationRow);
  assertMetaInboxConversationMutationAccess(conversation, queueAccess, {
    targetQueueCategoryKey: input.queueCategoryKey,
  });

  const now = new Date().toISOString();
  const actorUserId = profile.appUserId && isUuid(profile.appUserId) ? profile.appUserId : null;
  const mutation = buildMetaInboxWorkflowMutation(conversation, input, {
    actorUserId,
    now,
  });

  if (Object.keys(mutation.update).length) {
    const updateResult = await updateActiveMetaInboxRows(
      supabase,
      "meta_inbox_conversations",
      {
        ...mutation.update,
        updated_at: now,
      },
    )
      .eq("id", conversation.id);
    if (updateResult.error) throw normalizeMetaInboxSchemaError(updateResult.error);
  }

  const insertedEvents: JsonRecord[] = [];
  for (const event of mutation.events) {
    const insert = await supabase
      .from("meta_inbox_conversation_events")
      .insert(withActiveMetaInboxEnvironment({
        conversation_id: conversation.id,
        event_type: event.eventType,
        actor_user_id: actorUserId,
        event_at: now,
        previous_value: event.previousValue,
        new_value: event.newValue,
        metadata: event.metadata,
      }))
      .select("id,conversation_id,event_type,actor_user_id,event_at,previous_value,new_value,metadata")
      .single();
    if (insert.error) throw normalizeMetaInboxSchemaError(insert.error);
    if (insert.data) insertedEvents.push(insert.data);
  }

  const updatedResult = await selectActiveMetaInboxRows(
    supabase,
    "meta_inbox_conversations",
  )
    .eq("id", conversation.id)
    .limit(1);
  if (updatedResult.error) throw normalizeMetaInboxSchemaError(updatedResult.error);

  const updatedRow = rows<JsonRecord>(updatedResult.data)[0];
  return {
    conversation: updatedRow ? mapInboxConversation(updatedRow) : mutation.nextConversation,
    events: insertedEvents,
  };
}

export async function updateSocialInboxConversationContactMethod(
  conversationId: string,
  profile: MetaInboxAccessProfile,
  action: "create" | "update" | "delete",
  input: MetaInboxContactMethodMutationInput,
): Promise<{ contactMethod: SocialInboxCustomerContactMethod; events: JsonRecord[] }> {
  const supabase = dynamicSupabase("web");
  const queueAccess = await resolveSocialInboxMutationAccess(supabase, profile);
  const conversation = await requireMutableConversation(supabase, conversationId, queueAccess);
  const now = new Date().toISOString();
  const actorUserId = profile.appUserId && isUuid(profile.appUserId) ? profile.appUserId : null;

  if (action === "create") {
    const mutation = buildMetaInboxContactMethodCreate(
      conversation.customer_profile_id,
      {
        type: input.type || "phone",
        value: input.value || "",
      },
      { actorUserId, now },
    );
    if (input.providedInMessageId && isUuid(input.providedInMessageId)) {
      mutation.row.provided_in_message_id = input.providedInMessageId;
    }

    const insert = await supabase
      .from("meta_inbox_customer_contact_methods")
      .insert(withActiveMetaInboxEnvironment(mutation.row))
      .select("*")
      .single();
    if (insert.error) throw normalizeMetaInboxSchemaError(insert.error);
    if (!insert.data) throw new Error("Contact method did not return after insert.");

    const event = await insertContactMethodEvent(supabase, conversation.id, actorUserId, now, {
      ...mutation.event,
      newValue: {
        ...mutation.event.newValue,
        contactMethodId: String(insert.data.id),
      },
      metadata: contactEventMetadata(mutation.event.metadata, input.changeReason),
    });
    await updateContactMethodAuditEvent(supabase, String(insert.data.id), String(event.id));

    return {
      contactMethod: mapContactMethod({ ...insert.data, audit_event_id: event.id }),
      events: [event],
    };
  }

  const existing = await requireContactMethodForConversation(supabase, conversation, input.contactMethodId);
  const mutation =
    action === "update"
      ? buildMetaInboxContactMethodUpdate(
        existing,
        {
          type: input.type || existing.type,
          value: input.value ?? existing.value_display,
        },
        { actorUserId, now },
      )
      : buildMetaInboxContactMethodDelete(existing, { actorUserId, now });

  const update = await updateActiveMetaInboxRows(
    supabase,
    "meta_inbox_customer_contact_methods",
    mutation.update,
  )
    .eq("id", existing.id);
  if (update.error) throw normalizeMetaInboxSchemaError(update.error);

  const event = await insertContactMethodEvent(supabase, conversation.id, actorUserId, now, {
    ...mutation.event,
    metadata: contactEventMetadata(mutation.event.metadata, input.changeReason),
  });
  await updateContactMethodAuditEvent(supabase, existing.id, String(event.id));

  const refreshed = await selectActiveMetaInboxRows(
    supabase,
    "meta_inbox_customer_contact_methods",
  )
    .eq("id", existing.id)
    .limit(1);
  if (refreshed.error) throw normalizeMetaInboxSchemaError(refreshed.error);

  const row = rows<JsonRecord>(refreshed.data)[0];
  return {
    contactMethod: row ? mapContactMethod(row) : mapContactMethod({
      ...existing,
      ...mutation.update,
      audit_event_id: event.id,
    }),
    events: [event],
  };
}

async function selectExistingSendAttemptForIdempotency(
  supabase: DynamicSupabaseClient,
  conversationId: string,
  idempotencyKey: string,
) {
  if (!idempotencyKey) return null;
  const existing = await selectActiveMetaInboxRows(
    supabase,
    "meta_inbox_send_attempts",
  )
    .eq("conversation_id", conversationId)
    .eq("idempotency_key", idempotencyKey)
    .limit(1);
  if (existing.error) throw normalizeMetaInboxSchemaError(existing.error);
  return rows<JsonRecord>(existing.data)[0] || null;
}

async function selectExistingCommentActionForIdempotency(
  supabase: DynamicSupabaseClient,
  conversationId: string,
  idempotencyKey: string,
) {
  if (!idempotencyKey) return null;
  const existing = await selectActiveMetaInboxRows(
    supabase,
    "meta_inbox_comment_actions",
  )
    .eq("conversation_id", conversationId)
    .eq("idempotency_key", idempotencyKey)
    .limit(1);
  if (existing.error) throw normalizeMetaInboxSchemaError(existing.error);
  return rows<JsonRecord>(existing.data)[0] || null;
}

async function updateSendAttemptWithExpectedStatus(
  supabase: DynamicSupabaseClient,
  sendAttemptId: string,
  expectedStatus: MetaInboxSendAttemptStatus,
  update: JsonRecord,
) {
  const result = await scopeActiveMetaInboxEnvironment(
    supabase
      .from("meta_inbox_send_attempts")
      .update(update) as unknown as DynamicConditionalUpdateQuery,
  )
    .eq("id", sendAttemptId)
    .eq("status", expectedStatus)
    .select("*")
    .maybeSingle();
  if (result.error) throw normalizeMetaInboxSchemaError(result.error);
  if (!result.data) {
    throw new AuthorizationError(
      "Send attempt status changed before this update. Refresh and try again.",
      409,
    );
  }
  return result.data;
}

async function updateCommentActionWithExpectedStatus(
  supabase: DynamicSupabaseClient,
  commentActionId: string,
  expectedStatus: MetaInboxCommentActionStatus,
  update: JsonRecord,
) {
  const result = await scopeActiveMetaInboxEnvironment(
    supabase
      .from("meta_inbox_comment_actions")
      .update(update) as unknown as DynamicConditionalUpdateQuery,
  )
    .eq("id", commentActionId)
    .eq("status", expectedStatus)
    .select("*")
    .maybeSingle();
  if (result.error) throw normalizeMetaInboxSchemaError(result.error);
  if (!result.data) {
    throw new AuthorizationError(
      "Comment action status changed before this update. Refresh and try again.",
      409,
    );
  }
  return result.data;
}

export async function createSocialInboxSendAttempt(
  conversationId: string,
  profile: MetaInboxAccessProfile,
  input: MetaInboxSendAttemptInput,
): Promise<{ sendAttempt: SocialInboxSendAttempt; events: JsonRecord[] }> {
  const supabase = dynamicSupabase("web");
  const queueAccess = await resolveSocialInboxMutationAccess(supabase, profile);
  const conversation = await requireMutableConversation(supabase, conversationId, queueAccess);
  const now = new Date().toISOString();
  const actorUserId = profile.appUserId && isUuid(profile.appUserId) ? profile.appUserId : null;
  const mutation = buildMetaInboxSendAttemptDraft(
    conversation,
    {
      replyText: input.replyText || "",
      idempotencyKey: input.idempotencyKey,
      attachmentIds: input.attachmentIds || [],
    },
    {
      actorUserId,
      now,
      humanAgentEnabled: true,
    },
  );
  await validateSendAttemptAttachmentsForApproval(
    supabase,
    conversation,
    mutation.row.attachment_ids,
  );

  const existing = await selectExistingSendAttemptForIdempotency(
    supabase,
    conversation.id,
    String(mutation.row.idempotency_key || ""),
  );
  const idempotency = resolveMetaInboxSendAttemptIdempotency(existing, mutation.row);
  if (idempotency.action === "return_existing") {
    return {
      sendAttempt: mapSendAttempt(idempotency.row),
      events: [],
    };
  }

  const insert = await supabase
    .from("meta_inbox_send_attempts")
    .insert(withActiveMetaInboxEnvironment(mutation.row))
    .select("*")
    .single();
  if (insert.error) throw normalizeMetaInboxSchemaError(insert.error);
  if (!insert.data) throw new Error("Send attempt did not return after insert.");

  if (mutation.row.attachment_ids) {
    const attachmentIds = arrayField(mutation.row.attachment_ids).map(String).filter(Boolean);
    if (attachmentIds.length) {
      const attachmentUpdate = await updateActiveMetaInboxRows(
        supabase,
        "meta_inbox_attachments",
        {
          direction: "outbound",
          send_attempt_id: String(insert.data.id),
          updated_at: now,
        },
      ).in("id", attachmentIds);
      if (attachmentUpdate.error) {
        throw normalizeMetaInboxSchemaError(attachmentUpdate.error);
      }
    }
  }

  const event = await insertConversationEvent(supabase, conversation.id, actorUserId, now, {
    ...mutation.event,
    newValue: {
      ...mutation.event.newValue,
      sendAttemptId: String(insert.data.id),
    },
  });

  return {
    sendAttempt: mapSendAttempt(insert.data),
    events: [event],
  };
}

export async function createSocialInboxAttachmentUpload(
  conversationId: string,
  profile: MetaInboxAccessProfile,
  input: MetaInboxAttachmentUploadInput,
): Promise<{ attachment: SocialInboxUploadedAttachment }> {
  const supabase = dynamicSupabase("web") as DynamicStorageSupabaseClient;
  const queueAccess = await resolveSocialInboxMutationAccess(supabase, profile);
  const conversation = await requireMutableConversation(supabase, conversationId, queueAccess);
  const actorUserId = profile.appUserId && isUuid(profile.appUserId) ? profile.appUserId : null;
  if (!actorUserId) {
    throw new AuthorizationError("A valid inbox user is required to upload attachments.", 403);
  }

  const plan = planMetaInboxAttachmentUpload(
    conversation as MetaInboxAttachmentUploadConversation,
    {
      fileName: input.fileName,
      contentType: input.contentType,
      sizeBytes: input.sizeBytes,
    },
  );
  const now = new Date().toISOString();
  const storagePath = storagePathForMetaInboxAttachment(
    getActiveMetaInboxEnvironment(),
    conversation.id,
    randomUUID(),
    plan.safeFileName,
  );
  const bytes = input.bytes instanceof Uint8Array ? input.bytes : new Uint8Array(input.bytes);
  const bucket = supabase.storage.from(META_INBOX_ATTACHMENT_BUCKET);
  const upload = await bucket.upload(storagePath, bytes, {
    contentType: plan.mimeType,
    upsert: false,
    cacheControl: "31536000",
  });
  if (upload.error) throw upload.error;

  const { data } = bucket.getPublicUrl(storagePath);
  const insert = await supabase
    .from("meta_inbox_attachments")
    .insert(withActiveMetaInboxEnvironment(
      buildMetaInboxAttachmentUploadRow(
        conversation as MetaInboxAttachmentUploadConversation,
        plan,
        {
          actorUserId,
          now,
          publicUrl: data.publicUrl,
          storagePath,
        },
      ),
    ))
    .select("*")
    .single();
  if (insert.error) {
    await bucket.remove([storagePath]).catch(() => ({ error: null }));
    throw normalizeMetaInboxSchemaError(insert.error);
  }
  if (!insert.data) throw new Error("Attachment did not return after insert.");

  return { attachment: mapUploadedAttachment(insert.data) };
}

async function validateSendAttemptAttachmentsForApproval(
  supabase: DynamicSupabaseClient,
  conversation: SocialInboxConversation,
  attachmentIds: unknown,
) {
  const requestedIds = arrayField(attachmentIds).map(String).filter(Boolean);
  if (!requestedIds.length) return [];

  const result = await selectActiveMetaInboxRows(
    supabase,
    "meta_inbox_attachments",
  )
    .in("id", requestedIds)
    .limit(requestedIds.length);
  if (result.error) throw normalizeMetaInboxSchemaError(result.error);

  return validateMetaInboxSendAttachments(
    {
      id: conversation.id,
      platform: conversation.platform,
      source_type: conversation.source_type,
    },
    requestedIds,
    rows<JsonRecord>(result.data).map(mapSendAttachmentRow),
  );
}

export async function retrySocialInboxSendAttempt(
  conversationId: string,
  profile: MetaInboxAccessProfile,
  input: MetaInboxRetrySendAttemptInput,
): Promise<{ sendAttempt: SocialInboxSendAttempt; events: JsonRecord[] }> {
  const supabase = dynamicSupabase("web");
  const queueAccess = await resolveSocialInboxMutationAccess(supabase, profile);
  const conversation = await requireMutableConversation(supabase, conversationId, queueAccess);
  const attempt = await requireSendAttemptForConversation(supabase, conversation, input.sendAttemptId);
  const now = new Date().toISOString();
  const actorUserId = profile.appUserId && isUuid(profile.appUserId) ? profile.appUserId : null;
  const mutation = buildMetaInboxRetryAttemptUpdate(attempt, conversation, {
    actorUserId,
    now,
    humanAgentEnabled: true,
  });

  const updated = await updateSendAttemptWithExpectedStatus(
    supabase,
    attempt.id,
    mutation.expectedStatus,
    mutation.update,
  );
  const event = await insertConversationEvent(supabase, conversation.id, actorUserId, now, mutation.event);

  return {
    sendAttempt: mapSendAttempt(updated),
    events: [event],
  };
}

export async function queueSocialInboxSendAttempt(
  conversationId: string,
  profile: MetaInboxAccessProfile,
  input: MetaInboxQueueSendAttemptInput,
): Promise<{ sendAttempt: SocialInboxSendAttempt; events: JsonRecord[] }> {
  const supabase = dynamicSupabase("web");
  const queueAccess = await resolveSocialInboxMutationAccess(supabase, profile);
  const conversation = await requireMutableConversation(supabase, conversationId, queueAccess);
  const attempt = await requireSendAttemptForConversation(supabase, conversation, input.sendAttemptId);
  const now = new Date().toISOString();
  const actorUserId = profile.appUserId && isUuid(profile.appUserId) ? profile.appUserId : null;
  const mutation = buildMetaInboxQueueAttemptUpdate(attempt, conversation, {
    actorUserId,
    now,
    humanAgentEnabled: true,
  });

  const updated = await updateSendAttemptWithExpectedStatus(
    supabase,
    attempt.id,
    mutation.expectedStatus,
    mutation.update,
  );
  const event = await insertConversationEvent(supabase, conversation.id, actorUserId, now, mutation.event);

  return {
    sendAttempt: mapSendAttempt(updated),
    events: [event],
  };
}

export async function createSocialInboxCommentAction(
  conversationId: string,
  profile: MetaInboxAccessProfile,
  input: MetaInboxCommentActionInput,
): Promise<{ commentAction: SocialInboxCommentAction; events: JsonRecord[] }> {
  const supabase = dynamicSupabase("web");
  const queueAccess = await resolveSocialInboxMutationAccess(supabase, profile);
  const conversation = await requireMutableConversation(supabase, conversationId, queueAccess);
  const now = new Date().toISOString();
  const actorUserId = profile.appUserId && isUuid(profile.appUserId) ? profile.appUserId : null;
  const mutation = buildMetaInboxCommentActionDraft(conversation, input, {
    actorUserId,
    now,
  });

  const existing = await selectExistingCommentActionForIdempotency(
    supabase,
    conversation.id,
    String(mutation.row.idempotency_key || ""),
  );
  const idempotency = resolveMetaInboxCommentActionIdempotency(existing, mutation.row);
  if (idempotency.action === "return_existing") {
    return {
      commentAction: mapCommentAction(idempotency.row),
      events: [],
    };
  }

  const insert = await supabase
    .from("meta_inbox_comment_actions")
    .insert(withActiveMetaInboxEnvironment(mutation.row))
    .select("*")
    .single();
  if (insert.error) throw normalizeMetaInboxSchemaError(insert.error);
  if (!insert.data) throw new Error("Comment action did not return after insert.");

  const event = await insertConversationEvent(supabase, conversation.id, actorUserId, now, {
    ...mutation.event,
    newValue: {
      ...mutation.event.newValue,
      commentActionId: String(insert.data.id),
    },
  });

  return {
    commentAction: mapCommentAction(insert.data),
    events: [event],
  };
}

export async function queueSocialInboxCommentAction(
  conversationId: string,
  profile: MetaInboxAccessProfile,
  input: MetaInboxQueueCommentActionInput,
): Promise<{ commentAction: SocialInboxCommentAction; events: JsonRecord[] }> {
  const supabase = dynamicSupabase("web");
  const queueAccess = await resolveSocialInboxMutationAccess(supabase, profile);
  const conversation = await requireMutableConversation(supabase, conversationId, queueAccess);
  const action = await requireCommentActionForConversation(
    supabase,
    conversation,
    input.commentActionId,
  );
  ensureCommentActionPermission(profile, action);

  const now = new Date().toISOString();
  const actorUserId = profile.appUserId && isUuid(profile.appUserId) ? profile.appUserId : null;
  const mutation = buildMetaInboxQueueCommentActionUpdate(action, conversation, {
    actorUserId,
    now,
  });

  const updated = await updateCommentActionWithExpectedStatus(
    supabase,
    action.id,
    mutation.expectedStatus || "approved",
    mutation.update,
  );
  const event = await insertConversationEvent(supabase, conversation.id, actorUserId, now, mutation.event);

  return {
    commentAction: mapCommentAction(updated),
    events: [event],
  };
}

export async function retrySocialInboxCommentAction(
  conversationId: string,
  profile: MetaInboxAccessProfile,
  input: MetaInboxRetryCommentActionInput,
): Promise<{ commentAction: SocialInboxCommentAction; events: JsonRecord[] }> {
  const supabase = dynamicSupabase("web");
  const queueAccess = await resolveSocialInboxMutationAccess(supabase, profile);
  const conversation = await requireMutableConversation(supabase, conversationId, queueAccess);
  const action = await requireCommentActionForConversation(
    supabase,
    conversation,
    input.commentActionId,
  );
  ensureCommentActionPermission(profile, action);

  const now = new Date().toISOString();
  const actorUserId = profile.appUserId && isUuid(profile.appUserId) ? profile.appUserId : null;
  const mutation = buildMetaInboxRetryCommentActionUpdate(action, conversation, {
    actorUserId,
    now,
  });

  const updated = await updateCommentActionWithExpectedStatus(
    supabase,
    action.id,
    mutation.expectedStatus || "failed_retryable",
    mutation.update,
  );
  const event = await insertConversationEvent(supabase, conversation.id, actorUserId, now, mutation.event);

  return {
    commentAction: mapCommentAction(updated),
    events: [event],
  };
}

export async function recordSocialInboxPresence(
  conversationId: string,
  profile: MetaInboxAccessProfile,
  input: MetaInboxPresenceInput,
): Promise<{ presence: SocialInboxPresence | null; presences: SocialInboxPresence[] }> {
  const supabase = dynamicSupabase("web");
  const queueAccess = await resolveSocialInboxQueueAccess(supabase, profile);
  const conversation = await requireAccessibleConversation(supabase, conversationId, queueAccess);
  const activity = normalizePresenceInputActivity(input.activity);

  if (activity !== "viewing" && !profile.permissions?.includes("send_inbox_reply")) {
    throw new AuthorizationError("You do not have permission to signal reply presence.", 403);
  }

  const now = new Date().toISOString();
  const actorUserId = profile.appUserId && isUuid(profile.appUserId) ? profile.appUserId : null;
  let presence: SocialInboxPresence | null = null;

  if (actorUserId) {
    const identity = profile as MetaInboxAccessProfile & {
      fullName?: string | null;
      email?: string | null;
    };
    const heartbeat = buildMetaInboxPresenceHeartbeat(conversation.id, { activity }, {
      actorUserId,
      displayName: identity.fullName || identity.email || "Teammate",
      now,
    });

    const upsert = await supabase
      .from("meta_inbox_presence")
      .upsert([withActiveMetaInboxEnvironment(heartbeat.row)], {
        onConflict: "environment,conversation_id,app_user_id",
      })
      .select("*");
    if (upsert.error) throw normalizeMetaInboxSchemaError(upsert.error);
    const row = rows<JsonRecord>(upsert.data)[0];
    presence = row ? mapPresence(row) : null;
  }

  const presences = await selectActivePresenceForConversation(
    supabase,
    conversation.id,
    actorUserId,
    now,
  );

  return { presence, presences };
}

export async function createSocialInboxSavedReply(
  profile: MetaInboxAccessProfile,
  input: MetaInboxSavedReplyInput,
): Promise<{ savedReply: SocialInboxSavedReply }> {
  const supabase = dynamicSupabase("web");
  const queueAccess = await resolveSocialInboxMutationAccess(supabase, profile);
  if (queueAccess.mode === "none") {
    throw new AuthorizationError("You do not have access to this inbox queue.", 403);
  }
  if (
    queueAccess.mode === "team" &&
    input.queueCategoryKey &&
    !queueAccess.allowedQueueCategoryKeys.includes(input.queueCategoryKey)
  ) {
    throw new AuthorizationError("You do not have access to this inbox queue.", 403);
  }
  if (queueAccess.mode === "team" && input.visibility === "shared" && !input.queueCategoryKey) {
    throw new AuthorizationError("Shared team templates must be scoped to a queue.", 403);
  }
  if (
    input.visibility === "shared" &&
    input.approveShared === true &&
    !canApproveSharedSavedReplies(profile)
  ) {
    throw new AuthorizationError("Only sales lead or admin can approve shared templates.", 403);
  }

  const now = new Date().toISOString();
  const mutation = buildMetaInboxSavedReplyCreate(
    input,
    {
      appUserId: profile.appUserId && isUuid(profile.appUserId) ? profile.appUserId : null,
      roles: profile.roles,
    },
    now,
  );

  const insert = await supabase
    .from("meta_inbox_saved_replies")
    .insert(withActiveMetaInboxEnvironment(mutation.row))
    .select("*")
    .single();
  if (insert.error) throw normalizeMetaInboxSchemaError(insert.error);
  if (!insert.data) throw new Error("Saved reply did not return after insert.");

  return { savedReply: mapSavedReply(insert.data) };
}

export async function updateSocialInboxSavedReplyStatus(
  profile: MetaInboxAccessProfile,
  input: MetaInboxSavedReplyStatusInput,
): Promise<{ savedReply: SocialInboxSavedReply }> {
  if (!canApproveSharedSavedReplies(profile)) {
    throw new AuthorizationError("Only sales lead or admin can approve shared templates.", 403);
  }

  const savedReplyId = input.savedReplyId || "";
  if (!isUuid(savedReplyId)) throw new Error("Saved reply id is required.");

  const supabase = dynamicSupabase("web");
  const queueAccess = await resolveSocialInboxMutationAccess(supabase, profile);
  const existingResult = await selectActiveMetaInboxRows(
    supabase,
    "meta_inbox_saved_replies",
  )
    .eq("id", savedReplyId)
    .limit(1);
  if (existingResult.error) throw normalizeMetaInboxSchemaError(existingResult.error);

  const existingRow = rows<JsonRecord>(existingResult.data)[0];
  if (!existingRow) throw new AuthorizationError("Saved reply not found.", 404);
  const existing = mapSavedReply(existingRow);
  if (queueAccess.mode === "none") {
    throw new AuthorizationError("You do not have access to this inbox queue.", 403);
  }
  if (
    queueAccess.mode === "team" &&
    existing.visibility === "shared" &&
    (!existing.queue_category_key ||
      !queueAccess.allowedQueueCategoryKeys.includes(existing.queue_category_key))
  ) {
    throw new AuthorizationError("You do not have access to this template queue.", 403);
  }

  const update = buildMetaInboxSavedReplyStatusUpdate(
    existing,
    input,
    {
      appUserId: profile.appUserId && isUuid(profile.appUserId) ? profile.appUserId : null,
      roles: profile.roles,
    },
    new Date().toISOString(),
  );

  const updateResult = await updateActiveMetaInboxRows(
    supabase,
    "meta_inbox_saved_replies",
    update,
  )
    .eq("id", savedReplyId);
  if (updateResult.error) throw normalizeMetaInboxSchemaError(updateResult.error);

  const refreshed = await selectActiveMetaInboxRows(
    supabase,
    "meta_inbox_saved_replies",
  )
    .eq("id", savedReplyId)
    .limit(1);
  if (refreshed.error) throw normalizeMetaInboxSchemaError(refreshed.error);

  const row = rows<JsonRecord>(refreshed.data)[0];
  return {
    savedReply: row ? mapSavedReply(row) : mapSavedReply({ ...existingRow, ...update }),
  };
}

export async function createSocialInboxConversationNote(
  conversationId: string,
  profile: MetaInboxAccessProfile,
  input: MetaInboxConversationNoteInput,
): Promise<{ note: SocialInboxConversationNote; events: JsonRecord[] }> {
  const supabase = dynamicSupabase("web");
  const queueAccess = await resolveSocialInboxMutationAccess(supabase, profile);
  const conversation = await requireMutableConversation(supabase, conversationId, queueAccess);
  const now = new Date().toISOString();
  const actorUserId = profile.appUserId && isUuid(profile.appUserId) ? profile.appUserId : null;

  if (!actorUserId) {
    throw new AuthorizationError("A valid inbox user is required for notes.", 403);
  }
  if (input.noteType === "manager_coaching" && !canCreateManagerCoaching(profile)) {
    throw new AuthorizationError("Only sales lead or admin can add manager coaching.", 403);
  }

  const mutation = buildMetaInboxConversationNoteCreate(
    conversation.id,
    input,
    {
      appUserId: actorUserId,
      roles: profile.roles,
    },
    now,
  );

  const insert = await supabase
    .from("meta_inbox_notes")
    .insert(withActiveMetaInboxEnvironment(mutation.row))
    .select("*")
    .single();
  if (insert.error) throw normalizeMetaInboxSchemaError(insert.error);
  if (!insert.data) throw new Error("Inbox note did not return after insert.");

  const noteId = String(insert.data.id);
  const event = await insertConversationEvent(supabase, conversation.id, actorUserId, now, {
    ...mutation.event,
    newValue: {
      ...mutation.event.newValue,
      noteId,
    },
  });

  return {
    note: mapConversationNote(insert.data),
    events: [event],
  };
}

export async function createSocialInboxQaScorecard(
  conversationId: string,
  profile: MetaInboxAccessProfile,
  input: MetaInboxQaScorecardInput,
): Promise<{ qaScorecard: SocialInboxQaScorecard; events: JsonRecord[] }> {
  const supabase = dynamicSupabase("web");
  const queueAccess = await resolveSocialInboxMutationAccess(supabase, profile);
  const conversation = await requireMutableConversation(supabase, conversationId, queueAccess);
  const now = new Date().toISOString();
  const actorUserId = profile.appUserId && isUuid(profile.appUserId) ? profile.appUserId : null;

  if (!actorUserId) {
    throw new AuthorizationError("A valid inbox user is required for QA scorecards.", 403);
  }
  if (!canCreateMetaInboxQaScorecard(profile)) {
    throw new AuthorizationError("Only sales lead or admin can create QA scorecards.", 403);
  }

  const sendAttempt = input.sendAttemptId
    ? await requireSendAttemptForConversation(supabase, conversation, input.sendAttemptId)
    : null;
  const reviewedUserId =
    input.reviewedUserId ||
    conversation.assigned_user_id ||
    null;
  const mutation = buildMetaInboxQaScorecardCreate(
    conversation.id,
    {
      ...input,
      sendAttemptId: sendAttempt?.id || input.sendAttemptId || null,
      reviewedUserId,
    },
    {
      appUserId: actorUserId,
      roles: profile.roles,
    },
    now,
  );

  const insert = await supabase
    .from("meta_inbox_qa_scorecards")
    .insert(withActiveMetaInboxEnvironment(mutation.row))
    .select("*")
    .single();
  if (insert.error) throw normalizeMetaInboxSchemaError(insert.error);
  if (!insert.data) throw new Error("QA scorecard did not return after insert.");

  const qaScorecardId = String(insert.data.id);
  const event = await insertConversationEvent(supabase, conversation.id, actorUserId, now, {
    ...mutation.event,
    newValue: {
      ...mutation.event.newValue,
      qaScorecardId,
    },
  });

  return {
    qaScorecard: mapQaScorecard(insert.data),
    events: [event],
  };
}

async function resolveSocialInboxMutationAccess(
  supabase: DynamicSupabaseClient,
  profile: MetaInboxAccessProfile,
): Promise<MetaInboxQueueAccessDecision> {
  assertMetaInboxOperationalWriteAccess(profile);
  return resolveSocialInboxQueueAccess(supabase, profile);
}

async function resolveSocialInboxQueueAccess(
  supabase: DynamicSupabaseClient,
  profile: MetaInboxAccessProfile | null | undefined,
): Promise<MetaInboxQueueAccessDecision> {
  const scope = metaInboxQueueAccessScopeForProfile(profile);
  if (scope.mode !== "team") return scope;

  const appUserId = profile?.appUserId;
  if (!appUserId || !isUuid(appUserId)) {
    return {
      mode: "none",
      allowedQueueCategoryKeys: [],
      reason: "missing_app_user",
    };
  }

  const members = await selectActiveMetaInboxRows(
    supabase,
    "meta_inbox_team_members",
    "team_id",
  )
    .eq("app_user_id", appUserId)
    .limit(100);
  if (members.error) throw normalizeMetaInboxSchemaError(members.error);

  const teamIds = uniqueStrings(rows<JsonRecord>(members.data).map((row) => stringField(row.team_id)));
  if (!teamIds.length) {
    return {
      ...scope,
      allowedQueueCategoryKeys: [],
    };
  }

  const teams = await selectActiveMetaInboxRows(
    supabase,
    "meta_inbox_teams",
    "id",
  )
    .in("id", teamIds)
    .eq("active", true)
    .limit(100);
  if (teams.error) throw normalizeMetaInboxSchemaError(teams.error);

  const activeTeamIds = uniqueStrings(rows<JsonRecord>(teams.data).map((row) => stringField(row.id)));
  if (!activeTeamIds.length) {
    return {
      ...scope,
      allowedQueueCategoryKeys: [],
    };
  }

  const accessRows = await selectActiveMetaInboxRows(
    supabase,
    "meta_inbox_team_queue_access",
    "queue_category_key",
  )
    .in("team_id", activeTeamIds)
    .limit(500);
  if (accessRows.error) throw normalizeMetaInboxSchemaError(accessRows.error);

  return {
    ...scope,
    allowedQueueCategoryKeys: metaInboxAllowedQueueCategoriesForTeams(
      rows<JsonRecord>(accessRows.data).map((row) => ({
        queueCategoryKey: stringField(row.queue_category_key),
      })),
    ),
  };
}

function selectInboxConversationsForQueueAccess(
  supabase: DynamicSupabaseClient,
  access: MetaInboxQueueAccessDecision,
): Promise<DynamicQueryResult> {
  if (access.mode === "none") return emptyQueryResult();
  if (access.mode === "team" && !access.allowedQueueCategoryKeys.length) {
    return emptyQueryResult();
  }

  const query = selectActiveMetaInboxRows(supabase, "meta_inbox_conversations");
  const scoped =
    access.mode === "team"
      ? query.in("queue_category_key", access.allowedQueueCategoryKeys)
      : query;

  return scoped
    .order("last_activity_at", { ascending: false, nullsFirst: false })
    .limit(250);
}

async function selectAllInboxConversationsForQueueAccess(
  supabase: DynamicSupabaseClient,
  access: MetaInboxQueueAccessDecision,
): Promise<JsonRecord[]> {
  if (access.mode === "none") return [];
  if (access.mode === "team" && !access.allowedQueueCategoryKeys.length) return [];

  return selectAllActiveMetaInboxRows(supabase, "meta_inbox_conversations", {
    orderColumn: "last_activity_at",
    orderOptions: { ascending: false, nullsFirst: false },
    applyQuery:
      access.mode === "team"
        ? (query) => query.in("queue_category_key", access.allowedQueueCategoryKeys)
        : undefined,
  });
}

async function selectSendAttemptsForQueueAccess(
  supabase: DynamicSupabaseClient,
  access: MetaInboxQueueAccessDecision,
): Promise<DynamicQueryResult> {
  if (access.mode === "none") return emptyQueryResult();
  if (access.mode === "team" && !access.allowedQueueCategoryKeys.length) {
    return emptyQueryResult();
  }

  if (access.mode === "all") {
    return selectActiveMetaInboxRows(supabase, "meta_inbox_send_attempts")
      .order("created_at", { ascending: false, nullsFirst: false })
      .limit(250);
  }

  const conversations = await selectInboxConversationsForQueueAccess(supabase, access);
  if (conversations.error) throw normalizeMetaInboxSchemaError(conversations.error);
  const conversationIds = uniqueStrings(
    rows<JsonRecord>(conversations.data).map((conversation) => stringField(conversation.id)),
  );
  if (!conversationIds.length) return emptyQueryResult();

  return selectActiveMetaInboxRows(supabase, "meta_inbox_send_attempts")
    .in("conversation_id", conversationIds)
    .order("created_at", { ascending: false, nullsFirst: false })
    .limit(250);
}

async function selectCommentActionsForQueueAccess(
  supabase: DynamicSupabaseClient,
  access: MetaInboxQueueAccessDecision,
): Promise<DynamicQueryResult> {
  if (access.mode === "none") return emptyQueryResult();
  if (access.mode === "team" && !access.allowedQueueCategoryKeys.length) {
    return emptyQueryResult();
  }

  if (access.mode === "all") {
    return selectActiveMetaInboxRows(supabase, "meta_inbox_comment_actions")
      .order("created_at", { ascending: false, nullsFirst: false })
      .limit(250);
  }

  const conversations = await selectInboxConversationsForQueueAccess(supabase, access);
  if (conversations.error) throw normalizeMetaInboxSchemaError(conversations.error);
  const conversationIds = uniqueStrings(
    rows<JsonRecord>(conversations.data).map((conversation) => stringField(conversation.id)),
  );
  if (!conversationIds.length) return emptyQueryResult();

  return selectActiveMetaInboxRows(supabase, "meta_inbox_comment_actions")
    .in("conversation_id", conversationIds)
    .order("created_at", { ascending: false, nullsFirst: false })
    .limit(250);
}

async function selectConversationEventsForQueueAccess(
  supabase: DynamicSupabaseClient,
  access: MetaInboxQueueAccessDecision,
): Promise<DynamicQueryResult> {
  if (access.mode === "none") return emptyQueryResult();
  if (access.mode === "team" && !access.allowedQueueCategoryKeys.length) {
    return emptyQueryResult();
  }

  if (access.mode === "all") {
    return selectActiveMetaInboxRows(supabase, "meta_inbox_conversation_events")
      .order("event_at", { ascending: false, nullsFirst: false })
      .limit(500);
  }

  const conversations = await selectInboxConversationsForQueueAccess(supabase, access);
  if (conversations.error) throw normalizeMetaInboxSchemaError(conversations.error);
  const conversationIds = uniqueStrings(
    rows<JsonRecord>(conversations.data).map((conversation) => stringField(conversation.id)),
  );
  if (!conversationIds.length) return emptyQueryResult();

  return selectActiveMetaInboxRows(supabase, "meta_inbox_conversation_events")
    .in("conversation_id", conversationIds)
    .order("event_at", { ascending: false, nullsFirst: false })
    .limit(500);
}

async function selectNotesForQueueAccess(
  supabase: DynamicSupabaseClient,
  access: MetaInboxQueueAccessDecision,
): Promise<DynamicQueryResult> {
  if (access.mode === "none") return emptyQueryResult();
  if (access.mode === "team" && !access.allowedQueueCategoryKeys.length) {
    return emptyQueryResult();
  }

  if (access.mode === "all") {
    return selectActiveMetaInboxRows(supabase, "meta_inbox_notes")
      .order("created_at", { ascending: false, nullsFirst: false })
      .limit(250);
  }

  const conversations = await selectInboxConversationsForQueueAccess(supabase, access);
  if (conversations.error) throw normalizeMetaInboxSchemaError(conversations.error);
  const conversationIds = uniqueStrings(
    rows<JsonRecord>(conversations.data).map((conversation) => stringField(conversation.id)),
  );
  if (!conversationIds.length) return emptyQueryResult();

  return selectActiveMetaInboxRows(supabase, "meta_inbox_notes")
    .in("conversation_id", conversationIds)
    .order("created_at", { ascending: false, nullsFirst: false })
    .limit(250);
}

async function selectQaScorecardsForQueueAccess(
  supabase: DynamicSupabaseClient,
  access: MetaInboxQueueAccessDecision,
): Promise<DynamicQueryResult> {
  if (access.mode === "none") return emptyQueryResult();
  if (access.mode === "team" && !access.allowedQueueCategoryKeys.length) {
    return emptyQueryResult();
  }

  if (access.mode === "all") {
    return selectActiveMetaInboxRows(supabase, "meta_inbox_qa_scorecards")
      .order("created_at", { ascending: false, nullsFirst: false })
      .limit(250);
  }

  const conversations = await selectInboxConversationsForQueueAccess(supabase, access);
  if (conversations.error) throw normalizeMetaInboxSchemaError(conversations.error);
  const conversationIds = uniqueStrings(
    rows<JsonRecord>(conversations.data).map((conversation) => stringField(conversation.id)),
  );
  if (!conversationIds.length) return emptyQueryResult();

  return selectActiveMetaInboxRows(supabase, "meta_inbox_qa_scorecards")
    .in("conversation_id", conversationIds)
    .order("created_at", { ascending: false, nullsFirst: false })
    .limit(250);
}

function emptyQueryResult(): Promise<DynamicQueryResult> {
  return Promise.resolve({ data: [], error: null });
}

async function selectAllActiveMetaInboxRowsForConversationIds(
  supabase: DynamicSupabaseClient,
  table: string,
  conversationIds: string[],
  orderColumn: string,
) {
  const allRows: JsonRecord[] = [];
  for (const conversationIdChunk of chunks(conversationIds, 500)) {
    allRows.push(
      ...await selectAllActiveMetaInboxRows(supabase, table, {
        orderColumn,
        orderOptions: { ascending: false, nullsFirst: false },
        applyQuery: (query) => query.in("conversation_id", conversationIdChunk),
      }),
    );
  }
  return allRows;
}

async function selectMessagesForDashboardConversations(
  supabase: DynamicSupabaseClient,
  conversations: SocialInboxConversation[],
) {
  const threadIds = uniqueStrings(
    conversations.flatMap((conversation) =>
      conversation.source_type === "message_thread" || conversation.source_type === "private_reply"
        ? [conversation.platform_thread_id, conversation.source_id]
        : [],
    ),
  );
  if (!threadIds.length) return [];

  const messagesById = new Map<string, JsonRecord>();
  for (const threadIdChunk of chunks(threadIds, 500)) {
    const rows = await selectAllActiveMetaInboxRows(supabase, "meta_social_messages", {
      orderColumn: "sent_at",
      orderOptions: { ascending: true, nullsFirst: true },
      applyQuery: (query) => query.in("thread_id", threadIdChunk),
    });
    for (const row of rows) {
      messagesById.set(String(row.id), row);
    }
  }

  return Array.from(messagesById.values());
}

async function selectAllActiveMetaInboxRows(
  supabase: DynamicSupabaseClient,
  table: string,
  options: {
    columns?: string;
    orderColumn: string;
    orderOptions?: { ascending?: boolean; nullsFirst?: boolean };
    applyQuery?: (query: DynamicQuery) => DynamicQuery;
  },
) {
  const output: JsonRecord[] = [];
  for (let from = 0; ; from += MANAGER_DASHBOARD_PAGE_SIZE) {
    const baseQuery = selectActiveMetaInboxRows(supabase, table, options.columns || "*");
    const query = options.applyQuery ? options.applyQuery(baseQuery) : baseQuery;
    const result = await query
      .order(options.orderColumn, options.orderOptions)
      .range(from, from + MANAGER_DASHBOARD_PAGE_SIZE - 1);
    if (result.error) throw normalizeMetaInboxSchemaError(result.error);

    const page = rows<JsonRecord>(result.data);
    output.push(...page);
    if (page.length < MANAGER_DASHBOARD_PAGE_SIZE) break;
  }
  return output;
}

function missingConversation(): never {
  throw new AuthorizationError("Conversation not found.", 404);
}

async function requireAccessibleConversation(
  supabase: DynamicSupabaseClient,
  conversationId: string,
  queueAccess: MetaInboxQueueAccessDecision,
): Promise<SocialInboxConversation> {
  const conversationResult = await selectActiveMetaInboxRows(
    supabase,
    "meta_inbox_conversations",
  )
    .eq("id", conversationId)
    .limit(1);
  if (conversationResult.error) throw normalizeMetaInboxSchemaError(conversationResult.error);

  const conversationRow = rows<JsonRecord>(conversationResult.data)[0];
  if (!conversationRow) return missingConversation();

  const conversation = mapInboxConversation(conversationRow);
  if (!canReadMetaInboxConversationForQueueAccess(conversation, queueAccess)) {
    throw new AuthorizationError("You do not have access to this inbox queue.", 403);
  }

  return conversation;
}

async function requireMutableConversation(
  supabase: DynamicSupabaseClient,
  conversationId: string,
  queueAccess: MetaInboxQueueAccessDecision,
): Promise<SocialInboxConversation> {
  const conversation = await requireAccessibleConversation(supabase, conversationId, queueAccess);
  assertMetaInboxConversationMutationAccess(conversation, queueAccess);
  return conversation;
}

async function requireContactMethodForConversation(
  supabase: DynamicSupabaseClient,
  conversation: SocialInboxConversation,
  contactMethodId: string | null | undefined,
): Promise<MetaInboxContactMethodRecord> {
  if (!contactMethodId || !isUuid(contactMethodId)) {
    throw new Error("Contact method id is required.");
  }

  const result = await selectActiveMetaInboxRows(
    supabase,
    "meta_inbox_customer_contact_methods",
  )
    .eq("id", contactMethodId)
    .limit(1);
  if (result.error) throw normalizeMetaInboxSchemaError(result.error);

  const row = rows<JsonRecord>(result.data)[0];
  if (!row) throw new AuthorizationError("Contact method not found.", 404);
  if (!conversation.customer_profile_id || stringField(row.customer_profile_id) !== conversation.customer_profile_id) {
    throw new AuthorizationError("Contact method is not attached to this customer.", 403);
  }

  return mapContactMethodRecord(row);
}

async function requireSendAttemptForConversation(
  supabase: DynamicSupabaseClient,
  conversation: SocialInboxConversation,
  sendAttemptId: string | null | undefined,
): Promise<MetaInboxSendAttemptRecord> {
  if (!sendAttemptId || !isUuid(sendAttemptId)) {
    throw new Error("Send attempt id is required.");
  }

  const result = await selectActiveMetaInboxRows(
    supabase,
    "meta_inbox_send_attempts",
  )
    .eq("id", sendAttemptId)
    .limit(1);
  if (result.error) throw normalizeMetaInboxSchemaError(result.error);

  const row = rows<JsonRecord>(result.data)[0];
  if (!row) throw new AuthorizationError("Send attempt not found.", 404);
  if (stringField(row.conversation_id) !== conversation.id) {
    throw new AuthorizationError("Send attempt is not attached to this conversation.", 403);
  }

  return mapSendAttemptRecord(row);
}

async function requireCommentActionForConversation(
  supabase: DynamicSupabaseClient,
  conversation: SocialInboxConversation,
  commentActionId: string | null | undefined,
): Promise<MetaInboxCommentActionRecord> {
  if (!commentActionId || !isUuid(commentActionId)) {
    throw new Error("Comment action id is required.");
  }

  const result = await selectActiveMetaInboxRows(
    supabase,
    "meta_inbox_comment_actions",
  )
    .eq("id", commentActionId)
    .limit(1);
  if (result.error) throw normalizeMetaInboxSchemaError(result.error);

  const row = rows<JsonRecord>(result.data)[0];
  if (!row) throw new AuthorizationError("Comment action not found.", 404);
  if (stringField(row.conversation_id) !== conversation.id) {
    throw new AuthorizationError("Comment action is not attached to this conversation.", 403);
  }

  return mapCommentActionRecord(row);
}

function ensureCommentActionPermission(
  profile: MetaInboxAccessProfile,
  action: Pick<MetaInboxCommentActionRecord, "action_type">,
) {
  if (
    (action.action_type === "hide" || action.action_type === "delete") &&
    !profile.permissions?.includes("manage_inbox_state")
  ) {
    throw new AuthorizationError("You do not have permission to moderate public comments.", 403);
  }
}

async function selectActivePresenceForConversation(
  supabase: DynamicSupabaseClient,
  conversationId: string,
  currentUserId: string | null,
  now: string,
): Promise<SocialInboxPresence[]> {
  const result = await selectActiveMetaInboxRows(
    supabase,
    "meta_inbox_presence",
  )
    .eq("conversation_id", conversationId)
    .limit(50);
  if (result.error) throw normalizeMetaInboxSchemaError(result.error);

  const active = filterActiveMetaInboxPresence(
    rows<JsonRecord>(result.data).map(mapPresenceRecord),
    { currentUserId, now },
  );
  return active.map((presence) => ({
    id: presence.id || `${presence.conversation_id}:${presence.app_user_id}`,
    conversation_id: presence.conversation_id,
    app_user_id: presence.app_user_id,
    display_name: presence.display_name,
    activity: presence.activity,
    last_seen_at: presence.last_seen_at,
    expires_at: presence.expires_at,
  }));
}

async function insertConversationEvent(
  supabase: DynamicSupabaseClient,
  conversationId: string,
  actorUserId: string | null,
  now: string,
  event: {
    eventType:
      | "contact_method_changed"
      | "send_attempt"
      | "comment_action"
      | "note_added"
      | "qa_scorecard_added";
    previousValue: JsonRecord | null;
    newValue: JsonRecord;
    metadata: JsonRecord;
  },
) {
  const insert = await supabase
    .from("meta_inbox_conversation_events")
    .insert(withActiveMetaInboxEnvironment({
      conversation_id: conversationId,
      event_type: event.eventType,
      actor_user_id: actorUserId,
      event_at: now,
      previous_value: event.previousValue,
      new_value: event.newValue,
      metadata: event.metadata,
    }))
    .select("id,conversation_id,event_type,actor_user_id,event_at,previous_value,new_value,metadata")
    .single();
  if (insert.error) throw normalizeMetaInboxSchemaError(insert.error);
  if (!insert.data) throw new Error("Conversation audit event did not return after insert.");
  return insert.data;
}

async function insertContactMethodEvent(
  supabase: DynamicSupabaseClient,
  conversationId: string,
  actorUserId: string | null,
  now: string,
  event: {
    eventType: "contact_method_changed";
    previousValue: JsonRecord | null;
    newValue: JsonRecord;
    metadata: JsonRecord;
  },
) {
  const insert = await supabase
    .from("meta_inbox_conversation_events")
    .insert(withActiveMetaInboxEnvironment({
      conversation_id: conversationId,
      event_type: event.eventType,
      actor_user_id: actorUserId,
      event_at: now,
      previous_value: event.previousValue,
      new_value: event.newValue,
      metadata: event.metadata,
    }))
    .select("id,conversation_id,event_type,actor_user_id,event_at,previous_value,new_value,metadata")
    .single();
  if (insert.error) throw normalizeMetaInboxSchemaError(insert.error);
  if (!insert.data) throw new Error("Contact method audit event did not return after insert.");
  return insert.data;
}

async function updateContactMethodAuditEvent(
  supabase: DynamicSupabaseClient,
  contactMethodId: string,
  auditEventId: string,
) {
  const update = await updateActiveMetaInboxRows(
    supabase,
    "meta_inbox_customer_contact_methods",
    { audit_event_id: auditEventId },
  )
    .eq("id", contactMethodId);
  if (update.error) throw normalizeMetaInboxSchemaError(update.error);
}

function contactEventMetadata(metadata: JsonRecord, changeReason: string | null | undefined) {
  const reason = typeof changeReason === "string" ? changeReason.trim() : "";
  return {
    ...metadata,
    ...(reason ? { changeReason: reason } : {}),
  };
}

async function selectKnownMessagesForConversation(
  supabase: DynamicSupabaseClient,
  conversation: SocialInboxConversation,
) {
  if (!hasKnownMessageHistorySource(conversation)) {
    return [];
  }

  const result = await selectActiveMetaInboxRows(supabase, "meta_social_messages")
    .eq("platform", conversation.platform)
    .eq("thread_id", conversation.platform_thread_id)
    .order("sent_at", { ascending: true, nullsFirst: true })
    .limit(500);
  if (result.error) throw normalizeMetaInboxSchemaError(result.error);

  return rows<JsonRecord>(result.data).map(mapMessage);
}

async function selectKnownCommentsForConversation(
  supabase: DynamicSupabaseClient,
  conversation: SocialInboxConversation,
) {
  if (conversation.source_type !== "public_comment" || !conversation.source_id) {
    return [];
  }

  const [root, replies] = await Promise.all([
    selectActiveMetaInboxRows(supabase, "meta_social_comments")
      .eq("platform", conversation.platform)
      .eq("comment_id", conversation.source_id)
      .order("created_time", { ascending: true, nullsFirst: true })
      .limit(1),
    selectActiveMetaInboxRows(supabase, "meta_social_comments")
      .eq("platform", conversation.platform)
      .eq("parent_comment_id", conversation.source_id)
      .order("created_time", { ascending: true, nullsFirst: true })
      .limit(500),
  ]);
  if (root.error) throw normalizeMetaInboxSchemaError(root.error);
  if (replies.error) throw normalizeMetaInboxSchemaError(replies.error);

  const byId = new Map<string, SocialInboxComment>();
  for (const comment of [
    ...rows<JsonRecord>(root.data).map(mapComment),
    ...rows<JsonRecord>(replies.data).map(mapComment),
  ]) {
    byId.set(comment.id, comment);
  }

  return Array.from(byId.values()).sort((a, b) =>
    String(a.created_time || "").localeCompare(String(b.created_time || "")),
  );
}

export function emptySocialInboxData(): SocialInboxData {
  return {
    queueAccess: {
      mode: "all",
      allowedQueueCategoryKeys: null,
      reason: "unscoped_internal_read",
    },
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
    syncRuns: [],
  };
}

/**
 * Land the ad attribution carried by a `messaging_referrals` webhook
 * event onto the corresponding conversation, independently of the
 * normalize pipeline.
 *
 * Why this exists: Meta sometimes delivers a standalone
 * `messaging_referrals` event AFTER a conversation already has prior
 * messages (e.g. an existing customer clicks a new ad). In that case
 * the normalize path's `firstTouchFromMessage` keys off the earlier
 * message's `raw_json` — which doesn't carry the referral — and the
 * first-touch upsert uses `ignoreDuplicates: true` to protect existing
 * rows. The combination silently drops the new attribution.
 *
 * This function writes the referral fields directly:
 *   - looks up `meta_ads` to resolve `campaign_umbrella`
 *   - UPDATEs the existing first-touch row (only when its ad_id is
 *     null, so we never downgrade good data)
 *   - UPDATEs the conversation's queue/routing when the umbrella
 *     maps to a recognised queue AND the current routing is fallback
 *     (preserving manual_override and umbrella routing as before)
 */
async function applyReferralAttribution(
  referralRow: { thread: JsonRecord; referral: JsonRecord },
  role: "ingest",
): Promise<void> {
  const supabase = dynamicSupabase(role);
  const thread = referralRow.thread;
  const platform = thread.platform === "instagram" ? "instagram" : "facebook";
  const pageId = stringField(thread.page_id);
  const igUserId = stringField(thread.ig_user_id);
  const businessId = platform === "instagram" ? igUserId : pageId;
  const participantId = stringField(thread.participant_id);
  if (!businessId || !participantId) return;

  const canonicalKey = `${platform}:message_thread:${businessId}:${participantId}`;
  const adId = stringField(referralRow.referral.ad_id);
  const ref = stringField(referralRow.referral.ref);

  // No usable attribution → nothing to do.
  if (!adId && !ref) return;

  const convResult = await selectActiveMetaInboxRows(
    supabase,
    "meta_inbox_conversations",
    "id,routing_source,queue_category_key",
  )
    .eq("canonical_conversation_key", canonicalKey)
    .limit(1);
  if (convResult.error) {
    if (isMissingMetaInboxSchemaError(convResult.error)) return;
    throw normalizeMetaInboxSchemaError(convResult.error);
  }
  const convRow = rowsFrom(convResult.data)[0];
  if (!convRow) return;
  const conversationId = stringField(convRow.id);
  if (!conversationId) return;

  // Resolve campaign metadata. Use the same path the normalize pipeline
  // uses so umbrella resolution stays consistent.
  const adLookup = adId
    ? await loadMetaAdsForFirstTouchSources(
        [
          {
            canonicalConversationKey: canonicalKey,
            firstMessageId: null,
            firstMessageAt: null,
            referralJson: {},
            adId,
            adsContextDataJson: {},
            ref: null,
            sourcePostId: null,
            sourceMediaId: null,
            sourceCommentId: null,
            sourceProductId: null,
            sourcePermalink: null,
            campaignUmbrellaId: null,
            campaignId: null,
            adsetId: null,
            creativeId: null,
            attributionMethod: "meta_referral",
            attributionConfidence: 0.95,
            rawPayloadJson: {},
          },
        ] as readonly MetaInboxFirstTouchCandidate[],
        role,
      )
    : new Map<string, MetaAdsLookupRow>();
  const adRow = adId ? adLookup.get(adId) || null : null;
  const storedUmbrella = adRow && isCampaignUmbrella(adRow.campaign_umbrella)
    ? (adRow.campaign_umbrella as string)
    : null;

  // Patch first-touch source — only when current ad_id is null, so we
  // never overwrite better attribution from an earlier referral.
  const existingFtResult = await selectActiveMetaInboxRows(
    supabase,
    "meta_inbox_first_touch_sources",
    "id,ad_id",
  )
    .eq("conversation_id", conversationId)
    .limit(1);
  if (existingFtResult.error) {
    if (isMissingMetaInboxSchemaError(existingFtResult.error)) return;
    throw normalizeMetaInboxSchemaError(existingFtResult.error);
  }
  const existingFt = rowsFrom(existingFtResult.data)[0];
  if (existingFt && !stringField(existingFt.ad_id)) {
    const adsContext = recordField(referralRow.referral.ads_context_data);
    const patch: JsonRecord = {
      ad_id: adId,
      ref,
      ads_context_data_json: adsContext,
      referral_json: referralRow.referral,
      attribution_method: adId ? "meta_referral" : "meta_referral",
      attribution_confidence: adId ? 0.95 : 0.75,
    };
    if (adRow) {
      patch.campaign_id = stringField(adRow.campaign_id);
      patch.adset_id = stringField(adRow.ad_set_id);
      patch.creative_id = stringField(adRow.creative_id);
    }
    if (storedUmbrella) patch.campaign_umbrella_id = storedUmbrella;
    const { error: ftUpdateError } = await supabase
      .from("meta_inbox_first_touch_sources")
      .update(patch)
      .eq("id", String(existingFt.id));
    if (ftUpdateError && !isMissingMetaInboxSchemaError(ftUpdateError)) {
      throw normalizeMetaInboxSchemaError(ftUpdateError);
    }
  }

  // Re-route the conversation if the existing routing is a fallback and
  // we now have a recognised umbrella. Mirrors the upgrade rule in
  // preserveMetaInboxConversationWorkflowFields.
  const mappedQueue = storedUmbrella ? umbrellaToQueueCategory(storedUmbrella) : null;
  if (
    mappedQueue &&
    stringField(convRow.routing_source) === "fallback"
  ) {
    const { error: convUpdateError } = await supabase
      .from("meta_inbox_conversations")
      .update({
        queue_category_key: mappedQueue,
        routing_source: "campaign_umbrella",
        routing_confidence: 0.85,
        routing_explanation: `Routed by campaign umbrella: ${storedUmbrella}.`,
      })
      .eq("id", conversationId);
    if (convUpdateError && !isMissingMetaInboxSchemaError(convUpdateError)) {
      throw normalizeMetaInboxSchemaError(convUpdateError);
    }
  }
}

export async function ingestMetaWebhookPayload(payload: JsonRecord): Promise<MetaWebhookIngestResult> {
  const object = stringField(payload.object);
  const entries = arrayField(payload.entry).filter(isRecord);
  const result: MetaWebhookIngestResult = {
    messages: 0,
    comments: 0,
    referrals: 0,
  };

  for (const entry of entries) {
    const messagingEvents = [
      ...arrayField(entry.messaging).filter(isRecord),
      ...arrayField(entry.standby).filter(isRecord),
    ];
    for (const event of messagingEvents) {
      const referralRow = shapeWebhookReferralRow(object, entry, event);
      if (referralRow) {
        const threads = await upsertMany(
          "meta_social_threads",
          [referralRow.thread],
          "platform,thread_id",
          "ingest",
        );
        await normalizeMetaInboxRowsWhenSchemaReady(
          { threads },
          "ingest",
          { loadFullThreadHistory: true },
        );
        // The normalize pass above creates the conversation row but
        // cannot reliably plant the ad attribution onto an existing
        // first-touch source — when a prior message exists for this
        // thread, firstTouchFromMessage reads the message's raw_json
        // (no referral) instead of the thread's raw_json (referral
        // just landed), and the first_touch upsert is ignoreDuplicates.
        // applyReferralAttribution closes that gap by writing the
        // referral fields directly and re-routing the conversation
        // when the existing attribution is empty or weaker.
        await applyReferralAttribution(referralRow, "ingest");
        result.referrals += 1;
      }

      const row = shapeWebhookMessageRow(object, entry, event);
      if (!row) continue;
      const threads = await upsertMany(
        "meta_social_threads",
        [row.thread],
        "platform,thread_id",
        "ingest",
      );
      const messages = await upsertMany(
        "meta_social_messages",
        [row.message],
        "platform,message_id",
        "ingest",
      );
      await normalizeMetaInboxRowsWhenSchemaReady(
        { threads, messages },
        "ingest",
        { loadFullThreadHistory: true },
      );
      await enrichMessengerProfilesForThreads(threads);
      result.messages += messages.length;
    }

    const changeEvents = arrayField(entry.changes).filter(isRecord);
    for (const change of changeEvents) {
      const comment = webhookCommentRow(object, entry, change);
      if (!comment) continue;
      const comments = await upsertMany(
        "meta_social_comments",
        [comment],
        "platform,comment_id",
        "ingest",
      );
      await normalizeMetaInboxRowsWhenSchemaReady({ comments }, "ingest");
      result.comments += comments.length;
    }
  }

  if (result.messages || result.comments || result.referrals) {
    const supabase = dynamicSupabase("ingest");
    const { error } = await supabase.from("meta_social_sync_runs").insert(withActiveMetaInboxEnvironment({
      trigger: "webhook",
      status: "success",
      completed_at: new Date().toISOString(),
      metrics: {
        pages: 0,
        threads: result.messages + result.referrals,
        messages: result.messages,
        comments: result.comments,
        referrals: result.referrals,
      },
      errors: [],
    })).select("id").single();
    if (error) throw error;
  }

  return result;
}

export type RepairSocialInboxCustomerInfoOptions = {
  conversationId?: string;
  limit?: number;
};

export type RepairSocialInboxCustomerInfoResult = {
  conversationsConsidered: number;
  threadsRenormalized: number;
  profilesEnriched: number;
  profilesSkipped: number;
  errors: string[];
};

/**
 * Backfill helper: re-runs webhook-style normalization (with full thread
 * history) and Messenger profile enrichment for existing inbox rows.
 *
 * Heals conversations whose `send_eligibility`, `latest_inbound_at`, or
 * `customer_profiles.display_name`/`profile_picture_url` were corrupted by
 * the pre-fix webhook path. Safe to run repeatedly.
 */
export async function repairSocialInboxCustomerInfo(
  options: RepairSocialInboxCustomerInfoOptions = {},
): Promise<RepairSocialInboxCustomerInfoResult> {
  const supabase = dynamicSupabase("worker");
  const result: RepairSocialInboxCustomerInfoResult = {
    conversationsConsidered: 0,
    threadsRenormalized: 0,
    profilesEnriched: 0,
    profilesSkipped: 0,
    errors: [],
  };

  let conversationsBuilder = selectActiveMetaInboxRows(
    supabase,
    "meta_inbox_conversations",
    "id,platform,platform_thread_id,source_type",
  ).eq("source_type", "message_thread");
  if (options.conversationId) {
    conversationsBuilder = conversationsBuilder.eq("id", options.conversationId);
  }
  const conversationsResult = await conversationsBuilder.limit(
    Math.min(Math.max(options.limit ?? 500, 1), 5000),
  );
  if (conversationsResult.error) {
    if (isMissingMetaInboxSchemaError(conversationsResult.error)) {
      return result;
    }
    throw normalizeMetaInboxSchemaError(conversationsResult.error);
  }
  const conversations = rowsFrom(conversationsResult.data);
  result.conversationsConsidered = conversations.length;

  const renormalizedThreadKeys = new Set<string>();
  const enrichedProfileKeys = new Set<string>();

  for (const conversation of conversations) {
    const platform = stringField(conversation.platform);
    const threadId = stringField(conversation.platform_thread_id);
    if (!platform || !threadId) continue;

    const threadKey = `${platform}:${threadId}`;
    if (renormalizedThreadKeys.has(threadKey)) continue;
    renormalizedThreadKeys.add(threadKey);

    const threadResult = await selectActiveMetaInboxRows(supabase, "meta_social_threads")
      .eq("platform", platform)
      .eq("thread_id", threadId)
      .limit(1);
    if (threadResult.error) {
      if (isMissingMetaInboxSchemaError(threadResult.error)) return result;
      result.errors.push(`thread lookup ${threadKey}: ${errorToMessage(threadResult.error)}`);
      continue;
    }
    const threadRow = rowsFrom(threadResult.data)[0];
    if (!threadRow) continue;

    try {
      await normalizeMetaInboxRowsWhenSchemaReady(
        { threads: [threadRow], messages: [] },
        "worker",
        { loadFullThreadHistory: true },
      );
      result.threadsRenormalized += 1;
    } catch (error) {
      result.errors.push(`renormalize ${threadKey}: ${errorToMessage(error)}`);
      continue;
    }

    const participantId = stringField(threadRow.participant_id);
    const pageId = stringField(threadRow.page_id);
    if (platform !== "facebook" || !participantId || !pageId) continue;

    const profileKey = ["facebook", pageId, "", participantId].join(":");
    if (enrichedProfileKeys.has(profileKey)) {
      result.profilesSkipped += 1;
      continue;
    }
    enrichedProfileKeys.add(profileKey);

    try {
      const enrichStats = await enrichMessengerProfilesForThreads([threadRow], "worker");
      result.profilesEnriched += enrichStats.enriched;
      result.profilesSkipped += enrichStats.skipped;
    } catch (error) {
      result.errors.push(`enrich ${profileKey}: ${errorToMessage(error)}`);
    }
  }

  return result;
}

export type SocialInboxConversationDebug = {
  conversation: JsonRecord | null;
  thread: JsonRecord | null;
  firstInboundMessage: JsonRecord | null;
  firstTouch: JsonRecord | null;
  customerProfile: JsonRecord | null;
};

/**
 * Diagnostic: dump the inbox conversation + first-inbound raw payload + first-touch
 * row + customer profile for a single conversation. Used to investigate why ad
 * attribution / customer info is missing.
 */
export async function getSocialInboxConversationDebug(
  conversationId: string,
): Promise<SocialInboxConversationDebug> {
  const supabase = dynamicSupabase("worker");
  const debug: SocialInboxConversationDebug = {
    conversation: null,
    thread: null,
    firstInboundMessage: null,
    firstTouch: null,
    customerProfile: null,
  };

  const conversationLookup = await selectActiveMetaInboxRows(supabase, "meta_inbox_conversations")
    .eq("id", conversationId)
    .limit(1);
  if (conversationLookup.error) {
    if (isMissingMetaInboxSchemaError(conversationLookup.error)) return debug;
    throw normalizeMetaInboxSchemaError(conversationLookup.error);
  }
  const conversation = rowsFrom(conversationLookup.data)[0];
  if (!conversation) return debug;
  debug.conversation = conversation;

  const platform = stringField(conversation.platform);
  const threadId = stringField(conversation.platform_thread_id);
  if (platform && threadId) {
    const threadLookup = await selectActiveMetaInboxRows(supabase, "meta_social_threads")
      .eq("platform", platform)
      .eq("thread_id", threadId)
      .limit(1);
    if (!threadLookup.error) debug.thread = rowsFrom(threadLookup.data)[0] || null;

    const inboundLookup = await selectActiveMetaInboxRows(supabase, "meta_social_messages")
      .eq("platform", platform)
      .eq("thread_id", threadId)
      .eq("direction", "inbound")
      .order("sent_at", { ascending: true, nullsFirst: true })
      .limit(1);
    if (!inboundLookup.error) debug.firstInboundMessage = rowsFrom(inboundLookup.data)[0] || null;
  }

  const firstTouchLookup = await selectActiveMetaInboxRows(supabase, "meta_inbox_first_touch_sources")
    .eq("conversation_id", conversationId)
    .limit(1);
  if (!firstTouchLookup.error) debug.firstTouch = rowsFrom(firstTouchLookup.data)[0] || null;

  const profileId = stringField(conversation.customer_profile_id);
  if (profileId) {
    const profileLookup = await selectActiveMetaInboxRows(supabase, "meta_inbox_customer_profiles")
      .eq("id", profileId)
      .limit(1);
    if (!profileLookup.error) debug.customerProfile = rowsFrom(profileLookup.data)[0] || null;
  }

  return debug;
}

async function validateSocialInboxPermissions() {
  const health = await getMetaPermissionHealth();

  if (health.forbiddenGranted.length) {
    throw new ConfigurationError(
      `Meta token has forbidden permission(s): ${health.forbiddenGranted.join(", ")}. Re-issue a token without ads_management.`,
    );
  }

  if (health.socialInbox.missing.length) {
    throw new ConfigurationError(
      `Meta token is missing social inbox permission(s): ${health.socialInbox.missing.join(", ")}.`,
      health.socialInbox.missing,
    );
  }
}

/**
 * Look up the Page Access Token for a single Facebook page (or its linked
 * Instagram Business Account).
 *
 * We resolve tokens at send time instead of persisting them so that:
 *   - Rotating the long-lived user token (via `me/accounts`) automatically
 *     rotates every page token without a DB write.
 *   - We never store a Page Access Token at rest in our database.
 *
 * Returns the page row (token, ig user id, etc.) or null if the long-lived
 * token does not manage that page. The caller is responsible for surfacing
 * a useful error to the operator.
 */
export async function getManagedPage(
  pageOrIgId: string,
): Promise<{ pageId: string; accessToken: string; igUserId: string | null } | null> {
  const trimmed = pageOrIgId?.trim();
  if (!trimmed) return null;
  const pages = await fetchManagedPages();
  const match = pages.find(
    (page) => page.pageId === trimmed || page.igUserId === trimmed,
  );
  if (!match) return null;
  return {
    pageId: match.pageId,
    accessToken: match.accessToken,
    igUserId: match.igUserId,
  };
}

async function fetchManagedPages() {
  const pages = await graphPages<JsonRecord>(
    "me/accounts",
    {
      fields:
        "id,name,access_token,instagram_business_account{id,username,name},connected_instagram_account{id,username}",
      limit: "25",
    },
    { timeoutMs: 20000, maxPages: 2 },
  );

  return pages
    .map((page) => {
      const accessToken = stringField(page.access_token);
      const pageId = stringField(page.id);
      if (!accessToken || !pageId) return null;

      const igBusinessAccount = recordField(page.instagram_business_account);
      const connectedInstagramAccount = recordField(page.connected_instagram_account);
      const igUserId = stringField(igBusinessAccount.id) || stringField(connectedInstagramAccount.id);
      const igUsername =
        stringField(igBusinessAccount.username) || stringField(connectedInstagramAccount.username);

      return {
        pageId,
        name: stringField(page.name),
        accessToken,
        igUserId,
        igUsername,
        raw: page,
      };
    })
    .filter(Boolean) as ManagedPage[];
}

async function syncPage(page: ManagedPage) {
  const result = {
    threads: 0,
    messages: 0,
    comments: 0,
    errors: [] as string[],
  };

  const facebookMessages = await safeSyncConversations({
    page,
    platform: "facebook",
  });
  result.threads += facebookMessages.threads;
  result.messages += facebookMessages.messages;
  result.errors.push(...facebookMessages.errors);

  const instagramMessages = await safeSyncConversations({
    page,
    platform: "instagram",
    params: { platform: "instagram" },
  });
  result.threads += instagramMessages.threads;
  result.messages += instagramMessages.messages;
  result.errors.push(...instagramMessages.errors);

  const instagramComments = await safeSyncInstagramComments(page);
  result.comments += instagramComments.comments;
  result.errors.push(...instagramComments.errors);

  const facebookComments = await safeSyncFacebookComments(page);
  result.comments += facebookComments.comments;
  result.errors.push(...facebookComments.errors);

  return result;
}

async function safeSyncConversations(input: ConversationSyncInput) {
  try {
    return await syncConversations(input);
  } catch (error) {
    return {
      threads: 0,
      messages: 0,
      errors: [`${input.platform} messages: ${conversationSyncErrorMessage(input.platform, error)}`],
    };
  }
}

async function syncConversations({ page, platform, params = {} }: ConversationSyncInput) {
  const now = new Date().toISOString();
  const conversations = await graphPages<JsonRecord>(
    `${page.pageId}/conversations`,
    {
      ...params,
      fields: "id,updated_time,message_count,unread_count,participants",
      limit: String(getPositiveIntegerEnv("META_SOCIAL_SYNC_CONVERSATION_LIMIT", 25)),
    },
    {
      accessToken: page.accessToken,
      maxPages: getPositiveIntegerEnv("META_SOCIAL_SYNC_CONVERSATION_PAGES", 50),
      timeoutMs: 25000,
    },
  );

  const threadRows = await upsertMany(
    "meta_social_threads",
    conversations
      .map((conversation) => {
        const threadId = stringField(conversation.id);
        if (!threadId) return null;
        const customer = pickCustomerParticipant(conversation.participants, page.pageId);
        return {
          platform,
          thread_id: threadId,
          page_id: page.pageId,
          ig_user_id: platform === "instagram" ? page.igUserId : null,
          thread_type: "message",
          participant_id: customer.id,
          participant_name: customer.name,
          message_count: numberField(conversation.message_count) || 0,
          unread_count: numberField(conversation.unread_count) || 0,
          last_message_at: stringField(conversation.updated_time),
          raw_json: conversation,
          last_synced_at: now,
        };
      })
      .filter(Boolean) as JsonRecord[],
    "platform,thread_id",
  );

  const threadById = new Map(threadRows.map((thread) => [String(thread.thread_id), thread]));
  const maxThreads = getPositiveIntegerEnv("META_SOCIAL_SYNC_MESSAGE_THREAD_LIMIT", 1000);
  let messageCount = 0;
  const errors: string[] = [];

  for (const conversation of conversations.slice(0, maxThreads)) {
    const threadId = stringField(conversation.id);
    if (!threadId) continue;

    try {
      const messages = await graphPages<JsonRecord>(
        `${threadId}/messages`,
        {
          fields: "id,message,created_time,from,to,attachments",
          limit: String(getPositiveIntegerEnv("META_SOCIAL_SYNC_MESSAGE_LIMIT", 25)),
        },
        {
          accessToken: page.accessToken,
          maxPages: 1,
          timeoutMs: 20000,
        },
      );
      const messageRows = await upsertMessages({
        page,
        platform,
        threadId,
        threadRefId: stringField(threadById.get(threadId)?.id),
        messages,
      });
      messageCount += messageRows.length;
      await refreshThreadFromMessages(platform, threadId, messages);
      await normalizeMetaInboxRows({
        threads: threadById.get(threadId) ? [threadById.get(threadId) as JsonRecord] : [],
        messages: messageRows,
      });
    } catch (error) {
      errors.push(`${platform} thread ${threadId}: ${errorToMessage(error)}`);
    }
  }

  return {
    threads: threadRows.length,
    messages: messageCount,
    errors,
  };
}


function webhookCommentRow(object: string | null, entry: JsonRecord, change: JsonRecord) {
  const field = stringField(change.field);
  const value = recordField(change.value);
  const item = stringField(value.item);
  const commentId = stringField(value.comment_id) || stringField(value.id);

  if (!commentId || (field !== "comments" && item !== "comment")) return null;

  const platform = object === "instagram" ? "instagram" : "facebook";
  const from = recordField(value.from);
  const createdTime = timestampToIso(value.created_time) || timestampToIso(value.timestamp);

  return {
    platform,
    comment_id: commentId,
    parent_comment_id: stringField(value.parent_id) || stringField(value.parent_comment_id),
    page_id: platform === "facebook" ? stringField(entry.id) : null,
    ig_user_id: platform === "instagram" ? stringField(entry.id) : null,
    content_id: stringField(value.post_id) || stringField(value.media_id),
    content_permalink: stringField(value.permalink_url),
    author_id: stringField(value.sender_id) || stringField(from.id),
    author_name: stringField(value.sender_name) || stringField(from.name) || stringField(from.username),
    body: stringField(value.message) || stringField(value.text),
    like_count: numberField(value.like_count) || 0,
    reply_count: numberField(value.comment_count) || 0,
    hidden: typeof value.is_hidden === "boolean" ? value.is_hidden : null,
    created_time: createdTime,
    raw_json: change,
    last_synced_at: new Date().toISOString(),
  };
}

async function upsertMessages({
  page,
  platform,
  threadId,
  threadRefId,
  messages,
}: {
  page: ManagedPage;
  platform: "facebook" | "instagram";
  threadId: string;
  threadRefId: string | null;
  messages: JsonRecord[];
}) {
  return upsertMany(
    "meta_social_messages",
    messages
      .map((message) => {
        const messageId = stringField(message.id);
        if (!messageId) return null;
        const from = recordField(message.from);
        const to = firstRecord(message.to);
        const senderId = stringField(from.id);
        const recipientId = stringField(to.id);
        return {
          thread_ref_id: threadRefId,
          platform,
          thread_id: threadId,
          message_id: messageId,
          direction: messageDirection(senderId, page, platform),
          sender_id: senderId,
          sender_name: stringField(from.name) || stringField(from.username),
          recipient_id: recipientId,
          recipient_name: stringField(to.name) || stringField(to.username),
          body: stringField(message.message),
          attachments: normalizeMetaInboxAttachments(message.attachments),
          sent_at: stringField(message.created_time),
          raw_json: message,
        };
      })
      .filter(Boolean) as JsonRecord[],
    "platform,message_id",
  );
}

async function refreshThreadFromMessages(
  platform: "facebook" | "instagram",
  threadId: string,
  messages: JsonRecord[],
) {
  const sorted = [...messages].sort((a, b) =>
    String(stringField(b.created_time) || "").localeCompare(String(stringField(a.created_time) || "")),
  );
  const latest = sorted[0];
  if (!latest) return;

  // Only update snippet + last_message_at here. Participant identity is the
  // authoritative job of syncConversations (from the /conversations
  // participants array). Overwriting from latest.from would clobber the
  // customer with the page identity whenever the latest message is outbound.
  // Snippet: pick the most recent message that has actual text — attachment-
  // only messages (photos, stickers) have empty bodies and would otherwise
  // leave the preview as "Conversation history not synced yet".
  await upsertMany(
    "meta_social_threads",
    [
      {
        platform,
        thread_id: threadId,
        snippet: pickLatestNonEmptySnippet(messages),
        last_message_at: stringField(latest.created_time),
      },
    ],
    "platform,thread_id",
  );
}

async function safeSyncInstagramComments(page: ManagedPage) {
  if (!page.igUserId) return { comments: 0, errors: [] as string[] };

  try {
    const media = await graphPages<JsonRecord>(
      `${page.igUserId}/media`,
      {
        fields:
          "id,caption,media_type,permalink,timestamp,comments_count,comments.limit(25){id,text,username,timestamp,like_count,replies.limit(10){id,text,username,timestamp,like_count}}",
        limit: String(getPositiveIntegerEnv("META_SOCIAL_SYNC_MEDIA_LIMIT", 20)),
      },
      { maxPages: 1, timeoutMs: 25000 },
    );
    const comments = flattenInstagramComments(media, page);
    const rows = await upsertMany(comments.table, comments.rows, "platform,comment_id");
    await normalizeMetaInboxRows({ comments: rows });
    return { comments: rows.length, errors: [] as string[] };
  } catch (error) {
    return { comments: 0, errors: [`instagram comments: ${errorToMessage(error)}`] };
  }
}

async function safeSyncFacebookComments(page: ManagedPage) {
  try {
    const posts = await graphPages<JsonRecord>(
      `${page.pageId}/feed`,
      {
        fields:
          "id,message,created_time,permalink_url,comments.limit(25){id,message,created_time,from,comment_count,like_count,permalink_url,parent}",
        limit: String(getPositiveIntegerEnv("META_SOCIAL_SYNC_FEED_LIMIT", 15)),
      },
      { accessToken: page.accessToken, maxPages: 1, timeoutMs: 25000 },
    );
    const comments = flattenFacebookComments(posts, page);
    const rows = await upsertMany(comments.table, comments.rows, "platform,comment_id");
    await normalizeMetaInboxRows({ comments: rows });
    return { comments: rows.length, errors: [] as string[] };
  } catch (error) {
    return { comments: 0, errors: [`facebook comments: ${errorToMessage(error)}`] };
  }
}

function flattenInstagramComments(media: JsonRecord[], page: ManagedPage) {
  const now = new Date().toISOString();
  const rows: JsonRecord[] = [];

  for (const item of media) {
    const contentId = stringField(item.id);
    const contentPermalink = stringField(item.permalink);
    const comments = arrayField(recordField(item.comments).data);

    for (const comment of comments) {
      if (!isRecord(comment)) continue;
      if (!stringField(comment.id)) continue;
      rows.push(instagramCommentRow(comment, page, contentId, contentPermalink, null, now));

      const replies = arrayField(recordField(comment.replies).data);
      for (const reply of replies) {
        if (!isRecord(reply)) continue;
        if (!stringField(reply.id)) continue;
        rows.push(
          instagramCommentRow(reply, page, contentId, contentPermalink, stringField(comment.id), now),
        );
      }
    }
  }

  return { table: "meta_social_comments", rows };
}

function instagramCommentRow(
  comment: JsonRecord,
  page: ManagedPage,
  contentId: string | null,
  contentPermalink: string | null,
  parentCommentId: string | null,
  now: string,
) {
  return {
    platform: "instagram",
    comment_id: stringField(comment.id),
    parent_comment_id: parentCommentId,
    page_id: page.pageId,
    ig_user_id: page.igUserId,
    content_id: contentId,
    content_permalink: contentPermalink,
    author_name: stringField(comment.username),
    body: stringField(comment.text),
    like_count: numberField(comment.like_count) || 0,
    reply_count: arrayField(recordField(comment.replies).data).length,
    created_time: stringField(comment.timestamp),
    raw_json: comment,
    last_synced_at: now,
  };
}

function flattenFacebookComments(posts: JsonRecord[], page: ManagedPage) {
  const now = new Date().toISOString();
  const rows: JsonRecord[] = [];

  for (const post of posts) {
    const contentId = stringField(post.id);
    const contentPermalink = stringField(post.permalink_url);
    const comments = arrayField(recordField(post.comments).data);

    for (const comment of comments) {
      if (!isRecord(comment)) continue;
      if (!stringField(comment.id)) continue;
      const from = recordField(comment.from);
      rows.push({
        platform: "facebook",
        comment_id: stringField(comment.id),
        parent_comment_id: stringField(recordField(comment.parent).id),
        page_id: page.pageId,
        ig_user_id: page.igUserId,
        content_id: contentId,
        content_permalink: stringField(comment.permalink_url) || contentPermalink,
        author_id: stringField(from.id),
        author_name: stringField(from.name),
        body: stringField(comment.message),
        like_count: numberField(comment.like_count) || 0,
        reply_count: numberField(comment.comment_count) || 0,
        created_time: stringField(comment.created_time),
        raw_json: comment,
        last_synced_at: now,
      });
    }
  }

  return { table: "meta_social_comments", rows };
}

async function upsertPages(pages: ManagedPage[]) {
  const now = new Date().toISOString();
  return upsertMany(
    "meta_social_pages",
    pages.map((page) => ({
      page_id: page.pageId,
      name: page.name,
      ig_user_id: page.igUserId,
      ig_username: page.igUsername,
      raw_json: redactPageToken(page.raw),
      last_synced_at: now,
    })),
    "page_id",
  );
}

async function graphPages<T>(
  path: string,
  params: Record<string, string | undefined>,
  options: { accessToken?: string; maxPages?: number; timeoutMs?: number } = {},
) {
  const data: T[] = [];
  let nextUrl: string | undefined = graphUrl(path, params, options.accessToken);
  let page = 0;

  while (nextUrl && (!options.maxPages || page < options.maxPages)) {
    const response = await fetchWithTimeout(nextUrl, { timeoutMs: options.timeoutMs || 25000 });
    const json = (await response.json()) as MetaPaging<T>;

    if (!response.ok || json.error) {
      throw new MetaSocialGraphError(
        json.error?.message || `Meta Graph API request failed for ${path}`,
        json,
      );
    }

    data.push(...(json.data || []));
    nextUrl = json.paging?.next;
    page += 1;
  }

  return data;
}

async function fetchWithTimeout(url: string, { timeoutMs }: { timeoutMs: number }) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetch(url, { cache: "no-store", signal: controller.signal });
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new MetaSocialGraphError("Meta Graph API request timed out.");
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

function graphUrl(
  path: string,
  params: Record<string, string | undefined>,
  accessToken = requireMetaAccessToken(),
) {
  const url = new URL(`https://graph.facebook.com/${getMetaApiVersion()}/${path.replace(/^\//, "")}`);
  url.searchParams.set("access_token", accessToken);
  for (const [key, value] of Object.entries(params)) {
    if (value) url.searchParams.set(key, value);
  }
  return url.toString();
}

function requireMetaAccessToken() {
  const accessToken = process.env.META_ACCESS_TOKEN;
  if (!accessToken) {
    throw new ConfigurationError("Missing META_ACCESS_TOKEN", ["META_ACCESS_TOKEN"]);
  }
  return accessToken;
}

async function upsertMany(
  table: string,
  rows: JsonRecord[],
  onConflict: string,
  role: "worker" | "ingest" = "worker",
) {
  if (!rows.length) return [];
  const supabase = dynamicSupabase(role);
  const results: JsonRecord[] = [];

  for (const chunk of chunks(rows, 500)) {
    const { data, error } = await supabase
      .from(table)
      .upsert(withActiveMetaInboxEnvironmentRows(chunk), {
        onConflict: activeMetaInboxOnConflict(onConflict),
      })
      .select("*");

    if (error) throw error;
    results.push(...rowsFrom(data));
  }

  return results;
}

async function loadMetaAdsForFirstTouchSources(
  sources: readonly MetaInboxFirstTouchCandidate[],
  role: "worker" | "ingest",
): Promise<Map<string, MetaAdsLookupRow>> {
  const lookup = new Map<string, MetaAdsLookupRow>();
  const adIds = Array.from(
    new Set(
      sources
        .map((source) => source.adId)
        .filter((id): id is string => Boolean(id && id.trim())),
    ),
  );
  if (!adIds.length) return lookup;

  const supabase = dynamicSupabase(role);
  const { data: adData, error: adError } = await supabase
    .from("meta_ads")
    .select(
      "ad_id,campaign_id,ad_set_id,creative_id,campaign_ref_id,ad_set_ref_id,campaign_umbrella",
    )
    .in("ad_id", adIds);

  if (adError) {
    if (isMissingMetaInboxSchemaError(adError)) return lookup;
    throw normalizeMetaInboxSchemaError(adError);
  }

  const adRows = rowsFrom(adData);
  if (!adRows.length) return lookup;

  const campaignRefIds = Array.from(
    new Set(
      adRows
        .map((row) => stringField(row.campaign_ref_id))
        .filter((id): id is string => Boolean(id)),
    ),
  );
  const adSetRefIds = Array.from(
    new Set(
      adRows
        .map((row) => stringField(row.ad_set_ref_id))
        .filter((id): id is string => Boolean(id)),
    ),
  );

  const campaignNameById = new Map<string, string | null>();
  if (campaignRefIds.length) {
    const { data: campaignData, error: campaignError } = await supabase
      .from("meta_campaigns")
      .select("id,name")
      .in("id", campaignRefIds);
    if (campaignError && !isMissingMetaInboxSchemaError(campaignError)) {
      throw normalizeMetaInboxSchemaError(campaignError);
    }
    for (const row of rowsFrom(campaignData)) {
      campaignNameById.set(String(row.id), stringField(row.name));
    }
  }

  const adSetNameById = new Map<string, string | null>();
  if (adSetRefIds.length) {
    const { data: adSetData, error: adSetError } = await supabase
      .from("meta_ad_sets")
      .select("id,name")
      .in("id", adSetRefIds);
    if (adSetError && !isMissingMetaInboxSchemaError(adSetError)) {
      throw normalizeMetaInboxSchemaError(adSetError);
    }
    for (const row of rowsFrom(adSetData)) {
      adSetNameById.set(String(row.id), stringField(row.name));
    }
  }

  for (const row of adRows) {
    const adId = stringField(row.ad_id);
    if (!adId) continue;
    const campaignRefId = stringField(row.campaign_ref_id);
    const adSetRefId = stringField(row.ad_set_ref_id);
    lookup.set(adId, {
      ad_id: adId,
      campaign_id: stringField(row.campaign_id),
      ad_set_id: stringField(row.ad_set_id),
      creative_id: stringField(row.creative_id),
      campaign_name: campaignRefId ? campaignNameById.get(campaignRefId) || null : null,
      ad_set_name: adSetRefId ? adSetNameById.get(adSetRefId) || null : null,
      campaign_umbrella: stringField(row.campaign_umbrella),
    });
  }
  return lookup;
}

async function normalizeMetaInboxRows(
  input: MetaInboxNormalizationInput,
  role: "worker" | "ingest" = "worker",
  options: { loadFullThreadHistory?: boolean } = {},
) {
  const batch = options.loadFullThreadHistory
    ? await buildMetaInboxNormalizationBatchWithThreadHistory(
        input,
        threadHistoryLoaderFor(role),
      )
    : buildMetaInboxNormalizationBatch(input);
  if (
    !batch.customerProfiles.length &&
    !batch.conversations.length &&
    !batch.firstTouchSources.length
  ) {
    return;
  }

  const profileRows = await upsertMetaInboxMany(
    "meta_inbox_customer_profiles",
    batch.customerProfiles.map((profile) => ({
      platform: profile.platform,
      page_id: profile.pageId,
      ig_user_id: profile.igUserId,
      participant_id: profile.participantId,
      profile_key: profile.profileKey,
      display_name: profile.displayName,
      username: profile.username,
      profile_picture_url: profile.profilePictureUrl,
      profile_url: profile.profileUrl,
      profile_reference: profile.profileReference,
      raw_profile_json: profile.rawProfileJson,
      last_profile_synced_at: new Date().toISOString(),
    })),
    "profile_key",
    role,
  );
  const profileIdByKey = new Map(
    profileRows.map((profile) => [String(profile.profile_key), String(profile.id)]),
  );
  const existingConversationWorkflowState = await selectMetaInboxConversationWorkflowState(
    batch.conversations.map((conversation) => conversation.canonicalConversationKey),
    role,
  );

  // Resolve campaign umbrellas from the analyst-synced `meta_ads` table
  // BEFORE upserting conversations so the persisted queue routing reflects
  // the real ad attribution. The first pass inside the batch builder runs
  // without ad context, so ad-driven threads start in the fallback bucket;
  // this enrichment + re-routing settles them into the right queue.
  const adLookup = await loadMetaAdsForFirstTouchSources(batch.firstTouchSources, role);
  const enrichedBatch = applyCampaignUmbrellaRouting(batch, adLookup);
  const enrichedFirstTouchSources = enrichedBatch.firstTouchSources;

  const conversationRows = await upsertMetaInboxMany(
    "meta_inbox_conversations",
    enrichedBatch.conversations.map((conversation) => {
      const initialWorkflow = {
        status: conversation.conversationStatus,
        queueCategory: conversation.queueCategoryKey,
        routingSource: conversation.routingSource,
        routingConfidence: conversation.routingConfidence,
        routingExplanation: conversation.routingExplanation,
      };
      const row = {
        canonical_conversation_key: conversation.canonicalConversationKey,
        source_channel: conversation.sourceChannel,
        source_type: conversation.sourceType,
        platform: conversation.platform,
        raw_thread_id: conversation.rawThreadId,
        raw_comment_id: conversation.rawCommentId,
        customer_profile_id: conversation.customerProfileKey
          ? profileIdByKey.get(conversation.customerProfileKey) || null
          : null,
        page_id: conversation.pageId,
        ig_user_id: conversation.igUserId,
        participant_id: conversation.participantId,
        platform_thread_id: conversation.platformThreadId,
        parent_content_id: conversation.parentContentId,
        source_id: conversation.sourceId,
        first_inbound_at: conversation.firstInboundAt,
        latest_inbound_at: conversation.latestInboundAt,
        latest_outbound_at: conversation.latestOutboundAt,
        last_activity_at: conversation.lastActivityAt,
        needs_reply: conversation.needsReply,
        reply_window_expires_at: conversation.replyWindowExpiresAt,
        human_agent_window_expires_at: conversation.humanAgentWindowExpiresAt,
        send_eligibility: conversation.sendEligibility,
        conversation_status: initialWorkflow.status,
        queue_category_key: initialWorkflow.queueCategory,
        routing_source: initialWorkflow.routingSource,
        routing_confidence: initialWorkflow.routingConfidence,
        routing_explanation: initialWorkflow.routingExplanation,
      };
      const existing = existingConversationWorkflowState.get(conversation.canonicalConversationKey);
      return existing ? preserveMetaInboxConversationWorkflowFields(row, existing) : row;
    }),
    "canonical_conversation_key",
    role,
  );
  const conversationIdByKey = new Map(
    conversationRows.map((conversation) => [
      String(conversation.canonical_conversation_key),
      String(conversation.id),
    ]),
  );

  await upsertMetaInboxMany(
    "meta_inbox_first_touch_sources",
    enrichedFirstTouchSources
      .map((source) => {
        const conversationId = conversationIdByKey.get(source.canonicalConversationKey);
        if (!conversationId) return null;
        return {
          conversation_id: conversationId,
          first_message_id: source.firstMessageId,
          first_message_at: source.firstMessageAt,
          referral_json: source.referralJson,
          ad_id: source.adId,
          ads_context_data_json: source.adsContextDataJson,
          ref: source.ref,
          source_post_id: source.sourcePostId,
          source_media_id: source.sourceMediaId,
          source_comment_id: source.sourceCommentId,
          source_product_id: source.sourceProductId,
          source_permalink: source.sourcePermalink,
          campaign_umbrella_id: source.campaignUmbrellaId,
          campaign_id: source.campaignId,
          adset_id: source.adsetId,
          creative_id: source.creativeId,
          attribution_method: source.attributionMethod,
          attribution_confidence: source.attributionConfidence,
          raw_payload_json: source.rawPayloadJson,
        };
      })
      .filter(Boolean) as JsonRecord[],
    "conversation_id",
    role,
    { ignoreDuplicates: true },
  );

  await upsertMetaInboxMany(
    "meta_inbox_conversation_events",
    conversationRows.map((conversation) => ({
      conversation_id: String(conversation.id),
      event_type: "conversation_created",
      dedupe_key: `conversation_created:${String(conversation.canonical_conversation_key)}`,
      event_at: String(conversation.created_at || new Date().toISOString()),
      new_value: {
        canonicalConversationKey: String(conversation.canonical_conversation_key),
        sourceChannel: String(conversation.source_channel),
        queueCategoryKey: String(conversation.queue_category_key),
      },
      metadata: {
        normalizedFromRawMeta: true,
      },
    })),
    "dedupe_key",
    role,
    { ignoreDuplicates: true },
  );
}

async function normalizeMetaInboxRowsWhenSchemaReady(
  input: MetaInboxNormalizationInput,
  role: "worker" | "ingest" = "worker",
  options: { loadFullThreadHistory?: boolean } = {},
) {
  try {
    await normalizeMetaInboxRows(input, role, options);
  } catch (error) {
    if (isMissingMetaInboxSchemaError(error)) return;
    throw error;
  }
}

async function enrichMessengerProfilesForThreads(
  threads: JsonRecord[],
  role: "worker" | "ingest" = "ingest",
): Promise<{ enriched: number; skipped: number }> {
  const stats = { enriched: 0, skipped: 0 };
  if (!threads.length) return stats;
  const supabase = dynamicSupabase(role);
  const pageTokenCache = new Map<string, string | null>();

  for (const thread of threads) {
    const platform = stringField(thread.platform);
    if (platform !== "facebook") continue;
    const pageId = stringField(thread.page_id);
    const participantId = stringField(thread.participant_id);
    if (!pageId || !participantId) continue;

    const profileKey = [platform, pageId, "", participantId].join(":");
    const profileLookup = await selectActiveMetaInboxRows(
      supabase,
      "meta_inbox_customer_profiles",
      "id,display_name,profile_picture_url",
    )
      .eq("profile_key", profileKey)
      .limit(1);
    if (profileLookup.error) {
      if (isMissingMetaInboxSchemaError(profileLookup.error)) return stats;
      throw normalizeMetaInboxSchemaError(profileLookup.error);
    }
    const profileRow = rowsFrom(profileLookup.data)[0];
    if (!profileRow) continue;
    if (
      !shouldEnrichProfile({
        display_name: stringField(profileRow.display_name),
        profile_picture_url: stringField(profileRow.profile_picture_url),
      })
    ) {
      stats.skipped += 1;
      continue;
    }

    if (!pageTokenCache.has(pageId)) {
      const page = await getManagedPage(pageId).catch(() => null);
      pageTokenCache.set(pageId, page?.accessToken || null);
    }
    const pageAccessToken = pageTokenCache.get(pageId);
    if (!pageAccessToken) {
      stats.skipped += 1;
      continue;
    }

    const fetched = await fetchMessengerProfile(participantId, pageAccessToken);
    if (!fetched) {
      stats.skipped += 1;
      continue;
    }

    const patch: JsonRecord = { last_profile_synced_at: new Date().toISOString() };
    if (!stringField(profileRow.display_name) && fetched.displayName) {
      patch.display_name = fetched.displayName;
    }
    if (!stringField(profileRow.profile_picture_url) && fetched.profilePictureUrl) {
      patch.profile_picture_url = fetched.profilePictureUrl;
    }
    if (Object.keys(patch).length === 1) {
      stats.skipped += 1;
      continue;
    }

    const update = await updateActiveMetaInboxRows(
      supabase,
      "meta_inbox_customer_profiles",
      patch,
    ).eq("id", String(profileRow.id));
    if (update.error) {
      if (isMissingMetaInboxSchemaError(update.error)) return stats;
      throw normalizeMetaInboxSchemaError(update.error);
    }
    stats.enriched += 1;
  }

  return stats;
}

function threadHistoryLoaderFor(role: "worker" | "ingest"): MetaInboxThreadHistoryLoader {
  return async (platform, threadId) => {
    const supabase = dynamicSupabase(role);
    const result = await selectActiveMetaInboxRows(supabase, "meta_social_messages")
      .eq("platform", platform)
      .eq("thread_id", threadId)
      .order("sent_at", { ascending: true, nullsFirst: true })
      .limit(500);
    if (result.error) {
      if (isMissingMetaInboxSchemaError(result.error)) return [];
      throw normalizeMetaInboxSchemaError(result.error);
    }
    return rowsFrom(result.data);
  };
}

async function selectMetaInboxConversationWorkflowState(
  canonicalKeys: string[],
  role: "worker" | "ingest",
) {
  const keys = uniqueStrings(canonicalKeys);
  const state = new Map<string, JsonRecord>();
  if (!keys.length) return state;

  const supabase = dynamicSupabase(role);
  for (const chunk of chunks(keys, 500)) {
    const { data, error } = await selectActiveMetaInboxRows(
      supabase,
      "meta_inbox_conversations",
      [
        "canonical_conversation_key",
        "conversation_status",
        "queue_category_key",
        "routing_source",
        "routing_confidence",
        "routing_explanation",
      ].join(","),
    )
      .in("canonical_conversation_key", chunk)
      .limit(chunk.length);
    if (error) throw error;

    for (const row of rowsFrom(data)) {
      const key = stringField(row.canonical_conversation_key);
      if (key) state.set(key, row);
    }
  }

  return state;
}

export function preserveMetaInboxConversationWorkflowFields(
  row: JsonRecord,
  existing: JsonRecord,
) {
  // Manual override always wins: a sales user explicitly moved this
  // conversation and the system must not overwrite their decision.
  const manualOverride = existing.routing_source === "manual_override";

  // Allow upgrading from a fallback routing (e.g. general_inquiry assigned
  // because no ad attribution was captured at the time) to an actual
  // campaign-umbrella routing once enrichment surfaces ad context on a
  // later inbound. Without this, existing conversations stay stuck in
  // general_inquiry forever even when a fresh message brings real
  // attribution.
  const upgradeFromFallback =
    !manualOverride &&
    existing.routing_source === "fallback" &&
    row.routing_source === "campaign_umbrella";

  return {
    ...row,
    conversation_status: preservedField(existing.conversation_status, row.conversation_status),
    queue_category_key: upgradeFromFallback
      ? row.queue_category_key
      : preservedField(existing.queue_category_key, row.queue_category_key),
    routing_source: upgradeFromFallback
      ? row.routing_source
      : preservedField(existing.routing_source, row.routing_source),
    routing_confidence: upgradeFromFallback
      ? row.routing_confidence
      : preservedField(existing.routing_confidence, row.routing_confidence),
    routing_explanation: upgradeFromFallback
      ? row.routing_explanation
      : preservedField(existing.routing_explanation, row.routing_explanation),
  };
}

function preservedField(existingValue: unknown, fallback: unknown) {
  return existingValue === undefined ? fallback : existingValue;
}

async function upsertMetaInboxMany(
  table: string,
  rows: JsonRecord[],
  onConflict: string,
  role: "worker" | "ingest",
  options: { ignoreDuplicates?: boolean } = {},
) {
  if (!rows.length) return [];
  const supabase = dynamicSupabase(role);
  const conflict = activeMetaInboxOnConflict(onConflict);
  const results: JsonRecord[] = [];

  for (const chunk of chunks(rows, 500)) {
    const { data, error } = await supabase
      .from(table)
      .upsert(
        withActiveMetaInboxEnvironmentRows(chunk),
        {
          onConflict: conflict,
          ignoreDuplicates: options.ignoreDuplicates,
        },
      )
      .select("*");

    if (error) throw error;
    results.push(...rowsFrom(data));
  }

  return results;
}

function dynamicSupabase(role: "web" | "worker" | "ingest") {
  return createAdsAnalystClient(role) as unknown as DynamicSupabaseClient;
}

function selectActiveMetaInboxRows(
  supabase: DynamicSupabaseClient,
  table: string,
  columns = "*",
) {
  return scopeActiveMetaInboxEnvironment(supabase.from(table).select(columns));
}

function updateActiveMetaInboxRows(
  supabase: DynamicSupabaseClient,
  table: string,
  row: JsonRecord,
) {
  return scopeActiveMetaInboxEnvironment(supabase.from(table).update(row));
}

function mapThread(row: JsonRecord): SocialInboxThread {
  return {
    id: String(row.id),
    platform: row.platform === "facebook" ? "facebook" : "instagram",
    thread_id: String(row.thread_id),
    page_id: stringField(row.page_id),
    ig_user_id: stringField(row.ig_user_id),
    participant_id: stringField(row.participant_id),
    participant_name: stringField(row.participant_name),
    snippet: stringField(row.snippet),
    message_count: numberField(row.message_count) || 0,
    unread_count: numberField(row.unread_count) || 0,
    last_message_at: stringField(row.last_message_at),
    last_synced_at: stringField(row.last_synced_at),
  };
}

function mapMessage(row: JsonRecord): SocialInboxMessage {
  return {
    id: String(row.id),
    platform: row.platform === "facebook" ? "facebook" : "instagram",
    thread_id: String(row.thread_id),
    message_id: String(row.message_id),
    direction:
      row.direction === "inbound" || row.direction === "outbound" ? row.direction : "unknown",
    sender_id: stringField(row.sender_id),
    sender_name: stringField(row.sender_name),
    recipient_id: stringField(row.recipient_id),
    recipient_name: stringField(row.recipient_name),
    body: stringField(row.body),
    attachments: messageAttachmentsFromRow(row),
    sent_at: stringField(row.sent_at),
  };
}

function mapComment(row: JsonRecord): SocialInboxComment {
  return {
    id: String(row.id),
    platform: row.platform === "facebook" ? "facebook" : "instagram",
    comment_id: String(row.comment_id),
    parent_comment_id: stringField(row.parent_comment_id),
    page_id: stringField(row.page_id),
    ig_user_id: stringField(row.ig_user_id),
    content_id: stringField(row.content_id),
    content_permalink: stringField(row.content_permalink),
    author_id: stringField(row.author_id),
    author_name: stringField(row.author_name),
    body: stringField(row.body),
    like_count: numberField(row.like_count) || 0,
    reply_count: numberField(row.reply_count) || 0,
    created_time: stringField(row.created_time),
    last_synced_at: stringField(row.last_synced_at),
  };
}

function messageAttachmentsFromRow(row: JsonRecord) {
  const attachments = normalizeMetaInboxAttachments(row.attachments);
  if (attachments.length) return attachments;

  const rawJson = recordField(row.raw_json);
  const rawMessage = recordField(rawJson.message);
  return normalizeMetaInboxAttachments(rawMessage.attachments || rawJson.attachments);
}

function mapCustomerProfile(row: JsonRecord): SocialInboxCustomerProfile {
  return {
    id: String(row.id),
    platform: row.platform === "facebook" ? "facebook" : "instagram",
    page_id: stringField(row.page_id),
    ig_user_id: stringField(row.ig_user_id),
    participant_id: String(row.participant_id || ""),
    display_name: stringField(row.display_name),
    username: stringField(row.username),
    profile_picture_url: stringField(row.profile_picture_url),
    profile_url: stringField(row.profile_url),
    profile_reference: stringField(row.profile_reference),
    last_profile_synced_at: stringField(row.last_profile_synced_at),
  };
}

function mapContactMethod(row: JsonRecord): SocialInboxCustomerContactMethod {
  const type = row.type === "email" ? "email" : "phone";
  return {
    id: String(row.id),
    customer_profile_id: String(row.customer_profile_id || ""),
    type,
    value_normalized: String(row.value_normalized || ""),
    value_display: String(row.value_display || ""),
    source: String(row.source || "sales_entered"),
    raw_input: stringField(row.raw_input),
    verified_for_matching_at: stringField(row.verified_for_matching_at),
    entered_by: stringField(row.entered_by),
    entered_at: stringField(row.entered_at),
    deleted_by: stringField(row.deleted_by),
    deleted_at: stringField(row.deleted_at),
  };
}

function mapContactMethodRecord(row: JsonRecord): MetaInboxContactMethodRecord {
  const mapped = mapContactMethod(row);
  return {
    id: mapped.id,
    customer_profile_id: mapped.customer_profile_id,
    type: mapped.type,
    value_normalized: mapped.value_normalized,
    value_display: mapped.value_display,
    source: mapped.source,
    raw_input: mapped.raw_input,
    entered_by: mapped.entered_by,
    entered_at: mapped.entered_at,
    deleted_at: mapped.deleted_at,
  };
}

function mapInboxConversation(row: JsonRecord): SocialInboxConversation {
  const sourceChannel = sourceChannelField(row.source_channel);
  const conversationStatus = conversationStatusField(row.conversation_status);
  const queueCategoryKey = queueCategoryField(row.queue_category_key);
  const inboxOutcome = outcomeField(row.inbox_outcome);
  return {
    id: String(row.id),
    canonical_conversation_key: String(row.canonical_conversation_key || ""),
    source_channel: sourceChannel,
    source_type:
      row.source_type === "public_comment" ||
      row.source_type === "private_reply" ||
      row.source_type === "ad_referral" ||
      row.source_type === "other"
        ? row.source_type
        : "message_thread",
    platform: row.platform === "facebook" ? "facebook" : "instagram",
    customer_profile_id: stringField(row.customer_profile_id),
    page_id: stringField(row.page_id),
    ig_user_id: stringField(row.ig_user_id),
    participant_id: stringField(row.participant_id),
    platform_thread_id: stringField(row.platform_thread_id),
    parent_content_id: stringField(row.parent_content_id),
    source_id: stringField(row.source_id),
    first_inbound_at: stringField(row.first_inbound_at),
    latest_inbound_at: stringField(row.latest_inbound_at),
    latest_outbound_at: stringField(row.latest_outbound_at),
    last_activity_at: stringField(row.last_activity_at),
    needs_reply: row.needs_reply === true,
    reply_window_expires_at: stringField(row.reply_window_expires_at),
    human_agent_window_expires_at: stringField(row.human_agent_window_expires_at),
    send_eligibility: sendEligibilityField(row.send_eligibility),
    conversation_status: conversationStatus,
    assigned_team_id: stringField(row.assigned_team_id),
    assigned_user_id: stringField(row.assigned_user_id),
    follow_up_at: stringField(row.follow_up_at),
    lead_quality: stringField(row.lead_quality),
    lead_quality_reason_tags: arrayField(row.lead_quality_reason_tags).map(String),
    inbox_outcome: inboxOutcome,
    inbox_lost_reason: lostReasonField(row.inbox_lost_reason),
    queue_category_key: queueCategoryKey,
    routing_source: stringField(row.routing_source),
    routing_confidence: numberField(row.routing_confidence),
    routing_explanation: stringField(row.routing_explanation),
  };
}

function mapFirstTouchSource(row: JsonRecord): SocialInboxFirstTouchSource {
  // Meta delivers `photo_url` (and sometimes `video_url`) inside
  // `ads_context_data` on click-to-Messenger referrals. Use that as
  // the primary source for the ad creative thumbnail; the
  // meta_creatives join (resolveCreativeImageUrls) backfills the rest.
  const adsContext = isRecord(row.ads_context_data_json) ? row.ads_context_data_json : {};
  const photoUrl =
    stringField(adsContext.photo_url) ||
    stringField(adsContext.video_url) ||
    null;
  return {
    id: String(row.id),
    conversation_id: String(row.conversation_id || ""),
    first_message_id: stringField(row.first_message_id),
    first_message_at: stringField(row.first_message_at),
    ad_id: stringField(row.ad_id),
    ref: stringField(row.ref),
    source_post_id: stringField(row.source_post_id),
    source_media_id: stringField(row.source_media_id),
    source_comment_id: stringField(row.source_comment_id),
    source_product_id: stringField(row.source_product_id),
    source_permalink: stringField(row.source_permalink),
    campaign_umbrella_id: stringField(row.campaign_umbrella_id),
    campaign_id: stringField(row.campaign_id),
    adset_id: stringField(row.adset_id),
    creative_id: stringField(row.creative_id),
    attribution_method: stringField(row.attribution_method),
    attribution_confidence: numberField(row.attribution_confidence),
    creative_image_url: photoUrl,
    ad_title: stringField(adsContext.ad_title),
  };
}

/**
 * Backfill `creative_image_url` from the `meta_creatives` table for any
 * first-touch rows that have a `creative_id` but no webhook-delivered
 * photo URL. Mutates and returns the array for chaining.
 */
async function resolveCreativeImageUrls(
  rows: SocialInboxFirstTouchSource[],
  supabase: ReturnType<typeof dynamicSupabase>,
): Promise<SocialInboxFirstTouchSource[]> {
  const missingCreativeIds = uniqueStrings(
    rows
      .filter((r) => !r.creative_image_url && r.creative_id)
      .map((r) => r.creative_id || ""),
  );
  if (!missingCreativeIds.length) return rows;
  const { data, error } = await supabase
    .from("meta_creatives")
    .select("creative_id,thumbnail_url,image_url,video_thumbnail_url")
    .in("creative_id", missingCreativeIds);
  if (error) {
    // Silent fallthrough — analyst schema may not be present in every
    // environment; missing creative previews are non-fatal.
    if (isMissingMetaInboxSchemaError(error)) return rows;
    return rows;
  }
  const urlByCreativeId = new Map<string, string>();
  for (const row of rowsFrom(data)) {
    const creativeId = stringField(row.creative_id);
    if (!creativeId) continue;
    const url =
      stringField(row.thumbnail_url) ||
      stringField(row.image_url) ||
      stringField(row.video_thumbnail_url);
    if (url) urlByCreativeId.set(creativeId, url);
  }
  if (!urlByCreativeId.size) return rows;
  for (const row of rows) {
    if (row.creative_image_url || !row.creative_id) continue;
    const url = urlByCreativeId.get(row.creative_id);
    if (url) row.creative_image_url = url;
  }
  return rows;
}

function mapSendAttachmentRow(row: JsonRecord): MetaInboxSendAttachmentRow {
  return {
    id: String(row.id || ""),
    conversation_id: stringField(row.conversation_id),
    attachment_type: attachmentTypeField(row.attachment_type),
    meta_attachment_id: stringField(row.meta_attachment_id),
    media_url: stringField(row.media_url),
    is_sendable: row.is_sendable === true,
    deleted_at: stringField(row.deleted_at),
  };
}

function mapUploadedAttachment(row: JsonRecord): SocialInboxUploadedAttachment {
  const attachmentType = attachmentTypeField(row.attachment_type);
  const name = stringField(row.name);
  return {
    id: String(row.id || ""),
    conversation_id: String(row.conversation_id || ""),
    attachment_type: attachmentType,
    label: name || uploadedAttachmentLabel(attachmentType),
    name,
    mime_type: stringField(row.mime_type),
    media_url: stringField(row.media_url),
    preview_url: stringField(row.preview_url),
    size_bytes: numberField(row.size_bytes),
    is_sendable: row.is_sendable === true,
    created_at: stringField(row.created_at),
  };
}

function mapSendAttempt(row: JsonRecord): SocialInboxSendAttempt {
  return {
    id: String(row.id),
    conversation_id: String(row.conversation_id || ""),
    reply_text: String(row.reply_text || ""),
    approved_by: stringField(row.approved_by),
    approved_at: stringField(row.approved_at),
    status: sendAttemptStatusField(row.status),
    messaging_type:
      row.messaging_type === "RESPONSE" || row.messaging_type === "MESSAGE_TAG"
        ? row.messaging_type
        : null,
    tag: row.tag === "HUMAN_AGENT" ? "HUMAN_AGENT" : null,
    attachment_ids: arrayField(row.attachment_ids).map(String),
    meta_send_id: stringField(row.meta_send_id),
    meta_error_message: stringField(row.meta_error_message),
    meta_error_code: numberField(row.meta_error_code),
    meta_error_subcode: numberField(row.meta_error_subcode),
    meta_trace_id: stringField(row.meta_trace_id),
    attempt_count: numberField(row.attempt_count) || 0,
    next_retry_at: stringField(row.next_retry_at),
    last_attempted_at: stringField(row.last_attempted_at),
    sent_at: stringField(row.sent_at),
    idempotency_key: String(row.idempotency_key || ""),
    created_at: stringField(row.created_at),
    updated_at: stringField(row.updated_at),
  };
}

function uploadedAttachmentLabel(type: MetaInboxAttachmentType) {
  if (type === "image") return "Image attachment";
  if (type === "video") return "Video attachment";
  if (type === "audio") return "Audio attachment";
  if (type === "file") return "File attachment";
  return "Attachment";
}

function mapSendAttemptRecord(row: JsonRecord): MetaInboxSendAttemptRecord {
  const mapped = mapSendAttempt(row);
  return {
    id: mapped.id,
    conversation_id: mapped.conversation_id,
    reply_text: mapped.reply_text,
    status: mapped.status,
    messaging_type: mapped.messaging_type,
    tag: mapped.tag,
    attempt_count: mapped.attempt_count,
    next_retry_at: mapped.next_retry_at,
    meta_error_message: mapped.meta_error_message,
  };
}

function mapCommentAction(row: JsonRecord): SocialInboxCommentAction {
  return {
    id: String(row.id),
    conversation_id: String(row.conversation_id || ""),
    comment_id: String(row.comment_id || ""),
    action_type: commentActionTypeField(row.action_type),
    message_text: stringField(row.message_text),
    reason_note: stringField(row.reason_note),
    requested_by: stringField(row.requested_by),
    requested_at: stringField(row.requested_at),
    status: commentActionStatusField(row.status),
    meta_action_id: stringField(row.meta_action_id),
    meta_error_message: stringField(row.meta_error_message),
    meta_error_code: numberField(row.meta_error_code),
    meta_error_subcode: numberField(row.meta_error_subcode),
    meta_trace_id: stringField(row.meta_trace_id),
    attempt_count: numberField(row.attempt_count) || 0,
    next_retry_at: stringField(row.next_retry_at),
    last_attempted_at: stringField(row.last_attempted_at),
    completed_at: stringField(row.completed_at),
    idempotency_key: String(row.idempotency_key || ""),
    created_at: stringField(row.created_at),
    updated_at: stringField(row.updated_at),
  };
}

function mapConversationEvent(row: JsonRecord): SocialInboxConversationEvent {
  return {
    id: String(row.id),
    conversation_id: String(row.conversation_id || ""),
    event_type: String(row.event_type || "unknown"),
    actor_user_id: stringField(row.actor_user_id),
    event_at: stringField(row.event_at),
    previous_value: isRecord(row.previous_value) ? row.previous_value : null,
    new_value: isRecord(row.new_value) ? row.new_value : null,
    metadata: recordField(row.metadata),
    created_at: stringField(row.created_at),
  };
}

function mapSavedReply(row: JsonRecord): SocialInboxSavedReply {
  return mapMetaInboxSavedReplyRow(row);
}

function mapConversationNote(row: JsonRecord): SocialInboxConversationNote {
  return mapMetaInboxConversationNoteRow(row);
}

function mapQaScorecard(row: JsonRecord): SocialInboxQaScorecard {
  return mapMetaInboxQaScorecardRow(row);
}

function mapCommentActionRecord(row: JsonRecord): MetaInboxCommentActionRecord {
  const mapped = mapCommentAction(row);
  return {
    id: mapped.id,
    conversation_id: mapped.conversation_id,
    comment_id: mapped.comment_id,
    action_type: mapped.action_type,
    message_text: mapped.message_text,
    reason_note: mapped.reason_note,
    status: mapped.status,
    attempt_count: mapped.attempt_count,
    next_retry_at: mapped.next_retry_at,
    meta_error_message: mapped.meta_error_message,
  };
}

function mapPresence(row: JsonRecord): SocialInboxPresence {
  return {
    id: String(row.id || ""),
    conversation_id: String(row.conversation_id || ""),
    app_user_id: String(row.app_user_id || ""),
    display_name: stringField(row.display_name),
    activity: presenceActivityField(row.activity),
    last_seen_at: String(row.last_seen_at || ""),
    expires_at: String(row.expires_at || ""),
  };
}

function mapPresenceRecord(row: JsonRecord): MetaInboxPresenceRecord {
  const mapped = mapPresence(row);
  return {
    id: mapped.id,
    conversation_id: mapped.conversation_id,
    app_user_id: mapped.app_user_id,
    display_name: mapped.display_name,
    activity: mapped.activity,
    last_seen_at: mapped.last_seen_at,
    expires_at: mapped.expires_at,
  };
}

function mapSyncRun(row: JsonRecord): SocialInboxSyncRun {
  return {
    id: String(row.id),
    trigger: String(row.trigger || "manual"),
    status:
      row.status === "success" || row.status === "failed" || row.status === "partial"
        ? row.status
        : "running",
    started_at: String(row.started_at),
    completed_at: stringField(row.completed_at),
    metrics: recordField(row.metrics),
    errors: arrayField(row.errors),
  };
}

function sourceChannelField(value: unknown): MetaInboxSourceChannelKey {
  switch (value) {
    case "facebook_message":
    case "instagram_message":
    case "facebook_public_comment":
    case "instagram_public_comment":
    case "private_reply_from_comment":
    case "ad_referral":
    case "other_unknown":
      return value;
    default:
      return "other_unknown";
  }
}

function presenceActivityField(value: unknown): MetaInboxPresenceActivity {
  switch (value) {
    case "typing":
    case "replying":
      return value;
    case "viewing":
    default:
      return "viewing";
  }
}

function normalizePresenceInputActivity(value: unknown): MetaInboxPresenceActivity {
  return presenceActivityField(value);
}

function conversationStatusField(value: unknown): MetaInboxConversationStatusKey {
  switch (value) {
    case "new_inquiry":
    case "needs_reply":
    case "waiting_on_customer":
    case "follow_up_needed":
    case "appointment_scheduled":
    case "closed":
    case "lost_lead":
      return value;
    default:
      return "new_inquiry";
  }
}

function queueCategoryField(value: unknown): MetaInboxQueueCategoryKey {
  switch (value) {
    case "cash_for_gold":
    case "book_appointment":
    case "us_product":
    case "vn_product":
    case "us_promotions":
    case "vn_promotions":
    case "custom_jewelry":
    case "repair_service":
    case "general_inquiry":
    case "uncategorized_needs_review":
      return value;
    default:
      return "uncategorized_needs_review";
  }
}

function outcomeField(value: unknown): MetaInboxOutcomeKey {
  switch (value) {
    case "booked":
    case "showed_up":
    case "no_show":
    case "browsed":
    case "sold":
    case "lost":
      return value;
    default:
      return "no_outcome_yet";
  }
}

function lostReasonField(value: unknown): MetaInboxLostReasonKey | null {
  switch (value) {
    case "no_response":
    case "price_concerns":
    case "bought_elsewhere":
    case "timeline_issue":
    case "budget_not_aligned":
    case "design_not_preferred":
    case "cancelled_by_client":
    case "duplicate_lead":
    case "lost_after_no_show":
    case "other":
      return value;
    default:
      return null;
  }
}

function sendEligibilityField(value: unknown): SocialInboxConversation["send_eligibility"] {
  switch (value) {
    case "standard_reply_allowed":
    case "human_agent_allowed":
    case "expired":
    case "unknown":
      return value;
    default:
      return "unknown";
  }
}

function sendAttemptStatusField(value: unknown): MetaInboxSendAttemptStatus {
  switch (value) {
    case "approved":
    case "queued":
    case "sending":
    case "sent":
    case "failed_retryable":
    case "failed_terminal":
    case "canceled":
      return value;
    default:
      return "approved";
  }
}

function commentActionTypeField(value: unknown): MetaInboxCommentActionType {
  switch (value) {
    case "public_reply":
    case "private_reply":
    case "like":
    case "hide":
    case "delete":
      return value;
    default:
      return "public_reply";
  }
}

function attachmentTypeField(value: unknown): MetaInboxAttachmentType {
  switch (value) {
    case "image":
    case "video":
    case "audio":
    case "file":
    case "sticker":
    case "product":
    case "share":
    case "unknown":
      return value;
    default:
      return "unknown";
  }
}

function commentActionStatusField(value: unknown): MetaInboxCommentActionStatus {
  switch (value) {
    case "approved":
    case "queued":
    case "sending":
    case "succeeded":
    case "failed_retryable":
    case "failed_terminal":
    case "canceled":
      return value;
    default:
      return "approved";
  }
}

function messageDirection(
  senderId: string | null,
  page: ManagedPage,
  platform: "facebook" | "instagram",
) {
  if (!senderId) return "unknown";
  if (platform === "facebook" && senderId === page.pageId) return "outbound";
  if (platform === "instagram" && senderId === page.igUserId) return "outbound";
  return "inbound";
}

function redactPageToken(page: JsonRecord) {
  const copy = { ...page };
  if ("access_token" in copy) copy.access_token = "[redacted]";
  return copy;
}

function firstRecord(value: unknown): JsonRecord {
  const data = recordField(value).data;
  const first = Array.isArray(data) ? data[0] : null;
  return isRecord(first) ? first : {};
}

function pickCustomerParticipant(
  participants: unknown,
  pageId: string,
): { id: string | null; name: string | null } {
  const participantList = arrayField(recordField(participants).data).filter(isRecord);
  for (const candidate of participantList) {
    const id = stringField(candidate.id);
    if (id && id !== pageId) {
      return { id, name: stringField(candidate.name) };
    }
  }
  return { id: null, name: null };
}

function recordField(value: unknown): JsonRecord {
  return isRecord(value) ? value : {};
}

function arrayField(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function stringField(value: unknown): string | null {
  if (typeof value === "string" && value.length) return value;
  if (typeof value === "number") return String(value);
  return null;
}

function numberField(value: unknown): number | null {
  if (typeof value === "number") return value;
  if (typeof value === "string" && value.length) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function uniqueStrings(values: Array<string | null>) {
  return Array.from(new Set(values.filter(Boolean) as string[]));
}

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function timestampToIso(value: unknown) {
  const timestamp = numberField(value);
  if (timestamp === null) return stringField(value);
  const millis = timestamp > 10_000_000_000 ? timestamp : timestamp * 1000;
  const date = new Date(millis);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function getPositiveIntegerEnv(name: string, fallback: number) {
  const value = Number(process.env[name]);
  return Number.isFinite(value) && value > 0 ? Math.floor(value) : fallback;
}

function chunks<T>(items: T[], size: number) {
  const output: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    output.push(items.slice(index, index + size));
  }
  return output;
}

function rows<T>(data: unknown): T[] {
  return Array.isArray(data) ? (data as T[]) : [];
}

function rowsFrom(data: JsonRecord[] | null) {
  return rows<JsonRecord>(data);
}

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function errorToMessage(error: unknown) {
  return safeErrorMessage(error);
}

function conversationSyncErrorMessage(platform: "facebook" | "instagram", error: unknown) {
  const message = errorToMessage(error);
  if (platform !== "facebook") return message;

  if (error instanceof MetaSocialGraphError && isRecord(error.details)) {
    const graphError = recordField(error.details.error);
    const code = numberField(graphError.code);
    if (code === 1 || code === 2) {
      return `Meta is not returning historical Facebook Messenger conversations for this Page via polling. Webhook capture is configured for new Facebook messages. Last Meta error: ${message}`;
    }
  }

  return message;
}
