"use client";

import { Loader2, Plus, ShieldCheck } from "lucide-react";
import { useState } from "react";

import type { MetaInboxQueueDisplayItem } from "../../../lib/meta-inbox-queue-view.ts";
import type { MetaInboxQaScorecardInput } from "../../../lib/social-inbox.ts";
import {
  DrawerSection,
  formatDateLabel,
  shortIdentifier,
} from "./drawer-panel-helpers.tsx";

type MutationState = {
  status: "idle" | "saving" | "saved" | "error";
  message: string | null;
};

type QaScoreKey =
  | "toneScore"
  | "completenessScore"
  | "accuracyScore"
  | "nextStepScore"
  | "speedScore"
  | "policyComplianceScore";

const QA_SCORE_FIELDS: { key: QaScoreKey; label: string; rowKey: string }[] = [
  { key: "toneScore", label: "Tone", rowKey: "tone_score" },
  { key: "completenessScore", label: "Complete", rowKey: "completeness_score" },
  { key: "accuracyScore", label: "Accurate", rowKey: "accuracy_score" },
  { key: "nextStepScore", label: "Next Step", rowKey: "next_step_score" },
  { key: "speedScore", label: "Speed", rowKey: "speed_score" },
  { key: "policyComplianceScore", label: "Policy", rowKey: "policy_compliance_score" },
];

export function QaDrawerPanel({
  item,
  canManageInboxState,
  canCreateManagerCoaching,
  mutationState,
  onCreateScorecard,
}: {
  item: MetaInboxQueueDisplayItem | null;
  canManageInboxState: boolean;
  canCreateManagerCoaching: boolean;
  mutationState: MutationState;
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
    <div data-component="qa-drawer-panel">
      <DrawerSection
        title="QA Scorecards"
        icon={<ShieldCheck size={17} />}
        action={
          <span className="shrink-0 text-[10px] uppercase tracking-[0.14em] text-hp-muted">
            {scorecards.length ? `${scorecards.length} recent` : "None"}
          </span>
        }
      >
        {scorecards.length ? (
          <div className="space-y-2">
            {scorecards.map((scorecard) => (
              <article key={scorecard.id} className="border border-hp-rule bg-hp-inset p-3">
                <div className="flex min-w-0 items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-title text-2xl leading-none text-hp-ink oldstyle-nums">
                      Overall {scorecard.overall_score.toFixed(1)} / 5
                    </p>
                    <p className="mt-2 break-words text-xs leading-5 text-hp-muted">
                      {scorecard.coaching_note || "No coaching note."}
                    </p>
                  </div>
                  <span className="shrink-0 text-[10px] uppercase tracking-[0.14em] text-hp-muted">
                    {formatDateLabel(scorecard.created_at)}
                  </span>
                </div>
                <dl className="mt-3 grid grid-cols-2 gap-2 text-[10px] uppercase tracking-[0.14em] text-hp-muted">
                  {QA_SCORE_FIELDS.map((field) => (
                    <div key={field.key} className="flex items-center justify-between gap-2">
                      <dt>{field.label}</dt>
                      <dd className="text-hp-ink">
                        {String(scorecard[field.rowKey as keyof typeof scorecard])}
                      </dd>
                    </div>
                  ))}
                </dl>
                <p className="mt-3 text-[10px] uppercase tracking-[0.14em] text-hp-muted">
                  By {shortIdentifier(scorecard.reviewed_by)}
                  {scorecard.reviewed_user_id
                    ? ` · For ${shortIdentifier(scorecard.reviewed_user_id)}`
                    : ""}
                </p>
              </article>
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
                      {formatDateLabel(attempt.created_at)} · {attempt.status} ·{" "}
                      {attempt.reply_text.slice(0, 40)}
                    </option>
                  ))}
                </select>
              </label>
              <div className="grid gap-3">
                {QA_SCORE_FIELDS.map((field) => (
                  <fieldset key={field.key} className="grid gap-1">
                    <legend className="text-[10px] uppercase tracking-[0.14em] text-hp-muted">
                      {field.label}
                    </legend>
                    <div className="grid grid-cols-5 gap-1">
                      {[1, 2, 3, 4, 5].map((score) => {
                        const active = scores[field.key] === score;
                        return (
                          <button
                            key={score}
                            type="button"
                            onClick={() =>
                              setScores((current) => ({ ...current, [field.key]: score }))
                            }
                            aria-pressed={active}
                            className={[
                              "h-8 border px-2 text-xs lining-nums transition-colors",
                              active
                                ? "border-hp-ink bg-hp-ink text-hp-foundation"
                                : "border-hp-rule bg-hp-card text-hp-ink hover:border-hp-ink",
                            ].join(" ")}
                          >
                            {score}
                          </button>
                        );
                      })}
                    </div>
                  </fieldset>
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
                  className="inline-flex min-h-9 items-center gap-2 border border-hp-ink bg-hp-ink px-3 py-2 text-xs uppercase tracking-[0.12em] text-hp-foundation disabled:cursor-not-allowed disabled:opacity-50"
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
                      mutationState.status === "error" ? "text-signal-danger" : "text-hp-muted"
                    }`}
                  >
                    {mutationState.message}
                  </span>
                ) : null}
              </div>
            </div>
          ) : (
            <p className="text-xs leading-5 text-hp-muted">
              QA scorecards are manager coaching only. Sales can view accessible QA context,
              but only sales lead/admin can create scorecards.
            </p>
          )}
        </div>
      </DrawerSection>
    </div>
  );
}
