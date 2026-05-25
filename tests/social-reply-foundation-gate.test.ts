import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

import { buildFoundationAiReplyDisabledResponse } from "../src/lib/social-reply-foundation-gate.ts";

const SUGGEST_REPLY_ROUTE = readFileSync(
  "src/app/api/social-inbox/suggest-reply/route.ts",
  "utf8",
);

describe("social reply foundation gate", () => {
  it("returns a disabled AI response shape for foundation mode", () => {
    assert.deepEqual(buildFoundationAiReplyDisabledResponse(), {
      status: "disabled",
      disabled: true,
      suggestionId: null,
      draft: null,
      reason: "AI reply suggestions are disabled in the inbox foundation build.",
    });
  });

  it("keeps the suggest-reply route gated away from the AI provider", () => {
    assert.match(SUGGEST_REPLY_ROUTE, /buildFoundationAiReplyDisabledResponse/);
    assert.match(SUGGEST_REPLY_ROUTE, /status:\s*501/);
    assert.doesNotMatch(SUGGEST_REPLY_ROUTE, /suggestSocialReply/);
    assert.doesNotMatch(SUGGEST_REPLY_ROUTE, /social-reply-suggestions/);
    assert.doesNotMatch(SUGGEST_REPLY_ROUTE, /OpenAI/);
  });
});
