"use client";

import { Bookmark, ChevronUp, Loader2, Maximize2, Paperclip, RefreshCw, Send, Tags, X } from "lucide-react";
import { useState, type ChangeEvent } from "react";

import type { MetaInboxQueueDisplayItem } from "../../../lib/meta-inbox-queue-view.ts";
import {
  resolveReplyWindowState,
  type ReplyWindowUiState,
} from "../../../lib/social-inbox-ui-freshness.ts";
import type {
  MetaInboxQueueSendAttemptInput,
  MetaInboxRetrySendAttemptInput,
  MetaInboxSavedReplyInput,
  MetaInboxSendAttemptInput,
  SocialInboxSendAttempt,
  SocialInboxUploadedAttachment,
} from "../../../lib/social-inbox.ts";

export type ReplyAttemptMutationLoadState = {
  conversationId: string | null;
  sendAttemptId: string | null;
  status: "idle" | "saving" | "saved" | "error";
  message: string | null;
};

export type SavedReplyMutationLoadState = {
  conversationId: string | null;
  status: "idle" | "saving" | "saved" | "error";
  message: string | null;
};

type ManagedReplyComposerProps = {
  item: MetaInboxQueueDisplayItem | null;
  draft: string;
  onDraftChange: (value: string) => void;
  canSendInboxReply: boolean;
  mutationState: ReplyAttemptMutationLoadState;
  savedReplyMutationState: SavedReplyMutationLoadState;
  replyWindowNow: number;
  onUploadAttachment: (
    conversationId: string,
    file: File,
  ) => Promise<SocialInboxUploadedAttachment>;
  onCreateSendAttempt: (
    conversationId: string,
    input: MetaInboxSendAttemptInput,
  ) => void | Promise<void>;
  onQueueSendAttempt: (conversationId: string, input: MetaInboxQueueSendAttemptInput) => void;
  onRetrySendAttempt: (conversationId: string, input: MetaInboxRetrySendAttemptInput) => void;
  onCreateSavedReply: (conversationId: string, input: MetaInboxSavedReplyInput) => void;
};

type LegacyReplyComposerProps = {
  conversationId: string;
  brand: "HP" | "VVS" | "Unassigned";
  canSend: boolean;
};

type ReplyComposerProps = ManagedReplyComposerProps | LegacyReplyComposerProps;

export function ReplyComposer(props: ReplyComposerProps) {
  if ("item" in props) {
    return <ManagedReplyComposer {...props} />;
  }

  return <LegacyReplyComposer {...props} />;
}

function ManagedReplyComposer({
  item,
  draft,
  onDraftChange,
  canSendInboxReply,
  mutationState,
  savedReplyMutationState,
  replyWindowNow,
  onUploadAttachment,
  onCreateSendAttempt,
  onQueueSendAttempt,
  onRetrySendAttempt,
  onCreateSavedReply,
}: ManagedReplyComposerProps) {
  const [confirmingSend, setConfirmingSend] = useState(false);
  const [templatesOpen, setTemplatesOpen] = useState(false);
  const [previewId, setPreviewId] = useState<string | null>(null);
  const [savingTemplate, setSavingTemplate] = useState(false);
  const [sendAttemptsOpen, setSendAttemptsOpen] = useState(false);
  const [draftName, setDraftName] = useState("");
  const [selectedAttachments, setSelectedAttachments] = useState<SocialInboxUploadedAttachment[]>([]);
  const [attachmentUpload, setAttachmentUpload] = useState<{
    status: "idle" | "uploading" | "ready" | "error";
    message: string | null;
  }>({ status: "idle", message: null });

  const conversationId = item?.inboxConversation?.id || null;
  const windowState = item ? resolveReplyWindowState(item, replyWindowNow) : null;
  const replyWindowClosed = Boolean(item && !windowState?.canAttemptSend);
  const sendAttempts = sortSendAttempts(item?.sendAttempts || []);
  const latestAttempt = sendAttempts[0] || null;
  const hasDraftText = Boolean(draft.trim());
  const pendingSendAttemptCount = (hasDraftText ? 1 : 0) + selectedAttachments.length;
  const isUploadingAttachment = attachmentUpload.status === "uploading";
  const canAttach =
    Boolean(conversationId) &&
    canSendInboxReply &&
    Boolean(windowState?.canAttemptSend) &&
    !isUploadingAttachment;
  const canSend =
    Boolean(conversationId) &&
    canSendInboxReply &&
    Boolean(windowState?.canAttemptSend) &&
    pendingSendAttemptCount > 0 &&
    !isUploadingAttachment &&
    mutationState.status !== "saving";
  const canSaveDraft =
    Boolean(item) &&
    Boolean(conversationId) &&
    canSendInboxReply &&
    Boolean(draft.trim()) &&
    Boolean(draftName.trim()) &&
    savedReplyMutationState.status !== "saving";
  const previewReply =
    previewId && item ? item.savedReplies.find((reply) => reply.id === previewId) ?? null : null;

  function insertSavedReply(body: string) {
    onDraftChange(draft.trim() ? `${draft}\n\n${body}` : body);
    setConfirmingSend(false);
    setTemplatesOpen(false);
    setPreviewId(null);
  }

  function savePersonalDraft() {
    if (!item || !conversationId || !draft.trim() || !draftName.trim()) return;
    onCreateSavedReply(conversationId, {
      title: draftName.trim(),
      body: draft,
      visibility: "personal",
      queueCategoryKey: item.queueCategoryKey,
      sourceChannel: item.sourceChannel,
      language: "en",
      leadQuality: item.inboxConversation?.lead_quality as MetaInboxSavedReplyInput["leadQuality"],
    });
    setDraftName("");
  }

  function startSendConfirmation() {
    if (!canSend) return;
    setConfirmingSend(true);
  }

  function confirmSend() {
    if (!canSend || !conversationId) return;
    const attachments = selectedAttachments.slice();
    if (draft.trim()) {
      void onCreateSendAttempt(conversationId, {
        replyText: draft,
        idempotencyKey: newSendAttemptIdempotencyKey(conversationId, draft),
      });
    }
    for (const attachment of attachments) {
      void onCreateSendAttempt(conversationId, {
        replyText: "",
        attachmentIds: [attachment.id],
        idempotencyKey: newAttachmentSendAttemptIdempotencyKey(conversationId, attachment.id),
      });
    }
    onDraftChange("");
    setSelectedAttachments([]);
    setAttachmentUpload({ status: "idle", message: null });
    setConfirmingSend(false);
  }

  async function uploadAttachments(event: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files || []);
    event.target.value = "";
    if (!files.length || !conversationId || !canAttach) return;

    setAttachmentUpload({
      status: "uploading",
      message: `Uploading ${files.length} attachment${files.length === 1 ? "" : "s"}...`,
    });
    try {
      const uploaded: SocialInboxUploadedAttachment[] = [];
      for (const file of files) {
        uploaded.push(await onUploadAttachment(conversationId, file));
      }
      setSelectedAttachments((current) => [...current, ...uploaded]);
      setAttachmentUpload({
        status: "ready",
        message: `${uploaded.length} attachment${uploaded.length === 1 ? "" : "s"} ready.`,
      });
      setConfirmingSend(false);
    } catch (error) {
      setAttachmentUpload({
        status: "error",
        message: error instanceof Error ? error.message : "Attachment upload failed.",
      });
    }
  }

  function removeAttachment(attachmentId: string) {
    setSelectedAttachments((current) =>
      current.filter((attachment) => attachment.id !== attachmentId),
    );
    setConfirmingSend(false);
  }

  return (
    <section className="border border-hp-rule bg-hp-card">
      {sendAttempts.length > 0 ? (
        <section className="border-b border-hp-rule bg-hp-inset">
          <div className="flex flex-col gap-2 px-4 py-3 text-xs leading-5 text-hp-muted sm:flex-row sm:items-center sm:justify-between">
            <p>
              {sendAttempts.length} send attempt{sendAttempts.length === 1 ? "" : "s"}
              {latestAttempt ? ` · last ${relativeAge(latestAttempt, replyWindowNow)} ago` : ""}
            </p>
            <button
              type="button"
              onClick={() => setSendAttemptsOpen((open) => !open)}
              className="self-start border border-hp-rule bg-hp-card px-3 py-1.5 text-[10px] uppercase tracking-[0.14em] text-hp-ink hover:border-hp-ink sm:self-auto"
            >
              {sendAttemptsOpen ? "Hide ↕" : "Show ↕"}
            </button>
          </div>

          {sendAttemptsOpen ? (
            <div className="grid gap-2 border-t border-hp-rule px-4 py-3">
              {sendAttempts.map((attempt) => (
                <SendAttemptCard
                  key={attempt.id}
                  attempt={attempt}
                  conversationId={conversationId}
                  windowState={windowState}
                  canSendInboxReply={canSendInboxReply}
                  mutationState={mutationState}
                  onQueueSendAttempt={onQueueSendAttempt}
                  onRetrySendAttempt={onRetrySendAttempt}
                />
              ))}
            </div>
          ) : null}
        </section>
      ) : null}

      <div className="flex items-center justify-between gap-2 border-b border-hp-rule-soft bg-hp-card px-4 py-2.5">
        <p className="min-w-0 text-[10px] uppercase tracking-[0.14em] text-hp-muted">
          Reply as{" "}
          <em className="font-[family-name:var(--font-title)] text-[13px] not-italic text-hp-ink">
            {item?.brand || "Unassigned"}
          </em>
          {replyWindowClosed ? (
            <span className="ml-2 normal-case tracking-normal text-signal-danger">
              Reply window closed. Only follow-up tags can be sent.
            </span>
          ) : null}
        </p>

        <div className="relative shrink-0">
          <button
            type="button"
            onClick={() => {
              setTemplatesOpen((open) => !open);
              setPreviewId(null);
            }}
            aria-expanded={templatesOpen}
            className="flex h-8 items-center gap-1.5 border border-hp-rule bg-hp-card px-2.5 text-[10px] uppercase tracking-[0.14em] text-hp-ink transition-colors hover:border-hp-ink"
          >
            <Tags size={13} />
            Templates
            <span className="border border-hp-rule px-1 text-[9px] leading-none text-hp-muted lining-nums">
              {item?.savedReplies.length || 0}
            </span>
            <ChevronUp size={12} className={templatesOpen ? "" : "rotate-180"} />
          </button>

          {templatesOpen ? (
            <div className="absolute bottom-full right-0 z-30 mb-1 w-80 border border-hp-rule bg-hp-card shadow-[0_8px_24px_rgba(42,39,37,0.08)]">
              <p className="border-b border-hp-rule-soft bg-hp-inset px-3 py-2 text-[10px] uppercase tracking-[0.14em] text-hp-muted">
                Insert a saved reply
              </p>
              <div className="max-h-72 overflow-y-auto">
                {item?.savedReplies.length ? (
                  item.savedReplies.map((savedReply) => (
                    <div
                      key={savedReply.id}
                      className="flex items-stretch border-b border-hp-rule-soft last:border-0"
                    >
                      <button
                        type="button"
                        onClick={() => insertSavedReply(savedReply.body)}
                        disabled={!canSendInboxReply || replyWindowClosed}
                        className="min-w-0 flex-1 px-3 py-2.5 text-left hover:bg-hp-inset disabled:opacity-50"
                      >
                        <span className="flex items-center justify-between gap-2">
                          <span className="truncate text-[13px] text-hp-ink">{savedReply.title}</span>
                          <span className="shrink-0 text-[9px] uppercase tracking-[0.14em] text-hp-muted">
                            {savedReply.visibility === "personal" ? "Personal" : "Shared"}
                          </span>
                        </span>
                        <span className="mt-0.5 line-clamp-1 text-[11px] leading-5 text-hp-muted">
                          {savedReply.body}
                        </span>
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          setPreviewId((id) => (id === savedReply.id ? null : savedReply.id))
                        }
                        aria-label={`View full message: ${savedReply.title}`}
                        title="View full message"
                        className={[
                          "flex w-9 shrink-0 items-center justify-center border-l border-hp-rule-soft transition-colors hover:bg-hp-inset",
                          previewId === savedReply.id ? "bg-hp-inset text-hp-ink" : "text-hp-muted",
                        ].join(" ")}
                      >
                        <Maximize2 size={13} />
                      </button>
                    </div>
                  ))
                ) : (
                  <p className="px-3 py-3 text-[11px] leading-5 text-hp-muted">
                    No saved replies match this queue, source channel, lead quality, and language yet.
                  </p>
                )}
              </div>
            </div>
          ) : null}

          {templatesOpen && previewReply ? (
            <div className="absolute bottom-full right-[21rem] z-30 mb-1 flex max-h-80 w-80 flex-col border border-hp-rule bg-hp-card shadow-[0_8px_24px_rgba(42,39,37,0.08)]">
              <div className="flex items-center justify-between gap-2 border-b border-hp-rule-soft bg-hp-inset px-3 py-2">
                <span className="truncate text-[10px] uppercase tracking-[0.14em] text-hp-muted">
                  Full message
                </span>
                <button
                  type="button"
                  onClick={() => setPreviewId(null)}
                  aria-label="Close full message"
                  className="flex h-5 w-5 items-center justify-center text-hp-muted hover:text-hp-ink"
                >
                  <X size={13} />
                </button>
              </div>
              <div className="min-h-0 flex-1 overflow-y-auto px-3 py-3">
                <p className="text-[13px] text-hp-ink">{previewReply.title}</p>
                <p className="mt-0.5 text-[9px] uppercase tracking-[0.14em] text-hp-muted">
                  {previewReply.visibility === "personal" ? "Personal" : "Shared"}
                </p>
                <p className="mt-2 whitespace-pre-line text-sm leading-6 text-hp-body">
                  {previewReply.body}
                </p>
              </div>
              <div className="border-t border-hp-rule-soft p-2">
                <button
                  type="button"
                  onClick={() => insertSavedReply(previewReply.body)}
                  disabled={!canSendInboxReply || replyWindowClosed}
                  className="flex h-9 w-full items-center justify-center gap-2 border border-hp-ink bg-hp-ink px-3 text-[10px] uppercase tracking-[0.14em] text-hp-foundation transition-colors hover:bg-hp-body disabled:opacity-50"
                >
                  Insert →
                </button>
              </div>
            </div>
          ) : null}
        </div>
      </div>

      <textarea
        value={draft}
        onChange={(event) => {
          onDraftChange(event.target.value);
          if (!event.target.value.trim() && selectedAttachments.length === 0) {
            setConfirmingSend(false);
          }
        }}
        disabled={!item || replyWindowClosed}
        rows={3}
        placeholder={
          replyWindowClosed
            ? "Reply window is closed. Use a saved follow-up template."
            : "Write a reply, or insert a template…"
        }
        className="w-full resize-none border-0 bg-transparent px-4 py-3 text-sm leading-6 text-hp-ink outline-none placeholder:text-hp-muted disabled:opacity-70"
      />

      {selectedAttachments.length ? (
        <div className="flex flex-wrap gap-2 px-4 pb-1">
          {selectedAttachments.map((attachment) => (
            <span
              key={attachment.id}
              className="inline-flex items-center gap-1.5 border border-hp-rule bg-hp-inset py-1 pl-2 pr-1 text-[11px] text-hp-ink"
            >
              <Paperclip size={11} />
              <span className="max-w-[12rem] truncate">{attachment.label}</span>
              <button
                type="button"
                onClick={() => removeAttachment(attachment.id)}
                className="flex h-4 w-4 items-center justify-center text-hp-muted hover:text-hp-ink"
                aria-label={`Remove ${attachment.label}`}
              >
                <X size={11} />
              </button>
            </span>
          ))}
        </div>
      ) : null}

      {attachmentUpload.message ? (
        <p
          className={`px-4 pb-1 text-xs leading-5 ${
            attachmentUpload.status === "error"
              ? "text-signal-danger"
              : attachmentUpload.status === "ready"
                ? "text-signal-positive"
                : "text-hp-muted"
          }`}
        >
          {attachmentUpload.message}
        </p>
      ) : null}

      {savingTemplate ? (
        <div className="flex items-center gap-2 border-t border-hp-rule-soft bg-hp-inset px-4 py-2.5">
          <input
            value={draftName}
            onChange={(event) => setDraftName(event.target.value)}
            disabled={!draft.trim() || !canSendInboxReply}
            placeholder="Name this template"
            className="h-9 min-w-0 flex-1 border border-hp-rule bg-hp-card px-2.5 text-sm outline-none placeholder:text-hp-muted focus:border-hp-ink disabled:opacity-70"
          />
          <button
            type="button"
            onClick={() => {
              savePersonalDraft();
              setSavingTemplate(false);
            }}
            disabled={!canSaveDraft}
            className="flex h-9 items-center gap-1.5 border border-hp-ink bg-hp-ink px-3 text-[10px] uppercase tracking-[0.14em] text-hp-foundation disabled:opacity-50"
          >
            {savedReplyMutationState.status === "saving" ? (
              <Loader2 size={13} className="animate-spin" />
            ) : null}
            Save
          </button>
          <button
            type="button"
            onClick={() => setSavingTemplate(false)}
            className="h-9 border border-hp-rule px-3 text-[10px] uppercase tracking-[0.14em] text-hp-ink hover:border-hp-ink"
          >
            Cancel
          </button>
        </div>
      ) : null}

      {savedReplyMutationState.message ? (
        <p
          className={`border-t border-hp-rule-soft px-4 py-2 text-xs leading-5 ${
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

      <footer className="border-t border-hp-rule-soft">
        {!canSendInboxReply ? (
          <p className="px-4 py-3 text-[11px] text-hp-body">
            Read-only role. To send, request the{" "}
            <code className="bg-hp-inset px-1">send_inbox_reply</code> permission.
          </p>
        ) : null}

        {confirmingSend ? (
          <div className="flex flex-col gap-3 border-y border-signal-warning bg-signal-warning-bg px-4 py-3 text-xs text-signal-warning sm:flex-row sm:items-center sm:justify-between">
            <p>
              Send as {item?.brand || "Unassigned"}? This will record {pendingSendAttemptCount}{" "}
              send attempt{pendingSendAttemptCount === 1 ? "" : "s"}.
            </p>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setConfirmingSend(false)}
                className="h-9 border border-hp-rule bg-hp-card px-3 text-[10px] uppercase tracking-[0.14em] text-hp-ink hover:border-hp-ink"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={confirmSend}
                disabled={!canSend}
                className="h-9 border border-signal-warning bg-signal-warning px-4 text-[10px] uppercase tracking-[0.14em] text-hp-foundation hover:border-signal-danger hover:bg-signal-danger disabled:cursor-not-allowed disabled:opacity-50"
              >
                {mutationState.status === "saving" ? "Sending…" : "Send →"}
              </button>
            </div>
          </div>
        ) : (
          <div className="flex items-center justify-between gap-2 px-3 py-2.5">
            <div className="flex items-center gap-1">
              <input
                id={attachmentInputId(conversationId)}
                type="file"
                multiple
                onChange={uploadAttachments}
                disabled={!canAttach}
                className="sr-only"
              />
              <label
                htmlFor={attachmentInputId(conversationId)}
                aria-disabled={!canAttach}
                className={`flex h-9 items-center gap-1.5 px-2 text-[10px] uppercase tracking-[0.14em] transition-colors ${
                  canAttach
                    ? "cursor-pointer text-hp-body hover:bg-hp-inset hover:text-hp-ink"
                    : "cursor-not-allowed text-hp-muted opacity-40"
                }`}
              >
                {isUploadingAttachment ? (
                  <Loader2 size={13} className="animate-spin" />
                ) : (
                  <Paperclip size={13} />
                )}
                Attach
              </label>
              <button
                type="button"
                onClick={() => setSavingTemplate((open) => !open)}
                disabled={!hasDraftText || !canSendInboxReply}
                className={[
                  "flex h-9 items-center gap-1.5 px-2 text-[10px] uppercase tracking-[0.14em] transition-colors disabled:opacity-40",
                  savingTemplate
                    ? "bg-hp-inset text-hp-ink"
                    : "text-hp-body hover:bg-hp-inset hover:text-hp-ink",
                ].join(" ")}
              >
                <Bookmark size={13} />
                Save as template
              </button>
            </div>
            <div className="flex items-center gap-3">
              {pendingSendAttemptCount > 0 ? (
                <span className="text-[10px] uppercase tracking-[0.14em] text-hp-muted lining-nums">
                  {pendingSendAttemptCount} ready
                </span>
              ) : null}
              <button
                type="button"
                onClick={startSendConfirmation}
                disabled={!canSend}
                className="flex h-10 shrink-0 items-center justify-center gap-2 border border-hp-ink bg-hp-ink px-5 text-[10px] uppercase tracking-[0.14em] text-hp-foundation hover:border-hp-pink hover:bg-hp-pink disabled:cursor-not-allowed disabled:opacity-50"
              >
                <Send size={13} />
                Send →
              </button>
            </div>
          </div>
        )}

        {mutationState.message ? (
          <p
            className={`border-t border-hp-rule-soft px-4 py-3 text-xs ${
              mutationState.status === "error"
                ? "text-signal-danger"
                : mutationState.status === "saved"
                  ? "text-signal-positive"
                  : "text-hp-muted"
            }`}
          >
            {mutationState.message}
          </p>
        ) : null}
      </footer>
    </section>
  );
}

function SendAttemptCard({
  attempt,
  conversationId,
  windowState,
  canSendInboxReply,
  mutationState,
  onQueueSendAttempt,
  onRetrySendAttempt,
}: {
  attempt: SocialInboxSendAttempt;
  conversationId: string | null;
  windowState: ReplyWindowUiState | null;
  canSendInboxReply: boolean;
  mutationState: ReplyAttemptMutationLoadState;
  onQueueSendAttempt: (conversationId: string, input: MetaInboxQueueSendAttemptInput) => void;
  onRetrySendAttempt: (conversationId: string, input: MetaInboxRetrySendAttemptInput) => void;
}) {
  const canRetry =
    Boolean(conversationId) &&
    canSendInboxReply &&
    attempt.status === "failed_retryable" &&
    Boolean(windowState?.canAttemptSend) &&
    mutationState.status !== "saving";
  const canQueue =
    Boolean(conversationId) &&
    canSendInboxReply &&
    attempt.status === "approved" &&
    Boolean(windowState?.canAttemptSend) &&
    mutationState.status !== "saving";
  const attachmentCount = attempt.attachment_ids.length;
  const bodyLabel =
    attempt.reply_text ||
    (attachmentCount
      ? `${attachmentCount} attachment${attachmentCount === 1 ? "" : "s"}`
      : attempt.meta_error_message || "No body captured.");

  return (
    <article className="border border-hp-rule bg-hp-card p-3">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <p className="text-[10px] uppercase tracking-[0.14em] text-hp-muted">
            {attempt.status.replaceAll("_", " ")}
          </p>
          <p className="mt-1 line-clamp-2 break-words text-sm leading-6 text-hp-ink">
            {bodyLabel}
          </p>
          <p className="mt-1 text-xs leading-5 text-hp-muted">
            {attempt.approved_by || "Unknown advisor"} · {formatDateLabel(attempt.created_at)}
          </p>
        </div>

        {attempt.status === "failed_retryable" ? (
          <button
            type="button"
            onClick={() =>
              conversationId && onRetrySendAttempt(conversationId, { sendAttemptId: attempt.id })
            }
            disabled={!canRetry}
            className="flex h-9 shrink-0 items-center justify-center gap-2 border border-hp-rule px-3 text-[10px] uppercase tracking-[0.14em] text-hp-ink transition hover:border-hp-ink disabled:opacity-50"
          >
            {mutationState.status === "saving" && mutationState.sendAttemptId === attempt.id ? (
              <Loader2 size={13} className="animate-spin" />
            ) : (
              <RefreshCw size={13} />
            )}
            Retry
          </button>
        ) : null}

        {attempt.status === "approved" ? (
          <button
            type="button"
            onClick={() =>
              conversationId && onQueueSendAttempt(conversationId, { sendAttemptId: attempt.id })
            }
            disabled={!canQueue}
            className="flex h-9 shrink-0 items-center justify-center gap-2 border border-hp-rule px-3 text-[10px] uppercase tracking-[0.14em] text-hp-ink transition hover:border-hp-ink disabled:opacity-50"
          >
            {mutationState.status === "saving" && mutationState.sendAttemptId === attempt.id ? (
              <Loader2 size={13} className="animate-spin" />
            ) : (
              <Send size={13} />
            )}
            Queue Delivery
          </button>
        ) : null}
      </div>
    </article>
  );
}

function sortSendAttempts(attempts: SocialInboxSendAttempt[]) {
  return attempts
    .slice()
    .sort((a, b) =>
      String(b.updated_at || b.created_at || "").localeCompare(String(a.updated_at || a.created_at || "")),
    );
}

function relativeAge(attempt: SocialInboxSendAttempt, nowMs: number) {
  const value = attempt.last_attempted_at || attempt.updated_at || attempt.created_at;
  if (!value) return "unknown";
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) return "unknown";
  const minutes = Math.max(0, Math.floor((nowMs - timestamp) / 60_000));
  if (minutes < 1) return "now";
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  return `${Math.floor(hours / 24)}d`;
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

function newSendAttemptIdempotencyKey(conversationId: string, draft: string) {
  return stableIdempotencyKey("send", conversationId, [draft]);
}

function newAttachmentSendAttemptIdempotencyKey(conversationId: string, attachmentId: string) {
  return stableIdempotencyKey("attachment", conversationId, [attachmentId]);
}

function attachmentInputId(conversationId: string | null) {
  return `reply-attachment-${conversationId || "none"}`;
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

function LegacyReplyComposer({ conversationId, brand, canSend }: LegacyReplyComposerProps) {
  const [state, setState] = useState({
    text: "",
    confirming: false,
    status: "idle" as "idle" | "sending" | "recorded" | "error",
    message: null as string | null,
  });

  function startConfirm() {
    if (!canSend || !state.text.trim()) return;
    setState((current) => ({ ...current, confirming: true, message: null }));
  }

  function cancelConfirm() {
    setState((current) => ({ ...current, confirming: false }));
  }

  async function confirmSend() {
    if (!canSend || !state.text.trim()) return;
    setState((current) => ({ ...current, status: "sending", message: null }));
    try {
      const response = await fetch(
        `/api/social-inbox/conversations/${encodeURIComponent(conversationId)}/send-attempts`,
        {
          method: "POST",
          credentials: "same-origin",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ replyText: state.text }),
        },
      );
      const body = (await response.json().catch(() => ({}))) as {
        error?: string;
        notice?: string;
      };
      if (!response.ok) {
        throw new Error(body.error || `Send failed (${response.status})`);
      }
      setState((current) => ({
        ...current,
        text: "",
        status: "recorded",
        confirming: false,
        message: body.notice ?? "Send attempt recorded.",
      }));
    } catch (error) {
      setState((current) => ({
        ...current,
        status: "error",
        confirming: false,
        message: error instanceof Error ? error.message : "Send failed.",
      }));
    }
  }

  return (
    <section className="border border-hp-rule bg-hp-card">
      <header className="border-b border-hp-rule bg-hp-inset px-4 py-3 text-[10px] uppercase tracking-[0.14em] text-hp-muted">
        Reply as{" "}
        <em className="font-[family-name:var(--font-title)] text-hp-ink">
          {brand}
        </em>
      </header>

      <textarea
        value={state.text}
        onChange={(event) => setState((current) => ({ ...current, text: event.target.value }))}
        rows={5}
        placeholder="Type a human-approved reply draft..."
        className="min-h-[84px] w-full resize-none border-0 bg-transparent px-4 py-3 text-[14px] text-hp-ink placeholder:text-hp-muted focus:outline-none"
      />

      <footer className="flex flex-col">
        {!canSend ? (
          <p className="border-t border-hp-rule-soft px-4 py-3 text-[11px] text-hp-body">
            Read-only role. To send, request the{" "}
            <code className="bg-hp-inset px-1">send_inbox_reply</code> permission.
          </p>
        ) : null}

        {state.confirming ? (
          <div className="flex items-center gap-2 border-t border-signal-warning bg-signal-warning-bg px-4 py-3 text-[11px] font-bold uppercase tracking-[0.14em] text-signal-warning">
            <span aria-hidden>!</span>
            <span>Send as {brand}? Tap Send again to confirm.</span>
          </div>
        ) : null}

        <div className="flex items-center justify-between gap-2 border-t border-hp-rule-soft px-4 py-3">
          {state.confirming ? (
            <>
              <button
                type="button"
                onClick={cancelConfirm}
                className="h-9 border border-hp-rule px-3 text-[10px] uppercase tracking-[0.14em] text-hp-muted hover:border-hp-ink hover:text-hp-ink"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={confirmSend}
                disabled={state.status === "sending"}
                className="h-9 border border-signal-warning bg-signal-warning px-4 text-[10px] uppercase tracking-[0.14em] text-hp-foundation hover:border-signal-danger hover:bg-signal-danger disabled:cursor-not-allowed disabled:opacity-50"
              >
                {state.status === "sending" ? "Sending…" : `Send as ${brand} →`}
              </button>
            </>
          ) : (
            <>
              <span className="text-[10px] uppercase tracking-[0.14em] text-hp-muted">
                Manual draft
              </span>
              <button
                type="button"
                onClick={startConfirm}
                disabled={!state.text.trim() || state.status === "sending" || !canSend}
                className="h-9 border border-hp-ink bg-hp-ink px-4 text-[10px] uppercase tracking-[0.14em] text-hp-foundation hover:border-hp-pink hover:bg-hp-pink disabled:cursor-not-allowed disabled:opacity-50"
              >
                {state.status === "recorded" ? "Recorded" : "Send →"}
              </button>
            </>
          )}
        </div>

        {state.message ? (
          <p
            className={
              state.status === "error"
                ? "border-t border-hp-rule-soft px-4 py-3 text-xs text-signal-danger"
                : state.status === "recorded"
                  ? "border-t border-hp-rule-soft px-4 py-3 text-xs text-signal-positive"
                  : "border-t border-hp-rule-soft px-4 py-3 text-xs text-hp-body"
            }
          >
            {state.message}
          </p>
        ) : null}
      </footer>
    </section>
  );
}
