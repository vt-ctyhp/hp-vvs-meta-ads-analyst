"use client";

import {
  AlertTriangle,
  Camera,
  CheckCircle2,
  Clock,
  EyeOff,
  ExternalLink,
  Filter,
  Heart,
  Inbox,
  Link2,
  Loader2,
  Mail,
  MessageCircle,
  Paperclip,
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
import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";

import { SYNC, translateError } from "@/lib/glossary";
import { buildMetaInboxManagerDashboard } from "@/lib/meta-inbox-manager-dashboard";
import {
  buildMetaInboxQueueItems,
  type MetaInboxQueueDisplayItem,
} from "@/lib/meta-inbox-queue-view";
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
import { StatusSentence, type StatusHighlight } from "./status-sentence";
import type {
  SocialInboxComment,
  SocialInboxCommentAction,
  SocialInboxConversation,
  SocialInboxConversationEvent,
  SocialInboxConversationNote,
  SocialInboxCustomerContactMethod,
  SocialInboxData,
  SocialInboxConversationHistory,
  SocialInboxMessage,
  SocialInboxPresence,
  SocialInboxQaScorecard,
  SocialInboxSavedReply,
  SocialInboxSendAttempt,
  MetaInboxContactMethodMutationInput,
  MetaInboxCommentActionInput,
  MetaInboxConversationNoteInput,
  MetaInboxQaScorecardInput,
  MetaInboxSavedReplyInput,
  MetaInboxPresenceInput,
  MetaInboxQueueCommentActionInput,
  MetaInboxQueueSendAttemptInput,
  MetaInboxRetryCommentActionInput,
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
type QaScoreKey =
  | "toneScore"
  | "completenessScore"
  | "accuracyScore"
  | "nextStepScore"
  | "speedScore"
  | "policyComplianceScore";

const QA_SCORE_FIELDS: { key: QaScoreKey; label: string }[] = [
  { key: "toneScore", label: "Tone" },
  { key: "completenessScore", label: "Complete" },
  { key: "accuracyScore", label: "Accurate" },
  { key: "nextStepScore", label: "Next Step" },
  { key: "speedScore", label: "Speed" },
  { key: "policyComplianceScore", label: "Policy" },
];

type QueueDisplayItem = MetaInboxQueueDisplayItem;

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

type CommentActionMutationLoadState = {
  conversationId: string | null;
  status: "idle" | "saving" | "saved" | "error";
  message: string | null;
};

type SavedReplyMutationLoadState = {
  status: "idle" | "saving" | "saved" | "error";
  message: string | null;
};

type NoteMutationLoadState = {
  conversationId: string | null;
  status: "idle" | "saving" | "saved" | "error";
  message: string | null;
};

type QaScorecardMutationLoadState = {
  conversationId: string | null;
  status: "idle" | "saving" | "saved" | "error";
  message: string | null;
};

type PresenceLoadState = {
  status: "idle" | "ready" | "error";
  presences: SocialInboxPresence[];
  error: string | null;
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

const IDLE_COMMENT_ACTION_STATE: CommentActionMutationLoadState = {
  conversationId: null,
  status: "idle",
  message: null,
};

const IDLE_SAVED_REPLY_STATE: SavedReplyMutationLoadState = {
  status: "idle",
  message: null,
};

const IDLE_NOTE_STATE: NoteMutationLoadState = {
  conversationId: null,
  status: "idle",
  message: null,
};

const IDLE_QA_SCORECARD_STATE: QaScorecardMutationLoadState = {
  conversationId: null,
  status: "idle",
  message: null,
};

const IDLE_PRESENCE_STATE: PresenceLoadState = {
  status: "idle",
  presences: [],
  error: null,
};

export function SocialInboxClient({
  status,
  initialData,
  dataError,
  canManageInboxState,
  canSendInboxReply,
  canCreateManagerCoaching,
}: {
  status: SocialInboxStatus;
  initialData: SocialInboxData;
  dataError: string | null;
  canManageInboxState: boolean;
  canSendInboxReply: boolean;
  canCreateManagerCoaching: boolean;
}) {
  const [brandFilter, setBrandFilter] = useState<BrandFilter>("all");
  const [sourceFilter, setSourceFilter] = useState<SourceFilter>("all");
  const [itemTypeFilter, setItemTypeFilter] = useState<ItemTypeFilter>("all");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [queueCategoryFilter, setQueueCategoryFilter] = useState<QueueCategoryFilter>("all");
  const [sourceChannelFilter, setSourceChannelFilter] = useState<SourceChannelFilter>("all");
  const [campaignUmbrellaFilter, setCampaignUmbrellaFilter] = useState("all");
  const [adFilter, setAdFilter] = useState("all");
  const [creativeFilter, setCreativeFilter] = useState("all");
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
  const [commentActionMutationState, setCommentActionMutationState] =
    useState<CommentActionMutationLoadState>(IDLE_COMMENT_ACTION_STATE);
  const [savedReplyMutationState, setSavedReplyMutationState] =
    useState<SavedReplyMutationLoadState>(IDLE_SAVED_REPLY_STATE);
  const [noteMutationState, setNoteMutationState] =
    useState<NoteMutationLoadState>(IDLE_NOTE_STATE);
  const [qaScorecardMutationState, setQaScorecardMutationState] =
    useState<QaScorecardMutationLoadState>(IDLE_QA_SCORECARD_STATE);
  const [presenceByConversationId, setPresenceByConversationId] = useState<
    Record<string, PresenceLoadState>
  >({});

  const queue = useMemo(() => buildQueue(inboxData), [inboxData]);
  const managerDashboard = useMemo(
    () => buildMetaInboxManagerDashboard(inboxData),
    [inboxData],
  );
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
  const attributionFilterOptions = useMemo(
    () => buildAttributionFilterOptions(queue),
    [queue],
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
        if (
          campaignUmbrellaFilter !== "all" &&
          item.firstTouch?.campaign_umbrella_id !== campaignUmbrellaFilter
        ) return false;
        if (adFilter !== "all" && item.firstTouch?.ad_id !== adFilter) return false;
        if (creativeFilter !== "all" && item.firstTouch?.creative_id !== creativeFilter) {
          return false;
        }
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
          item.firstTouch?.campaign_umbrella_id,
          item.firstTouch?.campaign_id,
          item.firstTouch?.adset_id,
          item.firstTouch?.ad_id,
          item.firstTouch?.creative_id,
          item.firstTouch?.ref,
          metaInboxVocabularyLabel(META_INBOX_QUEUE_CATEGORIES, item.queueCategoryKey),
          metaInboxVocabularyLabel(META_INBOX_SOURCE_CHANNELS, item.sourceChannel),
        ]
          .join(" ")
          .toLowerCase()
          .includes(normalizedQuery);
      }),
    [
      brandFilter,
      adFilter,
      campaignUmbrellaFilter,
      creativeFilter,
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
  const selectedPresenceState = selectedConversationId
    ? presenceByConversationId[selectedConversationId] || IDLE_PRESENCE_STATE
    : IDLE_PRESENCE_STATE;
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
  const selectedCommentActionMutationState =
    commentActionMutationState.conversationId === selectedConversationId
      ? commentActionMutationState
      : IDLE_COMMENT_ACTION_STATE;
  const selectedNoteMutationState =
    noteMutationState.conversationId === selectedConversationId
      ? noteMutationState
      : IDLE_NOTE_STATE;
  const selectedQaScorecardMutationState =
    qaScorecardMutationState.conversationId === selectedConversationId
      ? qaScorecardMutationState
      : IDLE_QA_SCORECARD_STATE;

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

  const sendPresenceHeartbeat = useCallback(
    async (conversationId: string, input: MetaInboxPresenceInput) => {
      try {
        const response = await fetch(
          `/api/social-inbox/conversations/${encodeURIComponent(conversationId)}/presence`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(input),
          },
        );
        const payload = (await response.json()) as
          | { presence: SocialInboxPresence | null; presences: SocialInboxPresence[] }
          | { error: string };
        if (!response.ok || isPresenceErrorPayload(payload)) {
          throw new Error(
            isPresenceErrorPayload(payload) ? payload.error : "Could not update presence.",
          );
        }

        setPresenceByConversationId((current) => ({
          ...current,
          [conversationId]: {
            status: "ready",
            presences: payload.presences,
            error: null,
          },
        }));
      } catch (error) {
        setPresenceByConversationId((current) => ({
          ...current,
          [conversationId]: {
            status: "error",
            presences: current[conversationId]?.presences || [],
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

  useEffect(() => {
    if (!selectedConversationId) return;
    const activity = activeReplyDraft.trim() ? "replying" : "viewing";
    let disposed = false;
    let timeoutId: number | null = null;

    const beat = () => {
      if (disposed) return;
      void sendPresenceHeartbeat(selectedConversationId, { activity });
    };

    timeoutId = window.setTimeout(beat, activity === "replying" ? 600 : 0);
    const intervalId = window.setInterval(beat, activity === "replying" ? 10_000 : 25_000);

    return () => {
      disposed = true;
      if (timeoutId !== null) window.clearTimeout(timeoutId);
      window.clearInterval(intervalId);
    };
  }, [activeReplyDraft, selectedConversationId, sendPresenceHeartbeat]);

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
          | { conversation: SocialInboxConversation; events: SocialInboxConversationEvent[] }
          | { error: string };
        if (!response.ok || isWorkflowErrorPayload(payload)) {
          throw new Error(isWorkflowErrorPayload(payload) ? payload.error : "Could not update workflow.");
        }

        setInboxData((current) => ({
          ...current,
          inboxConversations: current.inboxConversations.map((conversation) =>
            conversation.id === payload.conversation.id ? payload.conversation : conversation,
          ),
          conversationEvents: mergeConversationEvents(
            current.conversationEvents,
            payload.events,
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
          | { contactMethod: SocialInboxCustomerContactMethod; events: SocialInboxConversationEvent[] }
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
            conversationEvents: mergeConversationEvents(
              current.conversationEvents,
              payload.events,
            ),
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
          | { sendAttempt: SocialInboxSendAttempt; events: SocialInboxConversationEvent[] }
          | { error: string };
        if (!response.ok || isSendAttemptErrorPayload(payload)) {
          throw new Error(
            isSendAttemptErrorPayload(payload)
              ? payload.error
              : "Could not record send attempt.",
          );
        }

        setInboxData((current) =>
          upsertConversationEvents(upsertSendAttempt(current, payload.sendAttempt), payload.events),
        );
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
          | { sendAttempt: SocialInboxSendAttempt; events: SocialInboxConversationEvent[] }
          | { error: string };
        if (!response.ok || isSendAttemptErrorPayload(payload)) {
          throw new Error(
            isSendAttemptErrorPayload(payload) ? payload.error : "Could not queue retry.",
          );
        }

        setInboxData((current) =>
          upsertConversationEvents(upsertSendAttempt(current, payload.sendAttempt), payload.events),
        );
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
          | { sendAttempt: SocialInboxSendAttempt; events: SocialInboxConversationEvent[] }
          | { error: string };
        if (!response.ok || isSendAttemptErrorPayload(payload)) {
          throw new Error(
            isSendAttemptErrorPayload(payload)
              ? payload.error
              : "Could not queue approved send attempt.",
          );
        }

        setInboxData((current) =>
          upsertConversationEvents(upsertSendAttempt(current, payload.sendAttempt), payload.events),
        );
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

  const handleCommentActionCreate = useCallback(
    async (conversationId: string, input: MetaInboxCommentActionInput) => {
      setCommentActionMutationState({
        conversationId,
        status: "saving",
        message: "Recording comment action...",
      });

      try {
        const response = await fetch(
          `/api/social-inbox/conversations/${encodeURIComponent(conversationId)}/comment-actions`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(input),
          },
        );
        const payload = (await response.json()) as
          | { commentAction: SocialInboxCommentAction; events: SocialInboxConversationEvent[] }
          | { error: string };
        if (!response.ok || isCommentActionErrorPayload(payload)) {
          throw new Error(
            isCommentActionErrorPayload(payload)
              ? payload.error
              : "Could not record comment action.",
          );
        }

        setInboxData((current) =>
          upsertConversationEvents(
            upsertCommentAction(current, payload.commentAction),
            payload.events,
          ),
        );
        setCommentActionMutationState({
          conversationId,
          status: "saved",
          message: `${payload.events.length} comment audit event${
            payload.events.length === 1 ? "" : "s"
          } recorded.`,
        });
      } catch (error) {
        setCommentActionMutationState({
          conversationId,
          status: "error",
          message: translateError(error),
        });
      }
    },
    [],
  );

  const handleCommentActionQueue = useCallback(
    async (conversationId: string, input: MetaInboxQueueCommentActionInput) => {
      setCommentActionMutationState({
        conversationId,
        status: "saving",
        message: "Queueing comment action...",
      });

      try {
        const response = await fetch(
          `/api/social-inbox/conversations/${encodeURIComponent(conversationId)}/comment-actions/queue`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(input),
          },
        );
        const payload = (await response.json()) as
          | { commentAction: SocialInboxCommentAction; events: SocialInboxConversationEvent[] }
          | { error: string };
        if (!response.ok || isCommentActionErrorPayload(payload)) {
          throw new Error(
            isCommentActionErrorPayload(payload)
              ? payload.error
              : "Could not queue comment action.",
          );
        }

        setInboxData((current) =>
          upsertConversationEvents(
            upsertCommentAction(current, payload.commentAction),
            payload.events,
          ),
        );
        setCommentActionMutationState({
          conversationId,
          status: "saved",
          message: `${payload.events.length} comment queue audit event${
            payload.events.length === 1 ? "" : "s"
          } recorded.`,
        });
      } catch (error) {
        setCommentActionMutationState({
          conversationId,
          status: "error",
          message: translateError(error),
        });
      }
    },
    [],
  );

  const handleCommentActionRetry = useCallback(
    async (conversationId: string, input: MetaInboxRetryCommentActionInput) => {
      setCommentActionMutationState({
        conversationId,
        status: "saving",
        message: "Queueing comment action retry...",
      });

      try {
        const response = await fetch(
          `/api/social-inbox/conversations/${encodeURIComponent(conversationId)}/comment-actions/retry`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(input),
          },
        );
        const payload = (await response.json()) as
          | { commentAction: SocialInboxCommentAction; events: SocialInboxConversationEvent[] }
          | { error: string };
        if (!response.ok || isCommentActionErrorPayload(payload)) {
          throw new Error(
            isCommentActionErrorPayload(payload)
              ? payload.error
              : "Could not queue comment action retry.",
          );
        }

        setInboxData((current) =>
          upsertConversationEvents(
            upsertCommentAction(current, payload.commentAction),
            payload.events,
          ),
        );
        setCommentActionMutationState({
          conversationId,
          status: "saved",
          message: `${payload.events.length} comment retry audit event${
            payload.events.length === 1 ? "" : "s"
          } recorded.`,
        });
      } catch (error) {
        setCommentActionMutationState({
          conversationId,
          status: "error",
          message: translateError(error),
        });
      }
    },
    [],
  );

  const handleSavedReplyCreate = useCallback(
    async (input: MetaInboxSavedReplyInput) => {
      setSavedReplyMutationState({
        status: "saving",
        message: "Saving personal draft...",
      });

      try {
        const response = await fetch("/api/social-inbox/saved-replies", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(input),
        });
        const payload = (await response.json()) as
          | { savedReply: SocialInboxSavedReply }
          | { error: string };
        if (!response.ok || isSavedReplyErrorPayload(payload)) {
          throw new Error(
            isSavedReplyErrorPayload(payload)
              ? payload.error
              : "Could not save reply template.",
          );
        }

        setInboxData((current) => upsertSavedReply(current, payload.savedReply));
        setSavedReplyMutationState({
          status: "saved",
          message: "Personal draft saved for matching conversations.",
        });
      } catch (error) {
        setSavedReplyMutationState({
          status: "error",
          message: translateError(error),
        });
      }
    },
    [],
  );

  const handleNoteCreate = useCallback(
    async (conversationId: string, input: MetaInboxConversationNoteInput) => {
      setNoteMutationState({
        conversationId,
        status: "saving",
        message: "Saving internal note...",
      });

      try {
        const response = await fetch(
          `/api/social-inbox/conversations/${encodeURIComponent(conversationId)}/notes`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(input),
          },
        );
        const payload = (await response.json()) as
          | { note: SocialInboxConversationNote; events: SocialInboxConversationEvent[] }
          | { error: string };
        if (!response.ok || isNoteErrorPayload(payload)) {
          throw new Error(
            isNoteErrorPayload(payload)
              ? payload.error
              : "Could not save internal note.",
          );
        }

        setInboxData((current) =>
          upsertConversationEvents(upsertConversationNote(current, payload.note), payload.events),
        );
        setNoteMutationState({
          conversationId,
          status: "saved",
          message: `${payload.events.length} note audit event${
            payload.events.length === 1 ? "" : "s"
          } recorded.`,
        });
      } catch (error) {
        setNoteMutationState({
          conversationId,
          status: "error",
          message: translateError(error),
        });
      }
    },
    [],
  );

  const handleQaScorecardCreate = useCallback(
    async (conversationId: string, input: MetaInboxQaScorecardInput) => {
      setQaScorecardMutationState({
        conversationId,
        status: "saving",
        message: "Saving QA scorecard...",
      });

      try {
        const response = await fetch(
          `/api/social-inbox/conversations/${encodeURIComponent(conversationId)}/qa-scorecards`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(input),
          },
        );
        const payload = (await response.json()) as
          | { qaScorecard: SocialInboxQaScorecard; events: SocialInboxConversationEvent[] }
          | { error: string };
        if (!response.ok || isQaScorecardErrorPayload(payload)) {
          throw new Error(
            isQaScorecardErrorPayload(payload)
              ? payload.error
              : "Could not save QA scorecard.",
          );
        }

        setInboxData((current) =>
          upsertConversationEvents(
            upsertQaScorecard(current, payload.qaScorecard),
            payload.events,
          ),
        );
        setQaScorecardMutationState({
          conversationId,
          status: "saved",
          message: `${payload.events.length} QA audit event${
            payload.events.length === 1 ? "" : "s"
          } recorded.`,
        });
      } catch (error) {
        setQaScorecardMutationState({
          conversationId,
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
              <FilterSelect
                label="Campaign Umbrella"
                value={campaignUmbrellaFilter}
                onChange={setCampaignUmbrellaFilter}
                options={[
                  ["all", "All Campaign Umbrellas"],
                  ...attributionFilterOptions.campaignUmbrellas,
                ]}
              />
              <div className="grid grid-cols-2 gap-3">
                <FilterSelect
                  label="Ad"
                  value={adFilter}
                  onChange={setAdFilter}
                  options={[
                    ["all", "All Ads"],
                    ...attributionFilterOptions.ads,
                  ]}
                />
                <FilterSelect
                  label="Creative"
                  value={creativeFilter}
                  onChange={setCreativeFilter}
                  options={[
                    ["all", "All Creatives"],
                    ...attributionFilterOptions.creatives,
                  ]}
                />
              </div>
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
                    setCampaignUmbrellaFilter("all");
                    setAdFilter("all");
                    setCreativeFilter("all");
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
                  <p className="mt-2 max-w-3xl break-words text-sm leading-6 text-hp-muted">
                    {syncStatus}
                  </p>
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
                    presences={selectedPresenceState.presences}
                    historyState={selectedHistoryState}
                    canSendInboxReply={canSendInboxReply}
                    commentActionState={selectedCommentActionMutationState}
                    onCreateCommentAction={handleCommentActionCreate}
                    onQueueCommentAction={handleCommentActionQueue}
                    onRetryCommentAction={handleCommentActionRetry}
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
                  savedReplyMutationState={savedReplyMutationState}
                  onCreateSendAttempt={handleSendAttemptCreate}
                  onQueueSendAttempt={handleSendAttemptQueue}
                  onRetrySendAttempt={handleSendAttemptRetry}
                  onCreateSavedReply={handleSavedReplyCreate}
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
                key={workflowPanelKey(selectedItem)}
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
              <AuditTrailPanel item={selectedItem} />

              <NotesCoachingPanel
                item={selectedItem}
                canManageInboxState={canManageInboxState}
                canCreateManagerCoaching={canCreateManagerCoaching}
                mutationState={selectedNoteMutationState}
                onCreateNote={handleNoteCreate}
              />

              <QaScorecardPanel
                item={selectedItem}
                canManageInboxState={canManageInboxState}
                canCreateManagerCoaching={canCreateManagerCoaching}
                mutationState={selectedQaScorecardMutationState}
                onCreateScorecard={handleQaScorecardCreate}
              />

              <SyncRunPanel data={inboxData} />

              <ManagerSnapshotPanel dashboard={managerDashboard} />

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
  return buildMetaInboxQueueItems(data);
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

function buildAttributionFilterOptions(queue: QueueDisplayItem[]) {
  return {
    campaignUmbrellas: uniqueAttributionOptions(
      queue,
      (item) => item.firstTouch?.campaign_umbrella_id || null,
      (item) => item.firstTouch?.campaign_umbrella_id || item.firstTouch?.ref || null,
    ),
    ads: uniqueAttributionOptions(
      queue,
      (item) => item.firstTouch?.ad_id || null,
      (item) => attributionOptionLabel("Ad", item.firstTouch?.ad_id || null, item.firstTouch?.ref || null),
    ),
    creatives: uniqueAttributionOptions(
      queue,
      (item) => item.firstTouch?.creative_id || null,
      (item) =>
        attributionOptionLabel("Creative", item.firstTouch?.creative_id || null, item.firstTouch?.ref || null),
    ),
  };
}

function uniqueAttributionOptions(
  queue: QueueDisplayItem[],
  valueForItem: (item: QueueDisplayItem) => string | null,
  labelForItem: (item: QueueDisplayItem) => string | null,
): [string, string][] {
  const options = new Map<string, string>();
  for (const item of queue) {
    const value = valueForItem(item);
    if (!value || options.has(value)) continue;
    options.set(value, labelForItem(item) || value);
  }
  return Array.from(options.entries()).sort((a, b) => a[1].localeCompare(b[1]));
}

function attributionOptionLabel(prefix: string, id: string | null, ref: string | null) {
  if (!id) return null;
  const short = id.length <= 18 ? id : `${id.slice(0, 6)}...${id.slice(-4)}`;
  return ref ? `${ref} · ${short}` : `${prefix} ${short}`;
}

function SelectedItemDetail({
  item,
  messages,
  comments,
  presences,
  historyState,
  canSendInboxReply,
  commentActionState,
  onCreateCommentAction,
  onQueueCommentAction,
  onRetryCommentAction,
  onLoadOlderHistory,
}: {
  item: QueueDisplayItem;
  messages: SocialInboxMessage[];
  comments: SocialInboxComment[];
  presences: SocialInboxPresence[];
  historyState: ConversationHistoryLoadState | null;
  canSendInboxReply: boolean;
  commentActionState: CommentActionMutationLoadState;
  onCreateCommentAction: (conversationId: string, input: MetaInboxCommentActionInput) => void;
  onQueueCommentAction: (conversationId: string, input: MetaInboxQueueCommentActionInput) => void;
  onRetryCommentAction: (conversationId: string, input: MetaInboxRetryCommentActionInput) => void;
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
        <PresenceCollisionBanner presences={presences} />
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
        <PublicCommentActionPanel
          item={item}
          rootComment={rootComment}
          canSendInboxReply={canSendInboxReply}
          mutationState={commentActionState}
          onCreateCommentAction={onCreateCommentAction}
          onQueueCommentAction={onQueueCommentAction}
          onRetryCommentAction={onRetryCommentAction}
        />
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
      <PresenceCollisionBanner presences={presences} />
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
              {message.attachments.length ? (
                <MessageAttachmentList
                  attachments={message.attachments}
                  tone={message.direction === "outbound" ? "dark" : "light"}
                />
              ) : null}
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

function MessageAttachmentList({
  attachments,
  tone,
}: {
  attachments: SocialInboxMessage["attachments"];
  tone: "light" | "dark";
}) {
  const muted = tone === "dark" ? "text-hp-foundation/75" : "text-hp-muted";
  const border = tone === "dark" ? "border-hp-foundation/30" : "border-hp-rule";
  const background = tone === "dark" ? "bg-hp-foundation/10" : "bg-hp-card";

  return (
    <div className="mt-3 grid gap-2">
      {attachments.map((attachment, index) => {
        const icon = attachmentIcon(attachment.attachmentType);
        const href = attachment.mediaUrl || attachment.previewUrl;
        return (
          <div
            key={`${attachment.metaAttachmentId || attachment.label}-${index}`}
            className={`flex min-w-0 items-center justify-between gap-3 border ${border} ${background} p-3`}
          >
            <div className="flex min-w-0 items-center gap-3">
              <span className="shrink-0">{icon}</span>
              <div className="min-w-0">
                <p className="truncate text-sm font-medium leading-5">{attachment.label}</p>
                <p className={`truncate text-xs leading-5 ${muted}`}>
                  {attachment.mimeType || attachment.attachmentType}
                  {attachment.sizeBytes ? ` · ${formatBytes(attachment.sizeBytes)}` : ""}
                </p>
              </div>
            </div>
            {href ? (
              <a
                href={href}
                target="_blank"
                rel="noreferrer"
                className={`shrink-0 text-xs font-medium ${muted} hover:underline`}
              >
                Open
              </a>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}

function PublicCommentActionPanel({
  item,
  rootComment,
  canSendInboxReply,
  mutationState,
  onCreateCommentAction,
  onQueueCommentAction,
  onRetryCommentAction,
}: {
  item: QueueDisplayItem;
  rootComment: SocialInboxComment | null;
  canSendInboxReply: boolean;
  mutationState: CommentActionMutationLoadState;
  onCreateCommentAction: (conversationId: string, input: MetaInboxCommentActionInput) => void;
  onQueueCommentAction: (conversationId: string, input: MetaInboxQueueCommentActionInput) => void;
  onRetryCommentAction: (conversationId: string, input: MetaInboxRetryCommentActionInput) => void;
}) {
  const conversationId = item.inboxConversation?.id || null;
  const [messageDraft, setMessageDraft] = useState("");
  const [reasonDraft, setReasonDraft] = useState("");
  const canAct = Boolean(conversationId && rootComment && canSendInboxReply);
  const isSaving = mutationState.status === "saving";
  const statusTone =
    mutationState.status === "error"
      ? "text-signal-danger"
      : mutationState.status === "saved"
        ? "text-signal-positive"
        : "text-hp-muted";
  const recentActions = item.commentActions
    .slice()
    .sort((a, b) => String(b.created_at || "").localeCompare(String(a.created_at || "")))
    .slice(0, 4);

  function submitAction(actionType: NonNullable<MetaInboxCommentActionInput["actionType"]>) {
    if (!conversationId) return;
    const messageText =
      actionType === "public_reply" || actionType === "private_reply" ? messageDraft : null;
    const reasonNote = actionType === "hide" || actionType === "delete" ? reasonDraft : null;
    onCreateCommentAction(conversationId, {
      actionType,
      messageText,
      reasonNote,
      idempotencyKey: newCommentActionIdempotencyKey(
        conversationId,
        actionType,
        messageText,
        reasonNote,
      ),
    });
    if (actionType === "public_reply" || actionType === "private_reply") setMessageDraft("");
    if (actionType === "hide" || actionType === "delete") setReasonDraft("");
  }

  function submitModerationAction(actionType: "hide" | "delete") {
    if (!window.confirm(`Confirm ${actionType} for this public comment?`)) return;
    submitAction(actionType);
  }

  return (
    <div className="mt-5 border border-hp-rule bg-hp-inset p-4">
      <div className="mb-3 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-hp-ink">
          <MessageCircle size={15} />
          <span className="text-[10px] uppercase tracking-[0.14em]">
            Public Comment Actions
          </span>
        </div>
        <span className={`text-[10px] uppercase tracking-[0.14em] ${statusTone}`}>
          {mutationState.message || (canAct ? "Ready" : "Read-only")}
        </span>
      </div>

      <div className="grid gap-3">
        <textarea
          value={messageDraft}
          onChange={(event) => setMessageDraft(event.target.value)}
          disabled={!canAct || isSaving}
          rows={3}
          placeholder="Public or private reply text"
          className="w-full resize-none border border-hp-rule bg-hp-foundation p-3 text-sm leading-6 text-hp-body outline-none placeholder:text-hp-muted focus:border-hp-ink disabled:opacity-70"
        />
        <div className="grid gap-2 sm:grid-cols-3">
          <CommentActionButton
            label="Public Reply"
            icon={<MessageCircle size={13} />}
            disabled={!canAct || isSaving || !messageDraft.trim()}
            onClick={() => submitAction("public_reply")}
          />
          <CommentActionButton
            label="Private DM"
            icon={<Mail size={13} />}
            disabled={!canAct || isSaving || !messageDraft.trim()}
            onClick={() => submitAction("private_reply")}
          />
          <CommentActionButton
            label="Like"
            icon={<Heart size={13} />}
            disabled={!canAct || isSaving}
            onClick={() => submitAction("like")}
          />
        </div>

        <input
          value={reasonDraft}
          onChange={(event) => setReasonDraft(event.target.value)}
          disabled={!canAct || isSaving}
          placeholder="Reason note required for hide/delete"
          className="h-10 w-full border border-hp-rule bg-hp-foundation px-3 text-sm text-hp-ink outline-none placeholder:text-hp-muted focus:border-hp-ink disabled:opacity-70"
        />
        <div className="grid gap-2 sm:grid-cols-2">
          <CommentActionButton
            label="Hide"
            icon={<EyeOff size={13} />}
            disabled={!canAct || isSaving || !reasonDraft.trim()}
            onClick={() => submitModerationAction("hide")}
          />
          <CommentActionButton
            label="Delete"
            icon={<Trash2 size={13} />}
            danger
            disabled={!canAct || isSaving || !reasonDraft.trim()}
            onClick={() => submitModerationAction("delete")}
          />
        </div>
      </div>

      {recentActions.length ? (
        <div className="mt-4 space-y-2 border-t border-hp-rule pt-3">
          {recentActions.map((action) => (
            <div
              key={action.id}
              className="flex flex-col gap-2 border border-hp-rule bg-hp-foundation p-3 text-xs leading-5 sm:flex-row sm:items-center sm:justify-between"
            >
              <div className="min-w-0">
                <p className="break-words text-sm text-hp-ink">
                  {commentActionLabel(action.action_type)} · {action.status.replaceAll("_", " ")}
                </p>
                <p className="text-hp-muted">{formatDateLabel(action.created_at)}</p>
                {action.meta_error_message ? (
                  <p className="mt-1 break-words text-signal-danger">{action.meta_error_message}</p>
                ) : null}
              </div>
              {action.status === "approved" ? (
                <CommentActionButton
                  label="Queue Action"
                  icon={<Send size={13} />}
                  disabled={!conversationId || !canSendInboxReply || isSaving}
                  onClick={() =>
                    conversationId &&
                    onQueueCommentAction(conversationId, { commentActionId: action.id })
                  }
                />
              ) : null}
              {action.status === "failed_retryable" ? (
                <CommentActionButton
                  label="Retry Action"
                  icon={<RefreshCw size={13} />}
                  disabled={!conversationId || !canSendInboxReply || isSaving}
                  onClick={() =>
                    conversationId &&
                    onRetryCommentAction(conversationId, { commentActionId: action.id })
                  }
                />
              ) : null}
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function CommentActionButton({
  label,
  icon,
  danger = false,
  disabled,
  onClick,
}: {
  label: string;
  icon: ReactNode;
  danger?: boolean;
  disabled: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={[
        "flex h-9 min-w-0 items-center justify-center gap-2 border px-3 text-xs font-medium transition disabled:opacity-50",
        danger
          ? "border-signal-danger text-signal-danger hover:bg-signal-danger hover:text-hp-foundation"
          : "border-hp-rule text-hp-ink hover:border-hp-ink",
      ].join(" ")}
    >
      {icon}
      <span className="truncate">{label}</span>
    </button>
  );
}

function attachmentIcon(type: SocialInboxMessage["attachments"][number]["attachmentType"]) {
  if (type === "image" || type === "video") return <Camera size={15} />;
  if (type === "share" || type === "product") return <Link2 size={15} />;
  if (type === "unknown") return <AlertTriangle size={15} />;
  return <Paperclip size={15} />;
}

function PresenceCollisionBanner({ presences }: { presences: SocialInboxPresence[] }) {
  if (!presences.length) return null;

  const activeReplyPresence =
    presences.find((presence) => presence.activity === "replying") ||
    presences.find((presence) => presence.activity === "typing") ||
    null;
  const primary = activeReplyPresence || presences[0];
  const isReplyConflict = primary.activity === "replying" || primary.activity === "typing";
  const name = primary.display_name || "Another teammate";
  const action =
    primary.activity === "replying"
      ? "is replying now"
      : primary.activity === "typing"
        ? "is typing"
        : "is viewing this conversation";

  return (
    <div
      className={[
        "mb-4 border p-3 text-sm leading-6",
        isReplyConflict
          ? "border-signal-warning bg-hp-inset text-hp-ink"
          : "border-hp-rule bg-hp-inset text-hp-muted",
      ].join(" ")}
    >
      <div className="flex min-w-0 items-start gap-3">
        <UserRound
          size={16}
          className={isReplyConflict ? "mt-1 shrink-0 text-signal-warning" : "mt-1 shrink-0 text-hp-muted"}
        />
        <div className="min-w-0">
          <p className="font-medium text-hp-ink">
            {name} {action}.
          </p>
          <p className="text-xs leading-5 text-hp-muted">
            Advisory collision warning only. Assignment and manager override still control ownership.
            {presences.length > 1 ? ` ${presences.length} teammates active.` : ""}
          </p>
        </div>
      </div>
    </div>
  );
}

function formatBytes(value: number) {
  if (!Number.isFinite(value) || value <= 0) return "";
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${Math.round(value / 1024)} KB`;
  return `${(value / (1024 * 1024)).toFixed(1)} MB`;
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
  savedReplyMutationState,
  onCreateSendAttempt,
  onQueueSendAttempt,
  onRetrySendAttempt,
  onCreateSavedReply,
}: {
  item: QueueDisplayItem | null;
  draft: string;
  onDraftChange: (value: string) => void;
  canSendInboxReply: boolean;
  mutationState: ReplyAttemptMutationLoadState;
  savedReplyMutationState: SavedReplyMutationLoadState;
  onCreateSendAttempt: (conversationId: string, input: MetaInboxSendAttemptInput) => void;
  onQueueSendAttempt: (conversationId: string, input: MetaInboxQueueSendAttemptInput) => void;
  onRetrySendAttempt: (conversationId: string, input: MetaInboxRetrySendAttemptInput) => void;
  onCreateSavedReply: (input: MetaInboxSavedReplyInput) => void;
}) {
  const [savedReplyTitle, setSavedReplyTitle] = useState("");
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
      idempotencyKey: newSendAttemptIdempotencyKey(conversationId, draft),
    });
  }

  function savePersonalDraft() {
    if (!item || !draft.trim()) return;
    onCreateSavedReply({
      title: savedReplyTitle.trim() || defaultSavedReplyTitle(draft),
      body: draft,
      visibility: "personal",
      queueCategoryKey: item.queueCategoryKey,
      sourceChannel: item.sourceChannel,
      language: "en",
      leadQuality: item.inboxConversation?.lead_quality as MetaInboxSavedReplyInput["leadQuality"],
    });
    setSavedReplyTitle("");
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

      <div className="border border-hp-rule bg-hp-card p-3">
        <div className="mb-3 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-hp-ink">
            <Tags size={15} />
            <span className="text-[10px] uppercase tracking-[0.14em]">Saved Replies</span>
          </div>
          <span className="text-[10px] uppercase tracking-[0.14em] text-hp-muted">
            {item?.savedReplies.length || 0} match
          </span>
        </div>
        {item?.savedReplies.length ? (
          <div className="grid gap-2">
            {item.savedReplies.slice(0, 4).map((savedReply) => (
              <div
                key={savedReply.id}
                className="flex flex-col gap-2 border border-hp-rule bg-hp-inset p-3 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-hp-ink">{savedReply.title}</p>
                  <p className="mt-1 line-clamp-2 text-xs leading-5 text-hp-muted">
                    {savedReply.body}
                  </p>
                  <p className="mt-2 text-[10px] uppercase tracking-[0.14em] text-hp-muted">
                    {savedReply.visibility === "personal" ? "Personal Draft" : "Approved Shared"}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => onDraftChange(savedReply.body)}
                  disabled={!canSendInboxReply}
                  className="flex h-9 shrink-0 items-center justify-center gap-2 border border-hp-rule px-3 text-xs font-medium text-hp-ink transition hover:border-hp-ink disabled:opacity-50"
                >
                  <Pencil size={13} />
                  Use
                </button>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm leading-6 text-hp-muted">
            No saved replies match this queue, source channel, lead quality, and language yet.
          </p>
        )}
        <div className="mt-3 grid gap-2 border-t border-hp-rule pt-3 sm:grid-cols-[minmax(0,1fr)_auto]">
          <input
            value={savedReplyTitle}
            onChange={(event) => setSavedReplyTitle(event.target.value)}
            disabled={!item || !canSendInboxReply}
            placeholder="Draft name"
            className="h-10 min-w-0 border border-hp-rule bg-hp-inset px-3 text-sm outline-none placeholder:text-hp-muted focus:border-hp-ink disabled:opacity-70"
          />
          <button
            type="button"
            onClick={savePersonalDraft}
            disabled={
              !item ||
              !canSendInboxReply ||
              !draft.trim() ||
              savedReplyMutationState.status === "saving"
            }
            className="flex min-h-10 shrink-0 items-center justify-center gap-2 border border-hp-ink px-3 text-xs font-medium text-hp-ink transition hover:bg-hp-ink hover:text-hp-foundation disabled:opacity-50"
          >
            {savedReplyMutationState.status === "saving" ? (
              <Loader2 size={13} className="animate-spin" />
            ) : (
              <Plus size={13} />
            )}
            Save Personal Draft
          </button>
        </div>
        <p className="mt-2 text-xs leading-5 text-hp-muted">
          Shared templates require sales lead/admin approval before sales can use them.
        </p>
        {savedReplyMutationState.message ? (
          <p
            className={`mt-2 text-xs leading-5 ${
              savedReplyMutationState.status === "error"
                ? "text-signal-danger"
                : savedReplyMutationState.status === "saved"
                  ? "text-signal-positive"
                  : "text-hp-muted"
            }`}
          >
            {savedReplyMutationState.message}
          </p>
        ) : null}
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

function workflowPanelKey(item: QueueDisplayItem | null) {
  const conversation = item?.inboxConversation;
  if (!conversation) return "empty-workflow";

  return [
    "workflow",
    conversation.id,
    item?.queueCategoryKey || "",
    item?.conversationStatus || "",
    conversation.lead_quality || "",
    conversation.lead_quality_reason_tags.join(","),
    conversation.inbox_outcome || "",
    conversation.inbox_lost_reason || "",
    conversation.follow_up_at || "",
  ].join(":");
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
  const [leadQualityDraft, setLeadQualityDraft] = useState(conversation?.lead_quality || "");
  const [reasonTagDrafts, setReasonTagDrafts] = useState<string[]>(
    conversation?.lead_quality_reason_tags || [],
  );
  const [outcomeDraft, setOutcomeDraft] = useState<SocialInboxConversation["inbox_outcome"]>(
    conversation?.inbox_outcome || "no_outcome_yet",
  );
  const [lostReasonDraft, setLostReasonDraft] = useState(conversation?.inbox_lost_reason || "");
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

function AuditTrailPanel({ item }: { item: QueueDisplayItem | null }) {
  const events = (item?.conversationEvents || [])
    .slice()
    .sort((a, b) => String(b.event_at || "").localeCompare(String(a.event_at || "")))
    .slice(0, 6);

  return (
    <div className="mt-5 border border-hp-rule bg-hp-card p-4">
      <div className="mb-3 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-hp-ink">
          <ShieldCheck size={17} />
          <span className="text-[11px] uppercase tracking-[0.14em]">Audit Trail</span>
        </div>
        <span className="shrink-0 text-[10px] uppercase tracking-[0.14em] text-hp-muted">
          {events.length ? `${events.length} recent` : "None"}
        </span>
      </div>

      {events.length ? (
        <div className="space-y-2">
          {events.map((event) => (
            <div key={event.id} className="border border-hp-rule bg-hp-inset p-3">
              <div className="flex min-w-0 items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-xs font-medium text-hp-ink">{auditEventLabel(event)}</p>
                  <p className="mt-1 break-words text-xs leading-5 text-hp-muted">
                    {auditEventSummary(event)}
                  </p>
                </div>
                <span className="shrink-0 text-[10px] uppercase tracking-[0.14em] text-hp-muted">
                  {formatDateLabel(event.event_at)}
                </span>
              </div>
              <p className="mt-2 text-[10px] uppercase tracking-[0.14em] text-hp-muted">
                {event.actor_user_id ? `Actor ${shortIdentifier(event.actor_user_id)}` : "System"}
              </p>
            </div>
          ))}
        </div>
      ) : (
        <p className="text-sm leading-6 text-hp-muted">
          No audit events recorded for this conversation yet.
        </p>
      )}
      <p className="mt-3 border-t border-hp-rule pt-3 text-xs leading-5 text-hp-muted">
        Sales can see accessible conversation audit history. Raw Meta payload stays hidden from UI.
      </p>
    </div>
  );
}

function NotesCoachingPanel({
  item,
  canManageInboxState,
  canCreateManagerCoaching,
  mutationState,
  onCreateNote,
}: {
  item: QueueDisplayItem | null;
  canManageInboxState: boolean;
  canCreateManagerCoaching: boolean;
  mutationState: NoteMutationLoadState;
  onCreateNote: (conversationId: string, input: MetaInboxConversationNoteInput) => Promise<void>;
}) {
  const [body, setBody] = useState("");
  const [noteType, setNoteType] =
    useState<SocialInboxConversationNote["note_type"]>("internal_note");
  const conversationId = item?.inboxConversation?.id || null;
  const notes = (item?.notes || [])
    .slice()
    .sort((a, b) => String(b.created_at || "").localeCompare(String(a.created_at || "")))
    .slice(0, 5);
  const canSubmit = Boolean(conversationId && canManageInboxState && body.trim());

  async function submitNote() {
    if (!conversationId || !canSubmit) return;
    await onCreateNote(conversationId, {
      noteType,
      body,
      mentionUserIds: [],
    });
    setBody("");
    setNoteType("internal_note");
  }

  return (
    <div className="mt-5 border border-hp-rule bg-hp-card p-4">
      <div className="mb-3 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-hp-ink">
          <Pencil size={17} />
          <span className="text-[11px] uppercase tracking-[0.14em]">Notes & Coaching</span>
        </div>
        <span className="shrink-0 text-[10px] uppercase tracking-[0.14em] text-hp-muted">
          {notes.length ? `${notes.length} recent` : "None"}
        </span>
      </div>

      {notes.length ? (
        <div className="space-y-2">
          {notes.map((note) => (
            <div key={note.id} className="border border-hp-rule bg-hp-inset p-3">
              <div className="flex min-w-0 items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-xs font-medium text-hp-ink">
                    {noteTypeLabel(note.note_type)}
                  </p>
                  <p className="mt-1 break-words text-xs leading-5 text-hp-muted">
                    {note.body}
                  </p>
                </div>
                <span className="shrink-0 text-[10px] uppercase tracking-[0.14em] text-hp-muted">
                  {formatDateLabel(note.created_at)}
                </span>
              </div>
              <p className="mt-2 text-[10px] uppercase tracking-[0.14em] text-hp-muted">
                {note.created_by ? `By ${shortIdentifier(note.created_by)}` : "By system"}
                {note.mention_user_ids.length
                  ? ` · ${note.mention_user_ids.length} mention${
                    note.mention_user_ids.length === 1 ? "" : "s"
                  }`
                  : ""}
              </p>
            </div>
          ))}
        </div>
      ) : (
        <p className="text-sm leading-6 text-hp-muted">
          No notes or coaching comments recorded for this conversation yet.
        </p>
      )}

      <div className="mt-4 border-t border-hp-rule pt-4">
        {canManageInboxState ? (
          <div className="space-y-3">
            <label className="block text-[10px] uppercase tracking-[0.14em] text-hp-muted">
              Note type
              <select
                value={noteType}
                onChange={(event) =>
                  setNoteType(event.target.value as SocialInboxConversationNote["note_type"])
                }
                className="mt-1 w-full border border-hp-rule bg-white px-3 py-2 text-sm normal-case tracking-normal text-hp-ink"
              >
                <option value="internal_note">Internal Note</option>
                {canCreateManagerCoaching ? (
                  <option value="manager_coaching">Manager Coaching</option>
                ) : null}
              </select>
            </label>
            <label className="block text-[10px] uppercase tracking-[0.14em] text-hp-muted">
              Add note
              <textarea
                value={body}
                onChange={(event) => setBody(event.target.value)}
                rows={3}
                maxLength={4000}
                placeholder="Add internal context, @mention follow-up, or coaching..."
                className="mt-1 w-full resize-none border border-hp-rule bg-white px-3 py-2 text-sm normal-case leading-5 tracking-normal text-hp-ink placeholder:text-hp-muted/70"
              />
            </label>
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => void submitNote()}
                disabled={!canSubmit || mutationState.status === "saving"}
                className="inline-flex min-h-9 items-center gap-2 border border-hp-ink bg-hp-ink px-3 py-2 text-xs uppercase tracking-[0.12em] text-white disabled:cursor-not-allowed disabled:opacity-50"
              >
                {mutationState.status === "saving" ? (
                  <Loader2 size={13} className="animate-spin" />
                ) : (
                  <Plus size={13} />
                )}
                <span className="whitespace-nowrap">Add Note</span>
              </button>
              {mutationState.message ? (
                <span
                  className={`min-w-0 break-words text-xs leading-5 ${
                    mutationState.status === "error" ? "text-red-600" : "text-hp-muted"
                  }`}
                >
                  {mutationState.message}
                </span>
              ) : null}
            </div>
            <p className="text-xs leading-5 text-hp-muted">
              Internal notes and coaching comments are never sent to the customer. Use @name
              for manager follow-up; mention alerts can be added later.
            </p>
          </div>
        ) : (
          <p className="text-xs leading-5 text-hp-muted">
            Notes are read-only for this role. Internal notes and coaching comments are never
            sent to the customer.
          </p>
        )}
      </div>
    </div>
  );
}

function QaScorecardPanel({
  item,
  canManageInboxState,
  canCreateManagerCoaching,
  mutationState,
  onCreateScorecard,
}: {
  item: QueueDisplayItem | null;
  canManageInboxState: boolean;
  canCreateManagerCoaching: boolean;
  mutationState: QaScorecardMutationLoadState;
  onCreateScorecard: (conversationId: string, input: MetaInboxQaScorecardInput) => Promise<void>;
}) {
  const [sendAttemptId, setSendAttemptId] = useState("");
  const [scores, setScores] = useState<Record<QaScoreKey, number>>({
    toneScore: 4,
    completenessScore: 4,
    accuracyScore: 4,
    nextStepScore: 4,
    speedScore: 4,
    policyComplianceScore: 4,
  });
  const [coachingNote, setCoachingNote] = useState("");
  const conversationId = item?.inboxConversation?.id || null;
  const scorecards = (item?.qaScorecards || [])
    .slice()
    .sort((a, b) => String(b.created_at || "").localeCompare(String(a.created_at || "")))
    .slice(0, 4);
  const canCreate = Boolean(conversationId && canManageInboxState && canCreateManagerCoaching);

  async function submitScorecard() {
    if (!conversationId || !canCreate) return;
    await onCreateScorecard(conversationId, {
      sendAttemptId: sendAttemptId || null,
      ...scores,
      coachingNote,
    });
    setSendAttemptId("");
    setCoachingNote("");
  }

  return (
    <div className="mt-5 border border-hp-rule bg-hp-card p-4">
      <div className="mb-3 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-hp-ink">
          <ShieldCheck size={17} />
          <span className="text-[11px] uppercase tracking-[0.14em]">QA Scorecards</span>
        </div>
        <span className="shrink-0 text-[10px] uppercase tracking-[0.14em] text-hp-muted">
          {scorecards.length ? `${scorecards.length} recent` : "None"}
        </span>
      </div>

      {scorecards.length ? (
        <div className="space-y-2">
          {scorecards.map((scorecard) => (
            <div key={scorecard.id} className="border border-hp-rule bg-hp-inset p-3">
              <div className="flex min-w-0 items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-xs font-medium text-hp-ink">
                    Overall {scorecard.overall_score.toFixed(1)} / 5
                  </p>
                  <p className="mt-1 break-words text-xs leading-5 text-hp-muted">
                    {scorecard.coaching_note || "No coaching note."}
                  </p>
                </div>
                <span className="shrink-0 text-[10px] uppercase tracking-[0.14em] text-hp-muted">
                  {formatDateLabel(scorecard.created_at)}
                </span>
              </div>
              <p className="mt-2 text-[10px] uppercase tracking-[0.14em] text-hp-muted">
                By {shortIdentifier(scorecard.reviewed_by)}
                {scorecard.reviewed_user_id
                  ? ` · For ${shortIdentifier(scorecard.reviewed_user_id)}`
                  : ""}
              </p>
            </div>
          ))}
        </div>
      ) : (
        <p className="text-sm leading-6 text-hp-muted">
          No QA scorecards recorded for this conversation yet.
        </p>
      )}

      <div className="mt-4 border-t border-hp-rule pt-4">
        {canCreate ? (
          <div className="space-y-3">
            <label className="block text-[10px] uppercase tracking-[0.14em] text-hp-muted">
              Review target
              <select
                value={sendAttemptId}
                onChange={(event) => setSendAttemptId(event.target.value)}
                className="mt-1 w-full border border-hp-rule bg-white px-3 py-2 text-sm normal-case tracking-normal text-hp-ink"
              >
                <option value="">Conversation overall</option>
                {(item?.sendAttempts || []).map((attempt) => (
                  <option key={attempt.id} value={attempt.id}>
                    {formatDateLabel(attempt.created_at)} · {attempt.status}
                  </option>
                ))}
              </select>
            </label>
            <div className="grid grid-cols-2 gap-2">
              {QA_SCORE_FIELDS.map((field) => (
                <label
                  key={field.key}
                  className="block text-[10px] uppercase tracking-[0.14em] text-hp-muted"
                >
                  {field.label}
                  <select
                    value={scores[field.key]}
                    onChange={(event) =>
                      setScores((current) => ({
                        ...current,
                        [field.key]: Number(event.target.value),
                      }))
                    }
                    className="mt-1 w-full border border-hp-rule bg-white px-2 py-2 text-sm normal-case tracking-normal text-hp-ink"
                  >
                    {[5, 4, 3, 2, 1].map((score) => (
                      <option key={score} value={score}>
                        {score}
                      </option>
                    ))}
                  </select>
                </label>
              ))}
            </div>
            <label className="block text-[10px] uppercase tracking-[0.14em] text-hp-muted">
              Coaching note
              <textarea
                value={coachingNote}
                onChange={(event) => setCoachingNote(event.target.value)}
                rows={3}
                maxLength={4000}
                placeholder="Optional coaching note for the sales reply..."
                className="mt-1 w-full resize-none border border-hp-rule bg-white px-3 py-2 text-sm normal-case leading-5 tracking-normal text-hp-ink placeholder:text-hp-muted/70"
              />
            </label>
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => void submitScorecard()}
                disabled={mutationState.status === "saving"}
                className="inline-flex min-h-9 items-center gap-2 border border-hp-ink bg-hp-ink px-3 py-2 text-xs uppercase tracking-[0.12em] text-white disabled:cursor-not-allowed disabled:opacity-50"
              >
                {mutationState.status === "saving" ? (
                  <Loader2 size={13} className="animate-spin" />
                ) : (
                  <Plus size={13} />
                )}
                <span className="whitespace-nowrap">Add Scorecard</span>
              </button>
              {mutationState.message ? (
                <span
                  className={`min-w-0 break-words text-xs leading-5 ${
                    mutationState.status === "error" ? "text-red-600" : "text-hp-muted"
                  }`}
                >
                  {mutationState.message}
                </span>
              ) : null}
            </div>
            <p className="text-xs leading-5 text-hp-muted">
              QA scorecards are manager coaching only and never customer-visible.
            </p>
          </div>
        ) : (
          <p className="text-xs leading-5 text-hp-muted">
            QA scorecards are manager coaching only. Sales can view accessible QA context,
            but only sales lead/admin can create scorecards.
          </p>
        )}
      </div>
    </div>
  );
}

function auditEventLabel(event: SocialInboxConversationEvent) {
  const labels: Record<string, string> = {
    conversation_created: "Conversation Created",
    assignment_changed: "Assignment Changed",
    status_changed: "Status Changed",
    lead_quality_changed: "Lead Quality Changed",
    inbox_outcome_changed: "Inbox Outcome Changed",
    routing_changed: "Routing Changed",
    follow_up_changed: "Follow-Up Changed",
    contact_method_changed: "Contact Method Changed",
    comment_action: "Comment Action",
    send_attempt: "Send Attempt",
    note_added: "Internal Note",
    qa_scorecard_added: "QA Scorecard",
  };
  return labels[event.event_type] || titleCase(event.event_type);
}

function auditEventSummary(event: SocialInboxConversationEvent) {
  const next = event.new_value || {};
  const metadata = event.metadata || {};
  const reason = auditString(metadata.changeReason) || auditString(metadata.reasonNote);

  if (event.event_type === "routing_changed") {
    return joinAuditParts([
      `Queue ${auditQueueLabel(next.queueCategoryKey)}`,
      reason,
    ]);
  }
  if (event.event_type === "status_changed") {
    return joinAuditParts([
      `Status ${auditStatusLabel(next.conversationStatus)}`,
      reason,
    ]);
  }
  if (event.event_type === "assignment_changed") {
    return joinAuditParts([
      auditString(next.assignedUserId)
        ? `Assigned to ${shortIdentifier(auditString(next.assignedUserId)!)}`
        : "Returned to team queue",
      reason,
    ]);
  }
  if (event.event_type === "lead_quality_changed") {
    return joinAuditParts([
      `Quality ${auditValue(next.leadQuality)}`,
      auditArray(next.reasonTags || next.leadQualityReasonTags),
      reason,
    ]);
  }
  if (event.event_type === "inbox_outcome_changed") {
    return joinAuditParts([
      `Outcome ${auditOutcomeLabel(next.inboxOutcome)}`,
      auditValue(next.inboxLostReason),
      reason,
    ]);
  }
  if (event.event_type === "follow_up_changed") {
    return joinAuditParts([`Follow-up ${auditValue(next.followUpAt)}`, reason]);
  }
  if (event.event_type === "contact_method_changed") {
    return joinAuditParts([
      titleCase(auditString(next.action) || "contact updated"),
      auditValue(next.type || next.contactMethodType),
      reason,
    ]);
  }
  if (event.event_type === "send_attempt") {
    return joinAuditParts([
      titleCase(auditString(next.status) || "send attempt recorded"),
      auditValue(next.messagingType || next.messaging_type),
      reason,
    ]);
  }
  if (event.event_type === "note_added") {
    const mentionCount = auditNumber(next.mentionCount) || 0;
    const noteId = auditString(next.noteId);
    return joinAuditParts([
      noteTypeLabel(
        auditString(next.noteType) === "manager_coaching" ? "manager_coaching" : "internal_note",
      ),
      noteId ? `Note ${shortIdentifier(noteId)}` : null,
      mentionCount ? `${mentionCount} mention${mentionCount === 1 ? "" : "s"}` : null,
      reason,
    ]);
  }
  if (event.event_type === "qa_scorecard_added") {
    return joinAuditParts([
      `QA ${auditValue(next.overallScore) || "Recorded"}`,
      auditString(next.qaScorecardId)
        ? `Scorecard ${shortIdentifier(auditString(next.qaScorecardId)!)}`
        : null,
      auditString(next.reviewedUserId)
        ? `For ${shortIdentifier(auditString(next.reviewedUserId)!)}`
        : null,
      reason,
    ]);
  }
  if (event.event_type === "comment_action") {
    return joinAuditParts([
      titleCase(auditString(next.actionType) || "comment action"),
      titleCase(auditString(next.status) || ""),
      reason,
    ]);
  }
  return joinAuditParts([
    auditValue(next.conversationStatus || next.queueCategoryKey || next.status),
    reason,
  ]);
}

function noteTypeLabel(value: SocialInboxConversationNote["note_type"]) {
  return value === "manager_coaching" ? "Manager Coaching" : "Internal Note";
}

function auditQueueLabel(value: unknown) {
  return metaInboxVocabularyLabel(
    META_INBOX_QUEUE_CATEGORIES,
    auditString(value) as MetaInboxQueueCategoryKey,
    auditValue(value) || "Unknown",
  );
}

function auditStatusLabel(value: unknown) {
  return metaInboxVocabularyLabel(
    META_INBOX_CONVERSATION_STATUSES,
    auditString(value) as SocialInboxConversation["conversation_status"],
    auditValue(value) || "Unknown",
  );
}

function auditOutcomeLabel(value: unknown) {
  return metaInboxVocabularyLabel(META_INBOX_OUTCOMES, auditString(value), auditValue(value) || "Unknown");
}

function joinAuditParts(parts: Array<string | null | undefined>) {
  return parts.filter((part): part is string => Boolean(part && part.trim())).join(" · ") || "Updated";
}

function auditString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function auditArray(value: unknown) {
  return Array.isArray(value) && value.length ? value.map(auditValue).join(", ") : null;
}

function auditValue(value: unknown) {
  if (typeof value === "string" && value.trim()) return titleCase(value);
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  return null;
}

function auditNumber(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() && Number.isFinite(Number(value))) {
    return Number(value);
  }
  return null;
}

function titleCase(value: string | null) {
  if (!value) return "";
  return value
    .replaceAll("_", " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function shortIdentifier(value: string) {
  return value.length <= 12 ? value : `${value.slice(0, 8)}...`;
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

function upsertCommentAction(
  data: SocialInboxData,
  commentAction: SocialInboxCommentAction,
): SocialInboxData {
  const withoutExisting = (data.commentActions || []).filter((action) => action.id !== commentAction.id);
  return {
    ...data,
    commentActions: [commentAction, ...withoutExisting],
  };
}

function upsertSavedReply(
  data: SocialInboxData,
  savedReply: SocialInboxSavedReply,
): SocialInboxData {
  const withoutExisting = (data.savedReplies || []).filter((reply) => reply.id !== savedReply.id);
  return {
    ...data,
    savedReplies: [savedReply, ...withoutExisting],
  };
}

function upsertConversationNote(
  data: SocialInboxData,
  note: SocialInboxConversationNote,
): SocialInboxData {
  const withoutExisting = (data.notes || []).filter((existing) => existing.id !== note.id);
  return {
    ...data,
    notes: [note, ...withoutExisting],
  };
}

function upsertQaScorecard(
  data: SocialInboxData,
  qaScorecard: SocialInboxQaScorecard,
): SocialInboxData {
  const withoutExisting = (data.qaScorecards || []).filter(
    (existing) => existing.id !== qaScorecard.id,
  );
  return {
    ...data,
    qaScorecards: [qaScorecard, ...withoutExisting],
  };
}

function upsertConversationEvents(
  data: SocialInboxData,
  events: SocialInboxConversationEvent[],
): SocialInboxData {
  if (!events.length) return data;
  return {
    ...data,
    conversationEvents: mergeConversationEvents(data.conversationEvents || [], events),
  };
}

function mergeConversationEvents(
  current: SocialInboxConversationEvent[],
  events: SocialInboxConversationEvent[],
) {
  if (!events.length) return current;
  const byId = new Map<string, SocialInboxConversationEvent>();
  for (const event of [...events, ...current]) {
    byId.set(event.id, event);
  }
  return Array.from(byId.values()).sort((a, b) =>
    String(b.event_at || "").localeCompare(String(a.event_at || "")),
  );
}

function newSendAttemptIdempotencyKey(conversationId: string, draft: string) {
  return stableIdempotencyKey("send", conversationId, [draft]);
}

function defaultSavedReplyTitle(draft: string) {
  const normalized = draft.trim().replace(/\s+/g, " ");
  return normalized.length > 48 ? `${normalized.slice(0, 45)}...` : normalized;
}

function newCommentActionIdempotencyKey(
  conversationId: string,
  actionType: NonNullable<MetaInboxCommentActionInput["actionType"]>,
  messageText: string | null,
  reasonNote: string | null,
) {
  return stableIdempotencyKey("comment", conversationId, [
    actionType,
    messageText || "",
    reasonNote || "",
  ]);
}

function stableIdempotencyKey(scope: string, conversationId: string, parts: string[]) {
  const payload = parts.map((part) => part.trim().replace(/\s+/g, " ")).join("\u001f");
  return `${conversationId}:${scope}:${stableStringHash(payload)}`;
}

function stableStringHash(value: string) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return `${value.length.toString(36)}-${(hash >>> 0).toString(36)}`;
}

function commentActionLabel(actionType: SocialInboxCommentAction["action_type"]) {
  if (actionType === "public_reply") return "Public reply";
  if (actionType === "private_reply") return "Private DM";
  if (actionType === "like") return "Like";
  if (actionType === "hide") return "Hide";
  return "Delete";
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

function ManagerSnapshotPanel({
  dashboard,
}: {
  dashboard: ReturnType<typeof buildMetaInboxManagerDashboard>;
}) {
  const metrics = dashboard.metrics;
  const topQueues = dashboard.byQueue.slice(0, 3);
  const responseBuckets = dashboard.responseAgeBuckets.filter((bucket) => bucket.count > 0);
  const workloadRows = dashboard.byAssignee.slice(0, 3);
  const sourceRows = dashboard.bySourceChannel.slice(0, 3);
  const attributionRows = dashboard.byCampaignUmbrella.slice(0, 3);

  return (
    <div className="mt-5 border border-hp-rule p-4">
      <div className="mb-3 flex items-center justify-between gap-3 text-hp-ink">
        <div className="flex items-center gap-2">
          <Clock size={17} />
          <span className="text-[11px] uppercase tracking-[0.14em]">Manager Snapshot</span>
        </div>
        <span className="shrink-0 text-[10px] uppercase tracking-[0.14em] text-hp-muted">
          {dashboard.range.label}
        </span>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <ManagerMetric label="Needs Reply" value={metrics.needsReply} />
        <ManagerMetric label="Missed Follow-Up" value={metrics.missedFollowUps} />
        <ManagerMetric label="Failed Sends" value={metrics.failedSends} />
        <ManagerMetric label="Retry Backlog" value={metrics.retryBacklog} />
        <ManagerMetric label="Unassigned" value={metrics.unassigned} />
        <ManagerMetric label="Label Gaps" value={metrics.missingLeadQuality} />
        <ManagerMetric label="Stale" value={metrics.staleConversations} />
        <ManagerMetric label="QA Reviews" value={metrics.qaScorecardsReviewed} />
        <ManagerMetric
          label="Label Complete"
          value={formatPercentMetric(metrics.labelCompletenessPercent)}
        />
        <ManagerMetric label="Avg QA" value={formatQaMetric(metrics.averageQaScore)} />
      </div>
      <div className="mt-3 border-t border-hp-rule pt-3 text-sm leading-6 text-hp-muted">
        <p>
          Avg first response:{" "}
          <span className="text-hp-ink">
            {formatMinutesMetric(metrics.averageFirstResponseMinutes)}
          </span>
        </p>
        <p>
          Closeout incomplete:{" "}
          <span className="text-hp-ink">{metrics.closeoutIncomplete}</span>
        </p>
      </div>
      <ManagerRows
        title="Response Age"
        emptyText="No open replies"
        rows={(responseBuckets.length ? responseBuckets : dashboard.responseAgeBuckets.slice(0, 1)).map(
          (bucket) => ({
            key: bucket.key,
            label: bucket.label,
            value: String(bucket.count),
          }),
        )}
      />
      <ManagerRows
        title="Workload"
        emptyText="No workload"
        rows={workloadRows.map((row) => ({
          key: row.assigneeUserId || "unassigned",
          label: row.label,
          value: `${row.needsReply} reply · ${row.failedSends} failed`,
        }))}
      />
      <ManagerRows
        title="Source Health"
        emptyText="No sources"
        rows={sourceRows.map((row) => ({
          key: row.sourceChannelKey,
          label: row.label,
          value: `${row.needsReply} reply · ${row.failedSends} failed`,
        }))}
      />
      <ManagerRows
        title="Attribution"
        emptyText="No attribution"
        rows={attributionRows.map((row) => ({
          key: row.key,
          label: row.label,
          value: `${row.needsReply} reply · ${row.totalConversations} total`,
        }))}
      />
      {topQueues.length ? (
        <div className="mt-3 space-y-2 border-t border-hp-rule pt-3">
          {topQueues.map((queue) => (
            <div
              key={queue.queueCategoryKey}
              className="flex min-w-0 items-center justify-between gap-3 text-xs leading-5"
            >
              <span className="min-w-0 truncate text-hp-ink">{queue.label}</span>
              <span className="shrink-0 text-hp-muted">
                {queue.needsReply} reply · {queue.missedFollowUps} follow-up
              </span>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function ManagerMetric({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="border border-hp-rule bg-hp-inset p-3">
      <p className="text-[9px] uppercase tracking-[0.14em] text-hp-muted">{label}</p>
      <p className="mt-1 font-title text-2xl leading-none text-hp-ink">{value}</p>
    </div>
  );
}

function ManagerRows({
  title,
  rows,
  emptyText,
}: {
  title: string;
  rows: { key: string; label: string; value: string }[];
  emptyText: string;
}) {
  return (
    <div className="mt-3 space-y-2 border-t border-hp-rule pt-3">
      <p className="text-[10px] uppercase tracking-[0.14em] text-hp-muted">{title}</p>
      {rows.length ? (
        rows.map((row) => (
          <div
            key={row.key}
            className="flex min-w-0 items-center justify-between gap-3 text-xs leading-5"
          >
            <span className="min-w-0 truncate text-hp-ink">{row.label}</span>
            <span className="shrink-0 text-hp-muted">{row.value}</span>
          </div>
        ))
      ) : (
        <p className="text-xs leading-5 text-hp-muted">{emptyText}</p>
      )}
    </div>
  );
}

function formatMinutesMetric(value: number | null) {
  if (value === null) return "Not enough data";
  if (value < 60) return `${value}m`;
  const hours = Math.floor(value / 60);
  const minutes = value % 60;
  return minutes ? `${hours}h ${minutes}m` : `${hours}h`;
}

function formatPercentMetric(value: number | null) {
  return value === null ? "N/A" : `${value}%`;
}

function formatQaMetric(value: number | null) {
  return value === null ? "N/A" : value.toFixed(1);
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

function isCommentActionErrorPayload(
  value: { commentAction: SocialInboxCommentAction; events: unknown[] } | { error: string },
): value is { error: string } {
  return "error" in value;
}

function isSavedReplyErrorPayload(
  value: { savedReply: SocialInboxSavedReply } | { error: string },
): value is { error: string } {
  return "error" in value;
}

function isNoteErrorPayload(
  value:
    | { note: SocialInboxConversationNote; events: unknown[] }
    | { error: string },
): value is { error: string } {
  return "error" in value;
}

function isQaScorecardErrorPayload(
  value:
    | { qaScorecard: SocialInboxQaScorecard; events: unknown[] }
    | { error: string },
): value is { error: string } {
  return "error" in value;
}

function isPresenceErrorPayload(
  value:
    | { presence: SocialInboxPresence | null; presences: SocialInboxPresence[] }
    | { error: string },
): value is { error: string } {
  return "error" in value;
}
