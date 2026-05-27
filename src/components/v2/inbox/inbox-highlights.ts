import type { MetaInboxQueueDisplayItem } from "../../../lib/meta-inbox-queue-view.ts";
import type { StatusHighlight } from "../../status-sentence";

export function computeInboxHighlights(queue: MetaInboxQueueDisplayItem[]): StatusHighlight[] {
  if (queue.length === 0) {
    return [{ text: "Inbox is empty for the current connection" }];
  }

  const needsReply = queue.filter((item) => item.status === "Needs reply").length;
  const highlights: StatusHighlight[] = [];

  if (needsReply > 0) {
    highlights.push({ text: `${needsReply} needing reply`, tone: "warning" });
  }
  if (highlights.length === 0) {
    highlights.push({
      text: `${queue.length} threads, all caught up`,
      tone: "positive",
    });
  }

  return highlights;
}
