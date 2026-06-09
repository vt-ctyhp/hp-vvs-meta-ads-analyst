import assert from "node:assert/strict";
import test from "node:test";

import {
  normalizeAnswerMarkdown,
  parseReadableAnswer,
} from "../src/lib/analysis-workbench-answer-format.ts";

test("strips markdown tokens but keeps single underscores in entity names", () => {
  const out = normalizeAnswerMarkdown(
    "### US Product\n**Live:** 4 campaigns `CBI_Evergreen_Prospecting_US`",
  );
  assert.doesNotMatch(out, /[#*`]/);
  assert.match(out, /CBI_Evergreen_Prospecting_US/);
});

test("breaks a markdown roster into separate labelled findings", () => {
  // The exact shape the live agent produced (hard to read as one blob).
  const summary =
    'Yes—both the US Product and VN Product campaign groups still have ads that are active. ' +
    'Also, none of them are in an "off" state; they\'re either live or paused. ' +
    "### US Product (Facebook US Product) — brand HP - Live: 4 campaigns - Paused: 2 campaigns - Off: 0 campaigns (Source: Q4) " +
    "### VN Product (Facebook VN Product) — brand HP - Live: 1 campaign - Paused: 2 campaigns - Off: 0 campaigns (Source: Q5)";

  const parsed = parseReadableAnswer(summary);

  // No literal markdown leaks into any finding.
  const allText = parsed.findings.map((item) => `${item.label ?? ""} ${item.body}`).join(" ");
  assert.doesNotMatch(allText, /[#*`]/);

  // The roster is split into many readable lines, not crammed into two blobs.
  assert.ok(parsed.findings.length >= 6, `expected >=6 findings, got ${parsed.findings.length}`);

  // Live / Paused / Off become bold labels.
  const labels = parsed.findings.map((item) => item.label).filter(Boolean);
  assert.ok(labels.includes("Live"));
  assert.ok(labels.includes("Paused"));
  assert.ok(labels.includes("Off"));

  // The headline answer survives as the first finding.
  assert.match(parsed.findings[0].body, /both the US Product and VN Product/);
});

test("falls back to a single normalized finding when there are no sentence breaks", () => {
  const parsed = parseReadableAnswer("**just one** line with no period");
  assert.equal(parsed.findings.length, 1);
  assert.doesNotMatch(parsed.findings[0].body, /[*`]/);
  assert.match(parsed.findings[0].body, /just one line/);
});

test("routes caveat and source-note lines out of the findings list", () => {
  const parsed = parseReadableAnswer(
    "Spend rose to $4,700.\nCaveat: budget figures double-count overlapping rows.\nSource note: query_performance returned 3 rows.",
  );
  assert.equal(parsed.findings.length, 1);
  assert.equal(parsed.caveats.length, 1);
  assert.equal(parsed.sourceNotes.length, 1);
});
