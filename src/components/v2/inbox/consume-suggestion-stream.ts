// Reads the suggest-reply Server-Sent Events stream produced by
// `createReplySuggestionStream`: forwards each `delta` draft to `onDraftDelta`
// as it arrives and resolves with the final `done` payload. Throws on an
// `error` event or a stream that ends without `done`. SSE records are framed by
// a blank line and may be split across network chunks, so partial records are
// buffered until complete.
export async function consumeSuggestionStream<TResult>(
  body: ReadableStream<Uint8Array>,
  onDraftDelta?: (draft: string) => void,
): Promise<TResult> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let result: TResult | null = null;
  let resolved = false;

  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      let separator: number;
      while ((separator = buffer.indexOf("\n\n")) !== -1) {
        const record = buffer.slice(0, separator);
        buffer = buffer.slice(separator + 2);
        const event = record.match(/^event: (.+)$/m)?.[1] ?? "message";
        const dataLine = record.match(/^data: (.+)$/m)?.[1];
        const data = dataLine ? JSON.parse(dataLine) : null;

        if (event === "delta") {
          if (data && typeof data.draft === "string") onDraftDelta?.(data.draft);
        } else if (event === "done") {
          result = data as TResult;
          resolved = true;
        } else if (event === "error") {
          throw new Error(data?.error || "Could not draft suggested reply.");
        }
      }
    }
  } finally {
    reader.cancel().catch(() => {});
  }

  if (!resolved) throw new Error("Could not draft suggested reply.");
  return result as TResult;
}
