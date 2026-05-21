import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { formatCaliforniaDateTime } from "../src/lib/california-time.ts";

describe("formatCaliforniaDateTime", () => {
  it("renders UTC sync timestamps as California local time", () => {
    assert.equal(
      formatCaliforniaDateTime("2026-05-21T02:01:00.000Z"),
      "May 20, 07:01 PM",
    );
  });

  it("returns the fallback for missing or invalid values", () => {
    assert.equal(formatCaliforniaDateTime(null), "-");
    assert.equal(formatCaliforniaDateTime("not-a-date", "n/a"), "n/a");
  });
});
