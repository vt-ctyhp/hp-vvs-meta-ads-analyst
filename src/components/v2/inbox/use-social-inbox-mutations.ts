import { useCallback, useState, type Dispatch, type MutableRefObject, type SetStateAction } from "react";

import { translateError } from "../../../lib/glossary.ts";
import {
  clearConversationTextState,
  type ConversationTextState,
} from "../../../lib/social-inbox-ui-freshness.ts";
import type {
  MetaInboxCommentActionInput,
  MetaInboxContactMethodMutationInput,
  MetaInboxConversationNoteInput,
  MetaInboxQaScorecardInput,
  MetaInboxQueueCommentActionInput,
  MetaInboxQueueSendAttemptInput,
  MetaInboxRetryCommentActionInput,
  MetaInboxRetrySendAttemptInput,
  MetaInboxSavedReplyInput,
  MetaInboxSendAttemptInput,
  MetaInboxWorkflowPatchInput,
  SocialInboxCommentAction,
  SocialInboxConversation,
  SocialInboxConversationEvent,
  SocialInboxConversationNote,
  SocialInboxCustomerContactMethod,
  SocialInboxData,
  SocialInboxQaScorecard,
  SocialInboxSavedReply,
  SocialInboxSendAttempt,
  SocialInboxUploadedAttachment,
} from "../../../lib/social-inbox.ts";
import {
  IDLE_COMMENT_ACTION_STATE,
  IDLE_CONTACT_METHOD_STATE,
  IDLE_NOTE_STATE,
  IDLE_QA_SCORECARD_STATE,
  IDLE_REPLY_ATTEMPT_STATE,
  IDLE_SAVED_REPLY_STATE,
  IDLE_WORKFLOW_STATE,
  isCommentActionErrorPayload,
  isContactMethodErrorPayload,
  isErrorPayload,
  isNoteErrorPayload,
  isQaScorecardErrorPayload,
  isSavedReplyErrorPayload,
  isSendAttemptErrorPayload,
  isWorkflowErrorPayload,
  mergeConversationEvents,
  upsertCommentAction,
  upsertConversationEvents,
  upsertConversationNote,
  upsertQaScorecard,
  upsertSavedReply,
  upsertSendAttempt,
  type CommentActionMutationLoadState,
  type ContactMethodMutationLoadState,
  type NoteMutationLoadState,
  type QaScorecardMutationLoadState,
  type ReplyAttemptMutationLoadState,
  type SavedReplyMutationLoadState,
  type SyncResponse,
  type WorkflowMutationLoadState,
} from "./inbox-client-state.ts";

type UseSocialInboxMutationsInput = {
  setInboxData: Dispatch<SetStateAction<SocialInboxData>>;
  setReplyDraftByConversationId: Dispatch<SetStateAction<ConversationTextState>>;
  setSyncStatus: Dispatch<SetStateAction<string | null>>;
  setIsSyncing: Dispatch<SetStateAction<boolean>>;
  loadConversationHistory: (conversationId: string, cursor?: string | null) => Promise<void>;
  selectedConversationIdRef: MutableRefObject<string | null>;
};

export type SocialInboxMutationController = {
  workflowMutationState: WorkflowMutationLoadState;
  contactMethodMutationState: ContactMethodMutationLoadState;
  replyAttemptMutationState: ReplyAttemptMutationLoadState;
  commentActionMutationState: CommentActionMutationLoadState;
  savedReplyMutationState: SavedReplyMutationLoadState;
  noteMutationState: NoteMutationLoadState;
  qaScorecardMutationState: QaScorecardMutationLoadState;
  handleWorkflowUpdate: (conversationId: string, input: MetaInboxWorkflowPatchInput) => void;
  handleContactMethodMutation: (
    conversationId: string,
    method: "POST" | "PATCH" | "DELETE",
    input: MetaInboxContactMethodMutationInput,
  ) => void;
  handleAttachmentUpload: (conversationId: string, file: File) => Promise<SocialInboxUploadedAttachment>;
  handleSendAttemptCreate: (conversationId: string, input: MetaInboxSendAttemptInput) => Promise<void>;
  handleSendAttemptRetry: (conversationId: string, input: MetaInboxRetrySendAttemptInput) => void;
  handleSendAttemptQueue: (conversationId: string, input: MetaInboxQueueSendAttemptInput) => void;
  handleCommentActionCreate: (conversationId: string, input: MetaInboxCommentActionInput) => void;
  handleCommentActionQueue: (conversationId: string, input: MetaInboxQueueCommentActionInput) => void;
  handleCommentActionRetry: (conversationId: string, input: MetaInboxRetryCommentActionInput) => void;
  handleSavedReplyCreate: (conversationId: string, input: MetaInboxSavedReplyInput) => void;
  handleNoteCreate: (
    conversationId: string,
    input: MetaInboxConversationNoteInput,
  ) => Promise<void>;
  handleQaScorecardCreate: (
    conversationId: string,
    input: MetaInboxQaScorecardInput,
  ) => Promise<void>;
  handleSync: () => Promise<void>;
};

export function useSocialInboxMutations({
  setInboxData,
  setReplyDraftByConversationId,
  setSyncStatus,
  setIsSyncing,
  loadConversationHistory,
  selectedConversationIdRef,
}: UseSocialInboxMutationsInput): SocialInboxMutationController {
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
    [setInboxData],
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
    [setInboxData],
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
    [setInboxData, setReplyDraftByConversationId],
  );

  const handleAttachmentUpload = useCallback(
    async (conversationId: string, file: File): Promise<SocialInboxUploadedAttachment> => {
      const formData = new FormData();
      formData.append("file", file);

      const response = await fetch(
        `/api/social-inbox/conversations/${encodeURIComponent(conversationId)}/attachments`,
        {
          method: "POST",
          body: formData,
        },
      );
      const payload = (await response.json()) as
        | { attachment: SocialInboxUploadedAttachment }
        | { error: string };
      if (!response.ok || "error" in payload) {
        throw new Error(
          "error" in payload ? payload.error : "Could not upload attachment.",
        );
      }

      return payload.attachment;
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
    [setInboxData],
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
    [setInboxData],
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
    [setInboxData],
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
    [setInboxData],
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
    [setInboxData],
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
    [setInboxData],
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
    [setInboxData],
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
    [setInboxData],
  );

  const handleSync = useCallback(async () => {
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
  }, [
    loadConversationHistory,
    selectedConversationIdRef,
    setInboxData,
    setIsSyncing,
    setSyncStatus,
  ]);

  return {
    workflowMutationState,
    contactMethodMutationState,
    replyAttemptMutationState,
    commentActionMutationState,
    savedReplyMutationState,
    noteMutationState,
    qaScorecardMutationState,
    handleWorkflowUpdate,
    handleContactMethodMutation,
    handleAttachmentUpload,
    handleSendAttemptCreate,
    handleSendAttemptRetry,
    handleSendAttemptQueue,
    handleCommentActionCreate,
    handleCommentActionQueue,
    handleCommentActionRetry,
    handleSavedReplyCreate,
    handleNoteCreate,
    handleQaScorecardCreate,
    handleSync,
  };
}
