import { Clock, Loader2 } from "lucide-react";

import type { SocialInboxConversationHistory } from "../../../lib/social-inbox.ts";
import type { ConversationHistoryLoadState } from "./inbox-client-state.ts";

export function HistoryStatusStrip({
  historyState,
  onLoadOlderHistory,
}: {
  historyState: ConversationHistoryLoadState | null;
  onLoadOlderHistory: (() => void) | null;
}) {
  if (!historyState || historyState.status === "idle") return null;

  const pageInfo = historyState.data?.pageInfo || null;
  const canLoadOlder = Boolean(pageInfo?.nextCursor && onLoadOlderHistory);
  const isLoading = historyState.status === "loading";
  const label =
    historyState.status === "error"
      ? historyState.error || "Could not load conversation history."
      : isLoading
        ? "Loading selected conversation history..."
        : pageInfo
          ? `${pageInfo.returned} of ${pageInfo.knownTotal} known item(s) loaded · ${historyCompletenessLabel(pageInfo.historyCompleteness)}`
          : "Conversation history ready.";

  return (
    <div className="mb-4 flex flex-col gap-3 border border-hp-rule bg-hp-inset p-3 text-xs leading-5 text-hp-muted sm:flex-row sm:items-center sm:justify-between">
      <div className="flex min-w-0 items-center gap-2">
        {isLoading ? (
          <Loader2 size={14} className="shrink-0 animate-spin text-hp-ink" />
        ) : (
          <Clock size={14} className="shrink-0 text-hp-ink" />
        )}
        <span className="min-w-0 break-words">{label}</span>
      </div>
      {canLoadOlder ? (
        <button
          type="button"
          onClick={onLoadOlderHistory || undefined}
          disabled={isLoading}
          className="shrink-0 border border-hp-rule px-3 py-1.5 text-[10px] uppercase tracking-[0.14em] text-hp-ink transition hover:border-hp-ink disabled:opacity-50"
        >
          Load Older History
        </button>
      ) : null}
    </div>
  );
}

function historyCompletenessLabel(
  value: SocialInboxConversationHistory["pageInfo"]["historyCompleteness"],
) {
  if (value === "complete_known_history") return "Known history complete";
  if (value === "partial_known_history") return "Older known history available";
  if (value === "source_missing") return "Source identity missing";
  return "No known message history";
}
