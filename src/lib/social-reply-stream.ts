import type { SuggestReplyResult } from "./social-reply-suggestions.ts";

type DraftDeltaListener = (draft: string) => void;
type ReplySuggestionProducer = (
  onDraftDelta: DraftDeltaListener,
) => Promise<SuggestReplyResult>;

// Frames the suggested-reply flow as a Server-Sent Events stream:
//   event: delta  -> { draft }   (the full draft-so-far, on each model update)
//   event: done   -> SuggestReplyResult
//   event: error  -> { error }   (if the producer throws mid-flight)
// The producer is handed an `onDraftDelta` callback it invokes as the draft
// grows; we forward each one as a delta event, then close with done or error.
export function createReplySuggestionStream(
  produce: ReplySuggestionProducer,
): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  return new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (event: string, data: unknown) => {
        controller.enqueue(encoder.encode(sseEvent(event, data)));
      };
      try {
        const result = await produce((draft) => send("delta", { draft }));
        send("done", result);
      } catch (error) {
        send("error", { error: errorMessage(error) });
      } finally {
        controller.close();
      }
    },
  });
}

export function sseEvent(event: string, data: unknown): string {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}

function errorMessage(error: unknown): string {
  if (error instanceof Error && error.message) return error.message;
  return "Could not draft suggested reply.";
}
