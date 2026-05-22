#!/usr/bin/env node

import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

const HELP = `Usage:
  node .agents/skills/meta-ads-data-accuracy/scripts/scan-ai-numeric-claims.mjs --input file [--input file] [--facts raw-summary.json] [--out path]
  node .agents/skills/meta-ads-data-accuracy/scripts/scan-ai-numeric-claims.mjs --self-test

Scans AI/report/export text or JSON for numeric claims. With --facts, recognized
total metric claims are compared against raw-summary.json from reconcile-meta-ads-data.mjs.
`;

const METRIC_PATTERNS = [
  { metric: "spend", pattern: /\b(spend|spent|cost|budget)\b/i },
  { metric: "impressions", pattern: /\b(impressions?|views?)\b/i },
  { metric: "clicks", pattern: /\bclicks?\b/i },
  { metric: "ctr", pattern: /\bctr|click[- ]through\s+rate\b/i },
  { metric: "cpc", pattern: /\bcpc|cost\s+per\s+click\b/i },
  { metric: "cpm", pattern: /\bcpm|cost\s+per\s+thousand\b/i },
  { metric: "leads", pattern: /\bleads?\b/i },
  { metric: "bookings", pattern: /\bbookings?|appointments?\b/i },
  { metric: "conversions", pattern: /\bconversions?\b/i },
  { metric: "website_bookings", pattern: /\bwebsite\s+bookings?\b/i },
  { metric: "messaging_contacts", pattern: /\b(messages?|messaging\s+contacts?|conversations?)\b/i },
  { metric: "primary_results", pattern: /\bprimary\s+(kpi|results?)\b/i },
  { metric: "secondary_results", pattern: /\bsecondary\s+(kpi|results?)\b/i },
  { metric: "roas", pattern: /\broas|return\s+on\s+ad\s+spend\b/i },
];

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    process.stdout.write(HELP);
    return;
  }
  if (args.selfTest) {
    await runSelfTest();
    return;
  }
  if (!args.inputs.length) throw new Error("At least one --input file is required");

  await mkdir(args.out, { recursive: true });
  const facts = args.facts ? await readFacts(args.facts) : null;
  const documents = [];
  for (const input of args.inputs) {
    documents.push({ path: input, text: await readTextDocument(input) });
  }

  const claims = documents.flatMap((document) => extractClaims(document.text, document.path, facts));
  const files = {
    report: join(args.out, "numeric-claims-report.md"),
    csv: join(args.out, "numeric-claims.csv"),
  };

  await writeFile(files.report, renderReport(claims, facts, files));
  await writeFile(files.csv, renderCsv(claims));

  const hardFailures = claims.filter((claim) => claim.status === "mismatch" || claim.status === "unsupported_roas");
  process.stdout.write(`Wrote ${files.report}\n`);
  process.stdout.write(`Wrote ${files.csv}\n`);
  process.stdout.write(`Status: ${hardFailures.length ? "FAIL" : "PASS"}\n`);
  if (hardFailures.length) process.exitCode = 1;
}

function parseArgs(argv) {
  const args = {
    inputs: [],
    facts: "",
    out: ".codex/meta-ads-accuracy/latest",
    help: false,
    selfTest: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const { key, value: inlineValue } = splitArg(arg);
    const nextValue = () => inlineValue ?? argv[++index];

    if (arg === "--help" || arg === "-h") args.help = true;
    else if (arg === "--self-test") args.selfTest = true;
    else if (key === "--input") args.inputs.push(nextValue());
    else if (key === "--facts") args.facts = nextValue();
    else if (key === "--out") args.out = nextValue();
    else throw new Error(`Unknown argument: ${arg}`);
  }

  return args;
}

function splitArg(arg) {
  const index = arg.indexOf("=");
  if (index === -1) return { key: arg, value: undefined };
  return { key: arg.slice(0, index), value: arg.slice(index + 1) };
}

async function readTextDocument(path) {
  const raw = await readFile(path, "utf8");
  if (/\.json$/i.test(path)) {
    try {
      return collectJsonText(JSON.parse(raw)).join("\n");
    } catch {
      return raw;
    }
  }
  return raw;
}

function collectJsonText(value, output = []) {
  if (typeof value === "string") output.push(value);
  else if (Array.isArray(value)) {
    for (const item of value) collectJsonText(item, output);
  } else if (value && typeof value === "object") {
    for (const item of Object.values(value)) collectJsonText(item, output);
  }
  return output;
}

async function readFacts(path) {
  const raw = await readFile(path, "utf8");
  const parsed = JSON.parse(raw);
  const metrics = parsed.metrics || parsed;
  return {
    path,
    metrics,
    supportedMetrics: new Set(Object.keys(metrics).filter((key) => metrics[key] !== null && metrics[key] !== undefined)),
  };
}

function extractClaims(text, sourcePath, facts) {
  const claims = [];
  const regex = /(?<![\w-])\$?\d[\d,]*(?:\.\d+)?\s?(?:%|[kKmMxX])?(?![\w-])/g;
  for (const match of text.matchAll(regex)) {
    const raw = match[0];
    const index = match.index || 0;
    if (looksLikeDateOrId(text, index, raw)) continue;
    const context = text.slice(Math.max(0, index - 90), Math.min(text.length, index + raw.length + 90));
    const metric = classifyMetric(context, index - Math.max(0, index - 90), raw.length);
    const value = parseClaimValue(raw);
    const status = evaluateClaim(metric, value, raw, facts);
    claims.push({
      source: sourcePath,
      raw,
      value,
      metric,
      status: status.status,
      expected: status.expected,
      delta: status.delta,
      context: compactWhitespace(context),
    });
  }
  return claims;
}

function looksLikeDateOrId(text, index, raw) {
  const before = text.slice(Math.max(0, index - 3), index);
  const after = text.slice(index + raw.length, index + raw.length + 3);
  if (/^\d{4}$/.test(raw) && /[-/]/.test(after)) return true;
  if (/^\d{1,2}$/.test(raw) && /[-/]/.test(before + after)) return true;
  if (/^\d{4}-\d{2}-\d{2}$/.test(text.slice(index, index + 10))) return true;
  return false;
}

function classifyMetric(context, numberIndex, rawLength) {
  const numberEnd = numberIndex + rawLength;
  const beforeBest = nearestMetricBefore(context.slice(0, numberIndex));
  if (beforeBest && beforeBest.distance <= 80) return beforeBest.metric;

  const afterBest = nearestMetricAfter(context.slice(numberEnd));
  if (afterBest && afterBest.distance <= 80) return afterBest.metric;

  return "unknown_metric";
}

function nearestMetricBefore(context) {
  let best = null;

  for (const item of METRIC_PATTERNS) {
    const pattern = new RegExp(item.pattern.source, "gi");
    for (const match of context.matchAll(pattern)) {
      const matchStart = match.index || 0;
      const matchEnd = matchStart + match[0].length;
      const distance = context.length - matchEnd;
      if (!best || distance < best.distance) {
        best = { metric: item.metric, distance };
      }
    }
  }

  return best;
}

function nearestMetricAfter(context) {
  let best = null;

  for (const item of METRIC_PATTERNS) {
    const pattern = new RegExp(item.pattern.source, "gi");
    for (const match of context.matchAll(pattern)) {
      const matchStart = match.index || 0;
      const distance = matchStart;
      if (!best || distance < best.distance) {
        best = { metric: item.metric, distance };
      }
    }
  }

  return best;
}

function parseClaimValue(raw) {
  const compact = raw.replace(/\s/g, "");
  const suffix = compact.at(-1);
  const numberPart = compact.replace(/[$,%kKmMxX]/g, "").replaceAll(",", "");
  let value = Number(numberPart);
  if (!Number.isFinite(value)) return null;
  if (suffix === "k" || suffix === "K") value *= 1000;
  if (suffix === "m" || suffix === "M") value *= 1000000;
  return Math.round(value * 100) / 100;
}

function evaluateClaim(metric, value, raw, facts) {
  if (metric === "roas") {
    return { status: "unsupported_roas", expected: null, delta: null };
  }
  if (!facts) return { status: metric === "unknown_metric" ? "needs_context" : "unchecked", expected: null, delta: null };
  if (metric === "unknown_metric") return { status: "needs_context", expected: null, delta: null };
  if (!facts.supportedMetrics.has(metric)) return { status: "missing_fact", expected: null, delta: null };
  const expected = numberValue(facts.metrics[metric]);
  const actual = numberValue(value);
  const tolerance = toleranceFor(raw, expected);
  const delta = Math.round((actual - expected) * 100) / 100;
  return {
    status: Math.abs(delta) <= tolerance ? "match" : "mismatch",
    expected,
    delta,
  };
}

function toleranceFor(raw, expected) {
  if (raw.includes("%")) return 0.1;
  return Math.max(1, Math.abs(expected) * 0.01);
}

function renderReport(claims, facts, files) {
  const counts = countBy(claims, (claim) => claim.status);
  const lines = [
    "# Numeric Claims Report",
    "",
    `Facts: ${facts ? facts.path : "(none)"}`,
    `Claims: ${claims.length}`,
    `CSV: ${files.csv}`,
    "",
    "## Status Counts",
    "",
  ];

  for (const [status, count] of Object.entries(counts)) {
    lines.push(`- ${status}: ${count}`);
  }

  const notable = claims.filter((claim) =>
    ["mismatch", "unsupported_roas", "missing_fact", "needs_context"].includes(claim.status),
  );

  if (notable.length) {
    lines.push("", "## Review Items", "");
    for (const claim of notable.slice(0, 80)) {
      lines.push(
        `- ${claim.status} ${claim.metric} ${claim.raw} expected=${claim.expected ?? ""} delta=${claim.delta ?? ""} source=${claim.source}`,
      );
      lines.push(`  Context: ${claim.context}`);
    }
    if (notable.length > 80) lines.push(`- ${notable.length - 80} more review items omitted.`);
  }

  lines.push("");
  return `${lines.join("\n")}\n`;
}

function renderCsv(claims) {
  const columns = ["source", "metric", "raw", "value", "status", "expected", "delta", "context"];
  const lines = [columns.join(",")];
  for (const claim of claims) {
    lines.push(columns.map((column) => csvEscape(claim[column])).join(","));
  }
  return `${lines.join("\n")}\n`;
}

function countBy(items, keyFn) {
  const counts = {};
  for (const item of items) {
    const key = keyFn(item);
    counts[key] = (counts[key] || 0) + 1;
  }
  return counts;
}

function csvEscape(value) {
  if (value === null || value === undefined) return "";
  const text = String(value);
  return /[",\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

function compactWhitespace(value) {
  return value.replace(/\s+/g, " ").trim();
}

function numberValue(value) {
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value.replaceAll(",", ""));
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}

async function runSelfTest() {
  const facts = {
    path: "<inline>",
    metrics: { spend: 1250, clicks: 40, ctr: 2.5 },
    supportedMetrics: new Set(["spend", "clicks", "ctr"]),
  };
  const claims = extractClaims("Spend was $1,250. CTR was 2.5%. ROAS was 3x. Random 42.", "<inline>", facts);
  const unknownClaims = extractClaims("Random 42.", "<inline>", facts);
  assertEqual(claims.some((claim) => claim.metric === "spend" && claim.status === "match"), true, "spend matches");
  assertEqual(claims.some((claim) => claim.metric === "ctr" && claim.status === "match"), true, "ctr matches");
  assertEqual(claims.some((claim) => claim.metric === "roas" && claim.status === "unsupported_roas"), true, "roas unsupported");
  assertEqual(unknownClaims.some((claim) => claim.raw === "42" && claim.status === "needs_context"), true, "unknown metric needs context");
  process.stdout.write("scan-ai-numeric-claims self-test PASS\n");
}

function assertEqual(actual, expected, message) {
  if (actual !== expected) throw new Error(`${message}: expected ${expected}, got ${actual}`);
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});
