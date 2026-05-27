// Create a new Supabase migration with a timestamp that complies with the
// repo's offset convention.
//
// CONVENTION (shared Supabase DB across two repos):
//   - sales-standalone-app-v1 → seconds component MUST be "00"
//   - hp-vvs-meta-ads-analyst → seconds component MUST be "30"
//
// Why: both repos write to the same Supabase project. If both pick the same
// `YYYYMMDDHHMMSS` timestamp for a new migration, only the first one to
// `db push` is recorded in the ledger and the other repo's SQL is silently
// dropped on the floor. Splitting the seconds field eliminates that class of
// collisions while keeping timestamps roughly chronological.
//
// The grandfather cutoff (versions strictly before MIN_ENFORCED_VERSION) is
// left alone — many existing files predate this rule. Only newly created
// versions are forced to comply.

import { execFileSync } from "node:child_process";
import { existsSync, readdirSync, writeFileSync } from "node:fs";
import path from "node:path";

const REPO_SECONDS_OFFSET = "30"; // hp-vvs-meta-ads-analyst
const MIN_ENFORCED_VERSION = "20260527000000";

const root = process.cwd();
const migrationsDir = path.join(root, "supabase", "migrations");
const args = process.argv.slice(2);
const noFetch = args.includes("--no-fetch");
const rawName = args.find((arg) => !arg.startsWith("--"));

function fail(message) {
  console.error(message);
  process.exit(1);
}

if (!rawName) {
  fail("Usage: npm run db:migration -- descriptive_name");
}

const name = rawName
  .trim()
  .toLowerCase()
  .replace(/[^a-z0-9]+/g, "_")
  .replace(/^_+|_+$/g, "");

if (!name) {
  fail("Migration name must contain at least one letter or number.");
}

if (!noFetch) {
  execFileSync("git", ["fetch", "--prune", "origin", "main"], {
    cwd: root,
    stdio: "inherit",
  });
}

const existingVersions = new Set(
  readdirSync(migrationsDir)
    .filter((entry) => entry.endsWith(".sql"))
    .map((entry) => entry.split("_", 1)[0]),
);

function utcTimestampMinuteAligned(date) {
  // Force the seconds component to the repo's offset so we never collide
  // with the other repo's new migrations.
  const parts = [
    date.getUTCFullYear(),
    date.getUTCMonth() + 1,
    date.getUTCDate(),
    date.getUTCHours(),
    date.getUTCMinutes(),
  ];

  return (
    `${parts[0]}` +
    parts
      .slice(1)
      .map((part) => String(part).padStart(2, "0"))
      .join("") +
    REPO_SECONDS_OFFSET
  );
}

let candidate = new Date();
// Strip seconds; we always anchor to MM:00 (UTC) + REPO_SECONDS_OFFSET.
candidate.setUTCSeconds(0, 0);
let version = utcTimestampMinuteAligned(candidate);

for (let i = 0; existingVersions.has(version); i += 1) {
  if (i > 60) fail("Could not find a free migration timestamp within 60 minutes.");
  // Advance by one whole minute so the offset seconds stay correct.
  candidate = new Date(candidate.getTime() + 60_000);
  version = utcTimestampMinuteAligned(candidate);
}

if (version < MIN_ENFORCED_VERSION) {
  // Refuse to back-date below the rollout cutoff. Forces clock-wrong fixes
  // to be explicit instead of silently bypassing the offset rule.
  fail(
    `Generated version ${version} is older than the enforced minimum ${MIN_ENFORCED_VERSION}. ` +
      "Check your system clock.",
  );
}

const relativePath = path.join("supabase", "migrations", `${version}_${name}.sql`);
const fullPath = path.join(root, relativePath);

if (existsSync(fullPath)) {
  fail(`${relativePath} already exists.`);
}

writeFileSync(
  fullPath,
  `-- Migration: ${name}\n--\n-- Shared Supabase ledger file. This repo writes seconds=${REPO_SECONDS_OFFSET}\n-- so it cannot collide with the sales-standalone-app-v1 repo (which writes seconds=00).\n\n`,
  "utf8",
);

console.log(relativePath);
