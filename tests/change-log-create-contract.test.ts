import { test } from "node:test";
import assert from "node:assert/strict";

import { createChangeLogEntry } from "../src/lib/change-log.ts";
import type { ChangeLogDraft } from "../src/lib/change-log-types.ts";

// The create path moved to an atomic Postgres RPC, but its public contract must
// not change: (draft, actor) => Promise<string>. This is a compile-time guard —
// if the signature drifts, `tsc --noEmit` (npm run typecheck) fails here.
type Actor = { appUserId: string | null; email: string | null };
type CreateContract = (draft: ChangeLogDraft, actor: Actor) => Promise<string>;

test("createChangeLogEntry keeps its (draft, actor) => Promise<string> contract", () => {
  const _contract: CreateContract = createChangeLogEntry;
  assert.equal(typeof _contract, "function");
  // draft + actor = two declared parameters.
  assert.equal(createChangeLogEntry.length, 2);
});
