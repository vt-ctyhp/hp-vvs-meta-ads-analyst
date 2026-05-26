"use client";

import {
  AlertTriangle,
  Camera,
  CheckCircle2,
  Clock,
  EyeOff,
  Heart,
  Link2,
  Loader2,
  Mail,
  MessageCircle,
  Paperclip,
  Pencil,
  Plus,
  Send,
  RefreshCw,
  Tags,
  Trash2,
  UserRound,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";

import { translateError } from "@/lib/glossary";
import { buildMetaInboxManagerDashboard } from "@/lib/meta-inbox-manager-dashboard";
import {
  buildMetaInboxQueueItems,
  type MetaInboxQueueDisplayItem,
} from "@/lib/meta-inbox-queue-view";
import {
  clearConversationTextState,
  readConversationTextState,
  resolveReplyWindowState,
  writeConversationTextState,
  type ConversationTextState,
} from "@/lib/social-inbox-ui-freshness";
import { InboxEyebrow } from "./v2/inbox/inbox-eyebrow";
import { InboxLayoutShell } from "./v2/inbox/inbox-layout-shell";
import { InboxStatusSentence } from "./v2/inbox/inbox-status-sentence";
import { ConversationPane } from "./v2/inbox/conversation-pane";
import { AuditDrawerPanel } from "./v2/inbox/audit-drawer-panel";
import { DetailsDrawerPanel } from "./v2/inbox/details-drawer-panel";
import { DrawerOverlay } from "./v2/inbox/drawer-overlay";
import { NotesDrawerPanel } from "./v2/inbox/notes-drawer-panel";
import { QaDrawerPanel } from "./v2/inbox/qa-drawer-panel";
import { QueueRail, visibleQueueCategories } from "./v2/inbox/queue-rail";
import { useDrawerState } from "./v2/inbox/use-drawer-state";
import {
  useInboxFilters,
  type ItemTypeFilter,
  type SourceChannelFilter,
  type StatusFilter,
} from "./v2/inbox/use-inbox-filters";
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
  conversationId: string | null;
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
  conversationId: null,
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
  const [inboxData, setInboxData] = useState(initialData);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncStatus, setSyncStatus] = useState<string | null>(dataError);
  const [replyDraftByConversationId, setReplyDraftByConversationId] =
    useState<ConversationTextState>({});
  const [replyInstructionByConversationId, setReplyInstructionByConversationId] =
    useState<ConversationTextState>({});
  const [replyWindowNow, setReplyWindowNow] = useState(() => Date.now());
  const selectedConversationIdRef = useRef<string | null>(null);
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
  const {
    itemTypeFilter,
    setItemTypeFilter,
    statusFilter,
    setStatusFilter,
    setQueueCategoryFilter,
    effectiveQueueCategoryFilter,
    sourceChannelFilter,
    setSourceChannelFilter,
    campaignUmbrellaFilter,
    setCampaignUmbrellaFilter,
    query,
    setQuery,
    filteredQueue,
    attributionFilterOptions,
    filtersDirty,
    reset: resetInboxFilters,
  } = useInboxFilters(queue, { visibleQueueKeys });
  const drawerState = useDrawerState();
  const handleSelectQueueItem = useCallback(
    (itemId: string) => {
      setSelectedId(itemId);
      drawerState.close();
    },
    [drawerState],
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
  const selectedRootComment = useMemo(() => {
    if (selectedItem?.type !== "comment") return null;
    return (
      selectedComments.find((comment) => comment.comment_id === selectedItem.sourceId) ||
      selectedComments.find((comment) => !comment.parent_comment_id) ||
      null
    );
  }, [selectedComments, selectedItem]);
  const activeReplyDraft = readConversationTextState(
    replyDraftByConversationId,
    selectedConversationId,
  );
  const activeReplyInstruction = readConversationTextState(
    replyInstructionByConversationId,
    selectedConversationId,
  );
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
  const selectedSavedReplyMutationState =
    savedReplyMutationState.conversationId === selectedConversationId
      ? savedReplyMutationState
      : IDLE_SAVED_REPLY_STATE;

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
    selectedConversationIdRef.current = selectedConversationId;
    setReplyWindowNow(Date.now());
  }, [selectedConversationId]);

  useEffect(() => {
    const intervalId = window.setInterval(() => setReplyWindowNow(Date.now()), 60_000);
    return () => window.clearInterval(intervalId);
  }, []);

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
        setReplyDraftByConversationId((current) =>
          clearConversationTextState(current, conversationId),
        );
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
    async (conversationId: string, input: MetaInboxSavedReplyInput) => {
      setSavedReplyMutationState({
        conversationId,
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
          conversationId,
          status: "saved",
          message: "Personal draft saved for matching conversations.",
        });
      } catch (error) {
        setSavedReplyMutationState({
          conversationId,
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
      const refreshedSelectedConversationId = selectedConversationIdRef.current;
      if (refreshedSelectedConversationId) {
        setSyncStatus("Sync complete. Refreshing selected conversation history...");
        await loadConversationHistory(refreshedSelectedConversationId);
      }
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

  const drawerPanel =
    selectedItem && drawerState.drawer === "details" ? (
      <DetailsDrawerPanel
        key={conversationPanelKey(selectedItem, "details-drawer")}
        item={selectedItem}
        canManageInboxState={canManageInboxState}
        mutationState={selectedWorkflowMutationState}
        workflowMutationState={selectedWorkflowMutationState}
        contactMethodMutationState={selectedContactMethodMutationState}
        onContactMethodMutation={handleContactMethodMutation}
        onWorkflowUpdate={handleWorkflowUpdate}
        instruction={activeReplyInstruction}
        onInstructionChange={(value) => {
          setReplyInstructionByConversationId((current) =>
            writeConversationTextState(current, selectedConversationId, value),
          );
        }}
        replyWindowNow={replyWindowNow}
        preset={drawerState.preset}
      />
    ) : selectedItem && drawerState.drawer === "audit" ? (
      <AuditDrawerPanel item={selectedItem} />
    ) : selectedItem && drawerState.drawer === "notes" ? (
      <NotesDrawerPanel
        key={conversationPanelKey(selectedItem, "notes-drawer")}
        item={selectedItem}
        canManageInboxState={canManageInboxState}
        canCreateManagerCoaching={canCreateManagerCoaching}
        mutationState={selectedNoteMutationState}
        onCreateNote={handleNoteCreate}
      />
    ) : selectedItem && drawerState.drawer === "qa" ? (
      <QaDrawerPanel
        key={conversationPanelKey(selectedItem, "qa-drawer")}
        item={selectedItem}
        canManageInboxState={canManageInboxState}
        canCreateManagerCoaching={canCreateManagerCoaching}
        mutationState={selectedQaScorecardMutationState}
        onCreateScorecard={handleQaScorecardCreate}
      />
    ) : null;

  return (
    <main className="min-h-screen bg-hp-foundation px-4 py-6 text-hp-body md:px-8">
      <section className="mx-auto max-w-7xl">
        <InboxEyebrow
          dashboard={managerDashboard}
          syncRun={inboxData.syncRuns[0] || null}
          onSync={handleSync}
          isSyncing={isSyncing}
          syncDisabled={!status.readiness.socialInbox}
        />
        <InboxStatusSentence queue={queue} />
      </section>

      <InboxReadinessBanner status={status} />

      <InboxLayoutShell
        queue={
          <QueueRail
            queue={filteredQueue}
            selectedId={selectedItem?.id || null}
            query={query}
            onQueryChange={setQuery}
            queueCategoryFilter={effectiveQueueCategoryFilter}
            onQueueCategoryChange={setQueueCategoryFilter}
            sourceChannelFilter={sourceChannelFilter}
            onSourceChannelChange={(value) => setSourceChannelFilter(value as SourceChannelFilter)}
            campaignUmbrellaFilter={campaignUmbrellaFilter}
            onCampaignUmbrellaChange={setCampaignUmbrellaFilter}
            itemTypeFilter={itemTypeFilter}
            onItemTypeChange={(value) => setItemTypeFilter(value as ItemTypeFilter)}
            statusFilter={statusFilter}
            onStatusChange={(value) => setStatusFilter(value as StatusFilter)}
            attributionFilterOptions={attributionFilterOptions}
            filtersDirty={filtersDirty}
            onResetFilters={resetInboxFilters}
            queueCategories={queueCategories}
            onSelect={(item) => handleSelectQueueItem(item.id)}
            now={replyWindowNow}
          />
        }

        conversation={
          <ConversationPane
            item={selectedItem}
            now={replyWindowNow}
            syncStatus={syncStatus}
            thread={
              selectedItem ? (
                <SelectedItemDetail
                  item={selectedItem}
                  messages={selectedMessages}
                  comments={selectedComments}
                  presences={selectedPresenceState.presences}
                  historyState={selectedHistoryState}
                  onLoadOlderHistory={
                    selectedConversationId && selectedHistoryNextCursor
                      ? () => loadConversationHistory(selectedConversationId, selectedHistoryNextCursor)
                      : null
                  }
                />
              ) : null
            }
            emptyState={<EmptyThreadState />}
            replyComposer={
              <ReplyAttemptPanel
                key={conversationPanelKey(selectedItem, "reply-attempt")}
                item={selectedItem}
                draft={activeReplyDraft}
                onDraftChange={(value) => {
                  setReplyDraftByConversationId((current) =>
                    writeConversationTextState(current, selectedConversationId, value),
                  );
                }}
                canSendInboxReply={canSendInboxReply}
                mutationState={selectedReplyAttemptMutationState}
                savedReplyMutationState={selectedSavedReplyMutationState}
                replyWindowNow={replyWindowNow}
                onCreateSendAttempt={handleSendAttemptCreate}
                onQueueSendAttempt={handleSendAttemptQueue}
                onRetrySendAttempt={handleSendAttemptRetry}
                onCreateSavedReply={handleSavedReplyCreate}
              />
            }
            commentActions={
              selectedItem ? (
                <PublicCommentActionPanel
                  key={conversationPanelKey(selectedItem, "comment-actions")}
                  item={selectedItem}
                  rootComment={selectedRootComment}
                  canSendInboxReply={canSendInboxReply}
                  mutationState={selectedCommentActionMutationState}
                  onCreateCommentAction={handleCommentActionCreate}
                  onQueueCommentAction={handleCommentActionQueue}
                  onRetryCommentAction={handleCommentActionRetry}
                />
              ) : null
            }
            onOpenDetails={() => drawerState.open("details")}
            onOpenAudit={() => drawerState.open("audit")}
            onOpenNotes={() => drawerState.open("notes")}
            onOpenQa={() => drawerState.open("qa")}
            onCloseConversation={() => drawerState.open("details", "close")}
          />
        }
        drawer={
          <DrawerOverlay
            item={selectedItem}
            drawer={drawerState.drawer}
            preset={drawerState.preset}
            onClose={drawerState.close}
          >
            {drawerPanel}
          </DrawerOverlay>
        }
      />
    </main>
  );
}

function buildQueue(data: SocialInboxData): QueueDisplayItem[] {
  return buildMetaInboxQueueItems(data);
}

function SelectedItemDetail({
  item,
  messages,
  comments,
  presences,
  historyState,
  onLoadOlderHistory,
}: {
  item: QueueDisplayItem;
  messages: SocialInboxMessage[];
  comments: SocialInboxComment[];
  presences: SocialInboxPresence[];
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
  replyWindowNow,
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
  replyWindowNow: number;
  onCreateSendAttempt: (conversationId: string, input: MetaInboxSendAttemptInput) => void;
  onQueueSendAttempt: (conversationId: string, input: MetaInboxQueueSendAttemptInput) => void;
  onRetrySendAttempt: (conversationId: string, input: MetaInboxRetrySendAttemptInput) => void;
  onCreateSavedReply: (conversationId: string, input: MetaInboxSavedReplyInput) => void;
}) {
  const [savedReplyTitle, setSavedReplyTitle] = useState("");
  const conversationId = item?.inboxConversation?.id || null;
  const windowState = item ? resolveReplyWindowState(item, replyWindowNow) : null;
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
      : !canSendInboxReply
        ? "Read-only role"
        : !windowState?.canAttemptSend
          ? windowState?.label === "Expired"
            ? "Reply window expired"
            : "Reply unavailable"
          : !draft.trim()
            ? "Draft reply first"
            : "Record send attempt";

  function recordSendAttempt() {
    if (!conversationId) return;
    onCreateSendAttempt(conversationId, {
      replyText: draft,
      idempotencyKey: newSendAttemptIdempotencyKey(conversationId, draft),
    });
  }

  function savePersonalDraft() {
    if (!item || !conversationId || !draft.trim()) return;
    onCreateSavedReply(conversationId, {
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

function conversationPanelKey(item: QueueDisplayItem | null, panel: string) {
  return `${panel}:${item?.inboxConversation?.id || item?.id || "empty"}`;
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
