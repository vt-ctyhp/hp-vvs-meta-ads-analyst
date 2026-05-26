"use client";

import { Loader2, Pencil, Plus } from "lucide-react";
import { useState } from "react";

import type { MetaInboxQueueDisplayItem } from "../../../lib/meta-inbox-queue-view.ts";
import type {
  MetaInboxConversationNoteInput,
  SocialInboxConversationNote,
} from "../../../lib/social-inbox.ts";
import {
  DrawerSection,
  formatDateLabel,
  shortIdentifier,
} from "./drawer-panel-helpers.tsx";

type MutationState = {
  status: "idle" | "saving" | "saved" | "error";
  message: string | null;
};

export function NotesDrawerPanel({
  item,
  canManageInboxState,
  canCreateManagerCoaching,
  mutationState,
  onCreateNote,
}: {
  item: MetaInboxQueueDisplayItem | null;
  canManageInboxState: boolean;
  canCreateManagerCoaching: boolean;
  mutationState: MutationState;
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
    <div data-component="notes-drawer-panel">
      <DrawerSection
        title="Notes & Coaching"
        icon={<Pencil size={17} />}
        action={
          <span className="shrink-0 text-[10px] uppercase tracking-[0.14em] text-hp-muted">
            {notes.length ? `${notes.length} recent` : "None"}
          </span>
        }
      >
        {notes.length ? (
          <div className="space-y-2">
            {notes.map((note) => (
              <article key={note.id} className="border border-hp-rule bg-hp-inset p-3">
                <div className="flex min-w-0 items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm text-hp-ink">{noteTypeLabel(note.note_type)}</p>
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
              </article>
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
                  rows={4}
                  maxLength={4000}
                  placeholder="Add internal context, @mention follow-up, or coaching..."
                  className="mt-1 w-full resize-none border border-hp-rule bg-white px-3 py-2 text-sm normal-case leading-5 tracking-normal text-hp-ink placeholder:text-hp-muted/70"
                />
              </label>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-[10px] uppercase tracking-[0.14em] text-hp-muted">
                  {body.length} / 4000
                </span>
                <button
                  type="button"
                  onClick={() => void submitNote()}
                  disabled={!canSubmit || mutationState.status === "saving"}
                  className="inline-flex min-h-9 items-center gap-2 border border-hp-ink bg-hp-ink px-3 py-2 text-xs uppercase tracking-[0.12em] text-hp-foundation disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {mutationState.status === "saving" ? (
                    <Loader2 size={13} className="animate-spin" />
                  ) : (
                    <Plus size={13} />
                  )}
                  <span className="whitespace-nowrap">Add Note</span>
                </button>
              </div>
              {mutationState.message ? (
                <p
                  className={`text-xs leading-5 ${
                    mutationState.status === "error" ? "text-signal-danger" : "text-hp-muted"
                  }`}
                >
                  {mutationState.message}
                </p>
              ) : null}
              <p className="text-xs leading-5 text-hp-muted">
                Internal notes and coaching comments are never sent to the customer. Use @name for
                manager follow-up; mention alerts can be added later.
              </p>
            </div>
          ) : (
            <p className="text-xs leading-5 text-hp-muted">
              Notes are read-only for this role. Internal notes and coaching comments are never
              sent to the customer.
            </p>
          )}
        </div>
      </DrawerSection>
    </div>
  );
}

function noteTypeLabel(value: SocialInboxConversationNote["note_type"]) {
  return value === "manager_coaching" ? "Manager Coaching" : "Internal Note";
}
