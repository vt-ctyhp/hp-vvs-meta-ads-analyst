// Validate the supabase/migrations directory.
//
// CONVENTION (shared Supabase DB across two repos):
//   - sales-standalone-app-v1 → new versions MUST end in "00" seconds
//   - hp-vvs-meta-ads-analyst → new versions MUST end in "30" seconds
//
// The seconds-offset rule applies to versions ≥ MIN_ENFORCED_VERSION only.
// Anything older predates this convention and is grandfathered.

import { execFileSync } from "node:child_process";
import { readdirSync } from "node:fs";
import path from "node:path";

const REPO_SECONDS_OFFSET = "30"; // hp-vvs-meta-ads-analyst
const MIN_ENFORCED_VERSION = "20260527000000";

const root = process.cwd();
const migrationsDir = path.join(root, "supabase", "migrations");
const filenamePattern = /^(\d{4}|\d{14})_[a-z0-9_]+\.sql$/;

const errors = [];
const files = readdirSync(migrationsDir)
  .filter((entry) => entry.endsWith(".sql"))
  .sort();
const versions = new Map();

for (const file of files) {
  const match = filenamePattern.exec(file);
  if (!match) {
    errors.push(`${file}: expected VERSION_snake_case_name.sql`);
    continue;
  }

  const version = match[1];
  const versionFiles = versions.get(version) ?? [];
  versionFiles.push(file);
  versions.set(version, versionFiles);

  // Offset rule: only enforced on 14-digit versions at or after the cutoff.
  // Remote-history placeholders must keep the exact remote version, including
  // seconds written by other tools/repos, or `supabase db push` cannot compare
  // ledgers without a repair.
  if (version.length === 14 && version >= MIN_ENFORCED_VERSION) {
    const seconds = version.slice(12, 14);
    const isRemoteHistoryPlaceholder = file.endsWith("_remote_schema_history_placeholder.sql");
    if (seconds !== REPO_SECONDS_OFFSET && !isRemoteHistoryPlaceholder) {
      errors.push(
        `${file}: seconds field is "${seconds}" but this repo requires "${REPO_SECONDS_OFFSET}" ` +
          `(offset convention, enforced for versions ≥ ${MIN_ENFORCED_VERSION}). ` +
          `Rename or regenerate via \`npm run db:migration -- <name>\`.`,
      );
    }
  }
}

for (const [version, versionFiles] of versions) {
  if (versionFiles.length > 1) {
    errors.push(`Duplicate migration version ${version}:\n  ${versionFiles.join("\n  ")}`);
  }
}

if (process.env.CHECK_REMOTE_MIGRATIONS === "1") {
  const output = execFileSync("npx", ["supabase", "migration", "list", "--linked"], {
    cwd: root,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });

  const driftRows = [];
  let parsedRows = 0;

  for (const line of output.split("\n")) {
    const match = /^\s*(\d*)\s*\|\s*(\d*)\s*\|/.exec(line);
    if (!match) continue;

    const [, local, remote] = match;
    if (!local && !remote) continue;

    parsedRows += 1;

    if (!local || !remote || local !== remote) {
      driftRows.push(line.trim());
    }
  }

  if (parsedRows === 0) {
    errors.push("Could not parse `supabase migration list --linked` output.");
  }

  if (driftRows.length > 0) {
    errors.push(`Remote migration ledger drift:\n  ${driftRows.join("\n  ")}`);
  }
} else {
  console.log("Remote migration drift check skipped. Set CHECK_REMOTE_MIGRATIONS=1 to enable it.");
}

if (errors.length > 0) {
  console.error(errors.join("\n\n"));
  process.exit(1);
}

console.log(`Supabase migration check passed: ${files.length} files, ${versions.size} versions.`);
