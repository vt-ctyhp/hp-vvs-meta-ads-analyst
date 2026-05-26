"use client";

import { Loader2, Plus, RefreshCw, Send, Tags } from "lucide-react";
import { useState } from "react";

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
  onCreateSendAttempt: (conversationId: string, input: MetaInboxSendAttemptInput) => void;
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
  onCreateSendAttempt,
  onQueueSendAttempt,
  onRetrySendAttempt,
  onCreateSavedReply,
}: ManagedReplyComposerProps) {
  const [confirmingSend, setConfirmingSend] = useState(false);
  const [savedRepliesOpen, setSavedRepliesOpen] = useState(true);
  const [sendAttemptsOpen, setSendAttemptsOpen] = useState(false);
  const [draftName, setDraftName] = useState("");

  const conversationId = item?.inboxConversation?.id || null;
  const windowState = item ? resolveReplyWindowState(item, replyWindowNow) : null;
  const replyWindowClosed = Boolean(item && !windowState?.canAttemptSend);
  const sendAttempts = sortSendAttempts(item?.sendAttempts || []);
  const latestAttempt = sendAttempts[0] || null;
  const canSend =
    Boolean(conversationId) &&
    canSendInboxReply &&
    Boolean(windowState?.canAttemptSend) &&
    Boolean(draft.trim()) &&
    mutationState.status !== "saving";
  const canSaveDraft =
    Boolean(item) &&
    Boolean(conversationId) &&
    canSendInboxReply &&
    Boolean(draft.trim()) &&
    Boolean(draftName.trim()) &&
    savedReplyMutationState.status !== "saving";

  function insertSavedReply(body: string) {
    onDraftChange(draft.trim() ? `${draft}\n\n${body}` : body);
    setConfirmingSend(false);
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
    onCreateSendAttempt(conversationId, {
      replyText: draft,
      idempotencyKey: newSendAttemptIdempotencyKey(conversationId, draft),
    });
    onDraftChange("");
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

      <section className="border-b border-hp-rule bg-hp-card">
        <div className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-2 text-hp-ink">
            <Tags size={14} />
            <p className="text-[10px] uppercase tracking-[0.14em]">
              Saved Replies · {item?.savedReplies.length || 0} available
            </p>
          </div>
          <button
            type="button"
            onClick={() => setSavedRepliesOpen((open) => !open)}
            className="self-start border border-hp-rule bg-hp-card px-3 py-1.5 text-[10px] uppercase tracking-[0.14em] text-hp-ink hover:border-hp-ink sm:self-auto"
          >
            {savedRepliesOpen ? "Hide ↕" : "Show ↕"}
          </button>
        </div>

        {savedRepliesOpen ? (
          <div className="grid gap-2 border-t border-hp-rule px-4 py-3 sm:grid-cols-2">
            {item?.savedReplies.length ? (
              item.savedReplies.slice(0, 4).map((savedReply) => (
                <article key={savedReply.id} className="border border-hp-rule bg-hp-inset p-3">
                  <div className="flex min-h-full flex-col gap-3">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[13px] font-medium text-hp-ink">
                        {savedReply.title}
                      </p>
                      <p className="mt-1 line-clamp-2 text-[11px] leading-5 text-hp-muted">
                        {savedReply.body}
                      </p>
                      <p className="mt-2 text-[10px] uppercase tracking-[0.14em] text-hp-muted">
                        {savedReply.visibility === "personal" ? "Personal Draft" : "Approved Shared"}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => insertSavedReply(savedReply.body)}
                      disabled={!canSendInboxReply || replyWindowClosed}
                      className="h-9 border border-hp-rule bg-hp-card px-3 text-[10px] uppercase tracking-[0.14em] text-hp-ink hover:border-hp-ink disabled:opacity-50"
                    >
                      Insert →
                    </button>
                  </div>
                </article>
              ))
            ) : (
              <p className="text-sm leading-6 text-hp-muted sm:col-span-2">
                No saved replies match this queue, source channel, lead quality, and language yet.
              </p>
            )}
          </div>
        ) : null}
      </section>

      <header className="border-b border-hp-rule bg-hp-inset px-4 py-3 text-[10px] uppercase tracking-[0.14em] text-hp-muted">
        Reply as{" "}
        <em className="font-[family-name:var(--font-title)] text-hp-ink">
          {item?.brand || "Unassigned"}
        </em>
        {replyWindowClosed ? (
          <span className="ml-2 normal-case tracking-normal text-signal-danger">
            Reply window closed. Only follow-up tags can be sent.
          </span>
        ) : null}
      </header>

      <textarea
        value={draft}
        onChange={(event) => {
          onDraftChange(event.target.value);
          if (!event.target.value.trim()) setConfirmingSend(false);
        }}
        disabled={!item || replyWindowClosed}
        rows={3}
        placeholder={
          replyWindowClosed
            ? "Reply window is closed. Use a saved follow-up template."
            : "Draft a reply…"
        }
        className="w-full resize-none border-0 bg-transparent px-4 py-3 text-sm leading-6 text-hp-ink outline-none placeholder:text-hp-muted disabled:opacity-70"
      />

      <div className="grid gap-2 border-t border-hp-rule-soft px-4 py-3 sm:grid-cols-[minmax(0,1fr)_auto]">
        <input
          value={draftName}
          onChange={(event) => setDraftName(event.target.value)}
          disabled={!draft.trim() || !canSendInboxReply}
          placeholder="Draft name"
          className="h-10 min-w-0 border border-hp-rule bg-hp-inset px-3 text-sm outline-none placeholder:text-hp-muted focus:border-hp-ink disabled:opacity-70"
        />
        <button
          type="button"
          onClick={savePersonalDraft}
          disabled={!canSaveDraft}
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
            <p>Send as {item?.brand || "Unassigned"}? This will record a send attempt.</p>
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
          <div className="flex items-center justify-between gap-2 px-4 py-3">
            <span className="text-[10px] uppercase tracking-[0.14em] text-hp-muted">
              Manual draft
            </span>
            <button
              type="button"
              onClick={startSendConfirmation}
              disabled={!canSend}
              className="flex h-10 shrink-0 items-center justify-center gap-2 border border-hp-ink bg-hp-ink px-4 text-[10px] uppercase tracking-[0.14em] text-hp-foundation hover:border-hp-pink hover:bg-hp-pink disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Send size={13} />
              Send →
            </button>
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

  return (
    <article className="border border-hp-rule bg-hp-card p-3">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <p className="text-[10px] uppercase tracking-[0.14em] text-hp-muted">
            {attempt.status.replaceAll("_", " ")}
          </p>
          <p className="mt-1 line-clamp-2 break-words text-sm leading-6 text-hp-ink">
            {attempt.reply_text || attempt.meta_error_message || "No body captured."}
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
