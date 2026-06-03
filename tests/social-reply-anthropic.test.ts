import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { extractStreamingDraft } from "../src/lib/social-reply-anthropic.ts";

describe("extractStreamingDraft", () => {
  it("returns empty string before the draft value has started", () => {
    assert.equal(extractStreamingDraft(""), "");
    assert.equal(extractStreamingDraft("{"), "");
    assert.equal(extractStreamingDraft('{"dra'), "");
    assert.equal(extractStreamingDraft('{"draft":"'), "");
  });

  it("returns the partial draft text while it is still streaming", () => {
    assert.equal(extractStreamingDraft('{"draft":"Yes'), "Yes");
    assert.equal(
      extractStreamingDraft('{"draft":"Yes, please come by today'),
      "Yes, please come by today",
    );
  });

  it("decodes JSON escape sequences inside the draft", () => {
    assert.equal(extractStreamingDraft('{"draft":"He said \\"hi\\"'), 'He said "hi"');
    assert.equal(extractStreamingDraft('{"draft":"line1\\nline2'), "line1\nline2");
  });

  it("stops at the closing quote and ignores later fields", () => {
    assert.equal(
      extractStreamingDraft('{"draft":"done","strategy":"close the sale"'),
      "done",
    );
    assert.equal(
      extractStreamingDraft(
        '{"draft":"done","strategy":"x","nextBestAction":"answer_question"}',
      ),
      "done",
    );
  });

  it("waits on an incomplete trailing escape rather than emitting a backslash", () => {
    assert.equal(extractStreamingDraft('{"draft":"He said \\'), "He said ");
    assert.equal(extractStreamingDraft('{"draft":"caf\\u00e'), "caf");
  });

  it("tolerates whitespace around the key and colon", () => {
    assert.equal(extractStreamingDraft('{ "draft" : "Hello'), "Hello");
    assert.equal(extractStreamingDraft('{\n  "draft": "Hello'), "Hello");
  });
});
