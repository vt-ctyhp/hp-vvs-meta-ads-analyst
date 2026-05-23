import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { normalizeAggregateInput } from "../src/lib/meta-insight-aggregates.ts";
import { buildMetaInsightAggregateWarmupInputs } from "../src/lib/meta-insight-cache-warmup.ts";

describe("Meta insight aggregate cache warmup", () => {
  it("builds unique first-load Analyst aggregate keys without lower-level rows", () => {
    const inputs = buildMetaInsightAggregateWarmupInputs({
      now: new Date("2026-05-22T12:00:00Z"),
      days: 30,
      periodCount: 2,
    });
    const keys = inputs.map((input) => JSON.stringify(normalizeAggregateInput(input)));

    assert.equal(keys.length, new Set(keys).size);
    assert.ok(
      inputs.some(
        (input) =>
          input.start === "2026-04-23" &&
          input.end === "2026-05-22" &&
          input.dimensions.join(",") === "campaign",
      ),
    );
    assert.ok(
      inputs.some(
        (input) =>
          input.start === "2026-03-24" &&
          input.end === "2026-04-22" &&
          input.dimensions.join(",") === "campaign",
      ),
    );
    assert.equal(
      inputs.some((input) => input.dimensions.includes("ad_set")),
      false,
    );
    assert.equal(
      inputs.some((input) => input.dimensions.includes("creative")),
      false,
    );
  });
});
