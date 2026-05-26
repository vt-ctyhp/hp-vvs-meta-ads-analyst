import type { ReactNode } from "react";

import type { MetaInboxQueueDisplayItem } from "../../../lib/meta-inbox-queue-view.ts";
import { ConversationHeader } from "./conversation-header.tsx";

type ConversationPaneProps = {
  item: MetaInboxQueueDisplayItem | null;
  now?: Date | number;
  syncStatus?: ReactNode;
  thread: ReactNode;
  replyComposer?: ReactNode;
  commentActions?: ReactNode;
  emptyState?: ReactNode;
  legacySideRail?: ReactNode;
  onOpenDetails?: () => void;
  onOpenAudit?: () => void;
  onOpenNotes?: () => void;
  onOpenQa?: () => void;
  onCloseConversation?: () => void;
};

export function ConversationPane({
  item,
  now,
  syncStatus = null,
  thread,
  replyComposer = null,
  commentActions = null,
  emptyState = null,
  legacySideRail = null,
  onOpenDetails,
  onOpenAudit,
  onOpenNotes,
  onOpenQa,
  onCloseConversation,
}: ConversationPaneProps) {
  const actionSurface = item?.type === "comment" ? commentActions : replyComposer;

  return (
    <section data-component="conversation-pane" className="min-w-0 bg-hp-card">
      <ConversationHeader
        item={item}
        now={now}
        onOpenDetails={onOpenDetails}
        onOpenAudit={onOpenAudit}
        onOpenNotes={onOpenNotes}
        onOpenQa={onOpenQa}
        onCloseConversation={onCloseConversation}
      />

      {syncStatus ? (
        <div className="border-b border-hp-rule px-5 py-3 text-sm leading-6 text-hp-muted">
          {syncStatus}
        </div>
      ) : null}

      <div className="flex min-h-[640px] min-w-0 flex-col">
        <div data-slot="conversation-thread" className="min-w-0 flex-1 p-6">
          {item ? thread : emptyState}
        </div>

        {item && actionSurface ? (
          <div data-slot="conversation-action" className="border-t border-hp-rule p-4">
            {actionSurface}
          </div>
        ) : null}

        {legacySideRail ? (
          <aside data-slot="legacy-side-rail" className="border-t border-hp-rule p-5">
            {legacySideRail}
          </aside>
        ) : null}
      </div>
    </section>
  );
}
