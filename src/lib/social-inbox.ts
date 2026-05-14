import { ConfigurationError, getMetaApiVersion } from "./env";
import { getMetaPermissionHealth } from "./meta";
import { createServiceClient } from "./supabase";

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

type DynamicSelectOrder = {
  limit: (count: number) => Promise<DynamicQueryResult>;
};

type DynamicSelect = {
  order: (
    column: string,
    options?: { ascending?: boolean; nullsFirst?: boolean },
  ) => DynamicSelectOrder;
};

type DynamicTable = {
  insert: (row: JsonRecord) => {
    select: (columns: string) => {
      single: () => Promise<DynamicSingleResult>;
    };
  };
  update: (row: JsonRecord) => {
    eq: (column: string, value: string) => Promise<{ error: Error | null }>;
  };
  upsert: (
    rows: JsonRecord[],
    options: { onConflict: string },
  ) => {
    select: (columns: string) => Promise<DynamicQueryResult>;
  };
  select: (columns: string) => DynamicSelect;
};

type DynamicSupabaseClient = {
  from: (table: string) => DynamicTable;
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
  attachments: unknown[];
  sent_at: string | null;
};

export type SocialInboxComment = {
  id: string;
  platform: "facebook" | "instagram";
  comment_id: string;
  parent_comment_id: string | null;
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
  threads: SocialInboxThread[];
  messages: SocialInboxMessage[];
  comments: SocialInboxComment[];
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
};

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
  const supabase = dynamicSupabase();
  const runInsert = await supabase
    .from("meta_social_sync_runs")
    .insert({
      trigger,
      status: "running",
    })
    .select("id")
    .single();

  if (runInsert.error) throw runInsert.error;

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

    await supabase
      .from("meta_social_sync_runs")
      .update({ page_ids: pages.map((page) => page.pageId) })
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

    await supabase
      .from("meta_social_sync_runs")
      .update({
        status,
        completed_at: new Date().toISOString(),
        metrics,
        errors,
      })
      .eq("id", syncRunId);

    return { status, metrics, errors, syncRunId };
  } catch (error) {
    errors.push(errorToMessage(error));
    await supabase
      .from("meta_social_sync_runs")
      .update({
        status: "failed",
        completed_at: new Date().toISOString(),
        metrics,
        errors,
      })
      .eq("id", syncRunId);

    return { status: "failed", metrics, errors, syncRunId };
  }
}

export async function getSocialInboxData(): Promise<SocialInboxData> {
  const supabase = dynamicSupabase();
  const [threads, messages, comments, syncRuns] = await Promise.all([
    supabase
      .from("meta_social_threads")
      .select("*")
      .order("last_message_at", { ascending: false, nullsFirst: false })
      .limit(100),
    supabase
      .from("meta_social_messages")
      .select("*")
      .order("sent_at", { ascending: false, nullsFirst: false })
      .limit(300),
    supabase
      .from("meta_social_comments")
      .select("*")
      .order("created_time", { ascending: false, nullsFirst: false })
      .limit(150),
    supabase
      .from("meta_social_sync_runs")
      .select("*")
      .order("started_at", { ascending: false })
      .limit(5),
  ]);

  for (const result of [threads, messages, comments, syncRuns]) {
    if (result.error) throw result.error;
  }

  return {
    threads: rows<JsonRecord>(threads.data).map(mapThread),
    messages: rows<JsonRecord>(messages.data).map(mapMessage),
    comments: rows<JsonRecord>(comments.data).map(mapComment),
    syncRuns: rows<JsonRecord>(syncRuns.data).map(mapSyncRun),
  };
}

export async function ingestMetaWebhookPayload(payload: JsonRecord): Promise<MetaWebhookIngestResult> {
  const object = stringField(payload.object);
  const entries = arrayField(payload.entry).filter(isRecord);
  const result: MetaWebhookIngestResult = {
    messages: 0,
    comments: 0,
  };

  for (const entry of entries) {
    const messagingEvents = arrayField(entry.messaging).filter(isRecord);
    for (const event of messagingEvents) {
      const row = webhookMessageRow(object, entry, event);
      if (!row) continue;
      await upsertMany("meta_social_threads", [row.thread], "platform,thread_id");
      const messages = await upsertMany("meta_social_messages", [row.message], "platform,message_id");
      result.messages += messages.length;
    }

    const changeEvents = arrayField(entry.changes).filter(isRecord);
    for (const change of changeEvents) {
      const comment = webhookCommentRow(object, entry, change);
      if (!comment) continue;
      const comments = await upsertMany("meta_social_comments", [comment], "platform,comment_id");
      result.comments += comments.length;
    }
  }

  if (result.messages || result.comments) {
    const supabase = dynamicSupabase();
    const { error } = await supabase.from("meta_social_sync_runs").insert({
      trigger: "webhook",
      status: "success",
      completed_at: new Date().toISOString(),
      metrics: {
        pages: 0,
        threads: result.messages,
        messages: result.messages,
        comments: result.comments,
      },
      errors: [],
    }).select("id").single();
    if (error) throw error;
  }

  return result;
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
      errors: [`${input.platform} messages: ${errorToMessage(error)}`],
    };
  }
}

async function syncConversations({ page, platform, params = {} }: ConversationSyncInput) {
  const now = new Date().toISOString();
  const conversations = await graphPages<JsonRecord>(
    `${page.pageId}/conversations`,
    {
      ...params,
      fields: "id,updated_time,message_count,unread_count",
      limit: String(getPositiveIntegerEnv("META_SOCIAL_SYNC_CONVERSATION_LIMIT", 25)),
    },
    {
      accessToken: page.accessToken,
      maxPages: 1,
      timeoutMs: 25000,
    },
  );

  const threadRows = await upsertMany(
    "meta_social_threads",
    conversations
      .map((conversation) => {
        const threadId = stringField(conversation.id);
        if (!threadId) return null;
        return {
          platform,
          thread_id: threadId,
          page_id: page.pageId,
          ig_user_id: platform === "instagram" ? page.igUserId : null,
          thread_type: "message",
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
  const maxThreads = getPositiveIntegerEnv("META_SOCIAL_SYNC_MESSAGE_THREAD_LIMIT", 10);
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

function webhookMessageRow(object: string | null, entry: JsonRecord, event: JsonRecord) {
  const message = recordField(event.message);
  const messageId = stringField(message.mid) || stringField(message.id);
  if (!messageId) return null;

  const sender = recordField(event.sender);
  const recipient = recordField(event.recipient);
  const senderId = stringField(sender.id);
  const recipientId = stringField(recipient.id);
  const platform = object === "instagram" ? "instagram" : "facebook";
  const pageId = platform === "facebook" ? stringField(entry.id) || recipientId : null;
  const igUserId = platform === "instagram" ? stringField(entry.id) || recipientId : null;
  const businessId = platform === "instagram" ? igUserId : pageId;
  const isEcho = Boolean(message.is_echo);
  const participantId = isEcho ? recipientId : senderId;
  const threadId = `${platform}:webhook:${businessId || "unknown"}:${participantId || "unknown"}`;
  const sentAt = timestampToIso(event.timestamp) || new Date().toISOString();
  const body = stringField(message.text) || stringField(message.quick_reply);

  return {
    thread: {
      platform,
      thread_id: threadId,
      page_id: pageId,
      ig_user_id: igUserId,
      thread_type: "message",
      participant_id: participantId,
      participant_name: null,
      snippet: body,
      message_count: 1,
      unread_count: isEcho ? 0 : 1,
      last_message_at: sentAt,
      raw_json: event,
      last_synced_at: new Date().toISOString(),
    },
    message: {
      platform,
      thread_id: threadId,
      message_id: messageId,
      direction: isEcho ? "outbound" : "inbound",
      sender_id: senderId,
      sender_name: null,
      recipient_id: recipientId,
      recipient_name: null,
      body,
      attachments: arrayField(recordField(message.attachments).data),
      sent_at: sentAt,
      raw_json: event,
    },
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
          attachments: arrayField(recordField(message.attachments).data),
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

  const from = recordField(latest.from);
  await upsertMany(
    "meta_social_threads",
    [
      {
        platform,
        thread_id: threadId,
        participant_id: stringField(from.id),
        participant_name: stringField(from.name) || stringField(from.username),
        snippet: stringField(latest.message),
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

async function upsertMany(table: string, rows: JsonRecord[], onConflict: string) {
  if (!rows.length) return [];
  const supabase = dynamicSupabase();
  const results: JsonRecord[] = [];

  for (const chunk of chunks(rows, 500)) {
    const { data, error } = await supabase
      .from(table)
      .upsert(chunk, { onConflict })
      .select("*");

    if (error) throw error;
    results.push(...rowsFrom(data));
  }

  return results;
}

function dynamicSupabase() {
  return createServiceClient() as unknown as DynamicSupabaseClient;
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
    attachments: arrayField(row.attachments),
    sent_at: stringField(row.sent_at),
  };
}

function mapComment(row: JsonRecord): SocialInboxComment {
  return {
    id: String(row.id),
    platform: row.platform === "facebook" ? "facebook" : "instagram",
    comment_id: String(row.comment_id),
    parent_comment_id: stringField(row.parent_comment_id),
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
  if (error instanceof Error) return error.message;
  return String(error);
}
