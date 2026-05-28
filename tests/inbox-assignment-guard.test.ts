import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, it } from "node:test";

const SRC = resolve("src");
// Only these files may write assigned_user_id directly.
const SANCTIONED = new Set([
  resolve("src/lib/meta-inbox-workflow.ts"),
  resolve("src/lib/inbox-assignment.ts"),
]);
// Matches a mutation write like `update.assigned_user_id =` or
// `assigned_user_id:` inside a data payload object.
// The leading non-word-char lookbehind on the `:` form ensures we match the
// conversation's own `assigned_user_id` column but NOT differently-named columns
// that merely end in that text (e.g. the rotation table's `last_assigned_user_id`,
// which is a legitimate pointer write, not a conversation-assignment mutation).
// Excludes: equality comparisons (=== / !==), TypeScript type annotations
// (`: string`, `: number`, `: boolean`, `: null`), and read-only field mapper
// calls (e.g. `stringField(...)`).
const WRITE_RE = /\.assigned_user_id\s*=|(?<![A-Za-z0-9_])assigned_user_id\s*:/;
const TYPE_ANNOTATION_RE = /assigned_user_id\s*:\s*(string|number|boolean|null)[\s|;]/;
const READ_MAPPER_RE = /assigned_user_id\s*:\s*\w+Field\s*\(/;

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) return walk(full);
    return /\.(ts|tsx)$/.test(full) ? [full] : [];
  });
}

describe("assignment mutation guard", () => {
  it("only the workflow and facade write assigned_user_id directly", () => {
    const offenders: string[] = [];
    for (const file of walk(SRC)) {
      if (SANCTIONED.has(file)) continue;
      const text = readFileSync(file, "utf8");
      for (const line of text.split("\n")) {
        // Allow reads/comparisons, type annotations, and read-only field mappers.
        if (
          WRITE_RE.test(line) &&
          !line.includes("===") &&
          !line.includes("!==") &&
          !TYPE_ANNOTATION_RE.test(line) &&
          !READ_MAPPER_RE.test(line)
        ) {
          offenders.push(`${file}: ${line.trim()}`);
        }
      }
    }
    assert.deepEqual(
      offenders,
      [],
      `Direct assigned_user_id writes found:\n${offenders.join("\n")}`,
    );
  });
});
