import assert from "node:assert/strict";
import test from "node:test";

import { getOpenAIAnalysisModel } from "../src/lib/env.ts";

test("analysis model defaults route fast dashboards to gpt-5.4 and deep analysis to gpt-5.5", () => {
  const previousFast = process.env.OPENAI_FAST_MODEL;
  const previousDeep = process.env.OPENAI_DEEP_MODEL;
  delete process.env.OPENAI_FAST_MODEL;
  delete process.env.OPENAI_DEEP_MODEL;

  try {
    assert.equal(getOpenAIAnalysisModel("fast"), "gpt-5.4");
    assert.equal(getOpenAIAnalysisModel("deep"), "gpt-5.5");
  } finally {
    restoreEnv("OPENAI_FAST_MODEL", previousFast);
    restoreEnv("OPENAI_DEEP_MODEL", previousDeep);
  }
});

function restoreEnv(name: string, value: string | undefined) {
  if (value === undefined) {
    delete process.env[name];
    return;
  }

  process.env[name] = value;
}
