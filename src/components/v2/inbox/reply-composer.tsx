"use client";

import { useState } from "react";

/**
 * Reply composer with the PRD §11 human-approval guardrail.
 *
 * Flow:
 *   1. Operator types or clicks "Ask AI" → POST /api/social-inbox/suggest-reply.
 *      Returns a draft inserted into the textarea.
 *   2. Operator edits text.
 *   3. Send button enabled only when text non-empty and user has
 *      send_inbox_reply permission.
 *   4. First click on Send → shows a confirmation chip "Send as {brand}?".
 *   5. Second click on Send (or Confirm in chip) → POSTs to a real send
 *      endpoint (wired in a follow-up). For now, the second click is
 *      blocked behind a "Send wiring lands in verification phase" notice
 *      because the actual Meta page send + audit row + draft text
 *      comparison is the subject of PRD §11.
 *
 * The component is deliberately small — every guardrail step is visible
 * inside this file so reviewers can audit the path.
 */

type Props = {
  platform: "facebook" | "instagram";
  sourceType: "message" | "comment";
  sourceId: string;
  brand: "HP" | "VVS" | "Unassigned";
  /** Roles include send_inbox_reply? */
  canSend: boolean;
};

type DraftState = {
  text: string;
  /** From AI suggestion endpoint when used. */
  draftId: string | null;
  generating: boolean;
  confirming: boolean;
  status: "idle" | "sending" | "sent" | "error";
  message: string | null;
};

const SUGGEST_LANG: "auto" | "en" | "vi" = "auto";

export function ReplyComposer({
  platform,
  sourceType,
  sourceId,
  brand,
  canSend,
}: Props) {
  const [state, setState] = useState<DraftState>({
    text: "",
    draftId: null,
    generating: false,
    confirming: false,
    status: "idle",
    message: null,
  });

  async function suggest() {
    if (state.generating) return;
    setState((s) => ({ ...s, generating: true, message: null }));
    try {
      const response = await fetch("/api/social-inbox/suggest-reply", {
        method: "POST",
        credentials: "same-origin",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          platform,
          sourceType,
          sourceId,
          brand,
          language: SUGGEST_LANG,
        }),
      });
      // suggestSocialReply returns { suggestionId, draft, language, ... }.
      const body = (await response.json().catch(() => ({}))) as {
        draft?: string;
        suggestionId?: string;
        error?: string;
      };
      if (!response.ok) {
        throw new Error(body.error || `Draft failed (${response.status})`);
      }
      setState((s) => ({
        ...s,
        generating: false,
        text: body.draft ?? "",
        draftId: body.suggestionId ?? null,
        message: null,
      }));
    } catch (e) {
      setState((s) => ({
        ...s,
        generating: false,
        message: e instanceof Error ? e.message : "Could not draft a reply.",
      }));
    }
  }

  function startConfirm() {
    if (!canSend || !state.text.trim()) return;
    setState((s) => ({ ...s, confirming: true, message: null }));
  }

  function cancelConfirm() {
    setState((s) => ({ ...s, confirming: false }));
  }

  async function confirmSend() {
    if (!canSend || !state.text.trim()) return;
    setState((s) => ({ ...s, status: "sending", message: null }));
    try {
      const response = await fetch("/api/social-inbox/send-reply", {
        method: "POST",
        credentials: "same-origin",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          platform,
          sourceType,
          sourceId,
          brand,
          text: state.text,
          draftId: state.draftId,
        }),
      });
      const body = (await response.json().catch(() => ({}))) as {
        ok?: boolean;
        error?: string;
        notice?: string;
      };
      if (!response.ok) {
        throw new Error(body.error || `Send failed (${response.status})`);
      }
      setState((s) => ({
        ...s,
        status: "sent",
        confirming: false,
        message: body.notice ?? "Recorded.",
      }));
    } catch (e) {
      setState((s) => ({
        ...s,
        status: "error",
        confirming: false,
        message: e instanceof Error ? e.message : "Send failed.",
      }));
    }
  }

  return (
    <section className="rounded-xl border border-stone-200 bg-white p-3">
      <header className="mb-2 flex items-center gap-2">
        <span className="text-[10px] uppercase tracking-wider text-stone-500">
          Reply
        </span>
        <button
          type="button"
          onClick={suggest}
          disabled={state.generating}
          className="ml-auto inline-flex h-7 items-center rounded-full border border-stone-300 bg-white px-3 text-xs font-medium text-stone-800 transition-colors hover:bg-stone-50 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {state.generating ? "Drafting…" : "Ask AI"}
        </button>
      </header>

      <textarea
        value={state.text}
        onChange={(e) => setState((s) => ({ ...s, text: e.target.value }))}
        rows={5}
        placeholder="Type or generate a reply…"
        className="w-full resize-y rounded-md border border-stone-300 bg-white p-2 text-sm text-stone-900 focus:outline-none focus:ring-2 focus:ring-stone-400"
      />

      <footer className="mt-2 flex flex-col gap-2">
        {!canSend ? (
          <p className="text-[11px] text-stone-600">
            Read-only role. To send, request the{" "}
            <code className="rounded bg-stone-100 px-1">send_inbox_reply</code>{" "}
            permission.
          </p>
        ) : state.confirming ? (
          <div className="flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
            <span>
              Send as <b>{brand}</b>? Reply will be posted to {platform}.
            </span>
            <div className="ml-auto flex items-center gap-1">
              <button
                type="button"
                onClick={cancelConfirm}
                className="inline-flex h-7 items-center rounded-full border border-stone-300 bg-white px-3 text-xs text-stone-800 hover:bg-stone-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={confirmSend}
                disabled={state.status === "sending"}
                className="inline-flex h-7 items-center rounded-full bg-stone-900 px-3 text-xs font-medium text-stone-50 transition-colors hover:bg-stone-800 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {state.status === "sending" ? "Sending…" : "Confirm send"}
              </button>
            </div>
          </div>
        ) : (
          <button
            type="button"
            onClick={startConfirm}
            disabled={!state.text.trim() || state.status === "sending"}
            className="inline-flex h-10 w-full items-center justify-center rounded-full bg-[#E14B7B] text-sm font-medium text-white shadow-sm transition-colors hover:bg-[#C53D6A] disabled:cursor-not-allowed disabled:opacity-60"
          >
            {state.status === "sent" ? "Sent" : "Send reply"}
          </button>
        )}

        {state.message ? (
          <p
            className={
              state.status === "error"
                ? "text-xs text-rose-700"
                : state.status === "sent"
                  ? "text-xs text-emerald-700"
                  : "text-xs text-stone-600"
            }
          >
            {state.message}
          </p>
        ) : null}
      </footer>
    </section>
  );
}
