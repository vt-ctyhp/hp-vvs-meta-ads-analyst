import { buildMetaInboxQueueItems, type MetaInboxQueueDisplayItem } from "../../../lib/meta-inbox-queue-view.ts";
import type {
  MetaInboxCommentActionInput,
  SocialInboxCommentAction,
  SocialInboxConversation,
  SocialInboxConversationEvent,
  SocialInboxConversationHistory,
  SocialInboxConversationNote,
  SocialInboxCustomerContactMethod,
  SocialInboxData,
  SocialInboxPresence,
  SocialInboxQaScorecard,
  SocialInboxSavedReply,
  SocialInboxSendAttempt,
} from "../../../lib/social-inbox.ts";

export type PermissionBlock = {
  ok: boolean;
  required: string[];
  missing: string[];
  optionalMissing?: string[];
  warnings?: string[];
};

export type AccountStatus = {
  brandCode: string;
  accountId: string;
  ok: boolean;
  name?: string | null;
  accountStatus?: number | null;
  error?: string;
};

export type MetaPermissionStatus = {
  granted: string[];
  forbiddenGranted: string[];
  adsSync: PermissionBlock;
  socialInbox: PermissionBlock;
  socialReply: PermissionBlock;
};

export type SocialInboxStatus = {
  ok: boolean;
  missingEnv: string[];
  permissions: MetaPermissionStatus | null;
  accounts: AccountStatus[];
  readiness: {
    adsSync: boolean;
    socialInbox: boolean;
    socialReply: boolean;
  };
  error: string | null;
};

export type SyncResponse = {
  status?: string;
  metrics?: {
    pages?: number;
    threads?: number;
    messages?: number;
    comments?: number;
  };
  errors?: string[];
  error?: string;
};

export type ConversationHistoryLoadState = {
  status: "idle" | "loading" | "ready" | "error";
  data: SocialInboxConversationHistory | null;
  error: string | null;
};

export type WorkflowMutationLoadState = {
  conversationId: string | null;
  status: "idle" | "saving" | "saved" | "error";
  message: string | null;
};

export type ContactMethodMutationLoadState = {
  conversationId: string | null;
  contactMethodId: string | null;
  status: "idle" | "saving" | "saved" | "error";
  message: string | null;
};

export type ReplyAttemptMutationLoadState = {
  conversationId: string | null;
  sendAttemptId: string | null;
  status: "idle" | "saving" | "saved" | "error";
  message: string | null;
};

export type AiReplySuggestionLoadState = {
  conversationId: string | null;
  suggestionId: string | null;
  status: "idle" | "loading" | "ready" | "error";
  message: string | null;
};

export type CommentActionMutationLoadState = {
  conversationId: string | null;
  status: "idle" | "saving" | "saved" | "error";
  message: string | null;
};

export type SavedReplyMutationLoadState = {
  conversationId: string | null;
  status: "idle" | "saving" | "saved" | "error";
  message: string | null;
};

export type NoteMutationLoadState = {
  conversationId: string | null;
  status: "idle" | "saving" | "saved" | "error";
  message: string | null;
};

export type QaScorecardMutationLoadState = {
  conversationId: string | null;
  status: "idle" | "saving" | "saved" | "error";
  message: string | null;
};

export type PresenceLoadState = {
  status: "idle" | "ready" | "error";
  presences: SocialInboxPresence[];
  error: string | null;
};

export const IDLE_HISTORY_STATE: ConversationHistoryLoadState = {
  status: "idle",
  data: null,
  error: null,
};

export const IDLE_WORKFLOW_STATE: WorkflowMutationLoadState = {
  conversationId: null,
  status: "idle",
  message: null,
};

export const IDLE_CONTACT_METHOD_STATE: ContactMethodMutationLoadState = {
  conversationId: null,
  contactMethodId: null,
  status: "idle",
  message: null,
};

export const IDLE_REPLY_ATTEMPT_STATE: ReplyAttemptMutationLoadState = {
  conversationId: null,
  sendAttemptId: null,
  status: "idle",
  message: null,
};

export const IDLE_AI_REPLY_SUGGESTION_STATE: AiReplySuggestionLoadState = {
  conversationId: null,
  suggestionId: null,
  status: "idle",
  message: null,
};

export const IDLE_COMMENT_ACTION_STATE: CommentActionMutationLoadState = {
  conversationId: null,
  status: "idle",
  message: null,
};

export const IDLE_SAVED_REPLY_STATE: SavedReplyMutationLoadState = {
  conversationId: null,
  status: "idle",
  message: null,
};

export const IDLE_NOTE_STATE: NoteMutationLoadState = {
  conversationId: null,
  status: "idle",
  message: null,
};

export const IDLE_QA_SCORECARD_STATE: QaScorecardMutationLoadState = {
  conversationId: null,
  status: "idle",
  message: null,
};

export const IDLE_PRESENCE_STATE: PresenceLoadState = {
  status: "idle",
  presences: [],
  error: null,
};

export function buildQueue(data: SocialInboxData): MetaInboxQueueDisplayItem[] {
  return buildMetaInboxQueueItems(data);
}

export function conversationPanelKey(item: MetaInboxQueueDisplayItem | null, panel: string) {
  return `${panel}:${item?.inboxConversation?.id || item?.id || "empty"}`;
}

export function upsertSendAttempt(
  data: SocialInboxData,
  sendAttempt: SocialInboxSendAttempt,
): SocialInboxData {
  const withoutExisting = (data.sendAttempts || []).filter((attempt) => attempt.id !== sendAttempt.id);
  return {
    ...data,
    sendAttempts: [sendAttempt, ...withoutExisting],
  };
}

export function upsertCommentAction(
  data: SocialInboxData,
  commentAction: SocialInboxCommentAction,
): SocialInboxData {
  const withoutExisting = (data.commentActions || []).filter((action) => action.id !== commentAction.id);
  return {
    ...data,
    commentActions: [commentAction, ...withoutExisting],
  };
}

export function upsertSavedReply(
  data: SocialInboxData,
  savedReply: SocialInboxSavedReply,
): SocialInboxData {
  const withoutExisting = (data.savedReplies || []).filter((reply) => reply.id !== savedReply.id);
  return {
    ...data,
    savedReplies: [savedReply, ...withoutExisting],
  };
}

export function upsertConversationNote(
  data: SocialInboxData,
  note: SocialInboxConversationNote,
): SocialInboxData {
  const withoutExisting = (data.notes || []).filter((existing) => existing.id !== note.id);
  return {
    ...data,
    notes: [note, ...withoutExisting],
  };
}

export function upsertQaScorecard(
  data: SocialInboxData,
  qaScorecard: SocialInboxQaScorecard,
): SocialInboxData {
  const withoutExisting = (data.qaScorecards || []).filter(
    (existing) => existing.id !== qaScorecard.id,
  );
  return {
    ...data,
    qaScorecards: [qaScorecard, ...withoutExisting],
  };
}

export function upsertConversationEvents(
  data: SocialInboxData,
  events: SocialInboxConversationEvent[],
): SocialInboxData {
  if (!events.length) return data;
  return {
    ...data,
    conversationEvents: mergeConversationEvents(data.conversationEvents || [], events),
  };
}

export function mergeConversationEvents(
  current: SocialInboxConversationEvent[],
  events: SocialInboxConversationEvent[],
) {
  if (!events.length) return current;
  const byId = new Map<string, SocialInboxConversationEvent>();
  for (const event of [...events, ...current]) {
    byId.set(event.id, event);
  }
  return Array.from(byId.values()).sort((a, b) =>
    String(b.event_at || "").localeCompare(String(a.event_at || "")),
  );
}

export function newCommentActionIdempotencyKey(
  conversationId: string,
  actionType: NonNullable<MetaInboxCommentActionInput["actionType"]>,
  messageText: string | null,
  reasonNote: string | null,
) {
  return stableIdempotencyKey("comment", conversationId, [
    actionType,
    messageText || "",
    reasonNote || "",
  ]);
}

export function stableIdempotencyKey(scope: string, conversationId: string, parts: string[]) {
  const payload = parts.map((part) => part.trim().replace(/\s+/g, " ")).join("\u001f");
  return `${conversationId}:${scope}:${stableStringHash(payload)}`;
}

export function stableStringHash(value: string) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return `${value.length.toString(36)}-${(hash >>> 0).toString(36)}`;
}

export function commentActionLabel(actionType: SocialInboxCommentAction["action_type"]) {
  if (actionType === "public_reply") return "Public reply";
  if (actionType === "private_reply") return "Private DM";
  if (actionType === "like") return "Like";
  if (actionType === "hide") return "Hide";
  return "Delete";
}

export function formatDateLabel(value: string | null | undefined) {
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

export function isErrorPayload(value: SocialInboxData | { error: string }): value is { error: string } {
  return "error" in value;
}

export function isHistoryErrorPayload(
  value: SocialInboxConversationHistory | { error: string },
): value is { error: string } {
  return "error" in value;
}

export function isWorkflowErrorPayload(
  value: { conversation: SocialInboxConversation; events: unknown[] } | { error: string },
): value is { error: string } {
  return "error" in value;
}

export function isContactMethodErrorPayload(
  value: { contactMethod: SocialInboxCustomerContactMethod; events: unknown[] } | { error: string },
): value is { error: string } {
  return "error" in value;
}

export function isSendAttemptErrorPayload(
  value: { sendAttempt: SocialInboxSendAttempt; events: unknown[] } | { error: string },
): value is { error: string } {
  return "error" in value;
}

export function isCommentActionErrorPayload(
  value: { commentAction: SocialInboxCommentAction; events: unknown[] } | { error: string },
): value is { error: string } {
  return "error" in value;
}

export function isSavedReplyErrorPayload(
  value: { savedReply: SocialInboxSavedReply } | { error: string },
): value is { error: string } {
  return "error" in value;
}

export function isNoteErrorPayload(
  value:
    | { note: SocialInboxConversationNote; events: unknown[] }
    | { error: string },
): value is { error: string } {
  return "error" in value;
}

export function isQaScorecardErrorPayload(
  value:
    | { qaScorecard: SocialInboxQaScorecard; events: unknown[] }
    | { error: string },
): value is { error: string } {
  return "error" in value;
}

export function isPresenceErrorPayload(
  value:
    | { presence: SocialInboxPresence | null; presences: SocialInboxPresence[] }
    | { error: string },
): value is { error: string } {
  return "error" in value;
}
