#!/usr/bin/env node

import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  normalizeSuite,
  readJson,
  renderQaReport,
  rowsForCsv,
  runLlmJudge,
  scoreDashboardResult,
  toCsv,
} from "./dashboard-qa-lib.mjs";

const DEFAULT_SUITE = fileURLToPath(new URL("../assets/persona-request-suite.json", import.meta.url));

const HELP = `Usage:
  node .agents/skills/ask-ai-dashboard-qa/scripts/score-dashboard-result.mjs --results results.json [options]
  node .agents/skills/ask-ai-dashboard-qa/scripts/score-dashboard-result.mjs --self-test

Options:
  --suite path          Test suite JSON. Defaults to bundled suite.
  --results path        Results JSON from run-dashboard-qa-suite, or single AnalysisResult JSON.
  --result path         Alias for --results.
  --test-id id          Repeatable filter or required ID for single result.
  --out path            Output directory. Defaults to .codex/ask-ai-dashboard-qa/latest.
  --llm-judge           Add optional OpenAI senior-analyst judge.
  --judge-model model   Model for --llm-judge. Or set OPENAI_QA_JUDGE_MODEL.
`;

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) return process.stdout.write(HELP);
  if (args.selfTest) return runSelfTest();
  if (!args.results) throw new Error("--results is required");

  const suite = normalizeSuite(await readJson(args.suite));
  const selectedTests = suite.tests.filter((test) => !args.testIds.size || args.testIds.has(test.id));
  if (!selectedTests.length) throw new Error("No suite tests selected");
  const rawResults = await readJson(args.results);
  const resultEntries = normalizeResultEntries(rawResults, selectedTests);
  const scores = [];

  for (const entry of resultEntries) {
    const test = selectedTests.find((item) => item.id === entry.testId);
    if (!test) continue;
    const score = scoreDashboardResult(test, entry.result, { minScore: suite.passing.minScore });
    score.repeat = entry.repeat ?? 1;
    if (args.llmJudge) {
      score.llmJudge = await runLlmJudge({
        test,
        result: entry.result,
        model: args.judgeModel || process.env.OPENAI_QA_JUDGE_MODEL,
      });
      if (Number(score.llmJudge.score) < 80) {
        score.passed = false;
        score.findings.push({
          category: "seniorUsefulness",
          points: 0,
          message: `LLM judge score below 80: ${score.llmJudge.score}`,
          critical: false,
        });
      }
    }
    scores.push(score);
  }

  await writeOutputs(args.out, suite, scores);
  const failed = scores.filter((score) => !score.passed);
  process.stdout.write(`Scored ${scores.length} result(s). ${failed.length ? "FAIL" : "PASS"}\n`);
  if (failed.length) process.exitCode = 1;
}

function parseArgs(argv) {
  const args = {
    suite: DEFAULT_SUITE,
    results: "",
    out: ".codex/ask-ai-dashboard-qa/latest",
    testIds: new Set(),
    llmJudge: false,
    judgeModel: "",
    help: false,
    selfTest: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const { key, value } = splitArg(arg);
    const next = () => value ?? argv[++index];
    if (arg === "--help" || arg === "-h") args.help = true;
    else if (arg === "--self-test") args.selfTest = true;
    else if (arg === "--llm-judge") args.llmJudge = true;
    else if (key === "--suite") args.suite = next();
    else if (key === "--results" || key === "--result") args.results = next();
    else if (key === "--out") args.out = next();
    else if (key === "--test-id") args.testIds.add(next());
    else if (key === "--judge-model") args.judgeModel = next();
    else throw new Error(`Unknown argument: ${arg}`);
  }
  return args;
}

function normalizeResultEntries(rawResults, selectedTests) {
  if (Array.isArray(rawResults.results)) {
    return rawResults.results.map((entry) => ({
      testId: entry.testId || entry.id,
      repeat: entry.repeat,
      result: entry.result || entry.response || entry,
    }));
  }

  if (Array.isArray(rawResults)) {
    return rawResults.map((entry) => ({
      testId: entry.testId || entry.id,
      repeat: entry.repeat,
      result: entry.result || entry.response || entry,
    }));
  }

  if (rawResults.result && rawResults.testId) {
    return [{ testId: rawResults.testId, repeat: rawResults.repeat, result: rawResults.result }];
  }

  if (selectedTests.length === 1) {
    return [{ testId: selectedTests[0].id, repeat: 1, result: rawResults }];
  }

  throw new Error("Could not map results to suite tests. Provide run-dashboard-qa-suite results or --test-id for single result.");
}

async function writeOutputs(outDir, suite, scores) {
  await mkdir(outDir, { recursive: true });
  await writeFile(join(outDir, "qa-report.md"), renderQaReport({ suite, scores, outDir }));
  await writeFile(join(outDir, "scores.csv"), toCsv(rowsForCsv(scores)));
  await writeFile(
    join(outDir, "failures.json"),
    `${JSON.stringify(scores.filter((score) => !score.passed), null, 2)}\n`,
  );
  await writeFile(join(outDir, "scores.json"), `${JSON.stringify(scores, null, 2)}\n`);
}

function splitArg(arg) {
  const index = arg.indexOf("=");
  if (index === -1) return { key: arg, value: undefined };
  return { key: arg.slice(0, index), value: arg.slice(index + 1) };
}

async function runSelfTest() {
  const suite = normalizeSuite(await readJson(DEFAULT_SUITE));
  const test = suite.tests.find((item) => item.id === "manager-budget-reallocation");
  const result = passingResultFor(test);
  const score = scoreDashboardResult(test, result, { minScore: suite.passing.minScore });
  assert(score.passed, `expected passing score, got ${score.score}`);
  const bad = scoreDashboardResult(test, { validationStatus: "ready", resolvedSpec: {}, table: { columns: [], rows: [] } });
  assert(!bad.passed, "bad result should fail");
  const out = join("/tmp", `ask-ai-dashboard-qa-self-test-${Date.now()}`);
  await writeOutputs(out, suite, [score, bad]);
  assert(dirname(out) === "/tmp", "self-test output path sane");
  process.stdout.write("score-dashboard-result self-test PASS\n");
}

function passingResultFor(test) {
  const expected = test.expected;
  const metrics = expected.requiredMetrics || [];
  const dimensions = expected.requiredDimensions || [];
  const widgets = (expected.requiredWidgets || []).map((widget, index) => ({
    type: widget.type || widget.typeAny?.[0] || "table",
    title: `Widget ${index + 1}`,
    x: widget.x || widget.xAny?.[0] || dimensions[0],
    metrics: widget.metrics || metrics.slice(0, 2),
  }));
  return {
    validationStatus: "ready",
    title: "Senior analyst dashboard",
    answer:
      "Top campaign umbrella changed versus prior period. Spend was $1,234 and primary KPI was 56. Prioritize the highest result group first, inspect the weak ad set, and shift budget toward the stronger creative.",
    resolvedSpec: {
      dateRange: expected.dateRange || { preset: "last_30_days" },
      metrics,
      dimensions,
      filters: expected.requiredFilters || [],
      tableLayout: expected.tableLayout,
      widgets,
    },
    widgets,
    table: {
      columns: [...dimensions, ...metrics].map((key) => ({ key, label: key, type: "number" })),
      rows: [{ campaign_umbrella: "Cash for Gold US", campaign: "Campaign A", creative: "Creative A", spend: 1234, primary_results: 56 }],
    },
    totals: Object.fromEntries(metrics.map((metric) => [metric, metric === "spend" ? 1234 : 56])),
    sourceTransparency: { timeRange: { start: "2026-05-01", end: "2026-05-30", days: 30 }, sourceTable: "meta_daily_insights" },
    analystDebug: { sourceFunction: "aggregate_meta_daily_insights", filters: expected.requiredFilters || [] },
    warnings: [],
    unsupportedReasons: [],
  };
}

function assert(value, message) {
  if (!value) throw new Error(message);
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});
