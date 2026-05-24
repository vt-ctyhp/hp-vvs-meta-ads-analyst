"use client";

import {
  AlertTriangle,
  Camera,
  CheckCircle2,
  Clock,
  ExternalLink,
  Filter,
  Inbox,
  Link2,
  Loader2,
  Mail,
  MessageCircle,
  Pencil,
  Phone,
  Plus,
  RefreshCw,
  Search,
  Send,
  Settings2,
  ShieldCheck,
  Tags,
  Trash2,
  UserRound,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";

import { SYNC, translateError } from "@/lib/glossary";
import {
  META_INBOX_CONVERSATION_STATUSES,
  META_INBOX_CUSTOMER_CONTACT_METHODS,
  META_INBOX_LEAD_QUALITY_LABELS,
  META_INBOX_LEAD_QUALITY_REASON_TAGS,
  META_INBOX_LOST_REASONS,
  META_INBOX_OUTCOMES,
  META_INBOX_QUEUE_CATEGORIES,
  META_INBOX_SOURCE_CHANNELS,
  metaInboxVocabularyLabel,
  type MetaInboxQueueCategoryKey,
  type MetaInboxSourceChannelKey,
} from "@/lib/meta-inbox-vocabulary";
import { inferSocialBrand, type BrandLabel } from "@/lib/social-brand";
import { StatusSentence, type StatusHighlight } from "./status-sentence";
import type {
  SocialInboxComment,
  SocialInboxConversation,
  SocialInboxCustomerContactMethod,
  SocialInboxCustomerProfile,
  SocialInboxData,
  SocialInboxConversationHistory,
  SocialInboxFirstTouchSource,
  SocialInboxMessage,
  SocialInboxSendAttempt,
  MetaInboxContactMethodMutationInput,
  MetaInboxQueueSendAttemptInput,
  MetaInboxRetrySendAttemptInput,
  MetaInboxSendAttemptInput,
  MetaInboxWorkflowPatchInput,
} from "@/lib/social-inbox";
import { mergeSocialInboxConversationHistory } from "@/lib/meta-inbox-history";

type PermissionBlock = {
  ok: boolean;
  required: string[];
  missing: string[];
  optionalMissing?: string[];
  warnings?: string[];
};

type AccountStatus = {
  brandCode: string;
  accountId: string;
  ok: boolean;
  name?: string | null;
  accountStatus?: number | null;
  error?: string;
};

type MetaPermissionStatus = {
  granted: string[];
  forbiddenGranted: string[];
  adsSync: PermissionBlock;
  socialInbox: PermissionBlock;
  socialReply: PermissionBlock;
};

export type SocialInboxStatus = {
  ok: boolean;
  missingEnv: string[];
  permissions: MetaPermissionStatus | null;
  accounts: AccountStatus[];
  readiness: {
    adsSync: boolean;
    socialInbox: boolean;
    socialReply: boolean;
  };
  error: string | null;
};

type BrandFilter = "all" | "HP" | "VVS";
type SourceFilter = "all" | "facebook" | "instagram";
type SourceChannelFilter = "all" | MetaInboxSourceChannelKey;
type QueueCategoryFilter = "all" | MetaInboxQueueCategoryKey;
type QueueCategoryOption = (typeof META_INBOX_QUEUE_CATEGORIES)[number];
type ItemTypeFilter = "all" | "messages" | "comments";
type StatusFilter = "all" | "unread" | "needs-reply";

type QueueDisplayItem = {
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
};

type SyncResponse = {
  status?: string;
  metrics?: {
    pages?: number;
    threads?: number;
    messages?: number;
    comments?: number;
  };
  errors?: string[];
  error?: string;
};

type ConversationHistoryLoadState = {
  status: "idle" | "loading" | "ready" | "error";
  data: SocialInboxConversationHistory | null;
  error: string | null;
};

type WorkflowMutationLoadState = {
  conversationId: string | null;
  status: "idle" | "saving" | "saved" | "error";
  message: string | null;
};

type ContactMethodMutationLoadState = {
  conversationId: string | null;
  contactMethodId: string | null;
  status: "idle" | "saving" | "saved" | "error";
  message: string | null;
};

type ReplyAttemptMutationLoadState = {
  conversationId: string | null;
  sendAttemptId: string | null;
  status: "idle" | "saving" | "saved" | "error";
  message: string | null;
};

const IDLE_HISTORY_STATE: ConversationHistoryLoadState = {
  status: "idle",
  data: null,
  error: null,
};

const IDLE_WORKFLOW_STATE: WorkflowMutationLoadState = {
  conversationId: null,
  status: "idle",
  message: null,
};

const IDLE_CONTACT_METHOD_STATE: ContactMethodMutationLoadState = {
  conversationId: null,
  contactMethodId: null,
  status: "idle",
  message: null,
};

const IDLE_REPLY_ATTEMPT_STATE: ReplyAttemptMutationLoadState = {
  conversationId: null,
  sendAttemptId: null,
  status: "idle",
  message: null,
};

export function SocialInboxClient({
  status,
  initialData,
  dataError,
  canManageInboxState,
  canSendInboxReply,
}: {
  status: SocialInboxStatus;
  initialData: SocialInboxData;
  dataError: string | null;
  canManageInboxState: boolean;
  canSendInboxReply: boolean;
}) {
  const [brandFilter, setBrandFilter] = useState<BrandFilter>("all");
  const [sourceFilter, setSourceFilter] = useState<SourceFilter>("all");
  const [itemTypeFilter, setItemTypeFilter] = useState<ItemTypeFilter>("all");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [queueCategoryFilter, setQueueCategoryFilter] = useState<QueueCategoryFilter>("all");
  const [sourceChannelFilter, setSourceChannelFilter] = useState<SourceChannelFilter>("all");
  const [query, setQuery] = useState("");
  const [inboxData, setInboxData] = useState(initialData);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncStatus, setSyncStatus] = useState<string | null>(dataError);
  const [replyContextId, setReplyContextId] = useState<string | null>(null);
  const [replyInstruction, setReplyInstruction] = useState("");
  const [replyDraft, setReplyDraft] = useState("");
  const [historyByConversationId, setHistoryByConversationId] = useState<
    Record<string, ConversationHistoryLoadState>
  >({});
  const [workflowMutationState, setWorkflowMutationState] =
    useState<WorkflowMutationLoadState>(IDLE_WORKFLOW_STATE);
  const [contactMethodMutationState, setContactMethodMutationState] =
    useState<ContactMethodMutationLoadState>(IDLE_CONTACT_METHOD_STATE);
  const [replyAttemptMutationState, setReplyAttemptMutationState] =
    useState<ReplyAttemptMutationLoadState>(IDLE_REPLY_ATTEMPT_STATE);

  const queue = useMemo(() => buildQueue(inboxData), [inboxData]);
  const queueCategories = useMemo(() => visibleQueueCategories(inboxData), [inboxData]);
  const visibleQueueKeys = useMemo(
    () => new Set(queueCategories.map((category) => category.key)),
    [queueCategories],
  );
  const effectiveQueueCategoryFilter =
    queueCategoryFilter !== "all" && !visibleQueueKeys.has(queueCategoryFilter)
      ? "all"
      : queueCategoryFilter;
  const queueCounts = useMemo(
    () => queueCategoryCounts(queue, queueCategories),
    [queue, queueCategories],
  );

  const inboxHighlights = useMemo<StatusHighlight[]>(() => {
    if (queue.length === 0) {
      return [{ text: "Inbox is empty for the current connection" }];
    }
    const unread = queue.filter((item) => item.status === "Unread").length;
    const needsReply = queue.filter((item) => item.status === "Needs reply").length;
    const highlights: StatusHighlight[] = [];
    if (unread > 0) {
      highlights.push({ text: `${unread} unread`, tone: "warning" });
    }
    if (needsReply > 0) {
      highlights.push({ text: `${needsReply} needing reply`, tone: "warning" });
    }
    if (highlights.length === 0) {
      highlights.push({
        text: `${queue.length} threads, all caught up`,
        tone: "positive",
      });
    }
    return highlights;
  }, [queue]);
  const filteredQueue = useMemo(
    () =>
      queue.filter((item) => {
        if (brandFilter !== "all" && item.brand !== brandFilter) return false;
        if (sourceFilter !== "all" && item.platform !== sourceFilter) return false;
        if (sourceChannelFilter !== "all" && item.sourceChannel !== sourceChannelFilter) return false;
        if (
          effectiveQueueCategoryFilter !== "all" &&
          item.queueCategoryKey !== effectiveQueueCategoryFilter
        ) return false;
        if (itemTypeFilter === "messages" && item.type !== "message") return false;
        if (itemTypeFilter === "comments" && item.type !== "comment") return false;
        if (statusFilter === "unread" && item.status !== "Unread") return false;
        if (statusFilter === "needs-reply" && item.status !== "Needs reply") return false;

        const normalizedQuery = query.trim().toLowerCase();
        if (!normalizedQuery) return true;
        return [
          item.brand,
          item.channel,
          item.type,
          item.status,
          item.sender,
          item.preview,
          item.routingExplanation,
          metaInboxVocabularyLabel(META_INBOX_QUEUE_CATEGORIES, item.queueCategoryKey),
          metaInboxVocabularyLabel(META_INBOX_SOURCE_CHANNELS, item.sourceChannel),
        ]
          .join(" ")
          .toLowerCase()
          .includes(normalizedQuery);
      }),
    [
      brandFilter,
      itemTypeFilter,
      query,
      queue,
      effectiveQueueCategoryFilter,
      sourceChannelFilter,
      sourceFilter,
      statusFilter,
    ],
  );
  const selectedItem =
    filteredQueue.find((item) => item.id === selectedId) || filteredQueue[0] || null;
  const selectedConversationId = selectedItem?.inboxConversation?.id || null;
  const selectedHistoryState = selectedConversationId
    ? historyByConversationId[selectedConversationId] || IDLE_HISTORY_STATE
    : null;
  const selectedMessages = useMemo(
    () => {
      if (selectedHistoryState?.data) return selectedHistoryState.data.messages;
      return selectedItem?.type === "message"
        ? inboxData.messages
          .filter(
            (message) =>
              message.platform === selectedItem.platform &&
              message.thread_id === selectedItem.sourceId,
          )
          .sort((a, b) => String(a.sent_at || "").localeCompare(String(b.sent_at || "")))
        : [];
    },
    [inboxData.messages, selectedHistoryState?.data, selectedItem],
  );
  const selectedComments = useMemo(() => {
    if (selectedHistoryState?.data) return selectedHistoryState.data.comments;
    if (selectedItem?.type !== "comment") return [];
    const root = inboxData.comments.find((comment) => comment.comment_id === selectedItem.sourceId);
    return root ? [root] : [];
  }, [inboxData.comments, selectedHistoryState?.data, selectedItem]);
  const selectedContextId = selectedItem?.id || null;
  const isReplyContextActive = replyContextId === selectedContextId;
  const activeReplyDraft = isReplyContextActive ? replyDraft : "";
  const activeReplyInstruction = isReplyContextActive ? replyInstruction : "";
  const selectedHistoryNextCursor = selectedHistoryState?.data?.pageInfo.nextCursor || null;
  const selectedWorkflowMutationState =
    workflowMutationState.conversationId === selectedConversationId
      ? workflowMutationState
      : IDLE_WORKFLOW_STATE;
  const selectedContactMethodMutationState =
    contactMethodMutationState.conversationId === selectedConversationId
      ? contactMethodMutationState
      : IDLE_CONTACT_METHOD_STATE;
  const selectedReplyAttemptMutationState =
    replyAttemptMutationState.conversationId === selectedConversationId
      ? replyAttemptMutationState
      : IDLE_REPLY_ATTEMPT_STATE;

  const loadConversationHistory = useCallback(
    async (conversationId: string, cursor?: string | null) => {
      setHistoryByConversationId((current) => ({
        ...current,
        [conversationId]: {
          status: "loading",
          data: current[conversationId]?.data || null,
          error: null,
        },
      }));

      try {
        const url = new URL(
          `/api/social-inbox/conversations/${encodeURIComponent(conversationId)}/messages`,
          window.location.origin,
        );
        url.searchParams.set("limit", "50");
        if (cursor) url.searchParams.set("cursor", cursor);

        const response = await fetch(url, { cache: "no-store" });
        const payload = (await response.json()) as SocialInboxConversationHistory | { error: string };
        if (!response.ok || isHistoryErrorPayload(payload)) {
          throw new Error(isHistoryErrorPayload(payload) ? payload.error : "Could not load history.");
        }

        setHistoryByConversationId((current) => {
          const existing = current[conversationId]?.data || null;
          return {
            ...current,
            [conversationId]: {
              status: "ready",
              data: cursor && existing
                ? mergeSocialInboxConversationHistory(existing, payload)
                : payload,
              error: null,
            },
          };
        });
      } catch (error) {
        setHistoryByConversationId((current) => ({
          ...current,
          [conversationId]: {
            status: "error",
            data: current[conversationId]?.data || null,
            error: translateError(error),
          },
        }));
      }
    },
    [],
  );

  useEffect(() => {
    if (!selectedConversationId) return;
    const state = historyByConversationId[selectedConversationId];
    if (state && state.status !== "idle") return;

    void loadConversationHistory(selectedConversationId);
  }, [historyByConversationId, loadConversationHistory, selectedConversationId]);

  const handleWorkflowUpdate = useCallback(
    async (conversationId: string, input: MetaInboxWorkflowPatchInput) => {
      setWorkflowMutationState({
        conversationId,
        status: "saving",
        message: "Saving workflow changes...",
      });

      try {
        const response = await fetch(
          `/api/social-inbox/conversations/${encodeURIComponent(conversationId)}/workflow`,
          {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(input),
          },
        );
        const payload = (await response.json()) as
          | { conversation: SocialInboxConversation; events: unknown[] }
          | { error: string };
        if (!response.ok || isWorkflowErrorPayload(payload)) {
          throw new Error(isWorkflowErrorPayload(payload) ? payload.error : "Could not update workflow.");
        }

        setInboxData((current) => ({
          ...current,
          inboxConversations: current.inboxConversations.map((conversation) =>
            conversation.id === payload.conversation.id ? payload.conversation : conversation,
          ),
        }));
        setWorkflowMutationState({
          conversationId,
          status: "saved",
          message: `${payload.events.length} audit event${payload.events.length === 1 ? "" : "s"} recorded.`,
        });
      } catch (error) {
        setWorkflowMutationState({
          conversationId,
          status: "error",
          message: translateError(error),
        });
      }
    },
    [],
  );

  const handleContactMethodMutation = useCallback(
    async (
      conversationId: string,
      method: "POST" | "PATCH" | "DELETE",
      input: MetaInboxContactMethodMutationInput,
    ) => {
      setContactMethodMutationState({
        conversationId,
        contactMethodId: input.contactMethodId || null,
        status: "saving",
        message: "Saving contact method...",
      });

      try {
        const response = await fetch(
          `/api/social-inbox/conversations/${encodeURIComponent(conversationId)}/contact-methods`,
          {
            method,
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(input),
          },
        );
        const payload = (await response.json()) as
          | { contactMethod: SocialInboxCustomerContactMethod; events: unknown[] }
          | { error: string };
        if (!response.ok || isContactMethodErrorPayload(payload)) {
          throw new Error(
            isContactMethodErrorPayload(payload)
              ? payload.error
              : "Could not save contact method.",
          );
        }

        setInboxData((current) => {
          const withoutExisting = current.customerContactMethods.filter(
            (contactMethod) => contactMethod.id !== payload.contactMethod.id,
          );
          return {
            ...current,
            customerContactMethods: payload.contactMethod.deleted_at
              ? withoutExisting
              : [...withoutExisting, payload.contactMethod],
          };
        });
        setContactMethodMutationState({
          conversationId,
          contactMethodId: payload.contactMethod.id,
          status: "saved",
          message: `${payload.events.length} contact audit event${
            payload.events.length === 1 ? "" : "s"
          } recorded.`,
        });
      } catch (error) {
        setContactMethodMutationState({
          conversationId,
          contactMethodId: input.contactMethodId || null,
          status: "error",
          message: translateError(error),
        });
      }
    },
    [],
  );

  const handleSendAttemptCreate = useCallback(
    async (conversationId: string, input: MetaInboxSendAttemptInput) => {
      setReplyAttemptMutationState({
        conversationId,
        sendAttemptId: null,
        status: "saving",
        message: "Recording approved send attempt...",
      });

      try {
        const response = await fetch(
          `/api/social-inbox/conversations/${encodeURIComponent(conversationId)}/send-attempts`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(input),
          },
        );
        const payload = (await response.json()) as
          | { sendAttempt: SocialInboxSendAttempt; events: unknown[] }
          | { error: string };
        if (!response.ok || isSendAttemptErrorPayload(payload)) {
          throw new Error(
            isSendAttemptErrorPayload(payload)
              ? payload.error
              : "Could not record send attempt.",
          );
        }

        setInboxData((current) => upsertSendAttempt(current, payload.sendAttempt));
        setReplyAttemptMutationState({
          conversationId,
          sendAttemptId: payload.sendAttempt.id,
          status: "saved",
          message: `${payload.events.length} send audit event${
            payload.events.length === 1 ? "" : "s"
          } recorded. live Meta delivery remains disabled.`,
        });
        setReplyContextId(conversationId);
        setReplyDraft("");
      } catch (error) {
        setReplyAttemptMutationState({
          conversationId,
          sendAttemptId: null,
          status: "error",
          message: translateError(error),
        });
      }
    },
    [],
  );

  const handleSendAttemptRetry = useCallback(
    async (conversationId: string, input: MetaInboxRetrySendAttemptInput) => {
      setReplyAttemptMutationState({
        conversationId,
        sendAttemptId: input.sendAttemptId || null,
        status: "saving",
        message: "Queueing retry attempt...",
      });

      try {
        const response = await fetch(
          `/api/social-inbox/conversations/${encodeURIComponent(conversationId)}/send-attempts/retry`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(input),
          },
        );
        const payload = (await response.json()) as
          | { sendAttempt: SocialInboxSendAttempt; events: unknown[] }
          | { error: string };
        if (!response.ok || isSendAttemptErrorPayload(payload)) {
          throw new Error(
            isSendAttemptErrorPayload(payload) ? payload.error : "Could not queue retry.",
          );
        }

        setInboxData((current) => upsertSendAttempt(current, payload.sendAttempt));
        setReplyAttemptMutationState({
          conversationId,
          sendAttemptId: payload.sendAttempt.id,
          status: "saved",
          message: `${payload.events.length} retry audit event${
            payload.events.length === 1 ? "" : "s"
          } recorded. live Meta delivery remains disabled.`,
        });
      } catch (error) {
        setReplyAttemptMutationState({
          conversationId,
          sendAttemptId: input.sendAttemptId || null,
          status: "error",
          message: translateError(error),
        });
      }
    },
    [],
  );

  const handleSendAttemptQueue = useCallback(
    async (conversationId: string, input: MetaInboxQueueSendAttemptInput) => {
      setReplyAttemptMutationState({
        conversationId,
        sendAttemptId: input.sendAttemptId || null,
        status: "saving",
        message: "Queueing approved send attempt...",
      });

      try {
        const response = await fetch(
          `/api/social-inbox/conversations/${encodeURIComponent(conversationId)}/send-attempts/queue`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(input),
          },
        );
        const payload = (await response.json()) as
          | { sendAttempt: SocialInboxSendAttempt; events: unknown[] }
          | { error: string };
        if (!response.ok || isSendAttemptErrorPayload(payload)) {
          throw new Error(
            isSendAttemptErrorPayload(payload)
              ? payload.error
              : "Could not queue approved send attempt.",
          );
        }

        setInboxData((current) => upsertSendAttempt(current, payload.sendAttempt));
        setReplyAttemptMutationState({
          conversationId,
          sendAttemptId: payload.sendAttempt.id,
          status: "saved",
          message: `${payload.events.length} queue audit event${
            payload.events.length === 1 ? "" : "s"
          } recorded. Delivery worker will handle send processing when live delivery is enabled.`,
        });
      } catch (error) {
        setReplyAttemptMutationState({
          conversationId,
          sendAttemptId: input.sendAttemptId || null,
          status: "error",
          message: translateError(error),
        });
      }
    },
    [],
  );

  async function handleSync() {
    setIsSyncing(true);
    setSyncStatus("Syncing recent Meta inbox data...");

    try {
      const syncResponse = await fetch("/api/social-inbox/sync", { method: "POST" });
      const syncPayload = (await syncResponse.json()) as SyncResponse;
      if (!syncResponse.ok) {
        throw new Error(syncPayload.error || "Inbox sync failed.");
      }

      const dataResponse = await fetch("/api/social-inbox", { cache: "no-store" });
      const freshData = (await dataResponse.json()) as SocialInboxData | { error: string };
      if (!dataResponse.ok || isErrorPayload(freshData)) {
        throw new Error(isErrorPayload(freshData) ? freshData.error : "Could not refresh inbox data.");
      }

      setInboxData(freshData);
      const metrics = syncPayload.metrics || {};
      const errorNote = syncPayload.errors?.length
        ? ` ${syncPayload.errors.length} source warning(s); first: ${syncPayload.errors[0]}`
        : "";
      setSyncStatus(
        `Sync ${syncPayload.status || "complete"}: ${metrics.threads || 0} threads, ${
          metrics.messages || 0
        } messages, ${metrics.comments || 0} comments.${errorNote}`,
      );
    } catch (error) {
      setSyncStatus(translateError(error));
    } finally {
      setIsSyncing(false);
    }
  }

  return (
    <main className="min-h-screen bg-hp-foundation px-4 py-6 text-hp-body md:px-8">
      <header className="mx-auto flex max-w-7xl flex-col gap-5 border-b border-hp-rule pb-6 md:flex-row md:items-end md:justify-between">
        <div>
          <span className="text-[11px] uppercase tracking-[0.14em] text-hp-muted">
            HP/VVS Social Inbox
          </span>
          <h1 className="mt-2 font-title text-4xl leading-tight text-hp-ink md:text-5xl">
            Message & Comment Command Center
          </h1>
          <StatusSentence
            context={`${queue.length} ${queue.length === 1 ? "thread" : "threads"} synced`}
            highlights={inboxHighlights}
          />
        </div>
        <div className="flex flex-wrap items-center gap-2 text-[11px] uppercase tracking-[0.14em]">
          <a
            href="/convert/inbox/settings"
            className="inline-flex h-9 items-center gap-2 border border-hp-rule px-3 text-hp-ink transition hover:border-hp-pink hover:text-hp-pink"
          >
            <Settings2 size={14} />
            Settings
          </a>
          <StatusPill ready={status.readiness.socialInbox} label="Inbox Read" />
          <StatusPill ready={status.readiness.socialReply} label="Replies" />
        </div>
      </header>

      <InboxReadinessBanner status={status} />

      <section className="mx-auto mt-8 grid max-w-7xl min-w-0 gap-6 xl:grid-cols-[360px_minmax(0,1fr)]">
        <aside className="min-w-0 border border-hp-rule bg-hp-card">
          <div className="border-b border-hp-rule p-4">
            <div className="mb-4 flex items-center gap-2 text-hp-ink">
              <Inbox size={18} />
              <span className="text-[11px] uppercase tracking-[0.14em]">Unified Queue</span>
            </div>

            <QueueTabs
              value={effectiveQueueCategoryFilter}
              counts={queueCounts}
              categories={queueCategories}
              onChange={setQueueCategoryFilter}
            />

            <label className="flex items-center gap-2 border-b border-hp-rule px-1 py-2 focus-within:border-hp-pink">
              <Search size={15} className="text-hp-muted" />
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search sender or thread"
                className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-hp-muted"
              />
            </label>

            <div className="mt-4 grid gap-3">
              <FilterSelect
                label="Brand"
                value={brandFilter}
                onChange={(value) => setBrandFilter(value as BrandFilter)}
                options={[
                  ["all", "All Brands"],
                  ["HP", "HP"],
                  ["VVS", "VVS"],
                ]}
              />
              <FilterSelect
                label="Platform"
                value={sourceFilter}
                onChange={(value) => setSourceFilter(value as SourceFilter)}
                options={[
                  ["all", "Facebook + Instagram"],
                  ["facebook", "Facebook"],
                  ["instagram", "Instagram"],
                ]}
              />
              <FilterSelect
                label="Source Channel"
                value={sourceChannelFilter}
                onChange={(value) => setSourceChannelFilter(value as SourceChannelFilter)}
                options={[
                  ["all", "All Channels"],
                  ...META_INBOX_SOURCE_CHANNELS.map((channel) => [channel.key, channel.label] as [
                    string,
                    string,
                  ]),
                ]}
              />
              <div className="grid grid-cols-2 gap-3">
                <FilterSelect
                  label="Type"
                  value={itemTypeFilter}
                  onChange={(value) => setItemTypeFilter(value as ItemTypeFilter)}
                  options={[
                    ["all", "All Items"],
                    ["messages", "Messages"],
                    ["comments", "Comments"],
                  ]}
                />
                <FilterSelect
                  label="Status"
                  value={statusFilter}
                  onChange={(value) => setStatusFilter(value as StatusFilter)}
                  options={[
                    ["all", "All Status"],
                    ["unread", "Unread"],
                    ["needs-reply", "Needs Reply"],
                  ]}
                />
              </div>
              <div className="flex items-center justify-between border-t border-hp-rule pt-3 text-[10px] uppercase tracking-[0.14em] text-hp-muted">
                <span>{filteredQueue.length} shown</span>
                <button
                  onClick={() => {
                    setBrandFilter("all");
                    setSourceFilter("all");
                    setSourceChannelFilter("all");
                    setQueueCategoryFilter("all");
                    setItemTypeFilter("all");
                    setStatusFilter("all");
                    setQuery("");
                  }}
                  className="text-hp-ink underline-offset-4 hover:underline"
                >
                  Reset
                </button>
              </div>
            </div>
          </div>

          <div className="max-h-[720px] overflow-y-auto">
            {filteredQueue.length ? (
              filteredQueue.map((item) => (
                <QueueItem
                  key={item.id}
                  item={item}
                  active={selectedItem?.id === item.id}
                  onSelect={() => setSelectedId(item.id)}
                />
              ))
            ) : (
              <div className="p-8 text-center">
                <div className="mx-auto flex h-12 w-12 items-center justify-center border border-hp-rule text-hp-muted">
                  <Filter size={18} />
                </div>
                <h2 className="mt-4 font-title text-2xl text-hp-ink">No matching items</h2>
                <p className="mt-2 text-sm leading-6 text-hp-muted">
                  Adjust the source, brand, type, status, or search filters to widen the queue.
                  Use Sync Inbox if you need the latest Meta data.
                </p>
              </div>
            )}
          </div>
        </aside>

        <section className="min-w-0 border border-hp-rule bg-hp-card">
          <div className="border-b border-hp-rule p-5">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
              <div>
                <span className="text-[11px] uppercase tracking-[0.14em] text-hp-muted">
                  Conversation Detail
                </span>
                <h2 className="mt-2 font-title text-[34px] leading-tight text-hp-ink">
                  {selectedItem ? selectedItem.sender : "Select a thread"}
                </h2>
                {syncStatus ? (
                  <p className="mt-2 max-w-3xl text-sm leading-6 text-hp-muted">{syncStatus}</p>
                ) : null}
              </div>
              <button
                disabled={!status.readiness.socialInbox || isSyncing}
                onClick={handleSync}
                className="flex h-10 items-center justify-center gap-2 border border-hp-ink px-4 text-[11px] uppercase tracking-[0.14em] text-hp-ink transition-colors hover:bg-hp-ink hover:text-hp-foundation disabled:border-hp-rule disabled:text-hp-muted"
              >
                <RefreshCw size={14} className={isSyncing ? "animate-spin" : ""} />
                {isSyncing ? SYNC.inProgress : `${SYNC.action} Inbox`}
              </button>
            </div>
          </div>

          <div className="grid min-h-[640px] gap-0 lg:grid-cols-[minmax(0,1fr)_340px]">
            <div className="flex min-w-0 flex-col border-b border-hp-rule lg:border-b-0 lg:border-r">
              <div className="flex-1 p-6">
                {selectedItem ? (
                  <SelectedItemDetail
                    item={selectedItem}
                    messages={selectedMessages}
                    comments={selectedComments}
                    historyState={selectedHistoryState}
                    onLoadOlderHistory={
                      selectedConversationId && selectedHistoryNextCursor
                        ? () => loadConversationHistory(selectedConversationId, selectedHistoryNextCursor)
                        : null
                    }
                  />
                ) : (
                  <EmptyThreadState />
                )}
              </div>

              <div className="border-t border-hp-rule p-4">
                <ReplyAttemptPanel
                  item={selectedItem}
                  draft={activeReplyDraft}
                  onDraftChange={(value) => {
                    setReplyContextId(selectedContextId);
                    setReplyDraft(value);
                  }}
                  canSendInboxReply={canSendInboxReply}
                  mutationState={selectedReplyAttemptMutationState}
                  onCreateSendAttempt={handleSendAttemptCreate}
                  onQueueSendAttempt={handleSendAttemptQueue}
                  onRetrySendAttempt={handleSendAttemptRetry}
                />
              </div>
            </div>

            <aside className="min-w-0 p-5">
              <ConversationSourcePanel
                item={selectedItem}
                canManageInboxState={canManageInboxState}
                mutationState={selectedContactMethodMutationState}
                onContactMethodMutation={handleContactMethodMutation}
              />
              <WorkflowStatePanel
                key={selectedConversationId || "empty-workflow"}
                item={selectedItem}
                canManageInboxState={canManageInboxState}
                mutationState={selectedWorkflowMutationState}
                onWorkflowUpdate={handleWorkflowUpdate}
                instruction={activeReplyInstruction}
                onInstructionChange={(value) => {
                  setReplyContextId(selectedContextId);
                  setReplyInstruction(value);
                }}
              />

              <SyncRunPanel data={inboxData} />

              <div className="mt-5 border border-hp-rule p-4">
                <div className="mb-3 flex items-center gap-2 text-hp-ink">
                  <ShieldCheck size={17} />
                  <span className="text-[11px] uppercase tracking-[0.14em]">Safety Rules</span>
                </div>
                <ul className="space-y-2 text-sm leading-6 text-hp-muted">
                  <li>Human click required for every reply.</li>
                  <li>Raw Meta payload stays hidden from product UI.</li>
                  <li>Queue routing is visible and auditable before reply.</li>
                  <li>Campaign/ad mutation remains disabled.</li>
                  <li>
                    {status.readiness.socialReply ? (
                      "Facebook comment replies are permission-ready; send APIs must still enforce human approval."
                    ) : (
                      <>
                        Facebook comment replies remain limited until{" "}
                        <span className="text-hp-ink">pages_manage_engagement</span> is granted.
                      </>
                    )}
                  </li>
                </ul>
              </div>
            </aside>
          </div>
        </section>
      </section>
    </main>
  );
}

function buildQueue(data: SocialInboxData): QueueDisplayItem[] {
  const profileById = new Map(data.customerProfiles.map((profile) => [profile.id, profile]));
  const contactMethodsByProfileId = new Map<string, SocialInboxCustomerContactMethod[]>();
  for (const contactMethod of data.customerContactMethods || []) {
    if (contactMethod.deleted_at) continue;
    const existing = contactMethodsByProfileId.get(contactMethod.customer_profile_id) || [];
    existing.push(contactMethod);
    contactMethodsByProfileId.set(contactMethod.customer_profile_id, existing);
  }
  const firstTouchByConversationId = new Map(
    data.firstTouchSources.map((source) => [source.conversation_id, source]),
  );
  const sendAttemptsByConversationId = new Map<string, SocialInboxSendAttempt[]>();
  for (const sendAttempt of data.sendAttempts || []) {
    const existing = sendAttemptsByConversationId.get(sendAttempt.conversation_id) || [];
    existing.push(sendAttempt);
    sendAttemptsByConversationId.set(sendAttempt.conversation_id, existing);
  }
  const conversationByThread = new Map(
    data.inboxConversations
      .filter((conversation) => conversation.platform_thread_id)
      .map((conversation) => [
        `${conversation.platform}:${conversation.platform_thread_id}`,
        conversation,
      ]),
  );
  const conversationByComment = new Map(
    data.inboxConversations
      .filter((conversation) => conversation.source_id)
      .map((conversation) => [
        `${conversation.platform}:${conversation.source_id}`,
        conversation,
      ]),
  );

  const threadItems = data.threads.map((thread) => {
    const channel: "Instagram" | "Facebook" =
      thread.platform === "instagram" ? "Instagram" : "Facebook";
    const conversation = conversationByThread.get(`${thread.platform}:${thread.thread_id}`) || null;
    const profile = conversation?.customer_profile_id
      ? profileById.get(conversation.customer_profile_id) || null
      : null;
    const firstTouch = conversation ? firstTouchByConversationId.get(conversation.id) || null : null;
    const sendAttempts = conversation ? sendAttemptsByConversationId.get(conversation.id) || [] : [];
    return {
      id: `thread:${thread.platform}:${thread.thread_id}`,
      sourceId: thread.thread_id,
      channel,
      platform: thread.platform,
      brand: inferSocialBrand(thread.page_id, thread.ig_user_id),
      type: "message" as const,
      sender: profile?.display_name || thread.participant_name || `${channel} Conversation`,
      preview: thread.snippet || `${thread.message_count} synced message(s)`,
      status: conversation?.needs_reply
        ? "Needs reply" as const
        : thread.unread_count > 0
          ? "Unread" as const
          : "Synced" as const,
      time: formatDateLabel(conversation?.last_activity_at || thread.last_message_at || thread.last_synced_at),
      timestamp: conversation?.last_activity_at || thread.last_message_at || thread.last_synced_at,
      sourceChannel: conversation?.source_channel || fallbackSourceChannel(thread.platform, "message"),
      queueCategoryKey: conversation?.queue_category_key || "uncategorized_needs_review",
      conversationStatus: conversation?.conversation_status || "new_inquiry",
      sendEligibility: conversation?.send_eligibility || "unknown",
      replyWindowExpiresAt: conversation?.reply_window_expires_at || null,
      humanAgentWindowExpiresAt: conversation?.human_agent_window_expires_at || null,
      routingExplanation: conversation?.routing_explanation || null,
      routingConfidence: conversation?.routing_confidence ?? null,
      inboxConversation: conversation,
      profile,
      contactMethods: profile ? contactMethodsByProfileId.get(profile.id) || [] : [],
      firstTouch,
      sendAttempts,
    };
  });

  const commentItems = data.comments.map((comment) => {
    const channel: "Instagram" | "Facebook" =
      comment.platform === "instagram" ? "Instagram" : "Facebook";
    const conversation = conversationByComment.get(`${comment.platform}:${comment.comment_id}`) || null;
    const profile = conversation?.customer_profile_id
      ? profileById.get(conversation.customer_profile_id) || null
      : null;
    const firstTouch = conversation ? firstTouchByConversationId.get(conversation.id) || null : null;
    const sendAttempts = conversation ? sendAttemptsByConversationId.get(conversation.id) || [] : [];
    return {
      id: `comment:${comment.platform}:${comment.comment_id}`,
      sourceId: comment.comment_id,
      channel,
      platform: comment.platform,
      brand: inferSocialBrand(comment.page_id, comment.ig_user_id),
      type: "comment" as const,
      sender: profile?.display_name || comment.author_name || `${channel} Comment`,
      preview: comment.body || "Comment text unavailable",
      status: "Needs reply" as const,
      time: formatDateLabel(conversation?.last_activity_at || comment.created_time || comment.last_synced_at),
      timestamp: conversation?.last_activity_at || comment.created_time || comment.last_synced_at,
      sourceChannel: conversation?.source_channel || fallbackSourceChannel(comment.platform, "comment"),
      queueCategoryKey: conversation?.queue_category_key || "uncategorized_needs_review",
      conversationStatus: conversation?.conversation_status || "new_inquiry",
      sendEligibility: conversation?.send_eligibility || "unknown",
      replyWindowExpiresAt: conversation?.reply_window_expires_at || null,
      humanAgentWindowExpiresAt: conversation?.human_agent_window_expires_at || null,
      routingExplanation: conversation?.routing_explanation || null,
      routingConfidence: conversation?.routing_confidence ?? null,
      inboxConversation: conversation,
      profile,
      contactMethods: profile ? contactMethodsByProfileId.get(profile.id) || [] : [],
      firstTouch,
      sendAttempts,
    };
  });

  return [...threadItems, ...commentItems].sort((a, b) =>
    String(b.timestamp || "").localeCompare(String(a.timestamp || "")),
  );
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

function visibleQueueCategories(data: SocialInboxData): readonly QueueCategoryOption[] {
  if (data.queueAccess.mode !== "team") return META_INBOX_QUEUE_CATEGORIES;

  const allowed = new Set(data.queueAccess.allowedQueueCategoryKeys);
  return META_INBOX_QUEUE_CATEGORIES.filter((category) => allowed.has(category.key));
}

function queueCategoryCounts(
  queue: QueueDisplayItem[],
  categories: readonly QueueCategoryOption[],
) {
  const counts = new Map<QueueCategoryFilter, number>([["all", queue.length]]);
  for (const category of categories) {
    counts.set(category.key, 0);
  }
  for (const item of queue) {
    counts.set(item.queueCategoryKey, (counts.get(item.queueCategoryKey) || 0) + 1);
  }
  return counts;
}

function SelectedItemDetail({
  item,
  messages,
  comments,
  historyState,
  onLoadOlderHistory,
}: {
  item: QueueDisplayItem;
  messages: SocialInboxMessage[];
  comments: SocialInboxComment[];
  historyState: ConversationHistoryLoadState | null;
  onLoadOlderHistory: (() => void) | null;
}) {
  if (item.type === "comment") {
    const rootComment =
      comments.find((comment) => comment.comment_id === item.sourceId) ||
      comments.find((comment) => !comment.parent_comment_id) ||
      null;
    const replyComments = comments.filter((comment) => comment.id !== rootComment?.id);

    return (
      <div className="max-h-[560px] min-h-[420px] overflow-y-auto border border-hp-rule p-5">
        <HistoryStatusStrip
          historyState={historyState}
          onLoadOlderHistory={onLoadOlderHistory}
        />
        <div className="mb-4 flex items-center gap-2 text-[11px] uppercase tracking-[0.14em] text-hp-muted">
          <Camera size={15} />
          {item.brand} · {item.channel} Comment
        </div>
        <p className="whitespace-pre-wrap break-words text-lg leading-8 text-hp-ink">
          {rootComment?.body || item.preview}
        </p>
        <div className="mt-5 grid gap-3 border-t border-hp-rule pt-4 text-sm text-hp-muted sm:grid-cols-2">
          <div>Author: {rootComment?.author_name || item.sender}</div>
          <div>Created: {formatDateLabel(rootComment?.created_time || item.timestamp)}</div>
          <div>Likes: {rootComment?.like_count || 0}</div>
          <div>Replies: {Math.max(rootComment?.reply_count || 0, replyComments.length)}</div>
        </div>
        {rootComment?.content_permalink ? (
          <a
            href={rootComment.content_permalink}
            target="_blank"
            rel="noreferrer"
            className="mt-5 inline-flex border border-hp-rule px-4 py-2 text-[11px] uppercase tracking-[0.14em] text-hp-ink hover:bg-hp-inset"
          >
            Open on Meta
          </a>
        ) : null}
        {replyComments.length ? (
          <div className="mt-6 space-y-3 border-t border-hp-rule pt-4">
            <div className="text-[10px] uppercase tracking-[0.14em] text-hp-muted">
              Comment Replies
            </div>
            {replyComments.map((reply) => (
              <div key={reply.id} className="border border-hp-rule bg-hp-inset p-3">
                <div className="mb-2 text-[10px] uppercase tracking-[0.14em] text-hp-muted">
                  {reply.author_name || "Unknown"} · {formatDateLabel(reply.created_time)}
                </div>
                <p className="whitespace-pre-wrap break-words text-sm leading-6 text-hp-body">
                  {reply.body || "Reply text unavailable"}
                </p>
              </div>
            ))}
          </div>
        ) : null}
      </div>
    );
  }

  return (
    <div className="max-h-[560px] min-h-[420px] overflow-y-auto border border-dashed border-hp-rule p-5">
      <HistoryStatusStrip
        historyState={historyState}
        onLoadOlderHistory={onLoadOlderHistory}
      />
      {messages.length ? (
        <div className="space-y-4">
          {messages.map((message) => (
            <div
              key={message.id}
              className={`max-w-[82%] border p-4 ${
                message.direction === "outbound"
                  ? "ml-auto border-hp-ink bg-hp-ink text-hp-foundation"
                  : "border-hp-rule bg-hp-inset text-hp-body"
              }`}
            >
              <div className="mb-2 text-[10px] uppercase tracking-[0.14em] opacity-70">
                {message.sender_name || message.direction} · {formatDateLabel(message.sent_at)}
              </div>
              <p className="whitespace-pre-wrap break-words text-sm leading-6">
                {message.body || "Attachment or unsupported message"}
              </p>
            </div>
          ))}
        </div>
      ) : (
        <div className="flex min-h-[360px] items-center justify-center text-center">
          <div>
            <div className="mx-auto flex h-14 w-14 items-center justify-center border border-hp-rule text-hp-muted">
              <MessageCircle size={20} />
            </div>
            <h3 className="mt-5 font-title text-3xl text-hp-ink">
              {historyState?.status === "loading" ? "Loading known history" : "Thread detected"}
            </h3>
            <p className="mx-auto mt-3 max-w-lg text-sm leading-6 text-hp-muted">
              {historyState?.status === "error"
                ? "Known history could not load. Current conversation source and reply tools stay visible."
                : "Meta returned this conversation thread. If message bodies are blank after sync, webhook delivery receives new messages as they arrive."}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

function HistoryStatusStrip({
  historyState,
  onLoadOlderHistory,
}: {
  historyState: ConversationHistoryLoadState | null;
  onLoadOlderHistory: (() => void) | null;
}) {
  if (!historyState || historyState.status === "idle") return null;

  const pageInfo = historyState.data?.pageInfo || null;
  const canLoadOlder = Boolean(pageInfo?.nextCursor && onLoadOlderHistory);
  const isLoading = historyState.status === "loading";
  const label =
    historyState.status === "error"
      ? historyState.error || "Could not load conversation history."
      : isLoading
        ? "Loading selected conversation history..."
        : pageInfo
          ? `${pageInfo.returned} of ${pageInfo.knownTotal} known item(s) loaded · ${historyCompletenessLabel(pageInfo.historyCompleteness)}`
          : "Conversation history ready.";

  return (
    <div className="mb-4 flex flex-col gap-3 border border-hp-rule bg-hp-inset p-3 text-xs leading-5 text-hp-muted sm:flex-row sm:items-center sm:justify-between">
      <div className="flex min-w-0 items-center gap-2">
        {isLoading ? (
          <Loader2 size={14} className="shrink-0 animate-spin text-hp-ink" />
        ) : (
          <Clock size={14} className="shrink-0 text-hp-ink" />
        )}
        <span className="min-w-0 break-words">{label}</span>
      </div>
      {canLoadOlder ? (
        <button
          type="button"
          onClick={onLoadOlderHistory || undefined}
          disabled={isLoading}
          className="shrink-0 border border-hp-rule px-3 py-1.5 text-[10px] uppercase tracking-[0.14em] text-hp-ink transition hover:border-hp-ink disabled:opacity-50"
        >
          Load Older History
        </button>
      ) : null}
    </div>
  );
}

function historyCompletenessLabel(
  value: SocialInboxConversationHistory["pageInfo"]["historyCompleteness"],
) {
  if (value === "complete_known_history") return "Known history complete";
  if (value === "partial_known_history") return "Older known history available";
  if (value === "source_missing") return "Source identity missing";
  return "No known message history";
}

function ReplyAttemptPanel({
  item,
  draft,
  onDraftChange,
  canSendInboxReply,
  mutationState,
  onCreateSendAttempt,
  onQueueSendAttempt,
  onRetrySendAttempt,
}: {
  item: QueueDisplayItem | null;
  draft: string;
  onDraftChange: (value: string) => void;
  canSendInboxReply: boolean;
  mutationState: ReplyAttemptMutationLoadState;
  onCreateSendAttempt: (conversationId: string, input: MetaInboxSendAttemptInput) => void;
  onQueueSendAttempt: (conversationId: string, input: MetaInboxQueueSendAttemptInput) => void;
  onRetrySendAttempt: (conversationId: string, input: MetaInboxRetrySendAttemptInput) => void;
}) {
  const conversationId = item?.inboxConversation?.id || null;
  const windowState = item ? replyWindowState(item) : null;
  const failedAttempts = (item?.sendAttempts || [])
    .filter((attempt) => attempt.status === "failed_retryable" || attempt.status === "failed_terminal")
    .sort((a, b) => String(b.updated_at || b.created_at || "").localeCompare(String(a.updated_at || a.created_at || "")));
  const recentAttempts = (item?.sendAttempts || [])
    .filter((attempt) => attempt.status !== "failed_retryable" && attempt.status !== "failed_terminal")
    .slice()
    .sort((a, b) => String(b.created_at || "").localeCompare(String(a.created_at || "")))
    .slice(0, 2);
  const canRecord =
    Boolean(conversationId) &&
    canSendInboxReply &&
    Boolean(windowState?.canAttemptSend) &&
    Boolean(draft.trim()) &&
    mutationState.status !== "saving";
  const statusTone =
    mutationState.status === "error"
      ? "text-signal-danger"
      : mutationState.status === "saved"
        ? "text-signal-positive"
        : "text-hp-muted";
  const statusMessage = mutationState.message || "Live Meta delivery disabled.";
  const buttonLabel = !item
    ? "Select conversation first"
    : mutationState.status === "saving"
      ? "Recording..."
      : "Record send attempt";

  function recordSendAttempt() {
    if (!conversationId) return;
    onCreateSendAttempt(conversationId, {
      replyText: draft,
      idempotencyKey: newSendAttemptIdempotencyKey(conversationId),
    });
  }

  return (
    <div className="grid gap-3">
      <div className="border border-hp-rule bg-hp-inset p-3 text-xs leading-5 text-hp-muted">
        <div>
          <p className="text-[10px] uppercase tracking-[0.14em] text-hp-muted">Reply Window</p>
          <p className="mt-1 text-sm font-medium text-hp-ink">
            {windowState?.label || "No conversation selected"}
          </p>
          <p className="mt-1">
            {windowState?.detail || "Select a conversation before recording a send attempt."}
          </p>
        </div>
        <p className={`mt-3 border-t border-hp-rule pt-3 ${statusTone}`}>{statusMessage}</p>
      </div>

      <textarea
        value={draft}
        onChange={(event) => onDraftChange(event.target.value)}
        disabled={!item}
        rows={4}
        placeholder={
          item
            ? "Write a human-approved reply draft. This records approval only."
            : "Select a message or comment to draft a reply."
        }
        className="w-full resize-none border border-hp-rule bg-hp-inset p-3 text-sm leading-6 outline-none placeholder:text-hp-muted focus:border-hp-ink disabled:opacity-70"
      />
      <div className="grid gap-3">
        <p className="min-w-0 text-xs leading-5 text-hp-muted">
          Record Send Attempt stores human approval, reply-window choice, and audit data;
          live Meta delivery remains disabled until the delivery worker is enabled.
        </p>
        <button
          type="button"
          onClick={recordSendAttempt}
          disabled={!canRecord}
          className="flex h-10 w-full shrink-0 items-center justify-center gap-2 whitespace-nowrap bg-hp-ink px-4 text-sm font-medium text-hp-foundation transition hover:opacity-90 disabled:opacity-50"
        >
          {mutationState.status === "saving" ? (
            <Loader2 size={14} className="animate-spin" />
          ) : (
            <Send size={14} />
          )}
          {buttonLabel}
        </button>
      </div>

      <div className="border border-hp-rule bg-hp-card p-3">
        <div className="mb-3 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-hp-ink">
            <AlertTriangle size={15} />
            <span className="text-[10px] uppercase tracking-[0.14em]">Failed Send Inbox</span>
          </div>
          <span className="text-[10px] uppercase tracking-[0.14em] text-hp-muted">
            {failedAttempts.length} failed
          </span>
        </div>
        {failedAttempts.length ? (
          <div className="space-y-2">
            {failedAttempts.map((attempt) => {
              const canRetry =
                Boolean(conversationId) &&
                canSendInboxReply &&
                attempt.status === "failed_retryable" &&
                Boolean(windowState?.canAttemptSend) &&
                mutationState.status !== "saving";
              return (
                <div key={attempt.id} className="border border-hp-rule bg-hp-inset p-3">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div className="min-w-0">
                      <p className="break-words text-sm leading-6 text-hp-ink">
                        {attempt.meta_error_message || attempt.status.replaceAll("_", " ")}
                      </p>
                      <p className="mt-1 text-xs leading-5 text-hp-muted">
                        Attempts {attempt.attempt_count} · last{" "}
                        {formatDateLabel(attempt.last_attempted_at || attempt.updated_at)}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() =>
                        conversationId &&
                        onRetrySendAttempt(conversationId, { sendAttemptId: attempt.id })
                      }
                      disabled={!canRetry}
                      className="flex h-9 shrink-0 items-center justify-center gap-2 border border-hp-rule px-3 text-[10px] uppercase tracking-[0.14em] text-hp-ink transition hover:border-hp-ink disabled:opacity-50"
                    >
                      <RefreshCw size={13} />
                      Retry
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <p className="text-sm leading-6 text-hp-muted">
            No failed sends recorded for this conversation.
          </p>
        )}

        {recentAttempts.length ? (
          <div className="mt-3 space-y-2 border-t border-hp-rule pt-3 text-xs leading-5 text-hp-muted">
            {recentAttempts.map((attempt) => {
              const canQueue =
                Boolean(conversationId) &&
                canSendInboxReply &&
                attempt.status === "approved" &&
                Boolean(windowState?.canAttemptSend) &&
                mutationState.status !== "saving";

              return (
                <div
                  key={attempt.id}
                  className="flex flex-col gap-2 border border-hp-rule bg-hp-inset p-3 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="min-w-0">
                    <p className="text-sm font-medium leading-5 text-hp-ink">
                      {attempt.status.replaceAll("_", " ")}
                    </p>
                    <p className="mt-1 break-words text-xs leading-5 text-hp-muted">
                      {formatDateLabel(attempt.created_at)}
                      {attempt.messaging_type ? ` · ${attempt.messaging_type}` : ""}
                      {attempt.tag ? ` · ${attempt.tag}` : ""}
                    </p>
                  </div>
                  {attempt.status === "approved" ? (
                    <button
                      type="button"
                      onClick={() =>
                        conversationId &&
                        onQueueSendAttempt(conversationId, { sendAttemptId: attempt.id })
                      }
                      disabled={!canQueue}
                      className="flex h-9 shrink-0 items-center justify-center gap-2 border border-hp-rule px-3 text-xs font-medium text-hp-ink transition hover:border-hp-ink disabled:opacity-50"
                    >
                      {mutationState.status === "saving" &&
                      mutationState.sendAttemptId === attempt.id ? (
                        <Loader2 size={13} className="animate-spin" />
                      ) : (
                        <Send size={13} />
                      )}
                      Queue Delivery
                    </button>
                  ) : null}
                </div>
              );
            })}
          </div>
        ) : null}
      </div>
    </div>
  );
}

function QueueTabs({
  value,
  counts,
  categories,
  onChange,
}: {
  value: QueueCategoryFilter;
  counts: Map<QueueCategoryFilter, number>;
  categories: readonly QueueCategoryOption[];
  onChange: (value: QueueCategoryFilter) => void;
}) {
  return (
    <div className="-mx-1 mb-4 flex gap-2 overflow-x-auto px-1 pb-1">
      <QueueTab
        label="All"
        value="all"
        active={value === "all"}
        count={counts.get("all") || 0}
        onChange={onChange}
      />
      {categories.map((category) => (
        <QueueTab
          key={category.key}
          label={category.label}
          value={category.key}
          active={value === category.key}
          count={counts.get(category.key) || 0}
          onChange={onChange}
        />
      ))}
    </div>
  );
}

function QueueTab({
  label,
  value,
  active,
  count,
  onChange,
}: {
  label: string;
  value: QueueCategoryFilter;
  active: boolean;
  count: number;
  onChange: (value: QueueCategoryFilter) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onChange(value)}
      className={[
        "shrink-0 border px-3 py-2 text-[10px] uppercase tracking-[0.14em] transition-colors",
        active
          ? "border-hp-ink bg-hp-ink text-hp-foundation"
          : "border-hp-rule text-hp-body hover:border-hp-ink hover:text-hp-ink",
      ].join(" ")}
    >
      <span>{label}</span>
      <span className={active ? "ml-2 text-hp-foundation/70" : "ml-2 text-hp-muted"}>
        {count}
      </span>
    </button>
  );
}

function ConversationSourcePanel({
  item,
  canManageInboxState,
  mutationState,
  onContactMethodMutation,
}: {
  item: QueueDisplayItem | null;
  canManageInboxState: boolean;
  mutationState: ContactMethodMutationLoadState;
  onContactMethodMutation: (
    conversationId: string,
    method: "POST" | "PATCH" | "DELETE",
    input: MetaInboxContactMethodMutationInput,
  ) => void;
}) {
  const firstTouch = item?.firstTouch || null;
  const profile = item?.profile || null;
  return (
    <div className="border border-hp-rule bg-hp-inset p-4">
      <div className="mb-3 flex items-center gap-2 text-hp-ink">
        <UserRound size={17} />
        <span className="text-[11px] uppercase tracking-[0.14em]">Customer Source</span>
      </div>
      {item ? (
        <div className="space-y-4">
          <div className="space-y-2">
            <InfoLine label="Customer" value={profile?.display_name || item.sender} />
            <InfoLine label="Handle" value={profile?.username ? `@${profile.username}` : null} />
            <InfoLine
              label="Profile"
              value={profile?.profile_url || profile?.profile_reference || item.sourceId}
              href={profile?.profile_url || null}
            />
            <InfoLine label="Participant ID" value={item.inboxConversation?.participant_id || null} />
          </div>

          <ContactMethodsPanel
            item={item}
            canManageInboxState={canManageInboxState}
            mutationState={mutationState}
            onContactMethodMutation={onContactMethodMutation}
          />

          <div className="border-t border-hp-rule pt-4">
            <p className="mb-2 text-[10px] uppercase tracking-[0.14em] text-hp-muted">
              First Touch
            </p>
            <InfoLine
              label="Source"
              value={metaInboxVocabularyLabel(META_INBOX_SOURCE_CHANNELS, item.sourceChannel)}
            />
            <InfoLine label="Ad ID" value={firstTouch?.ad_id || null} />
            <InfoLine label="Referral" value={firstTouch?.ref || null} />
            <InfoLine label="Campaign" value={firstTouch?.campaign_id || null} />
            <InfoLine label="Group of Ads" value={firstTouch?.adset_id || null} />
            <InfoLine label="Creative" value={firstTouch?.creative_id || null} />
            <InfoLine
              label="Source Link"
              value={firstTouch?.source_permalink || null}
              href={firstTouch?.source_permalink || null}
            />
          </div>
        </div>
      ) : (
        <p className="text-sm leading-6 text-hp-muted">
          Select a conversation to see customer profile reference, source channel, and first-touch
          attribution.
        </p>
      )}
    </div>
  );
}

function ContactMethodsPanel({
  item,
  canManageInboxState,
  mutationState,
  onContactMethodMutation,
}: {
  item: QueueDisplayItem;
  canManageInboxState: boolean;
  mutationState: ContactMethodMutationLoadState;
  onContactMethodMutation: (
    conversationId: string,
    method: "POST" | "PATCH" | "DELETE",
    input: MetaInboxContactMethodMutationInput,
  ) => void;
}) {
  const conversationId = item.inboxConversation?.id || null;
  const canEdit = Boolean(canManageInboxState && conversationId && item.profile);
  const [typeDraft, setTypeDraft] = useState<MetaInboxContactMethodMutationInput["type"]>("phone");
  const [valueDraft, setValueDraft] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValueDraft, setEditValueDraft] = useState("");
  const activeContacts = item.contactMethods.filter((contactMethod) => !contactMethod.deleted_at);
  const selectedEdit = activeContacts.find((contactMethod) => contactMethod.id === editingId) || null;
  const isSaving = mutationState.status === "saving";
  const statusTone =
    mutationState.status === "error"
      ? "text-signal-danger"
      : mutationState.status === "saved"
        ? "text-signal-positive"
        : "text-hp-muted";

  function addContactMethod() {
    if (!conversationId || !typeDraft) return;
    onContactMethodMutation(conversationId, "POST", {
      type: typeDraft,
      value: valueDraft,
      changeReason: "Sales entered customer contact method in inbox.",
    });
    setValueDraft("");
  }

  function saveEdit() {
    if (!conversationId || !selectedEdit) return;
    onContactMethodMutation(conversationId, "PATCH", {
      contactMethodId: selectedEdit.id,
      type: selectedEdit.type,
      value: editValueDraft,
      changeReason: "Sales edited customer contact method in inbox.",
    });
    setEditingId(null);
    setEditValueDraft("");
  }

  function deleteContactMethod(contactMethod: SocialInboxCustomerContactMethod) {
    if (!conversationId) return;
    onContactMethodMutation(conversationId, "DELETE", {
      contactMethodId: contactMethod.id,
      changeReason: "Sales deleted customer contact method in inbox.",
    });
  }

  return (
    <div className="border-t border-hp-rule pt-4">
      <div className="mb-2 flex items-center justify-between gap-3">
        <p className="text-[10px] uppercase tracking-[0.14em] text-hp-muted">
          Contact Methods
        </p>
        <span className={`text-[10px] uppercase tracking-[0.14em] ${statusTone}`}>
          {mutationState.message || (canEdit ? "Editable" : "Read-only")}
        </span>
      </div>

      {activeContacts.length ? (
        <div className="space-y-2">
          {activeContacts.map((contactMethod) => {
            const isEditing = editingId === contactMethod.id;
            return (
              <div key={contactMethod.id} className="border border-hp-rule bg-hp-card p-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 text-sm text-hp-ink">
                      {contactMethod.type === "email" ? <Mail size={14} /> : <Phone size={14} />}
                      <span className="min-w-0 break-all">{contactMethod.value_display}</span>
                    </div>
                    <p className="mt-1 text-xs leading-5 text-hp-muted">
                      {metaInboxVocabularyLabel(
                        META_INBOX_CUSTOMER_CONTACT_METHODS,
                        contactMethod.type,
                      )}{" "}
                      · {contactMethod.source.replaceAll("_", " ")} · future verified matching
                    </p>
                  </div>
                  {canEdit ? (
                    <div className="flex shrink-0 items-center gap-1">
                      <button
                        type="button"
                        onClick={() => {
                          setEditingId(contactMethod.id);
                          setEditValueDraft(contactMethod.value_display);
                        }}
                        disabled={isSaving}
                        aria-label="Edit Contact"
                        className="flex h-8 w-8 items-center justify-center border border-hp-rule text-hp-ink transition hover:border-hp-ink disabled:opacity-50"
                      >
                        <Pencil size={13} />
                      </button>
                      <button
                        type="button"
                        onClick={() => deleteContactMethod(contactMethod)}
                        disabled={isSaving}
                        aria-label="Delete Contact"
                        className="flex h-8 w-8 items-center justify-center border border-hp-rule text-signal-danger transition hover:border-signal-danger disabled:opacity-50"
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                  ) : null}
                </div>
                {isEditing ? (
                  <div className="mt-3 grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto]">
                    <input
                      value={editValueDraft}
                      onChange={(event) => setEditValueDraft(event.target.value)}
                      className="h-9 min-w-0 border border-hp-rule bg-hp-foundation px-3 text-sm text-hp-ink outline-none focus:border-hp-ink"
                    />
                    <button
                      type="button"
                      onClick={saveEdit}
                      disabled={isSaving}
                      className="h-9 border border-hp-ink px-3 text-[10px] uppercase tracking-[0.14em] text-hp-ink transition hover:bg-hp-ink hover:text-hp-foundation disabled:opacity-50"
                    >
                      Save
                    </button>
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
      ) : (
        <p className="text-sm leading-6 text-hp-muted">
          No customer phone or email captured yet.
        </p>
      )}

      {canEdit ? (
        <div className="mt-3 grid gap-2">
          <div className="grid gap-2 sm:grid-cols-[130px_minmax(0,1fr)]">
            <select
              value={typeDraft || "phone"}
              onChange={(event) =>
                setTypeDraft(event.target.value as MetaInboxContactMethodMutationInput["type"])
              }
              className="h-10 border border-hp-rule bg-hp-foundation px-3 text-sm text-hp-ink outline-none focus:border-hp-ink"
            >
              {META_INBOX_CUSTOMER_CONTACT_METHODS.map((method) => (
                <option key={method.key} value={method.key}>
                  {method.label}
                </option>
              ))}
            </select>
            <input
              value={valueDraft}
              onChange={(event) => setValueDraft(event.target.value)}
              placeholder="Customer phone or email"
              className="h-10 min-w-0 border border-hp-rule bg-hp-foundation px-3 text-sm text-hp-ink outline-none placeholder:text-hp-muted focus:border-hp-ink"
            />
          </div>
          <button
            type="button"
            onClick={addContactMethod}
            disabled={isSaving || !valueDraft.trim()}
            className="flex h-9 items-center justify-center gap-2 border border-hp-ink px-3 text-[10px] uppercase tracking-[0.14em] text-hp-ink transition hover:bg-hp-ink hover:text-hp-foundation disabled:opacity-50"
          >
            <Plus size={13} />
            Add Contact
          </button>
          <p className="text-xs leading-5 text-hp-muted">
            Phone and email stay inbox-owned, audited, and available for future verified matching.
          </p>
        </div>
      ) : (
        <p className="mt-3 text-xs leading-5 text-hp-muted">
          Sales users can add, edit, and delete customer phone/email for conversations they can access.
        </p>
      )}
    </div>
  );
}

function WorkflowStatePanel({
  item,
  canManageInboxState,
  mutationState,
  onWorkflowUpdate,
  instruction,
  onInstructionChange,
}: {
  item: QueueDisplayItem | null;
  canManageInboxState: boolean;
  mutationState: WorkflowMutationLoadState;
  onWorkflowUpdate: (conversationId: string, input: MetaInboxWorkflowPatchInput) => void;
  instruction: string;
  onInstructionChange: (value: string) => void;
}) {
  const conversation = item?.inboxConversation || null;
  const [queueDraft, setQueueDraft] = useState<MetaInboxQueueCategoryKey>(
    item?.queueCategoryKey || "uncategorized_needs_review",
  );
  const [statusDraft, setStatusDraft] = useState<SocialInboxConversation["conversation_status"]>(
    item?.conversationStatus || "new_inquiry",
  );
  const [leadQualityDraft, setLeadQualityDraft] = useState("");
  const [reasonTagDrafts, setReasonTagDrafts] = useState<string[]>([]);
  const [outcomeDraft, setOutcomeDraft] = useState<SocialInboxConversation["inbox_outcome"]>(
    "no_outcome_yet",
  );
  const [lostReasonDraft, setLostReasonDraft] = useState("");
  const [followUpDraft, setFollowUpDraft] = useState(formatDateTimeLocal(conversation?.follow_up_at));
  const [changeReasonDraft, setChangeReasonDraft] = useState("");

  const queueLabel = item
    ? metaInboxVocabularyLabel(META_INBOX_QUEUE_CATEGORIES, item.queueCategoryKey)
    : "No conversation";
  const statusLabel = item
    ? metaInboxVocabularyLabel(META_INBOX_CONVERSATION_STATUSES, item.conversationStatus)
    : "No status";
  const outcomeLabel = metaInboxVocabularyLabel(
    META_INBOX_OUTCOMES,
    item?.inboxConversation?.inbox_outcome || "no_outcome_yet",
  );
  const leadQualityLabel = metaInboxVocabularyLabel(
    META_INBOX_LEAD_QUALITY_LABELS,
    item?.inboxConversation?.lead_quality,
    "Not labeled",
  );
  const canEditWorkflow = Boolean(item && conversation && canManageInboxState);
  const isSaving = mutationState.status === "saving";
  const workflowStatusTone =
    mutationState.status === "error"
      ? "text-signal-danger"
      : mutationState.status === "saved"
        ? "text-signal-positive"
        : "text-hp-muted";

  function saveWorkflow() {
    if (!conversation) return;
    onWorkflowUpdate(conversation.id, {
      queueCategoryKey: queueDraft,
      conversationStatus: statusDraft,
      followUpAt: followUpDraft || null,
      leadQuality: leadQualityDraft
        ? (leadQualityDraft as NonNullable<MetaInboxWorkflowPatchInput["leadQuality"]>)
        : null,
      leadQualityReasonTags: reasonTagDrafts as NonNullable<
        MetaInboxWorkflowPatchInput["leadQualityReasonTags"]
      >,
      inboxOutcome: outcomeDraft,
      inboxLostReason: lostReasonDraft
        ? (lostReasonDraft as NonNullable<MetaInboxWorkflowPatchInput["inboxLostReason"]>)
        : null,
      changeReason: changeReasonDraft,
    });
  }

  function claimSelf() {
    if (!conversation) return;
    onWorkflowUpdate(conversation.id, {
      assignmentMode: "claim_self",
      changeReason: changeReasonDraft || "Claimed from inbox workflow panel.",
    });
  }

  function returnToTeamQueue() {
    if (!conversation) return;
    onWorkflowUpdate(conversation.id, {
      assignmentMode: "team_queue",
      changeReason: changeReasonDraft || "Returned to team queue.",
    });
  }

  return (
    <div className="mt-5 border border-hp-rule bg-hp-card p-4">
      <div className="mb-3 flex items-center gap-2 text-hp-ink">
        <Tags size={17} />
        <span className="text-[11px] uppercase tracking-[0.14em]">Workflow State</span>
      </div>
      <div className="grid gap-3 text-sm">
        <StateTile label="Queue" value={queueLabel} />
        <StateTile label="Status" value={statusLabel} />
        <StateTile label="Lead Quality" value={leadQualityLabel} />
        <StateTile label="Inbox Outcome" value={outcomeLabel} />
        <StateTile
          label="Reply Window"
          value={item ? sendEligibilityLabel(item) : "No conversation"}
          detail={item ? replyWindowDetail(item) : null}
        />
      </div>

      <div className="mt-4 border-t border-hp-rule pt-4">
        <div className="mb-2 flex items-center gap-2 text-hp-ink">
          <Link2 size={15} />
          <span className="text-[10px] uppercase tracking-[0.14em]">Routing Explanation</span>
        </div>
        <p className="text-sm leading-6 text-hp-muted">
          {item?.routingExplanation || "No normalized routing explanation has been captured yet."}
        </p>
        {typeof item?.routingConfidence === "number" ? (
          <p className="mt-2 text-[10px] uppercase tracking-[0.14em] text-hp-muted">
            Confidence {Math.round(item.routingConfidence * 100)}%
          </p>
        ) : null}
      </div>

      <div className="mt-4 border-t border-hp-rule pt-4">
        <div className="mb-3 flex items-center justify-between gap-3">
          <span className="text-[10px] uppercase tracking-[0.14em] text-hp-ink">
            Sales Workflow Controls
          </span>
          <span className={`text-[10px] uppercase tracking-[0.14em] ${workflowStatusTone}`}>
            {mutationState.message || (canEditWorkflow ? "Ready" : "Read-only")}
          </span>
        </div>
        {canEditWorkflow ? (
          <div className="grid gap-3">
            <FilterSelect
              label="Queue"
              value={queueDraft}
              onChange={(value) => setQueueDraft(value as MetaInboxQueueCategoryKey)}
              options={META_INBOX_QUEUE_CATEGORIES.map((category) => [
                category.key,
                category.label,
              ])}
            />
            <FilterSelect
              label="Conversation Status"
              value={statusDraft}
              onChange={(value) =>
                setStatusDraft(value as SocialInboxConversation["conversation_status"])
              }
              options={META_INBOX_CONVERSATION_STATUSES.map((statusOption) => [
                statusOption.key,
                statusOption.label,
              ])}
            />
            <FilterSelect
              label="Lead Quality"
              value={leadQualityDraft}
              onChange={setLeadQualityDraft}
              options={[
                ["", "Not Labeled"],
                ...META_INBOX_LEAD_QUALITY_LABELS.map((quality) => [
                  quality.key,
                  quality.label,
                ] as [string, string]),
              ]}
            />
            <label className="block min-w-0">
              <span className="mb-1.5 block text-[10px] uppercase tracking-[0.14em] text-hp-muted">
                Reason Tags
              </span>
              <select
                multiple
                value={reasonTagDrafts}
                onChange={(event) =>
                  setReasonTagDrafts(
                    Array.from(event.currentTarget.selectedOptions).map((option) => option.value),
                  )
                }
                className="h-28 w-full border border-hp-rule bg-hp-foundation px-3 py-2 text-sm text-hp-ink outline-none transition-colors focus:border-hp-ink"
              >
                {META_INBOX_LEAD_QUALITY_REASON_TAGS.map((tag) => (
                  <option key={tag.key} value={tag.key}>
                    {tag.label}
                  </option>
                ))}
              </select>
            </label>
            <FilterSelect
              label="Inbox Outcome"
              value={outcomeDraft}
              onChange={(value) =>
                setOutcomeDraft(value as SocialInboxConversation["inbox_outcome"])
              }
              options={META_INBOX_OUTCOMES.map((outcome) => [outcome.key, outcome.label])}
            />
            <FilterSelect
              label="Lost Reason"
              value={lostReasonDraft}
              onChange={setLostReasonDraft}
              options={[
                ["", "Not Lost"],
                ...META_INBOX_LOST_REASONS.map((reason) => [
                  reason.key,
                  reason.label,
                ] as [string, string]),
              ]}
            />
            <label className="block">
              <span className="mb-1.5 block text-[10px] uppercase tracking-[0.14em] text-hp-muted">
                Follow-Up
              </span>
              <input
                type="datetime-local"
                value={followUpDraft}
                onChange={(event) => setFollowUpDraft(event.target.value)}
                className="h-10 w-full border border-hp-rule bg-hp-foundation px-3 text-sm text-hp-ink outline-none transition-colors focus:border-hp-ink"
              />
            </label>
            <label className="block">
              <span className="mb-1.5 block text-[10px] uppercase tracking-[0.14em] text-hp-muted">
                Change Note
              </span>
              <input
                value={changeReasonDraft}
                onChange={(event) => setChangeReasonDraft(event.target.value)}
                placeholder="Optional note for audit trail"
                className="h-10 w-full border border-hp-rule bg-hp-foundation px-3 text-sm text-hp-ink outline-none placeholder:text-hp-muted focus:border-hp-ink"
              />
            </label>
            <div className="grid gap-2 sm:grid-cols-3">
              <button
                type="button"
                onClick={claimSelf}
                disabled={isSaving}
                className="border border-hp-rule px-3 py-2 text-[10px] uppercase tracking-[0.14em] text-hp-ink transition hover:border-hp-ink disabled:opacity-50"
              >
                Claim Self
              </button>
              <button
                type="button"
                onClick={returnToTeamQueue}
                disabled={isSaving}
                className="border border-hp-rule px-3 py-2 text-[10px] uppercase tracking-[0.14em] text-hp-ink transition hover:border-hp-ink disabled:opacity-50"
              >
                Team Queue
              </button>
              <button
                type="button"
                onClick={saveWorkflow}
                disabled={isSaving}
                className="bg-hp-ink px-3 py-2 text-[10px] uppercase tracking-[0.14em] text-hp-foundation transition hover:opacity-90 disabled:opacity-50"
              >
                Save State
              </button>
            </div>
            <p className="text-xs leading-5 text-hp-muted">
              Close and lost updates require Lead Quality, at least one reason tag, Inbox
              Outcome, and Lost Reason when lost. Every saved change writes an audit event.
            </p>
          </div>
        ) : (
          <p className="text-sm leading-6 text-hp-muted">
            Sales and sales lead users can claim, route, label, close, and mark lost
            conversations they can access. Marketing remains read-only for inbox operations.
          </p>
        )}
      </div>

      <label className="mt-4 block">
        <span className="mb-1.5 block text-[10px] uppercase tracking-[0.14em] text-hp-muted">
          Staff Guidance
        </span>
        <textarea
          value={instruction}
          onChange={(event) => onInstructionChange(event.target.value)}
          disabled={!item}
          rows={3}
          placeholder="Add price, appointment, sizing, or tone notes for the human reply."
          className="w-full resize-none border border-hp-rule bg-hp-foundation p-3 text-sm leading-5 text-hp-body outline-none placeholder:text-hp-muted focus:border-hp-ink disabled:opacity-70"
        />
      </label>
    </div>
  );
}

function InfoLine({
  label,
  value,
  href,
}: {
  label: string;
  value: string | null | undefined;
  href?: string | null;
}) {
  return (
    <div className="grid grid-cols-[96px_minmax(0,1fr)] gap-3 text-sm leading-5">
      <span className="text-[10px] uppercase tracking-[0.14em] text-hp-muted">{label}</span>
      {value ? (
        href ? (
          <a
            href={href}
            target="_blank"
            rel="noreferrer"
            className="inline-flex min-w-0 items-center gap-1 break-all text-hp-ink underline-offset-4 hover:underline"
          >
            <span className="min-w-0 break-all">{value}</span>
            <ExternalLink size={12} className="shrink-0" />
          </a>
        ) : (
          <span className="min-w-0 break-words text-hp-ink">{value}</span>
        )
      ) : (
        <span className="text-hp-muted">Not captured</span>
      )}
    </div>
  );
}

function StateTile({
  label,
  value,
  detail,
}: {
  label: string;
  value: string;
  detail?: string | null;
}) {
  return (
    <div className="border border-hp-rule bg-hp-inset p-3">
      <p className="text-[10px] uppercase tracking-[0.14em] text-hp-muted">{label}</p>
      <p className="mt-1 text-sm font-medium text-hp-ink">{value}</p>
      {detail ? <p className="mt-1 text-xs leading-5 text-hp-muted">{detail}</p> : null}
    </div>
  );
}

function sendEligibilityLabel(item: QueueDisplayItem) {
  if (item.sendEligibility === "standard_reply_allowed") return "Standard Reply";
  if (item.sendEligibility === "human_agent_allowed") return "Human Agent Window";
  if (item.sendEligibility === "expired") return "Expired";
  return "Unknown";
}

function replyWindowState(item: QueueDisplayItem) {
  const now = Date.now();
  const standardOpen =
    item.sendEligibility === "standard_reply_allowed" &&
    Boolean(item.replyWindowExpiresAt) &&
    Date.parse(item.replyWindowExpiresAt || "") > now;
  const humanAgentOpen =
    (item.sendEligibility === "human_agent_allowed" ||
      item.sendEligibility === "standard_reply_allowed") &&
    Boolean(item.humanAgentWindowExpiresAt) &&
    Date.parse(item.humanAgentWindowExpiresAt || "") > now;

  if (standardOpen) {
    return {
      canAttemptSend: true,
      label: "Standard Reply",
      detail: `${timeUntilLabel(item.replyWindowExpiresAt || "")} remaining for standard response.`,
    };
  }

  if (humanAgentOpen) {
    return {
      canAttemptSend: true,
      label: "Human Agent Window",
      detail: `${timeUntilLabel(item.humanAgentWindowExpiresAt || "")} remaining with Human Agent tag.`,
    };
  }

  if (item.sendEligibility === "expired") {
    return {
      canAttemptSend: false,
      label: "Expired",
      detail: "Meta reply window is closed for normal send attempts.",
    };
  }

  return {
    canAttemptSend: false,
    label: sendEligibilityLabel(item),
    detail: "Reply eligibility is unknown. Sync or repair the conversation before send attempt.",
  };
}

function replyWindowDetail(item: QueueDisplayItem) {
  const target =
    item.sendEligibility === "standard_reply_allowed"
      ? item.replyWindowExpiresAt
      : item.sendEligibility === "human_agent_allowed"
        ? item.humanAgentWindowExpiresAt
        : null;
  if (!target) return null;
  return `${timeUntilLabel(target)} remaining`;
}

function timeUntilLabel(iso: string) {
  const diffMs = Date.parse(iso) - Date.now();
  if (!Number.isFinite(diffMs)) return "Unknown";
  if (diffMs <= 0) return "Expired";
  const minutes = Math.ceil(diffMs / 60_000);
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.ceil(minutes / 60);
  if (hours < 24) return `${hours} hr`;
  return `${Math.ceil(hours / 24)} day`;
}

function upsertSendAttempt(data: SocialInboxData, sendAttempt: SocialInboxSendAttempt): SocialInboxData {
  const withoutExisting = (data.sendAttempts || []).filter((attempt) => attempt.id !== sendAttempt.id);
  return {
    ...data,
    sendAttempts: [sendAttempt, ...withoutExisting],
  };
}

function newSendAttemptIdempotencyKey(conversationId: string) {
  const suffix =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  return `${conversationId}:${suffix}`;
}

function SyncRunPanel({ data }: { data: SocialInboxData }) {
  const lastRun = data.syncRuns[0] || null;

  return (
    <div className="mt-5 border border-hp-rule p-4">
      <div className="mb-3 flex items-center gap-2 text-hp-ink">
        <RefreshCw size={17} />
        <span className="text-[11px] uppercase tracking-[0.14em]">Last Sync</span>
      </div>
      {lastRun ? (
        <div className="space-y-2 text-sm leading-6 text-hp-muted">
          <p className="text-hp-ink">{lastRun.status}</p>
          <p>{formatDateLabel(lastRun.completed_at || lastRun.started_at)}</p>
          <p>
            {Number(lastRun.metrics.threads || 0)} threads ·{" "}
            {Number(lastRun.metrics.messages || 0)} messages ·{" "}
            {Number(lastRun.metrics.comments || 0)} comments
          </p>
          {lastRun.errors.length ? (
            <p className="text-signal-warning">{String(lastRun.errors[0])}</p>
          ) : null}
        </div>
      ) : (
        <p className="text-sm leading-6 text-hp-muted">No inbox sync has run yet.</p>
      )}
    </div>
  );
}

function InboxReadinessBanner({ status }: { status: SocialInboxStatus }) {
  const [open, setOpen] = useState(false);
  const ready = status.readiness.socialInbox;
  const hasError = Boolean(status.error || status.missingEnv.length);
  const replyMissing = status.permissions?.socialReply.missing.length ?? 0;
  const showBanner = !ready || hasError || replyMissing > 0;

  if (!showBanner) return null;

  const headline = !ready
    ? "Inbox can't read Meta messages"
    : hasError
      ? "Inbox connection issue"
      : `${replyMissing} permission${replyMissing === 1 ? "" : "s"} missing for replies`;

  return (
    <section className="mx-auto mt-4 max-w-7xl">
      <div className="border-l-[3px] border-l-[#8B5B19] bg-hp-card">
        <div className="flex items-center gap-3 px-4 py-3">
          <span className="text-[11px] uppercase tracking-[0.14em] text-[#8B5B19]">
            {ready && !hasError ? "Heads up" : "Action needed"}
          </span>
          <span className="flex-1 text-sm text-hp-ink">{headline}</span>
          <button
            type="button"
            onClick={() => setOpen((value) => !value)}
            className="text-[10px] uppercase tracking-[0.14em] text-hp-muted transition-colors duration-150 hover:text-hp-ink"
          >
            {open ? "Hide details" : "Show details"}
          </button>
        </div>
        {open ? (
          <div className="border-t border-hp-rule p-5">
            <MetaReadinessPanel status={status} />
          </div>
        ) : null}
      </div>
    </section>
  );
}

function MetaReadinessPanel({ status }: { status: SocialInboxStatus }) {
  const permissions = status.permissions;
  const socialReplyWarnings = permissions?.socialReply.warnings || [];

  return (
    <section className="border border-hp-rule bg-hp-card p-5">
      <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
        <div>
          <span className="text-[11px] uppercase tracking-[0.14em] text-hp-muted">
            Meta Integration Status
          </span>
          <h2 className="mt-2 font-title text-[30px] leading-tight text-hp-ink">
            {status.readiness.socialInbox ? "Inbox read access is ready" : "Inbox setup needed"}
          </h2>
          <p className="mt-3 max-w-3xl text-sm leading-6 text-hp-muted">
            This page uses live Meta permission checks. The inbox can read Facebook and Instagram
            message/comment surfaces, while reply actions stay disabled until the backend and final
            permission set are in place.
          </p>
        </div>

        <div className="grid min-w-0 gap-3 sm:grid-cols-3 xl:w-[620px]">
          <ReadinessCard
            title="Ads Sync"
            ready={status.readiness.adsSync}
            detail={status.readiness.adsSync ? "Operational" : "Needs attention"}
          />
          <ReadinessCard
            title="Social Inbox"
            ready={status.readiness.socialInbox}
            detail={status.readiness.socialInbox ? "Read access ready" : "Missing permissions"}
          />
          <ReadinessCard
            title="Replies"
            ready={status.readiness.socialReply}
            detail={status.readiness.socialReply ? "Ready for send APIs" : "Limited"}
          />
        </div>
      </div>

      <div className="mt-5 grid gap-4 lg:grid-cols-[1fr_1fr]">
        <div className="border border-hp-rule bg-hp-inset p-4">
          <div className="text-[11px] uppercase tracking-[0.14em] text-hp-muted">
            Connected Accounts
          </div>
          <div className="mt-3 space-y-2">
            {status.accounts.length ? (
              status.accounts.map((account) => (
                <div
                  key={account.accountId}
                  className="flex items-center justify-between gap-3 text-sm"
                >
                  <span className="text-hp-ink">{account.name || account.accountId}</span>
                  <span className={account.ok ? "text-signal-positive" : "text-signal-danger"}>
                    {account.ok ? "Ready" : account.error || "Error"}
                  </span>
                </div>
              ))
            ) : (
              <p className="text-sm text-hp-muted">No configured Meta accounts available.</p>
            )}
          </div>
        </div>

        <div className="border border-hp-rule bg-hp-inset p-4">
          <div className="text-[11px] uppercase tracking-[0.14em] text-hp-muted">
            Remaining Setup
          </div>
          <div className="mt-3 space-y-2 text-sm leading-6">
            {status.error ? <p className="text-signal-danger">{status.error}</p> : null}
            {status.missingEnv.length ? (
              <p className="text-signal-danger">
                Missing env vars: {status.missingEnv.join(", ")}
              </p>
            ) : null}
            {permissions?.forbiddenGranted.length ? (
              <p className="text-signal-danger">
                Forbidden permission granted: {permissions.forbiddenGranted.join(", ")}
              </p>
            ) : null}
            {permissions?.socialReply.missing.length ? (
              <p className="text-signal-warning">
                Missing for Facebook comment replies: {permissions.socialReply.missing.join(", ")}
              </p>
            ) : null}
            {permissions?.adsSync.optionalMissing?.length ? (
              <p className="text-hp-muted">
                Optional ads permission missing: {permissions.adsSync.optionalMissing.join(", ")}
              </p>
            ) : null}
            {socialReplyWarnings.map((warning) => (
              <p key={warning} className="text-hp-muted">
                {warning}
              </p>
            ))}
            {!status.error &&
            !status.missingEnv.length &&
            !permissions?.socialReply.missing.length &&
            !permissions?.forbiddenGranted.length ? (
              <p className="text-signal-positive">All tracked permissions are ready.</p>
            ) : null}
          </div>
        </div>
      </div>
    </section>
  );
}

function ReadinessCard({
  title,
  ready,
  detail,
}: {
  title: string;
  ready: boolean;
  detail: string;
}) {
  return (
    <div className="border border-hp-rule bg-hp-inset p-4">
      <div className="flex items-center justify-between gap-3">
        <div className="text-[10px] uppercase tracking-[0.14em] text-hp-muted">{title}</div>
        {ready ? (
          <CheckCircle2 size={16} className="text-signal-positive" />
        ) : (
          <AlertTriangle size={16} className="text-signal-warning" />
        )}
      </div>
      <div className={`mt-3 text-sm ${ready ? "text-signal-positive" : "text-signal-warning"}`}>
        {detail}
      </div>
    </div>
  );
}

function StatusPill({ ready, label }: { ready: boolean; label: string }) {
  return (
    <div
      className={`flex h-9 items-center gap-2 border px-3 ${
        ready
          ? "border-signal-positive text-signal-positive"
          : "border-signal-warning text-signal-warning"
      }`}
    >
      {ready ? <CheckCircle2 size={14} /> : <AlertTriangle size={14} />}
      {label}
    </div>
  );
}

function FilterSelect({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: [string, string][];
}) {
  return (
    <label className="block min-w-0">
      <span className="mb-1.5 block text-[10px] uppercase tracking-[0.14em] text-hp-muted">
        {label}
      </span>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="h-10 w-full border border-hp-rule bg-hp-foundation px-3 text-sm text-hp-ink outline-none transition-colors focus:border-hp-ink"
      >
        {options.map(([optionValue, optionLabel]) => (
          <option key={optionValue} value={optionValue}>
            {optionLabel}
          </option>
        ))}
      </select>
    </label>
  );
}

function QueueItem({
  item,
  active,
  onSelect,
}: {
  item: QueueDisplayItem;
  active: boolean;
  onSelect: () => void;
}) {
  const Icon = item.channel === "Instagram" ? Camera : MessageCircle;
  return (
    <button
      onClick={onSelect}
      className={`w-full border-b border-hp-rule p-4 text-left transition-colors hover:bg-hp-inset ${
        active ? "bg-hp-inset" : ""
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 flex-1 items-start gap-2">
          <Icon size={16} className="mt-0.5 shrink-0 text-hp-muted" />
          <span className="min-w-0 break-words text-sm leading-5 text-hp-ink">{item.sender}</span>
        </div>
        <span className="shrink-0 text-[10px] uppercase tracking-[0.14em] text-hp-muted">
          {item.time}
        </span>
      </div>
      <p className="mt-2 line-clamp-2 text-sm leading-6 text-hp-body">{item.preview}</p>
      <div className="mt-3 flex flex-wrap items-center gap-2 text-[10px] uppercase tracking-[0.14em] text-hp-muted">
        <Clock size={13} />
        {item.brand} · {metaInboxVocabularyLabel(META_INBOX_QUEUE_CATEGORIES, item.queueCategoryKey)} ·{" "}
        {metaInboxVocabularyLabel(META_INBOX_SOURCE_CHANNELS, item.sourceChannel)} · {item.status}
      </div>
    </button>
  );
}

function EmptyThreadState() {
  return (
    <div className="flex min-h-[420px] items-center justify-center border border-dashed border-hp-rule p-8 text-center">
      <div>
        <div className="mx-auto flex h-14 w-14 items-center justify-center border border-hp-rule text-hp-muted">
          <MessageCircle size={20} />
        </div>
        <h3 className="mt-5 font-title text-3xl text-hp-ink">No conversation selected</h3>
        <p className="mx-auto mt-3 max-w-lg text-sm leading-6 text-hp-muted">
          Click Sync Inbox to pull the latest available Meta threads/comments, then select an item
          from the queue.
        </p>
      </div>
    </div>
  );
}

function formatDateTimeLocal(value: string | null | undefined) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const offsetMs = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offsetMs).toISOString().slice(0, 16);
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

function isErrorPayload(value: SocialInboxData | { error: string }): value is { error: string } {
  return "error" in value;
}

function isHistoryErrorPayload(
  value: SocialInboxConversationHistory | { error: string },
): value is { error: string } {
  return "error" in value;
}

function isWorkflowErrorPayload(
  value: { conversation: SocialInboxConversation; events: unknown[] } | { error: string },
): value is { error: string } {
  return "error" in value;
}

function isContactMethodErrorPayload(
  value: { contactMethod: SocialInboxCustomerContactMethod; events: unknown[] } | { error: string },
): value is { error: string } {
  return "error" in value;
}

function isSendAttemptErrorPayload(
  value: { sendAttempt: SocialInboxSendAttempt; events: unknown[] } | { error: string },
): value is { error: string } {
  return "error" in value;
}
