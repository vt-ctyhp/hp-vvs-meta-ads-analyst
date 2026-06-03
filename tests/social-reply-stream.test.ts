import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { createReplySuggestionStream } from "../src/lib/social-reply-stream.ts";

type SseEvent = { event: string | undefined; data: unknown };

async function readSseEvents(stream: ReadableStream<Uint8Array>): Promise<SseEvent[]> {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
  }

  const events: SseEvent[] = [];
  for (const chunk of buffer.split("\n\n")) {
    const trimmed = chunk.trim();
    if (!trimmed) continue;
    const event = trimmed.match(/^event: (.+)$/m)?.[1];
    const dataLine = trimmed.match(/^data: (.+)$/m)?.[1];
    events.push({ event, data: dataLine ? JSON.parse(dataLine) : null });
  }
  return events;
}

describe("createReplySuggestionStream", () => {
  it("emits a delta event per draft update, then a done event with the result", async () => {
    const result = {
      suggestionId: "abc",
      draft: "Hello there",
      nextBestAction: "answer_question",
    };
    const stream = createReplySuggestionStream(async (onDraftDelta) => {
      onDraftDelta("Hello");
      onDraftDelta("Hello there");
      return result as never;
    });

    assert.deepEqual(await readSseEvents(stream), [
      { event: "delta", data: { draft: "Hello" } },
      { event: "delta", data: { draft: "Hello there" } },
      { event: "done", data: result },
    ]);
  });

  it("emits an error event when the producer throws", async () => {
    const stream = createReplySuggestionStream(async () => {
      throw new Error("model exploded");
    });

    assert.deepEqual(await readSseEvents(stream), [
      { event: "error", data: { error: "model exploded" } },
    ]);
  });
});
