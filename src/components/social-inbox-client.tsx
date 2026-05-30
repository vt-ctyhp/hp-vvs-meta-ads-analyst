"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { translateError } from "@/lib/glossary";
import { buildMetaInboxManagerDashboard } from "@/lib/meta-inbox-manager-dashboard";
import {
  readConversationTextState,
  resolveActiveReplyWindowInput,
  writeConversationTextState,
  type ConversationTextState,
} from "@/lib/social-inbox-ui-freshness";
import { InboxEyebrow } from "./v2/inbox/inbox-eyebrow";
import { InboxHealthRow } from "./v2/inbox/inbox-health-row";
import { InboxLayoutShell } from "./v2/inbox/inbox-layout-shell";
import { InboxStatusSentence } from "./v2/inbox/inbox-status-sentence";
import { InboxMetricsHeaderLede } from "./v2/inbox/metrics-header-lede";
import { InboxMetricsHeaderStrip } from "./v2/inbox/metrics-header-strip";
import { LeadNudge } from "./v2/inbox/lead-nudge";
import { shouldRenderMetricsHeader } from "./v2/inbox/metrics-header-gate";
import type { PersonalHeaderMetrics } from "@/lib/inbox-metrics";
import { ConversationPane } from "./v2/inbox/conversation-pane";
import { AuditDrawerPanel } from "./v2/inbox/audit-drawer-panel";
import { DetailsDrawerPanel } from "./v2/inbox/details-drawer-panel";
import { DrawerOverlay } from "./v2/inbox/drawer-overlay";
import { NotesDrawerPanel } from "./v2/inbox/notes-drawer-panel";
import { QaDrawerPanel } from "./v2/inbox/qa-drawer-panel";
import { EmptyThreadState } from "./v2/inbox/empty-thread-state";
import {
  buildQueue,
  conversationPanelKey,
  IDLE_COMMENT_ACTION_STATE,
  IDLE_CONTACT_METHOD_STATE,
  IDLE_HISTORY_STATE,
  IDLE_NOTE_STATE,
  IDLE_PRESENCE_STATE,
  IDLE_QA_SCORECARD_STATE,
  IDLE_REPLY_ATTEMPT_STATE,
  IDLE_SAVED_REPLY_STATE,
  IDLE_WORKFLOW_STATE,
  isHistoryErrorPayload,
  isPresenceErrorPayload,
  type ConversationHistoryLoadState,
  type PresenceLoadState,
  type SocialInboxStatus,
} from "./v2/inbox/inbox-client-state";
import { PublicCommentActionPanel } from "./v2/inbox/public-comment-action-panel";
import { QueueRail, visibleQueueCategories } from "./v2/inbox/queue-rail";
import { useInboxUserNames } from "./v2/inbox/use-inbox-user-names";
import { ReplyComposer } from "./v2/inbox/reply-composer";
import { SelectedItemDetail } from "./v2/inbox/selected-item-detail";
import { useDrawerState } from "./v2/inbox/use-drawer-state";
import {
  useInboxFilters,
  type ItemTypeFilter,
  type SourceChannelFilter,
  type StatusFilter,
} from "./v2/inbox/use-inbox-filters";
import { useSocialInboxMutations } from "./v2/inbox/use-social-inbox-mutations";
import { InboxLiveIndicator } from "./v2/inbox/inbox-live-indicator";
import { useInboxLive } from "./v2/inbox/use-inbox-live";
import type {
  SocialInboxData,
  SocialInboxConversationHistory,
  MetaInboxPresenceInput,
  SocialInboxPresence,
} from "@/lib/social-inbox";
import { mergeSocialInboxConversationHistory } from "@/lib/meta-inbox-history";

export type { SocialInboxStatus };

export function SocialInboxClient({
  status,
  environment,
  initialData,
  dataError,
  canManageInboxState,
  canSendInboxReply,
  canCreateManagerCoaching,
  metricsHeaderEnabled = false,
  headerMetrics = null,
  teamLead = false,
}: {
  status: SocialInboxStatus;
  environment: string;
  initialData: SocialInboxData;
  dataError: string | null;
  canManageInboxState: boolean;
  canSendInboxReply: boolean;
  canCreateManagerCoaching: boolean;
  metricsHeaderEnabled?: boolean;
  headerMetrics?: PersonalHeaderMetrics | null;
  teamLead?: boolean;
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
  const userNames = useInboxUserNames();
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
  // The bulk inbox snapshot can be stale (it is not re-fetched after load), but
  // the per-conversation history fetch carries the current conversation row. Use
  // its reply-window eligibility so the composer matches the live thread it shows.
  const selectedItemForReply = useMemo(
    () =>
      selectedItem
        ? {
            ...selectedItem,
            ...resolveActiveReplyWindowInput(
              selectedItem,
              selectedHistoryState?.data?.conversation,
            ),
          }
        : null,
    [selectedItem, selectedHistoryState?.data?.conversation],
  );
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
    const intervalId = window.setInterval(beat, 10_000);

    return () => {
      disposed = true;
      if (timeoutId !== null) window.clearTimeout(timeoutId);
      window.clearInterval(intervalId);
    };
  }, [activeReplyDraft, selectedConversationId, sendPresenceHeartbeat]);

  const mutations = useSocialInboxMutations({
    setInboxData,
    setReplyDraftByConversationId,
    setSyncStatus,
    setIsSyncing,
    loadConversationHistory,
    selectedConversationIdRef,
  });

  const refetchInboxQueue = useCallback(async () => {
    const response = await fetch("/api/social-inbox", { cache: "no-store" });
    const fresh = (await response.json()) as SocialInboxData | { error: string };
    if (response.ok && fresh && typeof fresh === "object" && !("error" in fresh)) {
      setInboxData(fresh);
    }
  }, [setInboxData]);

  const { live: inboxLive } = useInboxLive({
    environment,
    enabled: status.readiness.socialInbox,
    selectedConversationIdRef,
    refetchQueue: refetchInboxQueue,
    refetchThread: loadConversationHistory,
  });

  const selectedWorkflowMutationState =
    mutations.workflowMutationState.conversationId === selectedConversationId
      ? mutations.workflowMutationState
      : IDLE_WORKFLOW_STATE;
  const selectedContactMethodMutationState =
    mutations.contactMethodMutationState.conversationId === selectedConversationId
      ? mutations.contactMethodMutationState
      : IDLE_CONTACT_METHOD_STATE;
  const selectedReplyAttemptMutationState =
    mutations.replyAttemptMutationState.conversationId === selectedConversationId
      ? mutations.replyAttemptMutationState
      : IDLE_REPLY_ATTEMPT_STATE;
  const selectedCommentActionMutationState =
    mutations.commentActionMutationState.conversationId === selectedConversationId
      ? mutations.commentActionMutationState
      : IDLE_COMMENT_ACTION_STATE;
  const selectedNoteMutationState =
    mutations.noteMutationState.conversationId === selectedConversationId
      ? mutations.noteMutationState
      : IDLE_NOTE_STATE;
  const selectedQaScorecardMutationState =
    mutations.qaScorecardMutationState.conversationId === selectedConversationId
      ? mutations.qaScorecardMutationState
      : IDLE_QA_SCORECARD_STATE;
  const selectedSavedReplyMutationState =
    mutations.savedReplyMutationState.conversationId === selectedConversationId
      ? mutations.savedReplyMutationState
      : IDLE_SAVED_REPLY_STATE;

  const drawerPanel =
    selectedItem && drawerState.drawer === "details" ? (
      <DetailsDrawerPanel
        key={conversationPanelKey(selectedItem, "details-drawer")}
        item={selectedItem}
        canManageInboxState={canManageInboxState}
        mutationState={selectedWorkflowMutationState}
        workflowMutationState={selectedWorkflowMutationState}
        contactMethodMutationState={selectedContactMethodMutationState}
        onContactMethodMutation={mutations.handleContactMethodMutation}
        onWorkflowUpdate={mutations.handleWorkflowUpdate}
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
        onCreateNote={mutations.handleNoteCreate}
      />
    ) : selectedItem && drawerState.drawer === "qa" ? (
      <QaDrawerPanel
        key={conversationPanelKey(selectedItem, "qa-drawer")}
        item={selectedItem}
        canManageInboxState={canManageInboxState}
        canCreateManagerCoaching={canCreateManagerCoaching}
        mutationState={selectedQaScorecardMutationState}
        onCreateScorecard={mutations.handleQaScorecardCreate}
      />
    ) : null;

  return (
    <main className="min-h-screen bg-hp-foundation px-4 py-6 text-hp-body md:px-8">
      <section className="mx-auto max-w-7xl">
        {shouldRenderMetricsHeader(metricsHeaderEnabled, headerMetrics) && headerMetrics ? (
          <>
            <InboxMetricsHeaderLede metrics={headerMetrics} />
            <InboxMetricsHeaderStrip
              metrics={headerMetrics}
              onSync={mutations.handleSync}
              isSyncing={isSyncing}
              syncDisabled={!status.readiness.socialInbox}
              syncRun={inboxData.syncRuns[0] || null}
              now={replyWindowNow}
            />
            <InboxHealthRow status={status} syncRun={inboxData.syncRuns[0] || null} />
            {teamLead && (headerMetrics.team.teammatesOverSla ?? 0) > 0 ? (
              <LeadNudge teammatesOverSla={headerMetrics.team.teammatesOverSla ?? 0} />
            ) : null}
          </>
        ) : (
          <>
            <InboxEyebrow
              dashboard={managerDashboard}
              syncRun={inboxData.syncRuns[0] || null}
              onSync={mutations.handleSync}
              isSyncing={isSyncing}
              syncDisabled={!status.readiness.socialInbox}
            />
            <InboxHealthRow status={status} syncRun={inboxData.syncRuns[0] || null} />
            <InboxStatusSentence queue={queue} />
          </>
        )}
        {status.readiness.socialInbox ? <InboxLiveIndicator live={inboxLive} /> : null}
      </section>

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
            userNames={userNames}
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
              <ReplyComposer
                key={conversationPanelKey(selectedItem, "reply-attempt")}
                item={selectedItemForReply}
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
                onUploadAttachment={mutations.handleAttachmentUpload}
                onCreateSendAttempt={mutations.handleSendAttemptCreate}
                onQueueSendAttempt={mutations.handleSendAttemptQueue}
                onRetrySendAttempt={mutations.handleSendAttemptRetry}
                onCreateSavedReply={mutations.handleSavedReplyCreate}
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
                  onCreateCommentAction={mutations.handleCommentActionCreate}
                  onQueueCommentAction={mutations.handleCommentActionQueue}
                  onRetryCommentAction={mutations.handleCommentActionRetry}
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
