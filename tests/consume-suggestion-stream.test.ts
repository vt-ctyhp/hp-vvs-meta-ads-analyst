import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { consumeSuggestionStream } from "../src/components/v2/inbox/consume-suggestion-stream.ts";

type Suggestion = { suggestionId: string; draft: string };

function streamFrom(chunks: string[]): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  let index = 0;
  return new ReadableStream<Uint8Array>({
    pull(controller) {
      if (index < chunks.length) {
        controller.enqueue(encoder.encode(chunks[index]));
        index += 1;
      } else {
        controller.close();
      }
    },
  });
}

describe("consumeSuggestionStream", () => {
  it("forwards each delta draft and resolves with the done payload", async () => {
    const drafts: string[] = [];
    const result = await consumeSuggestionStream<Suggestion>(
      streamFrom([
        'event: delta\ndata: {"draft":"He"}\n\n',
        'event: delta\ndata: {"draft":"Hello"}\n\n',
        'event: done\ndata: {"suggestionId":"x","draft":"Hello"}\n\n',
      ]),
      (draft) => drafts.push(draft),
    );

    assert.deepEqual(drafts, ["He", "Hello"]);
    assert.deepEqual(result, { suggestionId: "x", draft: "Hello" });
  });

  it("reassembles an SSE record split across chunk boundaries", async () => {
    const drafts: string[] = [];
    const result = await consumeSuggestionStream<Suggestion>(
      streamFrom([
        'event: delta\ndata: {"dra',
        'ft":"Hello"}\n\nevent: do',
        'ne\ndata: {"suggestionId":"x","draft":"Hello"}\n\n',
      ]),
      (draft) => drafts.push(draft),
    );

    assert.deepEqual(drafts, ["Hello"]);
    assert.equal(result.suggestionId, "x");
  });

  it("throws the server error message on an error event", async () => {
    await assert.rejects(
      consumeSuggestionStream(streamFrom(['event: error\ndata: {"error":"model exploded"}\n\n'])),
      /model exploded/,
    );
  });

  it("throws when the stream ends without a done event", async () => {
    await assert.rejects(
      consumeSuggestionStream(streamFrom(['event: delta\ndata: {"draft":"Hi"}\n\n'])),
      /Could not draft suggested reply/,
    );
  });
});
