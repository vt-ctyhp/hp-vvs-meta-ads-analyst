"use client";

import { useState } from "react";

/**
 * Reply composer with the PRD §11 human-approval guardrail.
 *
 * Flow:
 *   1. Operator types a reply draft.
 *   2. Send button enabled only when text non-empty and user has
 *      send_inbox_reply permission.
 *   3. First click on Send → shows a confirmation chip "Send as {brand}?".
 *   4. Second click on Send (or Confirm in chip) → POSTs to a real send
 *      endpoint (wired in a follow-up). For now, the second click is
 *      blocked behind a "Send wiring lands in verification phase" notice
 *      because the actual Meta page send + audit row is the subject of PRD §11.
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
  draftId: string | null;
  confirming: boolean;
  status: "idle" | "sending" | "sent" | "error";
  message: string | null;
};

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
    confirming: false,
    status: "idle",
    message: null,
  });

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
    <section className="border border-hp-rule bg-hp-card">
      <header className="border-b border-hp-rule bg-hp-inset px-4 py-3 text-[10px] uppercase tracking-[0.14em] text-hp-muted">
        Reply as{" "}
        <span className="font-[family-name:var(--font-title)] italic text-hp-ink">
          {brand}
        </span>
      </header>

      <textarea
        value={state.text}
        onChange={(e) => setState((s) => ({ ...s, text: e.target.value }))}
        rows={5}
        placeholder="Type a human-approved reply draft..."
        className="min-h-[84px] w-full resize-none border-0 bg-transparent px-4 py-3 text-[14px] text-hp-ink placeholder:text-hp-muted focus:outline-none"
      />

      <footer className="flex flex-col">
        {!canSend ? (
          <p className="border-t border-hp-rule-soft px-4 py-3 text-[11px] text-hp-body">
            Read-only role. To send, request the{" "}
            <code className="bg-hp-inset px-1">send_inbox_reply</code>{" "}
            permission.
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
                {state.status === "sent" ? "Sent" : "Send →"}
              </button>
            </>
          )}
        </div>

        {state.message ? (
          <p
            className={
              state.status === "error"
                ? "border-t border-hp-rule-soft px-4 py-3 text-xs text-signal-danger"
                : state.status === "sent"
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
