import { Fragment } from "react";

import type { MetaInboxQueueDisplayItem } from "../../../lib/meta-inbox-queue-view.ts";
import { computeInboxHighlights } from "./inbox-highlights.ts";

export function InboxStatusSentence({
  queue,
}: {
  queue: MetaInboxQueueDisplayItem[];
}) {
  const highlights = computeInboxHighlights(queue);

  return (
    <div
      data-component="inbox-status-sentence"
      className="flex items-baseline justify-between gap-5 border-b border-hp-rule px-1 pb-5 pt-4"
    >
      <h1 className="font-title text-[26px] leading-tight text-hp-ink oldstyle-nums">
        {highlights.map((highlight, index) => (
          <Fragment key={`${highlight.text}-${index}`}>
            <span
              data-tone={highlight.tone || "neutral"}
              className={highlightToneClass(highlight.tone)}
            >
              {highlight.text}
            </span>
            {index < highlights.length - 1 ? (
              <span className="text-hp-muted"> · </span>
            ) : null}
          </Fragment>
        ))}
      </h1>
      <div className="shrink-0 text-[10px] text-hp-muted smallcaps">Convert · Inbox</div>
    </div>
  );
}

function highlightToneClass(tone: "positive" | "warning" | "neutral" | undefined) {
  if (tone === "warning") return "text-signal-warning";
  if (tone === "positive") return "text-signal-positive";
  return "text-hp-body";
}
