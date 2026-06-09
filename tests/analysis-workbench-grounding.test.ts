import assert from "node:assert/strict";
import test from "node:test";

import {
  groundAgentAnswer,
  validateAnswerGrounding,
} from "../src/lib/analysis-workbench-grounding.ts";
import type { AgentLedgerEntry } from "../src/lib/analysis-workbench-agent.ts";

const PERF_LEDGER: AgentLedgerEntry[] = [
  {
    id: "Q1",
    tool: "query_performance",
    params: {},
    summary: "spend by campaign_umbrella: 2 rows.",
    rowCount: 2,
    rows: [
      { campaign_umbrella: "Facebook US Product", spend: 1200, messaging_contacts: 30 },
      { campaign_umbrella: "Facebook VN Product", spend: 800, messaging_contacts: 18 },
    ],
  },
];

const ENTITY_LEDGER: AgentLedgerEntry[] = [
  {
    id: "Q1",
    tool: "query_entities",
    params: {},
    summary: "ad: 3 matched (1 live, 2 paused, 0 off).",
    rowCount: 3,
    rows: [
      { id: "a", status: "live" },
      { id: "b", status: "paused" },
      { id: "c", status: "paused" },
    ],
  },
];

test("a window length like '30 days' is descriptive, not a figure to verify", () => {
  const ledger: AgentLedgerEntry[] = [
    {
      id: "Q1",
      tool: "query_entities",
      params: {},
      summary: "campaign: 2 matched (2 live, 0 paused, 0 off).",
      rowCount: 2,
      rows: [
        { id: "a", status: "live", name: "CBI_Evergreen_Prospecting_US_Lifetime" },
        { id: "b", status: "live", name: "CBI_Evergreen_Prospecting_US_Jun_ADV_Audience" },
      ],
    },
  ];
  const grounded = groundAgentAnswer(
    "For the last 30 days (2026-05-10 to 2026-06-08), 2 campaigns are live.",
    ledger,
  );
  // "30 days" and the 30-day window must not be redacted.
  assert.match(grounded.answer, /last 30 days/);
  assert.doesNotMatch(grounded.answer, /\(unverified\)/);
  assert.equal(grounded.grounding.status, "grounded");
});

test("redaction does not corrupt adjacent or larger numbers", () => {
  // Evidence has 1 (rowCount) and 12 (a spend), but not a standalone 2.
  const ledger: AgentLedgerEntry[] = [
    {
      id: "Q1",
      tool: "query_performance",
      params: {},
      summary: "spend: 1 row.",
      rowCount: 1,
      rows: [{ campaign_umbrella: "Facebook US Product", spend: 12 }],
    },
  ];
  const grounded = groundAgentAnswer("We saw 12 ads but only 2 were live.", ledger);
  // The untraceable standalone 2 is redacted...
  assert.match(grounded.answer, /only \(unverified\) were live/);
  // ...without mangling the traceable 12 into "1(unverified)".
  assert.match(grounded.answer, /We saw 12 ads/);
  assert.doesNotMatch(grounded.answer, /1\(unverified\)/);
});

test("a status count derived from roster rows is traceable even if absent from the summary", () => {
  // Summary omits the count; the model counts 2 paused rows itself.
  const ledger: AgentLedgerEntry[] = [
    {
      id: "Q1",
      tool: "query_entities",
      params: {},
      summary: "query_entities campaign matched a roster.",
      rowCount: 3,
      rows: [
        { id: "a", status: "live" },
        { id: "b", status: "paused" },
        { id: "c", status: "paused" },
      ],
    },
  ];
  const result = validateAnswerGrounding("2 campaigns are paused.", ledger);
  assert.equal(result.status, "grounded");
  assert.equal(result.untraceable.length, 0);
});

test("an answer whose numbers all come from rows is grounded", () => {
  const result = validateAnswerGrounding("US Product spent $1,200; VN Product spent $800.", PERF_LEDGER);
  assert.equal(result.status, "grounded");
  assert.deepEqual(result.untraceable, []);
  assert.equal(result.numbersChecked, 2);
});

test("a fabricated number is flagged as untraceable", () => {
  const result = validateAnswerGrounding("US Product spent $1,200 and drove 47 bookings.", PERF_LEDGER);
  assert.equal(result.status, "ungrounded");
  assert.ok(result.untraceable.some((token) => token.includes("47")));
});

test("a derived total that equals a column sum is traceable", () => {
  const result = validateAnswerGrounding("Total spend across both groups was $2,000.", PERF_LEDGER);
  assert.equal(result.status, "grounded");
});

test("counts cited from the tool summary are traceable", () => {
  const result = validateAnswerGrounding("Of these, 1 is live and 2 are paused.", ENTITY_LEDGER);
  assert.equal(result.status, "grounded");
});

test("ISO dates and bare years are not treated as figures to verify", () => {
  const result = validateAnswerGrounding(
    "Between 2026-05-01 and 2026-05-07 in 2026, spend was $1,200.",
    PERF_LEDGER,
  );
  assert.equal(result.status, "grounded");
  assert.equal(result.numbersChecked, 1);
});

test("a percentage that matches a row value is traceable", () => {
  const ledger: AgentLedgerEntry[] = [
    {
      id: "Q1",
      tool: "query_performance",
      params: {},
      summary: "ctr by campaign: 1 row.",
      rowCount: 1,
      rows: [{ campaign: "A", ctr: 1.2 }],
    },
  ];
  const result = validateAnswerGrounding("CTR was 1.2%.", ledger);
  assert.equal(result.status, "grounded");
});

test("groundAgentAnswer redacts untraceable figures and warns", () => {
  const grounded = groundAgentAnswer("US Product spent $1,200 and drove 47 bookings.", PERF_LEDGER);
  assert.match(grounded.answer, /\$1,200/); // traceable figure kept
  assert.doesNotMatch(grounded.answer, /47 bookings/); // fabricated figure withheld
  assert.ok(grounded.warnings.length >= 1);
  assert.equal(grounded.grounding.status, "ungrounded");
});

test("groundAgentAnswer leaves a fully grounded answer untouched", () => {
  const text = "US Product spent $1,200; VN Product spent $800.";
  const grounded = groundAgentAnswer(text, PERF_LEDGER);
  assert.equal(grounded.answer, text);
  assert.deepEqual(grounded.warnings, []);
});

test("an empty evidence ledger marks numeric claims unverified", () => {
  const grounded = groundAgentAnswer("There were 5 live ads.", []);
  assert.equal(grounded.grounding.evidenceEmpty, true);
  assert.equal(grounded.grounding.status, "ungrounded");
  assert.doesNotMatch(grounded.answer, /5 live ads/);
});
