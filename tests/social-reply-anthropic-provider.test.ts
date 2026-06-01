import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  createAnthropicReplySuggestion,
  type AnthropicReplyClient,
} from "../src/lib/social-reply-anthropic.ts";
import type { SocialReplyContext } from "../src/lib/social-reply-context.ts";

describe("Anthropic social reply provider", () => {
  it("requests structured output and validates the parsed reply", async () => {
    const requests: Record<string, unknown>[] = [];
    const client: AnthropicReplyClient = {
      messages: {
        async parse(request) {
          requests.push(request);
          return {
            parsed_output: {
              draft: "Yes, please come by today and we can assess it in store.",
              strategy: "Invite to store because value depends on assessment.",
              nextBestAction: "invite_to_store",
              confidence: "high",
              suggestedLanguage: "en",
              toneNotes: ["Warm and direct"],
              riskFlags: ["No remote payout quote"],
            },
            usage: {
              input_tokens: 100,
              output_tokens: 42,
            },
          };
        },
      },
    };

    const result = await createAnthropicReplySuggestion({
      context: contextFixture(),
      model: "claude-test",
      client,
    });

    assert.equal(result.model, "claude-test");
    assert.equal(result.output.nextBestAction, "invite_to_store");
    assert.equal(result.output.draft, "Yes, please come by today and we can assess it in store.");
    assert.deepEqual(result.usage, { inputTokens: 100, outputTokens: 42 });
    assert.equal(requests.length, 1);
    assert.equal(requests[0]?.model, "claude-test");
    assert.match(String(requests[0]?.system), /human-approved customer replies/);
    assert.deepEqual(
      ((requests[0]?.output_config as Record<string, unknown>)?.format as Record<string, unknown>)?.type,
      "json_schema",
    );
  });

  it("rejects malformed structured replies before storing them", async () => {
    const client: AnthropicReplyClient = {
      messages: {
        async parse() {
          return {
            parsed_output: {
              draft: "",
              strategy: "No draft.",
              nextBestAction: "invite_to_store",
              confidence: "high",
              suggestedLanguage: "en",
              toneNotes: [],
              riskFlags: [],
            },
          };
        },
      },
    };

    await assert.rejects(
      createAnthropicReplySuggestion({
        context: contextFixture(),
        model: "claude-test",
        client,
      }),
      /draft is required/i,
    );
  });
});

function contextFixture(): SocialReplyContext {
  return {
    systemPrompt: "You draft human-approved customer replies.",
    userPrompt: JSON.stringify({
      transcript: "Customer: Can I sell gold today?",
    }),
    transcript: [],
    transcriptText: "Customer: Can I sell gold today?",
    transcriptTruncated: false,
    omittedTranscriptItems: 0,
    resolvedLanguage: "en",
    contextUsed: {
      brand: "HP",
      conversationId: "33333333-3333-4333-8333-333333333333",
      sourceType: "message_thread",
      platform: "instagram",
      messageCount: 1,
      commentCount: 0,
      transcriptItems: 1,
      omittedTranscriptItems: 0,
      promptProfileId: null,
      promptProfileVersion: null,
      exampleCount: 0,
      customerName: "Emma",
      transcriptTruncated: false,
    },
  };
}
