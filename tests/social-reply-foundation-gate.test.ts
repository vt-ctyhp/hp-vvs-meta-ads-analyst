import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

import {
  buildFoundationAiReplyDisabledResponse,
  isSocialReplySuggestionReady,
} from "../src/lib/social-reply-foundation-gate.ts";

const SUGGEST_REPLY_ROUTE = readFileSync(
  "src/app/api/social-inbox/suggest-reply/route.ts",
  "utf8",
);

describe("social reply foundation gate", () => {
  it("returns a disabled response shape until Anthropic reply suggestions are enabled", () => {
    withEnv(
      {
        AI_REPLY_SUGGESTIONS_ENABLED: undefined,
        ANTHROPIC_API_KEY: undefined,
      },
      () => {
        assert.deepEqual(buildFoundationAiReplyDisabledResponse(), {
          status: "disabled",
          disabled: true,
          suggestionId: null,
          draft: null,
          reason:
            "AI reply suggestions are disabled. Set AI_REPLY_SUGGESTIONS_ENABLED=true to enable Anthropic drafts.",
        });
        assert.equal(isSocialReplySuggestionReady(), false);
      },
    );
  });

  it("requires Anthropic configuration after the feature flag is on", () => {
    withEnv(
      {
        AI_REPLY_SUGGESTIONS_ENABLED: "true",
        ANTHROPIC_API_KEY: undefined,
      },
      () => {
        assert.equal(isSocialReplySuggestionReady(), false);
        assert.match(buildFoundationAiReplyDisabledResponse().reason, /ANTHROPIC_API_KEY/);
      },
    );

    withEnv(
      {
        AI_REPLY_SUGGESTIONS_ENABLED: "true",
        ANTHROPIC_API_KEY: "test-key",
      },
      () => {
        assert.equal(isSocialReplySuggestionReady(), true);
      },
    );
  });

  it("routes configured requests to the normalized Anthropic suggestion service", () => {
    assert.match(SUGGEST_REPLY_ROUTE, /requirePermissionFromRequest\(request, "send_inbox_reply"\)/);
    assert.match(SUGGEST_REPLY_ROUTE, /parseJsonObjectBody/);
    assert.match(SUGGEST_REPLY_ROUTE, /conversationId/);
    assert.match(SUGGEST_REPLY_ROUTE, /isSocialReplySuggestionReady/);
    assert.match(SUGGEST_REPLY_ROUTE, /buildFoundationAiReplyDisabledResponse/);
    assert.match(SUGGEST_REPLY_ROUTE, /status:\s*501/);
    assert.match(SUGGEST_REPLY_ROUTE, /streamSocialReply/);
    assert.match(SUGGEST_REPLY_ROUTE, /social-reply-suggestions/);
    assert.doesNotMatch(SUGGEST_REPLY_ROUTE, /OpenAI/);
  });
});

function withEnv(
  values: Record<string, string | undefined>,
  callback: () => void,
) {
  const previous = new Map<string, string | undefined>();
  for (const [key, value] of Object.entries(values)) {
    previous.set(key, process.env[key]);
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }

  try {
    callback();
  } finally {
    for (const [key, value] of previous) {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  }
}
