import {
  META_INBOX_LEAD_QUALITY_LABELS,
  META_INBOX_QUEUE_CATEGORIES,
  META_INBOX_SOURCE_CHANNELS,
  type MetaInboxLeadQualityKey,
  type MetaInboxQueueCategoryKey,
  type MetaInboxSourceChannelKey,
} from "./meta-inbox-vocabulary.ts";

type JsonRecord = Record<string, unknown>;

export type MetaInboxSavedReplyVisibility = "personal" | "shared";
export type MetaInboxSavedReplyApprovalStatus =
  | "draft"
  | "pending_approval"
  | "approved"
  | "rejected"
  | "archived";

export type MetaInboxSavedReply = {
  id: string;
  title: string;
  body: string;
  visibility: MetaInboxSavedReplyVisibility;
  approval_status: MetaInboxSavedReplyApprovalStatus;
  owner_user_id: string | null;
  created_by: string | null;
  approved_by: string | null;
  approved_at: string | null;
  queue_category_key: MetaInboxQueueCategoryKey | null;
  source_channel: MetaInboxSourceChannelKey | null;
  language: string;
  lead_quality: MetaInboxLeadQualityKey | null;
  active: boolean;
  usage_count: number;
  last_used_at: string | null;
  metadata: JsonRecord;
  created_at: string | null;
  updated_at: string | null;
};

export type MetaInboxSavedReplyInput = {
  title?: string | null;
  body?: string | null;
  visibility?: MetaInboxSavedReplyVisibility | null;
  queueCategoryKey?: MetaInboxQueueCategoryKey | null;
  sourceChannel?: MetaInboxSourceChannelKey | null;
  language?: string | null;
  leadQuality?: MetaInboxLeadQualityKey | null;
  approveShared?: boolean | null;
};

export type MetaInboxSavedReplyStatusInput = {
  savedReplyId?: string | null;
  approvalStatus?: Extract<
    MetaInboxSavedReplyApprovalStatus,
    "approved" | "rejected" | "archived"
  > | null;
};

export type MetaInboxSavedReplyActor = {
  appUserId: string | null;
  roles: readonly string[];
};

export type MetaInboxSavedReplyContext = {
  actorUserId?: string | null;
  queueCategoryKey?: MetaInboxQueueCategoryKey | null;
  sourceChannel?: MetaInboxSourceChannelKey | null;
  leadQuality?: string | null;
  language?: string | null;
};

export function buildMetaInboxSavedReplyCreate(
  input: MetaInboxSavedReplyInput,
  actor: MetaInboxSavedReplyActor,
  now: string,
): { row: JsonRecord; savedReply: MetaInboxSavedReply } {
  const actorUserId = requireValidActorId(actor.appUserId);
  const title = requireText(input.title, "Template title", 120);
  const body = requireText(input.body, "Template body", 4000);
  const visibility = input.visibility === "shared" ? "shared" : "personal";
  const approveShared = input.approveShared === true;

  if (visibility === "personal" && approveShared) {
    throw new Error("Personal saved replies cannot be shared-approved.");
  }

  const approvalStatus: MetaInboxSavedReplyApprovalStatus =
    visibility === "personal"
      ? "draft"
      : approveShared
        ? "approved"
        : "pending_approval";

  if (approvalStatus === "approved" && !canApproveSharedSavedReplies(actor)) {
    throw new Error("Only sales lead or admin can approve shared templates.");
  }

  const row = {
    title,
    body,
    visibility,
    approval_status: approvalStatus,
    owner_user_id: visibility === "personal" ? actorUserId : null,
    created_by: actorUserId,
    approved_by: approvalStatus === "approved" ? actorUserId : null,
    approved_at: approvalStatus === "approved" ? now : null,
    queue_category_key: normalizeQueueCategory(input.queueCategoryKey),
    source_channel: normalizeSourceChannel(input.sourceChannel),
    language: normalizeLanguage(input.language),
    lead_quality: normalizeLeadQuality(input.leadQuality),
    active: true,
    metadata: {},
  };

  return {
    row,
    savedReply: mapMetaInboxSavedReplyRow({
      id: "pending",
      usage_count: 0,
      last_used_at: null,
      created_at: now,
      updated_at: now,
      ...row,
    }),
  };
}

export function buildMetaInboxSavedReplyStatusUpdate(
  existing: MetaInboxSavedReply,
  input: MetaInboxSavedReplyStatusInput,
  actor: MetaInboxSavedReplyActor,
  now: string,
): JsonRecord {
  const actorUserId = requireValidActorId(actor.appUserId);
  if (!canApproveSharedSavedReplies(actor)) {
    throw new Error("Only sales lead or admin can approve shared templates.");
  }
  if (existing.visibility !== "shared") {
    throw new Error("Only shared saved replies can enter approval workflow.");
  }

  const approvalStatus = normalizeApprovalStatus(input.approvalStatus);
  return {
    approval_status: approvalStatus,
    approved_by: approvalStatus === "approved" ? actorUserId : null,
    approved_at: approvalStatus === "approved" ? now : null,
    active: approvalStatus !== "archived",
  };
}

export function canApproveSharedSavedReplies(actor: Pick<MetaInboxSavedReplyActor, "roles">) {
  return actor.roles.includes("admin") || actor.roles.includes("sales_lead");
}

export function filterMetaInboxSavedRepliesForConversation(
  savedReplies: readonly MetaInboxSavedReply[],
  context: MetaInboxSavedReplyContext,
): MetaInboxSavedReply[] {
  const actorUserId = context.actorUserId || null;
  const language = normalizeLanguage(context.language);
  const queueCategoryKey = normalizeQueueCategory(context.queueCategoryKey);
  const sourceChannel = normalizeSourceChannel(context.sourceChannel);
  const leadQuality = normalizeLeadQuality(context.leadQuality);

  return savedReplies
    .filter((savedReply) => {
      if (!savedReply.active) return false;
      if (!isVisibleToActor(savedReply, actorUserId)) return false;
      if (savedReply.language !== language) return false;
      if (savedReply.queue_category_key && savedReply.queue_category_key !== queueCategoryKey) {
        return false;
      }
      if (savedReply.source_channel && savedReply.source_channel !== sourceChannel) return false;
      if (savedReply.lead_quality && savedReply.lead_quality !== leadQuality) return false;
      return true;
    })
    .sort(savedReplySort(context));
}

export function filterMetaInboxSavedRepliesForProfile(
  savedReplies: readonly MetaInboxSavedReply[],
  actor: MetaInboxSavedReplyActor,
): MetaInboxSavedReply[] {
  const actorUserId = actor.appUserId || null;
  const canApproveShared = canApproveSharedSavedReplies(actor);
  return savedReplies.filter((savedReply) =>
    isVisibleToActor(savedReply, actorUserId, canApproveShared),
  );
}

export function mapMetaInboxSavedReplyRow(row: JsonRecord): MetaInboxSavedReply {
  return {
    id: String(row.id || ""),
    title: String(row.title || ""),
    body: String(row.body || ""),
    visibility: row.visibility === "shared" ? "shared" : "personal",
    approval_status: savedReplyApprovalStatus(row.approval_status),
    owner_user_id: stringField(row.owner_user_id),
    created_by: stringField(row.created_by),
    approved_by: stringField(row.approved_by),
    approved_at: stringField(row.approved_at),
    queue_category_key: normalizeQueueCategory(stringField(row.queue_category_key)),
    source_channel: normalizeSourceChannel(stringField(row.source_channel)),
    language: normalizeLanguage(stringField(row.language)),
    lead_quality: normalizeLeadQuality(stringField(row.lead_quality)),
    active: row.active !== false,
    usage_count: numberField(row.usage_count) || 0,
    last_used_at: stringField(row.last_used_at),
    metadata: isRecord(row.metadata) ? row.metadata : {},
    created_at: stringField(row.created_at),
    updated_at: stringField(row.updated_at),
  };
}

function savedReplySort(context: MetaInboxSavedReplyContext) {
  return (a: MetaInboxSavedReply, b: MetaInboxSavedReply) => {
    const specificity = savedReplySpecificity(b, context) - savedReplySpecificity(a, context);
    if (specificity !== 0) return specificity;
    if (a.visibility !== b.visibility) return a.visibility === "personal" ? -1 : 1;
    return String(b.updated_at || b.created_at || "").localeCompare(
      String(a.updated_at || a.created_at || ""),
    );
  };
}

function savedReplySpecificity(
  savedReply: MetaInboxSavedReply,
  context: MetaInboxSavedReplyContext,
) {
  return [
    savedReply.queue_category_key && savedReply.queue_category_key === context.queueCategoryKey,
    savedReply.source_channel && savedReply.source_channel === context.sourceChannel,
    savedReply.lead_quality && savedReply.lead_quality === context.leadQuality,
  ].filter(Boolean).length;
}

function isVisibleToActor(
  savedReply: MetaInboxSavedReply,
  actorUserId: string | null,
  canApproveShared = false,
) {
  if (savedReply.visibility === "shared") {
    return savedReply.approval_status === "approved" || canApproveShared;
  }
  return Boolean(actorUserId && savedReply.owner_user_id === actorUserId);
}

function requireValidActorId(value: string | null | undefined) {
  if (!value || !isUuid(value)) {
    throw new Error("A valid inbox user is required for saved replies.");
  }
  return value;
}

function requireText(value: unknown, label: string, maxLength: number) {
  if (typeof value !== "string") throw new Error(`${label} is required.`);
  const trimmed = value.trim();
  if (!trimmed) throw new Error(`${label} is required.`);
  if (trimmed.length > maxLength) {
    throw new Error(`${label} must be ${maxLength} characters or less.`);
  }
  return trimmed;
}

function normalizeApprovalStatus(value: unknown): Extract<
  MetaInboxSavedReplyApprovalStatus,
  "approved" | "rejected" | "archived"
> {
  switch (value) {
    case "approved":
    case "rejected":
    case "archived":
      return value;
    default:
      throw new Error("Approval status must be approved, rejected, or archived.");
  }
}

function savedReplyApprovalStatus(value: unknown): MetaInboxSavedReplyApprovalStatus {
  switch (value) {
    case "pending_approval":
    case "approved":
    case "rejected":
    case "archived":
      return value;
    case "draft":
    default:
      return "draft";
  }
}

function normalizeQueueCategory(value: unknown): MetaInboxQueueCategoryKey | null {
  return stringInVocabulary(value, META_INBOX_QUEUE_CATEGORIES) as MetaInboxQueueCategoryKey | null;
}

function normalizeSourceChannel(value: unknown): MetaInboxSourceChannelKey | null {
  return stringInVocabulary(value, META_INBOX_SOURCE_CHANNELS) as MetaInboxSourceChannelKey | null;
}

function normalizeLeadQuality(value: unknown): MetaInboxLeadQualityKey | null {
  return stringInVocabulary(value, META_INBOX_LEAD_QUALITY_LABELS) as MetaInboxLeadQualityKey | null;
}

function normalizeLanguage(value: unknown) {
  const language = typeof value === "string" ? value.trim().toLowerCase() : "";
  if (!language) return "en";
  return language.replace(/[^a-z0-9-]/g, "").slice(0, 16) || "en";
}

function stringInVocabulary(
  value: unknown,
  options: readonly { key: string }[],
): string | null {
  if (typeof value !== "string") return null;
  return options.some((option) => option.key === value) ? value : null;
}

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value,
  );
}

function stringField(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function numberField(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() && Number.isFinite(Number(value))) {
    return Number(value);
  }
  return null;
}

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
