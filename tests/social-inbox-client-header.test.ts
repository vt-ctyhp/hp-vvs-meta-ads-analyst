import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { shouldRenderMetricsHeader } from "../src/components/v2/inbox/metrics-header-gate.ts";

describe("metrics header gate", () => {
  it("renders new header only when enabled AND metrics present", () => {
    assert.equal(shouldRenderMetricsHeader(true, { windowState: "open" } as never), true);
    assert.equal(shouldRenderMetricsHeader(true, null), false);
    assert.equal(shouldRenderMetricsHeader(false, { windowState: "open" } as never), false);
    assert.equal(shouldRenderMetricsHeader(undefined, undefined), false);
  });
});
