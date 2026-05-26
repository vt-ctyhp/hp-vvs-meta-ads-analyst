import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { pickLatestNonEmptySnippet } from "../src/lib/meta-message-snippet.ts";

describe("pickLatestNonEmptySnippet", () => {
  it("returns the most recent message that has text", () => {
    assert.equal(
      pickLatestNonEmptySnippet([
        { message: "older real text", created_time: "2026-05-25T10:00:00Z" },
        { message: "", created_time: "2026-05-26T10:00:00Z" },
      ]),
      "older real text",
    );
  });

  it("returns the latest text when latest message has text", () => {
    assert.equal(
      pickLatestNonEmptySnippet([
        { message: "older", created_time: "2026-05-25T10:00:00Z" },
        { message: "latest real text", created_time: "2026-05-26T10:00:00Z" },
      ]),
      "latest real text",
    );
  });

  it("returns null when all messages are empty or whitespace", () => {
    assert.equal(
      pickLatestNonEmptySnippet([
        { message: "", created_time: "2026-05-26T10:00:00Z" },
        { message: "   ", created_time: "2026-05-25T10:00:00Z" },
        { message: null, created_time: "2026-05-24T10:00:00Z" },
      ]),
      null,
    );
  });

  it("returns null for empty input", () => {
    assert.equal(pickLatestNonEmptySnippet([]), null);
  });

  it("trims surrounding whitespace from the chosen snippet", () => {
    assert.equal(
      pickLatestNonEmptySnippet([
        { message: "  hello there  ", created_time: "2026-05-26T10:00:00Z" },
      ]),
      "hello there",
    );
  });

  it("ignores messages with no created_time and prefers timestamped ones", () => {
    assert.equal(
      pickLatestNonEmptySnippet([
        { message: "no timestamp" },
        { message: "with timestamp", created_time: "2026-05-26T10:00:00Z" },
      ]),
      "with timestamp",
    );
  });
});
