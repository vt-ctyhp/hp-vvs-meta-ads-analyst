"use client";

import { Link2, Mail, Pencil, Phone, Plus, Tags, Trash2, UserRound } from "lucide-react";
import { useState } from "react";

import type { MetaInboxQueueDisplayItem } from "../../../lib/meta-inbox-queue-view.ts";
import {
  META_INBOX_CONVERSATION_STATUSES,
  META_INBOX_CUSTOMER_CONTACT_METHODS,
  META_INBOX_LEAD_QUALITY_LABELS,
  META_INBOX_LEAD_QUALITY_REASON_TAGS,
  META_INBOX_LOST_REASONS,
  META_INBOX_OUTCOMES,
  META_INBOX_QUEUE_CATEGORIES,
  META_INBOX_SOURCE_CHANNELS,
  metaInboxVocabularyLabel,
  type MetaInboxQueueCategoryKey,
} from "../../../lib/meta-inbox-vocabulary.ts";
import type {
  MetaInboxContactMethodMutationInput,
  MetaInboxWorkflowPatchInput,
  SocialInboxConversation,
  SocialInboxCustomerContactMethod,
} from "../../../lib/social-inbox.ts";
import { platformOf } from "./conversation-header.tsx";
import {
  DrawerSection,
  FilterSelect,
  formatDateTimeLocal,
  InfoLine,
} from "./drawer-panel-helpers.tsx";
import type { DispositionPreset } from "./use-drawer-state.ts";

type MutationState = {
  status: "idle" | "saving" | "saved" | "error";
  message: string | null;
};

export function DetailsDrawerPanel({
  item,
  canManageInboxState,
  mutationState,
  contactMethodMutationState = mutationState,
  workflowMutationState = mutationState,
  onContactMethodMutation,
  onWorkflowUpdate,
  instruction,
  onInstructionChange,
  preset = null,
}: {
  item: MetaInboxQueueDisplayItem | null;
  canManageInboxState: boolean;
  mutationState: MutationState;
  contactMethodMutationState?: MutationState;
  workflowMutationState?: MutationState;
  onContactMethodMutation: (
    conversationId: string,
    method: "POST" | "PATCH" | "DELETE",
    input: MetaInboxContactMethodMutationInput,
  ) => void;
  onWorkflowUpdate: (conversationId: string, input: MetaInboxWorkflowPatchInput) => void;
  instruction: string;
  onInstructionChange: (value: string) => void;
  replyWindowNow?: number;
  preset?: DispositionPreset;
}) {
  if (!item) {
    return (
      <div className="p-5 text-sm leading-6 text-hp-muted">
        Select a conversation to see customer and workflow details.
      </div>
    );
  }

  return (
    <div data-component="details-drawer-panel">
      {preset === "close" ? <ClosePresetBanner /> : null}
      <CustomerSection
        item={item}
        canManageInboxState={canManageInboxState}
        mutationState={contactMethodMutationState}
        onContactMethodMutation={onContactMethodMutation}
      />
      <WorkflowSection
        key={`${item.inboxConversation?.id || item.id}:${preset || "normal"}`}
        item={item}
        canManageInboxState={canManageInboxState}
        mutationState={workflowMutationState}
        onWorkflowUpdate={onWorkflowUpdate}
        instruction={instruction}
        onInstructionChange={onInstructionChange}
        preset={preset}
      />
    </div>
  );
}

function ClosePresetBanner() {
  return (
    <section className="border-b border-signal-warning bg-signal-warning-bg px-5 py-4">
      <p className="font-title text-sm normal-case leading-5 text-hp-ink">
        Closing this conversation
      </p>
      <p className="mt-1 text-sm leading-6 text-hp-body">
        Status is pre-set to Closed. Save state requires Lead quality, ≥1 reason tag, and an
        Outcome filled in below.
      </p>
    </section>
  );
}

function CustomerSection({
  item,
  canManageInboxState,
  mutationState,
  onContactMethodMutation,
}: {
  item: MetaInboxQueueDisplayItem;
  canManageInboxState: boolean;
  mutationState: MutationState;
  onContactMethodMutation: (
    conversationId: string,
    method: "POST" | "PATCH" | "DELETE",
    input: MetaInboxContactMethodMutationInput,
  ) => void;
}) {
  const profile = item.profile;
  const firstTouch = item.firstTouch;
  const sourcePlatform = platformOf(item.sourceChannel);
  const handle = sourcePlatform === "IG" && profile?.username ? `@${profile.username}` : null;
  const profileUrl = profile?.profile_url || null;
  const platformLinkLabel = sourcePlatform === "IG"
    ? "Open on Instagram →"
    : sourcePlatform === "FB"
      ? "Open on Facebook →"
      : null;

  return (
    <DrawerSection title="Customer" icon={<UserRound size={17} />}>
      <div className="space-y-4">
        <div>
          <h3 className="font-title break-words text-[24px] leading-tight text-hp-ink">
            {profile?.display_name || item.sender}
          </h3>
          {handle ? (
            <p data-handle-platform={sourcePlatform} className="mt-1 italic text-hp-muted">
              {handle}
            </p>
          ) : null}
          {profileUrl && platformLinkLabel ? (
            <a
              href={profileUrl}
              target="_blank"
              rel="noreferrer"
              className="mt-3 inline-flex border border-hp-rule bg-hp-card px-3 py-2 text-[10px] uppercase tracking-[0.14em] text-hp-ink underline-offset-4 hover:border-hp-ink hover:bg-hp-inset"
            >
              {platformLinkLabel}
            </a>
          ) : (
            <p className="mt-3 text-sm leading-6 text-hp-muted">No profile link available</p>
          )}
        </div>

        <ContactMethods
          item={item}
          canManageInboxState={canManageInboxState}
          mutationState={mutationState}
          onContactMethodMutation={onContactMethodMutation}
        />

        <div className="border-t border-hp-rule pt-4">
          <p className="mb-3 text-[10px] uppercase tracking-[0.14em] text-hp-muted">
            First Touch
          </p>
          {firstTouch?.creative_image_url ? (
            <a
              href={firstTouch.source_permalink || firstTouch.creative_image_url}
              target="_blank"
              rel="noreferrer"
              className="mb-3 block border border-hp-rule bg-hp-card hover:border-hp-ink"
              title={firstTouch.ad_title || "Ad creative"}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={firstTouch.creative_image_url}
                alt={firstTouch.ad_title || "Ad creative"}
                className="block h-32 w-full object-cover"
              />
              {firstTouch.ad_title ? (
                <p className="border-t border-hp-rule px-3 py-2 text-xs italic text-hp-muted">
                  {firstTouch.ad_title}
                </p>
              ) : null}
            </a>
          ) : null}
          <div className="space-y-2">
            <InfoLine
              label="Source"
              value={firstTouchSourceLabel(item.sourceChannel, firstTouch)}
            />
            <InfoLine label="Umbrella" value={firstTouchFieldLabel(firstTouch?.campaign_umbrella_id, firstTouch?.attribution_method)} />
            <InfoLine label="Campaign" value={firstTouchFieldLabel(firstTouch?.campaign_id, firstTouch?.attribution_method)} />
            <InfoLine label="Ad set" value={firstTouchFieldLabel(firstTouch?.adset_id, firstTouch?.attribution_method)} />
            <InfoLine label="Ad" value={firstTouch?.ad_id || null} />
            <InfoLine label="Creative" value={firstTouchFieldLabel(firstTouch?.creative_id, firstTouch?.attribution_method)} />
            <InfoLine
              label="Source post"
              value={firstTouch?.source_permalink ? "Open source post →" : null}
              href={firstTouch?.source_permalink || null}
            />
          </div>
        </div>
      </div>
    </DrawerSection>
  );
}

function firstTouchSourceLabel(
  sourceChannel: string,
  firstTouch: Record<string, unknown> | null | undefined,
): string {
  const base = metaInboxVocabularyLabel(META_INBOX_SOURCE_CHANNELS, sourceChannel);
  if (!firstTouch || firstTouch.attribution_method === "none") {
    const platform = sourceChannel?.startsWith("instagram") ? "Instagram" : "Facebook";
    return `${platform} Message — no ad referral`;
  }
  return base;
}

function firstTouchFieldLabel(
  value: unknown,
  attributionMethod: unknown,
): string | null {
  if (typeof value === "string" && value.trim()) return value;
  if (attributionMethod === "meta_referral") return "Ad linked, campaign resolving…";
  return null;
}

function ContactMethods({
  item,
  canManageInboxState,
  mutationState,
  onContactMethodMutation,
}: {
  item: MetaInboxQueueDisplayItem;
  canManageInboxState: boolean;
  mutationState: MutationState;
  onContactMethodMutation: (
    conversationId: string,
    method: "POST" | "PATCH" | "DELETE",
    input: MetaInboxContactMethodMutationInput,
  ) => void;
}) {
  const conversationId = item.inboxConversation?.id || null;
  const canEdit = Boolean(canManageInboxState && conversationId && item.profile);
  const [typeDraft, setTypeDraft] = useState<MetaInboxContactMethodMutationInput["type"]>("phone");
  const [valueDraft, setValueDraft] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValueDraft, setEditValueDraft] = useState("");
  const activeContacts = item.contactMethods.filter((contactMethod) => !contactMethod.deleted_at);
  const selectedEdit = activeContacts.find((contactMethod) => contactMethod.id === editingId) || null;
  const isSaving = mutationState.status === "saving";

  function addContactMethod() {
    if (!conversationId || !typeDraft || !valueDraft.trim()) return;
    onContactMethodMutation(conversationId, "POST", {
      type: typeDraft,
      value: valueDraft,
      changeReason: "Sales entered customer contact method in inbox.",
    });
    setValueDraft("");
  }

  function saveEdit() {
    if (!conversationId || !selectedEdit || !editValueDraft.trim()) return;
    onContactMethodMutation(conversationId, "PATCH", {
      contactMethodId: selectedEdit.id,
      type: selectedEdit.type,
      value: editValueDraft,
      changeReason: "Sales edited customer contact method in inbox.",
    });
    setEditingId(null);
    setEditValueDraft("");
  }

  function deleteContactMethod(contactMethod: SocialInboxCustomerContactMethod) {
    if (!conversationId) return;
    onContactMethodMutation(conversationId, "DELETE", {
      contactMethodId: contactMethod.id,
      changeReason: "Sales deleted customer contact method in inbox.",
    });
  }

  return (
    <div className="border-t border-hp-rule pt-4">
      <div className="mb-2 flex items-center justify-between gap-3">
        <p className="text-[10px] uppercase tracking-[0.14em] text-hp-muted">
          Contact Methods
        </p>
        <span className="text-[10px] uppercase tracking-[0.14em] text-hp-muted">
          {mutationState.message || (canEdit ? "Editable" : "Read-only")}
        </span>
      </div>

      {activeContacts.length ? (
        <div className="space-y-2">
          {activeContacts.map((contactMethod) => {
            const isEditing = editingId === contactMethod.id;
            return (
              <div key={contactMethod.id} className="border border-hp-rule bg-hp-inset p-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 text-sm text-hp-ink">
                      {contactMethod.type === "email" ? <Mail size={14} /> : <Phone size={14} />}
                      <span className="min-w-0 break-all">{contactMethod.value_display}</span>
                    </div>
                    <p className="mt-1 text-xs leading-5 text-hp-muted">
                      {metaInboxVocabularyLabel(
                        META_INBOX_CUSTOMER_CONTACT_METHODS,
                        contactMethod.type,
                      )}{" "}
                      · {contactMethod.source.replaceAll("_", " ")}
                    </p>
                  </div>
                  {canEdit ? (
                    <div className="flex shrink-0 items-center gap-1">
                      <button
                        type="button"
                        onClick={() => {
                          setEditingId(contactMethod.id);
                          setEditValueDraft(contactMethod.value_display);
                        }}
                        disabled={isSaving}
                        aria-label="Edit Contact"
                        className="flex h-8 w-8 items-center justify-center border border-hp-rule text-hp-ink transition hover:border-hp-ink disabled:opacity-50"
                      >
                        <Pencil size={13} />
                      </button>
                      <button
                        type="button"
                        onClick={() => deleteContactMethod(contactMethod)}
                        disabled={isSaving}
                        aria-label="Delete Contact"
                        className="flex h-8 w-8 items-center justify-center border border-hp-rule text-signal-danger transition hover:border-signal-danger disabled:opacity-50"
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                  ) : null}
                </div>
                {isEditing ? (
                  <div className="mt-3 grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto]">
                    <input
                      value={editValueDraft}
                      onChange={(event) => setEditValueDraft(event.target.value)}
                      className="h-9 min-w-0 border border-hp-rule bg-white px-3 text-sm text-hp-ink outline-none focus:border-hp-ink"
                    />
                    <button
                      type="button"
                      onClick={saveEdit}
                      disabled={isSaving || !editValueDraft.trim()}
                      className="h-9 border border-hp-ink px-3 text-[10px] uppercase tracking-[0.14em] text-hp-ink transition hover:bg-hp-ink hover:text-hp-foundation disabled:opacity-50"
                    >
                      Save
                    </button>
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
      ) : (
        <p className="text-sm leading-6 text-hp-muted">
          No customer phone or email captured yet.
        </p>
      )}

      {canEdit ? (
        <div className="mt-3 grid gap-2">
          <div className="grid gap-2 sm:grid-cols-[130px_minmax(0,1fr)]">
            <select
              value={typeDraft || "phone"}
              onChange={(event) =>
                setTypeDraft(event.target.value as MetaInboxContactMethodMutationInput["type"])
              }
              className="h-10 border border-hp-rule bg-white px-3 text-sm text-hp-ink outline-none focus:border-hp-ink"
            >
              {META_INBOX_CUSTOMER_CONTACT_METHODS.map((method) => (
                <option key={method.key} value={method.key}>
                  {method.label}
                </option>
              ))}
            </select>
            <input
              value={valueDraft}
              onChange={(event) => setValueDraft(event.target.value)}
              placeholder="Customer phone or email"
              className="h-10 min-w-0 border border-hp-rule bg-white px-3 text-sm text-hp-ink outline-none placeholder:text-hp-muted focus:border-hp-ink"
            />
          </div>
          <button
            type="button"
            onClick={addContactMethod}
            disabled={isSaving || !valueDraft.trim()}
            className="flex h-9 items-center justify-center gap-2 border border-hp-ink px-3 text-[10px] uppercase tracking-[0.14em] text-hp-ink transition hover:bg-hp-ink hover:text-hp-foundation disabled:opacity-50"
          >
            <Plus size={13} />
            Add Contact
          </button>
        </div>
      ) : (
        <p className="mt-3 text-xs leading-5 text-hp-muted">
          Sales users can add, edit, and delete customer phone/email for conversations they can
          access.
        </p>
      )}
    </div>
  );
}

function WorkflowSection({
  item,
  canManageInboxState,
  mutationState,
  onWorkflowUpdate,
  instruction,
  onInstructionChange,
  preset,
}: {
  item: MetaInboxQueueDisplayItem;
  canManageInboxState: boolean;
  mutationState: MutationState;
  onWorkflowUpdate: (conversationId: string, input: MetaInboxWorkflowPatchInput) => void;
  instruction: string;
  onInstructionChange: (value: string) => void;
  preset: DispositionPreset;
}) {
  const conversation = item.inboxConversation;
  const [queueDraft, setQueueDraft] = useState<MetaInboxQueueCategoryKey>(
    item.queueCategoryKey || "uncategorized_needs_review",
  );
  const [statusDraft, setStatusDraft] = useState<SocialInboxConversation["conversation_status"]>(
    preset === "close" ? "closed" : item.conversationStatus || "new_inquiry",
  );
  const [leadQualityDraft, setLeadQualityDraft] = useState(conversation?.lead_quality || "");
  const [reasonTagDrafts, setReasonTagDrafts] = useState<string[]>(
    conversation?.lead_quality_reason_tags || [],
  );
  const [outcomeDraft, setOutcomeDraft] = useState<SocialInboxConversation["inbox_outcome"]>(
    conversation?.inbox_outcome || "no_outcome_yet",
  );
  const [lostReasonDraft, setLostReasonDraft] = useState(conversation?.inbox_lost_reason || "");
  const [followUpDraft, setFollowUpDraft] = useState(formatDateTimeLocal(conversation?.follow_up_at));
  const [changeReasonDraft, setChangeReasonDraft] = useState("");
  const canEditWorkflow = Boolean(conversation && canManageInboxState);
  const isSaving = mutationState.status === "saving";
  const finalizing =
    statusDraft === "closed" ||
    statusDraft === "lost_lead" ||
    outcomeDraft !== "no_outcome_yet";
  const missingCloseoutRequirements =
    finalizing &&
    (!leadQualityDraft ||
      reasonTagDrafts.length === 0 ||
      outcomeDraft === "no_outcome_yet" ||
      ((statusDraft === "lost_lead" || outcomeDraft === "lost") && !lostReasonDraft));
  const saveDisabled = !canEditWorkflow || isSaving || missingCloseoutRequirements;

  function saveWorkflow() {
    if (!conversation || saveDisabled) return;
    onWorkflowUpdate(conversation.id, {
      queueCategoryKey: queueDraft,
      conversationStatus: statusDraft,
      followUpAt: followUpDraft || null,
      leadQuality: leadQualityDraft
        ? (leadQualityDraft as NonNullable<MetaInboxWorkflowPatchInput["leadQuality"]>)
        : null,
      leadQualityReasonTags: reasonTagDrafts as NonNullable<
        MetaInboxWorkflowPatchInput["leadQualityReasonTags"]
      >,
      inboxOutcome: outcomeDraft,
      inboxLostReason: lostReasonDraft
        ? (lostReasonDraft as NonNullable<MetaInboxWorkflowPatchInput["inboxLostReason"]>)
        : null,
      changeReason: changeReasonDraft,
    });
  }

  function claimSelf() {
    if (!conversation || !canEditWorkflow) return;
    onWorkflowUpdate(conversation.id, {
      assignmentMode: "claim_self",
      changeReason: changeReasonDraft || "Claimed from inbox workflow panel.",
    });
  }

  function returnToTeamQueue() {
    if (!conversation || !canEditWorkflow) return;
    onWorkflowUpdate(conversation.id, {
      assignmentMode: "team_queue",
      changeReason: changeReasonDraft || "Returned to team queue.",
    });
  }

  return (
    <DrawerSection
      title="Workflow"
      icon={<Tags size={17} />}
      action={
        <span className="text-[10px] uppercase tracking-[0.14em] text-hp-muted">
          {mutationState.message || (canEditWorkflow ? "Ready" : "Read-only")}
        </span>
      }
    >
      <div className="grid gap-3">
        <div className="border border-hp-rule bg-hp-inset p-3">
          <div className="mb-2 flex items-center gap-2 text-hp-ink">
            <Link2 size={15} />
            <span className="text-[10px] uppercase tracking-[0.14em]">
              Routing Explanation
            </span>
          </div>
          <p className="text-sm leading-6 text-hp-muted">
            {item.routingExplanation || "No normalized routing explanation has been captured yet."}
          </p>
        </div>

        <FilterSelect
          label="Queue"
          value={queueDraft}
          onChange={(value) => setQueueDraft(value as MetaInboxQueueCategoryKey)}
          disabled={!canEditWorkflow || isSaving}
          options={META_INBOX_QUEUE_CATEGORIES.map((category) => [category.key, category.label])}
        />
        <FilterSelect
          label="Status"
          value={statusDraft}
          onChange={(value) =>
            setStatusDraft(value as SocialInboxConversation["conversation_status"])
          }
          disabled={!canEditWorkflow || isSaving}
          warning={preset === "close"}
          options={META_INBOX_CONVERSATION_STATUSES.map((statusOption) => [
            statusOption.key,
            statusOption.label,
          ])}
        />
        <FilterSelect
          label="Lead Quality"
          value={leadQualityDraft}
          onChange={setLeadQualityDraft}
          disabled={!canEditWorkflow || isSaving}
          options={[
            ["", "Not Labeled"],
            ...META_INBOX_LEAD_QUALITY_LABELS.map((quality) => [quality.key, quality.label] as [
              string,
              string,
            ]),
          ]}
        />
        <label className="block min-w-0">
          <span className="mb-1.5 block text-[10px] uppercase tracking-[0.14em] text-hp-muted">
            Reason Tags
          </span>
          <select
            multiple
            aria-label="Reason Tags"
            value={reasonTagDrafts}
            onChange={(event) =>
              setReasonTagDrafts(
                Array.from(event.currentTarget.selectedOptions).map((option) => option.value),
              )
            }
            disabled={!canEditWorkflow || isSaving}
            className="h-28 w-full border border-hp-rule bg-white px-3 py-2 text-sm text-hp-ink outline-none transition-colors focus:border-hp-ink disabled:bg-hp-inset disabled:text-hp-muted"
          >
            {META_INBOX_LEAD_QUALITY_REASON_TAGS.map((tag) => (
              <option key={tag.key} value={tag.key}>
                {tag.label}
              </option>
            ))}
          </select>
        </label>
        <FilterSelect
          label="Inbox Outcome"
          value={outcomeDraft}
          onChange={(value) => setOutcomeDraft(value as SocialInboxConversation["inbox_outcome"])}
          disabled={!canEditWorkflow || isSaving}
          options={META_INBOX_OUTCOMES.map((outcome) => [outcome.key, outcome.label])}
        />
        <FilterSelect
          label="Lost Reason"
          value={lostReasonDraft}
          onChange={setLostReasonDraft}
          disabled={!canEditWorkflow || isSaving}
          options={[
            ["", "Not Lost"],
            ...META_INBOX_LOST_REASONS.map((reason) => [reason.key, reason.label] as [
              string,
              string,
            ]),
          ]}
        />
        <label className="block">
          <span className="mb-1.5 block text-[10px] uppercase tracking-[0.14em] text-hp-muted">
            Follow-Up
          </span>
          <input
            type="datetime-local"
            value={followUpDraft}
            onChange={(event) => setFollowUpDraft(event.target.value)}
            disabled={!canEditWorkflow || isSaving}
            className="h-10 w-full border border-hp-rule bg-white px-3 text-sm text-hp-ink outline-none transition-colors focus:border-hp-ink disabled:bg-hp-inset disabled:text-hp-muted"
          />
        </label>
        <label className="block">
          <span className="mb-1.5 block text-[10px] uppercase tracking-[0.14em] text-hp-muted">
            Change Note
          </span>
          <textarea
            value={changeReasonDraft}
            onChange={(event) => setChangeReasonDraft(event.target.value)}
            disabled={!canEditWorkflow || isSaving}
            rows={3}
            placeholder="Optional note for audit trail"
            className="w-full resize-none border border-hp-rule bg-white p-3 text-sm leading-5 text-hp-body outline-none placeholder:text-hp-muted focus:border-hp-ink disabled:bg-hp-inset disabled:text-hp-muted"
          />
        </label>

        {!canEditWorkflow ? (
          <p className="text-sm leading-6 text-hp-muted">
            Sales and sales lead users can claim, route, label, close, and mark lost
            conversations they can access. Marketing remains read-only for inbox operations.
          </p>
        ) : null}

        {canEditWorkflow && missingCloseoutRequirements ? (
          <p className="border border-signal-warning bg-signal-warning-bg px-3 py-2 text-xs leading-5 text-hp-body">
            Fill Lead Quality, at least one reason tag, and Inbox Outcome before saving a close
            or lost update.
          </p>
        ) : null}

        <div className="grid gap-2 sm:grid-cols-3">
          <button
            type="button"
            onClick={claimSelf}
            disabled={!canEditWorkflow || isSaving}
            className="border border-hp-rule px-3 py-2 text-[10px] uppercase tracking-[0.14em] text-hp-ink transition hover:border-hp-ink disabled:opacity-50"
          >
            Claim Self
          </button>
          <button
            type="button"
            onClick={returnToTeamQueue}
            disabled={!canEditWorkflow || isSaving}
            className="border border-hp-rule px-3 py-2 text-[10px] uppercase tracking-[0.14em] text-hp-ink transition hover:border-hp-ink disabled:opacity-50"
          >
            Team Queue
          </button>
          <button
            type="button"
            onClick={saveWorkflow}
            disabled={saveDisabled}
            className="bg-hp-ink px-3 py-2 text-[10px] uppercase tracking-[0.14em] text-hp-foundation transition hover:opacity-90 disabled:opacity-50"
          >
            Save State
          </button>
        </div>
        <p className="text-xs leading-5 text-hp-muted">
          Close and lost updates require Lead Quality, at least one reason tag, Inbox Outcome,
          and Lost Reason when lost. Every saved change writes an audit event.
        </p>

        <label className="block border-t border-hp-rule pt-4">
          <span className="mb-1.5 block text-[10px] uppercase tracking-[0.14em] text-hp-muted">
            Staff Guidance
          </span>
          <textarea
            value={instruction}
            onChange={(event) => onInstructionChange(event.target.value)}
            disabled={!conversation}
            rows={3}
            placeholder="Add price, appointment, sizing, or tone notes for the human reply."
            className="w-full resize-none border border-hp-rule bg-white p-3 text-sm leading-5 text-hp-body outline-none placeholder:text-hp-muted focus:border-hp-ink disabled:bg-hp-inset disabled:text-hp-muted"
          />
        </label>
      </div>
    </DrawerSection>
  );
}
