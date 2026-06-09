/**
 * Strict grounding for agent answers (Phase 3, Unit 7).
 *
 * Every figure in the written answer must trace to a value the agent actually
 * queried. {@link validateAnswerGrounding} extracts the numeric tokens from the
 * prose and confirms each one appears among the evidence — row values, column
 * sums, row counts, and the numbers in the tool summaries — within a small
 * rounding tolerance. {@link groundAgentAnswer} withholds (redacts) any figure
 * that cannot be traced rather than ship a possibly-fabricated number.
 *
 * Dates (YYYY-MM-DD) and bare calendar years are not treated as figures to
 * verify; they describe the window, not a measured value.
 */
import type { AgentLedgerEntry } from "./analysis-workbench-agent.ts";

export type GroundingStatus = "grounded" | "ungrounded";

export type AnswerGroundingResult = {
  status: GroundingStatus;
  numbersChecked: number;
  untraceable: string[];
  evidenceEmpty: boolean;
};

export type GroundedAnswer = {
  answer: string;
  warnings: string[];
  grounding: AnswerGroundingResult;
};

const REDACTION = "(unverified)";
const ISO_DATE = /\d{4}-\d{2}-\d{2}/g;
// Currency/percent/grouped/decimal numbers, e.g. $1,200  47  1.2%  2,000.
// Grouped form (with thousands commas) is matched first so a trailing
// sentence comma is never absorbed into the number.
const NUMBER_TOKEN = /\$?-?\d{1,3}(?:,\d{3})+(?:\.\d+)?%?|\$?-?\d+(?:\.\d+)?%?/g;

export function validateAnswerGrounding(
  answer: string,
  ledger: AgentLedgerEntry[],
): AnswerGroundingResult {
  const evidence = buildEvidenceValues(ledger);
  const evidenceEmpty = ledger.every((entry) => !entry.rows.length);
  const tokens = extractNumericTokens(answer);

  const untraceable = tokens
    .filter((token) => !isTraceable(token.value, evidence))
    .map((token) => token.raw);

  return {
    status: untraceable.length ? "ungrounded" : "grounded",
    numbersChecked: tokens.length,
    untraceable: uniqueStrings(untraceable),
    evidenceEmpty,
  };
}

export function groundAgentAnswer(answer: string, ledger: AgentLedgerEntry[]): GroundedAnswer {
  const grounding = validateAnswerGrounding(answer, ledger);
  if (grounding.status === "grounded") {
    return { answer, warnings: [], grounding };
  }

  let redacted = answer;
  for (const token of grounding.untraceable) {
    redacted = replaceAll(redacted, token, REDACTION);
  }

  const warnings = [
    `Withheld ${grounding.untraceable.length} figure${
      grounding.untraceable.length === 1 ? "" : "s"
    } that could not be traced to the queried data: ${grounding.untraceable.join(", ")}.`,
  ];

  return { answer: redacted, warnings, grounding };
}

// ---------------------------------------------------------------------------
// Numeric extraction
// ---------------------------------------------------------------------------

type NumericToken = { raw: string; value: number };

function extractNumericTokens(text: string): NumericToken[] {
  const withoutDates = text.replace(ISO_DATE, " ");
  const tokens: NumericToken[] = [];
  for (const match of withoutDates.matchAll(NUMBER_TOKEN)) {
    const raw = match[0];
    const value = parseNumber(raw);
    if (value === null) continue;
    if (isBareYear(raw, value)) continue;
    tokens.push({ raw, value });
  }
  return tokens;
}

function parseNumber(raw: string): number | null {
  const cleaned = raw.replace(/[$,%\s]/g, "");
  if (!cleaned || cleaned === "-") return null;
  const value = Number(cleaned);
  return Number.isFinite(value) ? value : null;
}

/** A 4-digit calendar year with no currency/percent/grouping/decimal is descriptive, not a figure. */
function isBareYear(raw: string, value: number): boolean {
  if (/[$%,.]/.test(raw)) return false;
  return Number.isInteger(value) && value >= 1900 && value <= 2099;
}

// ---------------------------------------------------------------------------
// Evidence set
// ---------------------------------------------------------------------------

function buildEvidenceValues(ledger: AgentLedgerEntry[]): number[] {
  const values: number[] = [];
  for (const entry of ledger) {
    values.push(entry.rowCount);
    for (const token of extractNumericTokens(entry.summary)) values.push(token.value);

    const columnSums = new Map<string, number>();
    for (const row of entry.rows) {
      for (const [key, raw] of Object.entries(row)) {
        const value = coerceNumber(raw);
        if (value === null) continue;
        values.push(value);
        columnSums.set(key, (columnSums.get(key) || 0) + value);
      }
    }
    for (const sum of columnSums.values()) values.push(sum);
  }
  return values;
}

function coerceNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

// ---------------------------------------------------------------------------
// Tolerance matching
// ---------------------------------------------------------------------------

function isTraceable(value: number, evidence: number[]): boolean {
  return evidence.some((candidate) => approxEqual(value, candidate));
}

function approxEqual(a: number, b: number): boolean {
  if (a === b) return true;
  const diff = Math.abs(a - b);
  if (diff <= 0.5) return true;
  if (Math.round(a) === Math.round(b)) return true;
  if (b !== 0 && diff / Math.abs(b) <= 0.02) return true;
  return false;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function replaceAll(text: string, token: string, replacement: string): string {
  return text.split(token).join(replacement);
}

function uniqueStrings(values: string[]): string[] {
  return Array.from(new Set(values));
}
