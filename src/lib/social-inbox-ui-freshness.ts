export type ConversationTextState = Record<string, string>;

export type ReplyWindowInput = {
  sendEligibility: string;
  replyWindowExpiresAt?: string | null;
  humanAgentWindowExpiresAt?: string | null;
};

export type ReplyWindowUiState = {
  canAttemptSend: boolean;
  label: string;
  detail: string;
};

export function readConversationTextState(
  state: ConversationTextState,
  conversationId: string | null | undefined,
) {
  if (!conversationId) return "";
  return state[conversationId] || "";
}

export function writeConversationTextState(
  state: ConversationTextState,
  conversationId: string | null | undefined,
  value: string,
): ConversationTextState {
  if (!conversationId) return state;
  if (!value) return clearConversationTextState(state, conversationId);
  return {
    ...state,
    [conversationId]: value,
  };
}

export function clearConversationTextState(
  state: ConversationTextState,
  conversationId: string | null | undefined,
): ConversationTextState {
  if (!conversationId || !(conversationId in state)) return state;
  const next = { ...state };
  delete next[conversationId];
  return next;
}

export function resolveReplyWindowState(
  item: ReplyWindowInput,
  nowMs = Date.now(),
): ReplyWindowUiState {
  const standardExpiresAt = parseWindowExpiry(item.replyWindowExpiresAt);
  const humanAgentExpiresAt = parseWindowExpiry(item.humanAgentWindowExpiresAt);
  const standardOpen =
    item.sendEligibility === "standard_reply_allowed" &&
    standardExpiresAt !== null &&
    standardExpiresAt > nowMs;
  const humanAgentOpen =
    (item.sendEligibility === "human_agent_allowed" ||
      item.sendEligibility === "standard_reply_allowed") &&
    humanAgentExpiresAt !== null &&
    humanAgentExpiresAt > nowMs;

  if (standardOpen) {
    return {
      canAttemptSend: true,
      label: "Standard Reply",
      detail: `${timeUntilLabel(item.replyWindowExpiresAt || "", nowMs)} remaining for standard response.`,
    };
  }

  if (humanAgentOpen) {
    return {
      canAttemptSend: true,
      label: "Human Agent Window",
      detail: `${timeUntilLabel(item.humanAgentWindowExpiresAt || "", nowMs)} remaining with Human Agent tag.`,
    };
  }

  if (item.sendEligibility === "expired" || hasExpiredKnownWindow(item, nowMs)) {
    return {
      canAttemptSend: false,
      label: "Expired",
      detail: "Meta reply window is closed for normal send attempts.",
    };
  }

  return {
    canAttemptSend: false,
    label: sendEligibilityLabel(item),
    detail: "Reply eligibility is unknown. Sync or repair the conversation before send attempt.",
  };
}

export function resolveReplyWindowDetail(item: ReplyWindowInput, nowMs = Date.now()) {
  const target =
    item.sendEligibility === "standard_reply_allowed"
      ? item.replyWindowExpiresAt
      : item.sendEligibility === "human_agent_allowed"
        ? item.humanAgentWindowExpiresAt
        : null;
  if (!target) return null;
  return `${timeUntilLabel(target, nowMs)} remaining`;
}

export function timeUntilLabel(iso: string, nowMs = Date.now()) {
  const diffMs = Date.parse(iso) - nowMs;
  if (!Number.isFinite(diffMs)) return "Unknown";
  if (diffMs <= 0) return "Expired";
  const minutes = Math.ceil(diffMs / 60_000);
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.ceil(minutes / 60);
  if (hours < 24) return `${hours} hr`;
  return `${Math.ceil(hours / 24)} day`;
}

function hasExpiredKnownWindow(item: ReplyWindowInput, nowMs: number) {
  const standardExpiresAt = parseWindowExpiry(item.replyWindowExpiresAt);
  const humanAgentExpiresAt = parseWindowExpiry(item.humanAgentWindowExpiresAt);

  if (item.sendEligibility === "standard_reply_allowed") {
    return (
      (standardExpiresAt !== null && standardExpiresAt <= nowMs) ||
      (standardExpiresAt === null && humanAgentExpiresAt !== null && humanAgentExpiresAt <= nowMs)
    );
  }

  if (item.sendEligibility === "human_agent_allowed") {
    return humanAgentExpiresAt !== null && humanAgentExpiresAt <= nowMs;
  }

  return false;
}

function parseWindowExpiry(value: string | null | undefined) {
  if (!value) return null;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function sendEligibilityLabel(item: ReplyWindowInput) {
  if (item.sendEligibility === "standard_reply_allowed") return "Standard Reply";
  if (item.sendEligibility === "human_agent_allowed") return "Human Agent Window";
  if (item.sendEligibility === "expired") return "Expired";
  return "Unknown";
}
