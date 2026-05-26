export type SnippetCandidate = {
  message?: unknown;
  created_time?: unknown;
};

/**
 * Pick the most recent message that has actual text for use as a thread
 * snippet/preview. Skips empty, whitespace-only, and null bodies (typical
 * for attachment-only messages like photos and stickers). Returns null when
 * no candidate has text — caller can fall back to a placeholder.
 */
export function pickLatestNonEmptySnippet(
  messages: ReadonlyArray<SnippetCandidate>,
): string | null {
  const withText = messages
    .map((message) => ({
      text: stringField(message.message),
      time: stringField(message.created_time) || "",
    }))
    .filter((entry) => entry.text !== null);
  if (!withText.length) return null;
  withText.sort((a, b) => b.time.localeCompare(a.time));
  return withText[0].text;
}

function stringField(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}
