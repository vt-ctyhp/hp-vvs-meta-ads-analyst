import assert from "node:assert/strict";
import test from "node:test";

import { buildOpenAICostBreakdown } from "../src/lib/openai-cost.ts";

test("OpenAI cost helper estimates configured model aliases", () => {
  assert.deepEqual(
    buildOpenAICostBreakdown({
      model: "gpt-5.5",
      inputTokens: 1_000_000,
      outputTokens: 1_000_000,
    }),
    {
      model: "gpt-5.5",
      inputTokens: 1_000_000,
      outputTokens: 1_000_000,
      totalTokens: 2_000_000,
      estimatedCostUsd: 35,
    },
  );

  assert.equal(
    buildOpenAICostBreakdown({
      model: "gpt-5.4-mini",
      inputTokens: 1_000_000,
      outputTokens: 1_000_000,
    }).estimatedCostUsd,
    5.25,
  );
});
