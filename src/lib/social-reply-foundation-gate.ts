export type FoundationAiReplyDisabledResponse = {
  status: "disabled";
  disabled: true;
  suggestionId: null;
  draft: null;
  reason: string;
};

export function buildFoundationAiReplyDisabledResponse(): FoundationAiReplyDisabledResponse {
  return {
    status: "disabled",
    disabled: true,
    suggestionId: null,
    draft: null,
    reason: "AI reply suggestions are disabled in the inbox foundation build.",
  };
}
