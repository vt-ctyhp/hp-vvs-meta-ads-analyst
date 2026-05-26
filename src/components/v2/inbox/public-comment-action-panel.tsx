"use client";

import { EyeOff, Heart, Mail, MessageCircle, RefreshCw, Send, Trash2 } from "lucide-react";
import { useState, type ReactNode } from "react";

import type { MetaInboxQueueDisplayItem } from "../../../lib/meta-inbox-queue-view.ts";
import type {
  MetaInboxCommentActionInput,
  MetaInboxQueueCommentActionInput,
  MetaInboxRetryCommentActionInput,
  SocialInboxComment,
} from "../../../lib/social-inbox.ts";
import {
  commentActionLabel,
  formatDateLabel,
  newCommentActionIdempotencyKey,
  type CommentActionMutationLoadState,
} from "./inbox-client-state.ts";

export function PublicCommentActionPanel({
  item,
  rootComment,
  canSendInboxReply,
  mutationState,
  onCreateCommentAction,
  onQueueCommentAction,
  onRetryCommentAction,
}: {
  item: MetaInboxQueueDisplayItem;
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
