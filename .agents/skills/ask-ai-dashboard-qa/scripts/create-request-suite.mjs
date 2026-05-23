#!/usr/bin/env node

import { mkdir, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { normalizeSuite, readJson } from "./dashboard-qa-lib.mjs";

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const DEFAULT_SUITE = fileURLToPath(new URL("../assets/persona-request-suite.json", import.meta.url));

const HELP = `Usage:
  node .agents/skills/ask-ai-dashboard-qa/scripts/create-request-suite.mjs [options]
  node .agents/skills/ask-ai-dashboard-qa/scripts/create-request-suite.mjs --self-test

Options:
  --suite path       Source suite. Defaults to bundled persona suite.
  --out path         Output JSON path.
  --persona value    Repeatable filter: analyst, manager, sales_lead, marketing.
  --type value       Repeatable requestType filter.
  --test-id value    Repeatable exact test ID filter.
  --list             Print selected prompts instead of writing JSON.
`;

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) return process.stdout.write(HELP);
  if (args.selfTest) return runSelfTest();

  const suite = normalizeSuite(await readJson(args.suite));
  const selected = {
    ...suite,
    tests: suite.tests.filter((test) => selectedByArgs(test, args)),
  };
  if (!selected.tests.length) throw new Error("No tests matched filters");

  if (args.list) {
    for (const test of selected.tests) {
      process.stdout.write(`${test.id}\t${test.persona}\t${test.requestType}\t${test.prompt}\n`);
    }
    return;
  }

  if (!args.out) {
    process.stdout.write(`${JSON.stringify(selected, null, 2)}\n`);
    return;
  }

  await mkdir(dirname(args.out), { recursive: true });
  await writeFile(args.out, `${JSON.stringify(selected, null, 2)}\n`);
  process.stdout.write(`Wrote ${args.out} (${selected.tests.length} tests)\n`);
}

function parseArgs(argv) {
  const args = {
    suite: DEFAULT_SUITE,
    out: "",
    personas: new Set(),
    types: new Set(),
    testIds: new Set(),
    list: false,
    help: false,
    selfTest: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const { key, value } = splitArg(arg);
    const next = () => value ?? argv[++index];
    if (arg === "--help" || arg === "-h") args.help = true;
    else if (arg === "--self-test") args.selfTest = true;
    else if (arg === "--list") args.list = true;
    else if (key === "--suite") args.suite = next();
    else if (key === "--out") args.out = next();
    else if (key === "--persona") args.personas.add(next());
    else if (key === "--type") args.types.add(next());
    else if (key === "--test-id") args.testIds.add(next());
    else throw new Error(`Unknown argument: ${arg}`);
  }
  return args;
}

function selectedByArgs(test, args) {
  if (args.personas.size && !args.personas.has(test.persona)) return false;
  if (args.types.size && !args.types.has(test.requestType)) return false;
  if (args.testIds.size && !args.testIds.has(test.id)) return false;
  return true;
}

function splitArg(arg) {
  const index = arg.indexOf("=");
  if (index === -1) return { key: arg, value: undefined };
  return { key: arg.slice(0, index), value: arg.slice(index + 1) };
}

async function runSelfTest() {
  const suite = normalizeSuite(await readJson(DEFAULT_SUITE));
  assert(suite.tests.length >= 10, "suite should include at least 10 tests");
  assert(suite.tests.some((test) => test.persona === "manager"), "suite should include manager");
  assert(SCRIPT_DIR.includes("scripts"), "script dir resolved");
  process.stdout.write("create-request-suite self-test PASS\n");
}

function assert(value, message) {
  if (!value) throw new Error(message);
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});
