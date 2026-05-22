import { test } from "node:test";
import assert from "node:assert/strict";

import { severityColor } from "../src/lib/severity-color.ts";

test("ok and healthy return positive token", () => {
  assert.equal(severityColor("ok"), "var(--positive)");
  assert.equal(severityColor("healthy"), "var(--positive)");
  assert.equal(severityColor("HEALTHY"), "var(--positive)");
});

test("warning and warn return warning token", () => {
  assert.equal(severityColor("warning"), "var(--warning)");
  assert.equal(severityColor("warn"), "var(--warning)");
});

test("critical, error, fail return danger token", () => {
  assert.equal(severityColor("critical"), "var(--danger)");
  assert.equal(severityColor("error"), "var(--danger)");
  assert.equal(severityColor("fail"), "var(--danger)");
});

test("unknown returns ink-muted token", () => {
  assert.equal(severityColor("snoozed"), "var(--ink-muted)");
  assert.equal(severityColor(""), "var(--ink-muted)");
});
