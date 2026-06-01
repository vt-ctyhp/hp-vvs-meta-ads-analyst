import {
  getMissingAiReplySuggestionEnv,
  isAiReplySuggestionsEnabled,
} from "./env.ts";

export type FoundationAiReplyDisabledResponse = {
  status: "disabled";
  disabled: true;
  suggestionId: null;
  draft: null;
  reason: string;
};

export function buildFoundationAiReplyDisabledResponse(): FoundationAiReplyDisabledResponse {
  const missing = getMissingAiReplySuggestionEnv();
  const reason = !isAiReplySuggestionsEnabled()
    ? "AI reply suggestions are disabled. Set AI_REPLY_SUGGESTIONS_ENABLED=true to enable Anthropic drafts."
    : `AI reply suggestions are missing configuration: ${missing.join(", ")}`;

  return {
    status: "disabled",
    disabled: true,
    suggestionId: null,
    draft: null,
    reason,
  };
}

export function isSocialReplySuggestionReady() {
  return isAiReplySuggestionsEnabled() && getMissingAiReplySuggestionEnv().length === 0;
}
