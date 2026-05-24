import {
  META_INBOX_CONVERSATION_STATUSES,
  META_INBOX_LEAD_QUALITY_LABELS,
  META_INBOX_LEAD_QUALITY_REASON_TAGS,
  META_INBOX_LOST_REASONS,
  META_INBOX_OUTCOMES,
  META_INBOX_QUEUE_CATEGORIES,
  META_INBOX_SOURCE_CHANNELS,
  metaInboxVocabularyKeys,
  type MetaInboxConversationStatusKey,
  type MetaInboxLeadQualityKey,
  type MetaInboxLeadQualityReasonTagKey,
  type MetaInboxLostReasonKey,
  type MetaInboxOutcomeKey,
  type MetaInboxQueueCategoryKey,
  type MetaInboxSourceChannelKey,
} from "./meta-inbox-vocabulary.ts";

export type MetaInboxTeamQueueAccess = {
  queueCategoryKey: string | null | undefined;
};

export type MetaInboxFinalStateInput = {
  conversationStatus: string | null | undefined;
  leadQuality: string | null | undefined;
  leadQualityReasonTags: readonly string[] | null | undefined;
  inboxOutcome: string | null | undefined;
  inboxLostReason?: string | null | undefined;
};

export type MetaInboxValidationIssue = {
  field:
    | "conversationStatus"
    | "leadQuality"
    | "leadQualityReasonTags"
    | "inboxOutcome"
    | "inboxLostReason";
  reason: "required" | "invalid";
};

const QUEUE_CATEGORY_KEYS = keySet(META_INBOX_QUEUE_CATEGORIES);
const SOURCE_CHANNEL_KEYS = keySet(META_INBOX_SOURCE_CHANNELS);
const CONVERSATION_STATUS_KEYS = keySet(META_INBOX_CONVERSATION_STATUSES);
const LEAD_QUALITY_KEYS = keySet(META_INBOX_LEAD_QUALITY_LABELS);
const LEAD_QUALITY_REASON_TAG_KEYS = keySet(META_INBOX_LEAD_QUALITY_REASON_TAGS);
const OUTCOME_KEYS = keySet(META_INBOX_OUTCOMES);
const LOST_REASON_KEYS = keySet(META_INBOX_LOST_REASONS);

export function isMetaInboxQueueCategoryKey(
  value: string | null | undefined,
): value is MetaInboxQueueCategoryKey {
  return hasKey(QUEUE_CATEGORY_KEYS, value);
}

export function isMetaInboxSourceChannelKey(
  value: string | null | undefined,
): value is MetaInboxSourceChannelKey {
  return hasKey(SOURCE_CHANNEL_KEYS, value);
}

export function isMetaInboxConversationStatusKey(
  value: string | null | undefined,
): value is MetaInboxConversationStatusKey {
  return hasKey(CONVERSATION_STATUS_KEYS, value);
}

export function isMetaInboxLeadQualityKey(
  value: string | null | undefined,
): value is MetaInboxLeadQualityKey {
  return hasKey(LEAD_QUALITY_KEYS, value);
}

export function isMetaInboxLeadQualityReasonTagKey(
  value: string | null | undefined,
): value is MetaInboxLeadQualityReasonTagKey {
  return hasKey(LEAD_QUALITY_REASON_TAG_KEYS, value);
}

export function isMetaInboxOutcomeKey(
  value: string | null | undefined,
): value is MetaInboxOutcomeKey {
  return hasKey(OUTCOME_KEYS, value);
}

export function isMetaInboxLostReasonKey(
  value: string | null | undefined,
): value is MetaInboxLostReasonKey {
  return hasKey(LOST_REASON_KEYS, value);
}

export function metaInboxAllowedQueueCategoriesForTeams(
  accessRows: readonly MetaInboxTeamQueueAccess[],
) {
  const accessible = new Set(
    accessRows
      .map((row) => row.queueCategoryKey)
      .filter(isMetaInboxQueueCategoryKey),
  );

  return metaInboxVocabularyKeys(META_INBOX_QUEUE_CATEGORIES).filter((key) =>
    accessible.has(key),
  );
}

export function validateMetaInboxFinalState(input: MetaInboxFinalStateInput) {
  const issues: MetaInboxValidationIssue[] = [];
  const finalStatus =
    input.conversationStatus === "closed" || input.conversationStatus === "lost_lead";
  const finalOutcome = Boolean(
    input.inboxOutcome && input.inboxOutcome !== "no_outcome_yet",
  );

  if (input.conversationStatus && !isMetaInboxConversationStatusKey(input.conversationStatus)) {
    issues.push({ field: "conversationStatus", reason: "invalid" });
  }

  if (input.leadQuality && !isMetaInboxLeadQualityKey(input.leadQuality)) {
    issues.push({ field: "leadQuality", reason: "invalid" });
  }

  if (input.inboxOutcome && !isMetaInboxOutcomeKey(input.inboxOutcome)) {
    issues.push({ field: "inboxOutcome", reason: "invalid" });
  }

  if (input.inboxLostReason && !isMetaInboxLostReasonKey(input.inboxLostReason)) {
    issues.push({ field: "inboxLostReason", reason: "invalid" });
  }

  const invalidReasonTag = (input.leadQualityReasonTags || []).some(
    (tag) => !isMetaInboxLeadQualityReasonTagKey(tag),
  );
  if (invalidReasonTag) {
    issues.push({ field: "leadQualityReasonTags", reason: "invalid" });
  }

  if (finalStatus || finalOutcome) {
    if (!input.leadQuality) issues.push({ field: "leadQuality", reason: "required" });
    if (!input.leadQualityReasonTags?.length) {
      issues.push({ field: "leadQualityReasonTags", reason: "required" });
    }
    if (!input.inboxOutcome || input.inboxOutcome === "no_outcome_yet") {
      issues.push({ field: "inboxOutcome", reason: "required" });
    }
  }

  if (
    (input.conversationStatus === "lost_lead" || input.inboxOutcome === "lost") &&
    !input.inboxLostReason
  ) {
    issues.push({ field: "inboxLostReason", reason: "required" });
  }

  return {
    ok: issues.length === 0,
    issues,
  };
}

function keySet(options: readonly { key: string }[]) {
  return new Set(options.map((option) => option.key));
}

function hasKey<const TKey extends string>(
  keys: ReadonlySet<TKey>,
  value: string | null | undefined,
): value is TKey {
  return Boolean(value && keys.has(value as TKey));
}
