#!/usr/bin/env node

import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
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
  node .agents/skills/ask-ai-dashboard-qa/scripts/run-dashboard-qa-suite.mjs --base-url http://localhost:3000 [options]
  node .agents/skills/ask-ai-dashboard-qa/scripts/run-dashboard-qa-suite.mjs --self-test

Options:
  --suite path          Test suite JSON. Defaults to bundled suite.
  --out path            Output directory. Defaults to .codex/ask-ai-dashboard-qa/latest.
  --test-id id          Repeatable exact test ID filter.
  --persona value       Repeatable persona filter.
  --type value          Repeatable requestType filter.
  --repeat n            Repeat each test. Defaults to 1.
  --cookie value        Cookie header for authenticated app session.
  --login-local-test    POST /api/auth/local-test-session and reuse Set-Cookie.
  --llm-judge           Add optional OpenAI senior-analyst judge.
  --judge-model model   Model for --llm-judge. Or set OPENAI_QA_JUDGE_MODEL.
`;

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) return process.stdout.write(HELP);
  if (args.selfTest) return runSelfTest();
  if (!args.baseUrl) throw new Error("--base-url is required");

  const suite = normalizeSuite(await readJson(args.suite));
  const selectedTests = suite.tests.filter((test) => selectedByArgs(test, args));
  if (!selectedTests.length) throw new Error("No tests matched filters");

  await mkdir(args.out, { recursive: true });
  const cookie = args.loginLocalTest ? await loginLocalTest(args.baseUrl) : args.cookie;
  const results = [];
  const scores = [];

  for (const test of selectedTests) {
    for (let repeat = 1; repeat <= args.repeat; repeat += 1) {
      const result = await callAnalysisApi(args.baseUrl, test, cookie);
      const score = scoreDashboardResult(test, result, { minScore: suite.passing.minScore });
      score.repeat = repeat;
      if (args.llmJudge) {
        score.llmJudge = await runLlmJudge({
          test,
          result,
          model: args.judgeModel || process.env.OPENAI_QA_JUDGE_MODEL,
        });
        if (Number(score.llmJudge.score) < 80) score.passed = false;
      }
      results.push({ testId: test.id, repeat, request: requestBodyFor(test), result });
      scores.push(score);
      process.stdout.write(`${score.passed ? "PASS" : "FAIL"} ${test.id} repeat=${repeat} score=${score.score}\n`);
    }
  }

  await writeOutputs(args.out, suite, results, scores);
  const failed = scores.filter((score) => !score.passed);
  process.stdout.write(`Wrote ${args.out}/qa-report.md\n`);
  if (failed.length) process.exitCode = 1;
}

function parseArgs(argv) {
  const args = {
    baseUrl: "",
    suite: DEFAULT_SUITE,
    out: ".codex/ask-ai-dashboard-qa/latest",
    testIds: new Set(),
    personas: new Set(),
    types: new Set(),
    repeat: 1,
    cookie: "",
    loginLocalTest: false,
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
    else if (arg === "--login-local-test") args.loginLocalTest = true;
    else if (arg === "--llm-judge") args.llmJudge = true;
    else if (key === "--base-url") args.baseUrl = trimTrailingSlash(next());
    else if (key === "--suite") args.suite = next();
    else if (key === "--out") args.out = next();
    else if (key === "--test-id") args.testIds.add(next());
    else if (key === "--persona") args.personas.add(next());
    else if (key === "--type") args.types.add(next());
    else if (key === "--repeat") args.repeat = parsePositiveInt(next(), "--repeat");
    else if (key === "--cookie") args.cookie = next();
    else if (key === "--judge-model") args.judgeModel = next();
    else throw new Error(`Unknown argument: ${arg}`);
  }
  return args;
}

function selectedByArgs(test, args) {
  if (args.testIds.size && !args.testIds.has(test.id)) return false;
  if (args.personas.size && !args.personas.has(test.persona)) return false;
  if (args.types.size && !args.types.has(test.requestType)) return false;
  return true;
}

async function loginLocalTest(baseUrl) {
  const response = await fetch(`${baseUrl}/api/auth/local-test-session`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      email: process.env.LOCAL_TEST_AUTH_EMAIL || "local-admin@hp-vvs.test",
      password: process.env.LOCAL_TEST_AUTH_PASSWORD || "local-test-password",
      next: "/analysis",
    }),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload.error || `Local test login failed with ${response.status}`);
  }
  const setCookie = response.headers.get("set-cookie");
  if (!setCookie) throw new Error("Local test login did not return Set-Cookie");
  return setCookie.split(";")[0];
}

async function callAnalysisApi(baseUrl, test, cookie) {
  const response = await fetch(`${baseUrl}/api/analysis`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(cookie ? { cookie } : {}),
    },
    body: JSON.stringify(requestBodyFor(test)),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    return {
      validationStatus: "request_failed",
      status: "request_failed",
      answer: payload.error || `HTTP ${response.status}`,
      unsupportedReasons: [payload.error || `HTTP ${response.status}`],
      table: { columns: [], rows: [] },
      widgets: [],
      spec: {},
      resolvedSpec: {},
    };
  }
  return payload;
}

function requestBodyFor(test) {
  return {
    prompt: test.prompt,
    mode: test.mode,
    ...(test.runtimeContext ? { runtimeContext: test.runtimeContext } : {}),
    ...(test.defaultDateRange ? { defaultDateRange: test.defaultDateRange } : {}),
  };
}

async function writeOutputs(outDir, suite, results, scores) {
  await mkdir(outDir, { recursive: true });
  await writeFile(join(outDir, "results.json"), `${JSON.stringify({ results }, null, 2)}\n`);
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

function parsePositiveInt(value, label) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1) throw new Error(`${label} must be positive integer`);
  return parsed;
}

function trimTrailingSlash(value) {
  return String(value || "").replace(/\/$/, "");
}

async function runSelfTest() {
  const suite = normalizeSuite(await readJson(DEFAULT_SUITE));
  const tests = suite.tests.filter((test) => selectedByArgs(test, { testIds: new Set(), personas: new Set(["analyst"]), types: new Set(), repeat: 1 }));
  assert(tests.length >= 3, "expected analyst tests");
  const body = requestBodyFor(tests[0]);
  assert(body.prompt && body.mode, "request body has prompt and mode");
  const out = `/tmp/ask-ai-dashboard-qa-runner-self-test-${Date.now()}`;
  await writeOutputs(out, suite, [{ testId: tests[0].id, repeat: 1, request: body, result: {} }], []);
  process.stdout.write("run-dashboard-qa-suite self-test PASS\n");
}

function assert(value, message) {
  if (!value) throw new Error(message);
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});
