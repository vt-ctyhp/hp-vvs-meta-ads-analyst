import type { SocialInboxConversation } from "./social-inbox.ts";
import {
  META_INBOX_CONVERSATION_STATUSES,
  META_INBOX_LEAD_QUALITY_LABELS,
  META_INBOX_LEAD_QUALITY_REASON_TAGS,
  META_INBOX_LOST_REASONS,
  META_INBOX_OUTCOMES,
  META_INBOX_QUEUE_CATEGORIES,
  type MetaInboxConversationStatusKey,
  type MetaInboxLeadQualityKey,
  type MetaInboxLeadQualityReasonTagKey,
  type MetaInboxLostReasonKey,
  type MetaInboxOutcomeKey,
  type MetaInboxQueueCategoryKey,
} from "./meta-inbox-vocabulary.ts";

type JsonRecord = Record<string, unknown>;

export type MetaInboxAssignmentMode = "claim_self" | "team_queue";

export type MetaInboxWorkflowPatchInput = {
  assignmentMode?: MetaInboxAssignmentMode;
  assignedTeamId?: string | null;
  queueCategoryKey?: MetaInboxQueueCategoryKey | null;
  conversationStatus?: MetaInboxConversationStatusKey | null;
  followUpAt?: string | null;
  leadQuality?: MetaInboxLeadQualityKey | null;
  leadQualityReasonTags?: MetaInboxLeadQualityReasonTagKey[];
  inboxOutcome?: MetaInboxOutcomeKey | null;
  inboxLostReason?: MetaInboxLostReasonKey | null;
  changeReason?: string | null;
};

export type MetaInboxConversationEventType =
  | "assignment_changed"
  | "status_changed"
  | "lead_quality_changed"
  | "inbox_outcome_changed"
  | "routing_changed"
  | "follow_up_changed";

export type MetaInboxWorkflowEventDraft = {
  eventType: MetaInboxConversationEventType;
  previousValue: JsonRecord;
  newValue: JsonRecord;
  metadata: JsonRecord;
};

export type MetaInboxWorkflowMutation = {
  update: JsonRecord;
  events: MetaInboxWorkflowEventDraft[];
  nextConversation: SocialInboxConversation;
};

type MutationContext = {
  actorUserId: string | null;
  now: string;
};

const QUEUE_KEYS = optionKeys(META_INBOX_QUEUE_CATEGORIES);
const STATUS_KEYS = optionKeys(META_INBOX_CONVERSATION_STATUSES);
const LEAD_QUALITY_KEYS = optionKeys(META_INBOX_LEAD_QUALITY_LABELS);
const REASON_TAG_KEYS = optionKeys(META_INBOX_LEAD_QUALITY_REASON_TAGS);
const OUTCOME_KEYS = optionKeys(META_INBOX_OUTCOMES);
const LOST_REASON_KEYS = optionKeys(META_INBOX_LOST_REASONS);

export function buildMetaInboxWorkflowMutation(
  conversation: SocialInboxConversation,
  input: MetaInboxWorkflowPatchInput,
  context: MutationContext,
): MetaInboxWorkflowMutation {
  const update: JsonRecord = {};
  const events: MetaInboxWorkflowEventDraft[] = [];
  const nextConversation: SocialInboxConversation = {
    ...conversation,
    lead_quality_reason_tags: [...conversation.lead_quality_reason_tags],
  };
  const metadata = workflowMetadata(input);

  applyAssignment(conversation, nextConversation, input, context, update, events, metadata);
  applyQueueCategory(conversation, nextConversation, input, context, update, events, metadata);
  applyStatus(conversation, nextConversation, input, context, update, events, metadata);
  applyFollowUp(conversation, nextConversation, input, update, events, metadata);
  applyLeadQuality(conversation, nextConversation, input, update, events, metadata);
  applyInboxOutcome(conversation, nextConversation, input, update, events, metadata);
  validateCloseoutRequirements(nextConversation);

  return {
    update,
    events,
    nextConversation,
  };
}

function applyAssignment(
  previous: SocialInboxConversation,
  next: SocialInboxConversation,
  input: MetaInboxWorkflowPatchInput,
  context: MutationContext,
  update: JsonRecord,
  events: MetaInboxWorkflowEventDraft[],
  metadata: JsonRecord,
) {
  if (!input.assignmentMode) return;

  if (input.assignmentMode === "claim_self") {
    if (!context.actorUserId || !isUuid(context.actorUserId)) {
      throw new Error("A valid sales user is required to claim a conversation.");
    }
    next.assigned_user_id = context.actorUserId;
  } else {
    next.assigned_user_id = null;
  }

  if (input.assignedTeamId !== undefined) {
    next.assigned_team_id = normalizeOptionalUuid(input.assignedTeamId, "Assigned Team");
  }

  if (
    previous.assigned_user_id === next.assigned_user_id &&
    previous.assigned_team_id === next.assigned_team_id
  ) {
    return;
  }

  update.assigned_user_id = next.assigned_user_id;
  if (input.assignedTeamId !== undefined) {
    update.assigned_team_id = next.assigned_team_id;
  }
  events.push({
    eventType: "assignment_changed",
    previousValue: {
      assignedUserId: previous.assigned_user_id,
      assignedTeamId: previous.assigned_team_id,
    },
    newValue: {
      assignedUserId: next.assigned_user_id,
      assignedTeamId: next.assigned_team_id,
    },
    metadata,
  });
}

function applyQueueCategory(
  previous: SocialInboxConversation,
  next: SocialInboxConversation,
  input: MetaInboxWorkflowPatchInput,
  context: MutationContext,
  update: JsonRecord,
  events: MetaInboxWorkflowEventDraft[],
  metadata: JsonRecord,
) {
  if (input.queueCategoryKey === undefined || input.queueCategoryKey === null) return;
  const queueCategoryKey = requireOption(
    input.queueCategoryKey,
    QUEUE_KEYS,
    "Queue Category",
  ) as MetaInboxQueueCategoryKey;
  if (previous.queue_category_key === queueCategoryKey) return;

  next.queue_category_key = queueCategoryKey;
  next.routing_source = "manual_override";
  next.routing_confidence = 1;
  next.routing_explanation = input.changeReason?.trim()
    ? `Manual routing override: ${input.changeReason.trim()}`
    : "Manual routing override by sales.";

  update.queue_category_key = queueCategoryKey;
  update.routing_source = next.routing_source;
  update.routing_confidence = next.routing_confidence;
  update.routing_explanation = next.routing_explanation;
  update.manual_override_at = context.now;
  update.manual_override_by = context.actorUserId && isUuid(context.actorUserId)
    ? context.actorUserId
    : null;
  events.push({
    eventType: "routing_changed",
    previousValue: {
      queueCategoryKey: previous.queue_category_key,
      routingSource: previous.routing_source,
    },
    newValue: {
      queueCategoryKey,
      routingSource: next.routing_source,
    },
    metadata,
  });
}

function applyStatus(
  previous: SocialInboxConversation,
  next: SocialInboxConversation,
  input: MetaInboxWorkflowPatchInput,
  context: MutationContext,
  update: JsonRecord,
  events: MetaInboxWorkflowEventDraft[],
  metadata: JsonRecord,
) {
  if (input.conversationStatus === undefined || input.conversationStatus === null) return;
  const conversationStatus = requireOption(
    input.conversationStatus,
    STATUS_KEYS,
    "Conversation Status",
  ) as MetaInboxConversationStatusKey;
  if (previous.conversation_status === conversationStatus) return;

  next.conversation_status = conversationStatus;
  update.conversation_status = conversationStatus;
  if (conversationStatus === "closed" || conversationStatus === "lost_lead") {
    update.closed_at = context.now;
  }
  if (
    conversationStatus !== "lost_lead" &&
    next.inbox_outcome !== "lost" &&
    input.inboxLostReason === undefined
  ) {
    next.inbox_lost_reason = null;
    update.inbox_lost_reason = null;
  }
  events.push({
    eventType: "status_changed",
    previousValue: { conversationStatus: previous.conversation_status },
    newValue: { conversationStatus },
    metadata,
  });
}

function applyFollowUp(
  previous: SocialInboxConversation,
  next: SocialInboxConversation,
  input: MetaInboxWorkflowPatchInput,
  update: JsonRecord,
  events: MetaInboxWorkflowEventDraft[],
  metadata: JsonRecord,
) {
  if (input.followUpAt === undefined) return;
  const followUpAt = normalizeOptionalIso(input.followUpAt, "Follow-Up");
  if (previous.follow_up_at === followUpAt) return;

  next.follow_up_at = followUpAt;
  update.follow_up_at = followUpAt;
  events.push({
    eventType: "follow_up_changed",
    previousValue: { followUpAt: previous.follow_up_at },
    newValue: { followUpAt },
    metadata,
  });
}

function applyLeadQuality(
  previous: SocialInboxConversation,
  next: SocialInboxConversation,
  input: MetaInboxWorkflowPatchInput,
  update: JsonRecord,
  events: MetaInboxWorkflowEventDraft[],
  metadata: JsonRecord,
) {
  const hasLeadQuality = input.leadQuality !== undefined;
  const hasReasonTags = input.leadQualityReasonTags !== undefined;
  if (!hasLeadQuality && !hasReasonTags) return;

  if (hasLeadQuality) {
    next.lead_quality = input.leadQuality
      ? requireOption(input.leadQuality, LEAD_QUALITY_KEYS, "Lead Quality")
      : null;
  }
  if (hasReasonTags) {
    next.lead_quality_reason_tags = uniqueReasonTags(input.leadQualityReasonTags || []);
  }

  if (
    previous.lead_quality === next.lead_quality &&
    sameStringArray(previous.lead_quality_reason_tags, next.lead_quality_reason_tags)
  ) {
    return;
  }

  update.lead_quality = next.lead_quality;
  update.lead_quality_reason_tags = next.lead_quality_reason_tags;
  events.push({
    eventType: "lead_quality_changed",
    previousValue: {
      leadQuality: previous.lead_quality,
      reasonTags: previous.lead_quality_reason_tags,
    },
    newValue: {
      leadQuality: next.lead_quality,
      reasonTags: next.lead_quality_reason_tags,
    },
    metadata,
  });
}

function applyInboxOutcome(
  previous: SocialInboxConversation,
  next: SocialInboxConversation,
  input: MetaInboxWorkflowPatchInput,
  update: JsonRecord,
  events: MetaInboxWorkflowEventDraft[],
  metadata: JsonRecord,
) {
  const hasOutcome = input.inboxOutcome !== undefined && input.inboxOutcome !== null;
  const hasLostReason = input.inboxLostReason !== undefined;
  if (!hasOutcome && !hasLostReason) return;

  const outcomeInput = input.inboxOutcome;
  if (hasOutcome && outcomeInput) {
    next.inbox_outcome = requireOption(
      outcomeInput,
      OUTCOME_KEYS,
      "Inbox Outcome",
    ) as MetaInboxOutcomeKey;
  }
  if (hasLostReason) {
    next.inbox_lost_reason = input.inboxLostReason
      ? (requireOption(input.inboxLostReason, LOST_REASON_KEYS, "Lost Reason") as MetaInboxLostReasonKey)
      : null;
  } else if (next.inbox_outcome !== "lost" && next.conversation_status !== "lost_lead") {
    next.inbox_lost_reason = null;
  }

  if (
    previous.inbox_outcome === next.inbox_outcome &&
    previous.inbox_lost_reason === next.inbox_lost_reason
  ) {
    return;
  }

  update.inbox_outcome = next.inbox_outcome;
  update.inbox_lost_reason = next.inbox_lost_reason;
  events.push({
    eventType: "inbox_outcome_changed",
    previousValue: {
      inboxOutcome: previous.inbox_outcome,
      inboxLostReason: previous.inbox_lost_reason,
    },
    newValue: {
      inboxOutcome: next.inbox_outcome,
      inboxLostReason: next.inbox_lost_reason,
    },
    metadata,
  });
}

function validateCloseoutRequirements(conversation: SocialInboxConversation) {
  const finalizing =
    conversation.conversation_status === "closed" ||
    conversation.conversation_status === "lost_lead" ||
    conversation.inbox_outcome !== "no_outcome_yet";
  if (!finalizing) return;

  if (!conversation.lead_quality) {
    throw new Error("Lead Quality is required before closing or marking lost.");
  }
  if (!conversation.lead_quality_reason_tags.length) {
    throw new Error("At least one Lead Quality reason tag is required before closing or marking lost.");
  }
  if (conversation.inbox_outcome === "no_outcome_yet") {
    throw new Error("Inbox Outcome is required before closing or marking lost.");
  }
  if (
    (conversation.conversation_status === "lost_lead" ||
      conversation.inbox_outcome === "lost") &&
    !conversation.inbox_lost_reason
  ) {
    throw new Error("Lost Reason is required before marking a conversation lost.");
  }
}

function workflowMetadata(input: MetaInboxWorkflowPatchInput): JsonRecord {
  return {
    source: "inbox_workflow",
    changeReason: input.changeReason?.trim() || null,
  };
}

function uniqueReasonTags(values: readonly string[]) {
  return Array.from(new Set(values.map((value) => (
    requireOption(value, REASON_TAG_KEYS, "Lead Quality Reason Tag")
  )))) as MetaInboxLeadQualityReasonTagKey[];
}

function requireOption(value: string, allowed: ReadonlySet<string>, label: string) {
  if (!allowed.has(value)) {
    throw new Error(`${label} is not a supported inbox workflow value.`);
  }
  return value;
}

function normalizeOptionalIso(value: string | null, label: string) {
  if (!value) return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    throw new Error(`${label} date is invalid.`);
  }
  return parsed.toISOString();
}

function normalizeOptionalUuid(value: string | null, label: string) {
  if (!value) return null;
  if (!isUuid(value)) {
    throw new Error(`${label} must be a valid ID.`);
  }
  return value;
}

function sameStringArray(left: readonly string[], right: readonly string[]) {
  if (left.length !== right.length) return false;
  return left.every((value, index) => value === right[index]);
}

function optionKeys(options: readonly { key: string }[]) {
  return new Set(options.map((option) => option.key));
}

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}
