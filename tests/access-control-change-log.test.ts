import { test } from "node:test";
import assert from "node:assert/strict";

import { permissionsForRoles } from "../src/lib/access-control.ts";

test("marketing can view and manage the change log", () => {
  const perms = permissionsForRoles(["marketing"]);
  assert.ok(perms.includes("view_change_log"));
  assert.ok(perms.includes("manage_change_log"));
});

test("executive can view but not manage the change log", () => {
  const perms = permissionsForRoles(["executive"]);
  assert.ok(perms.includes("view_change_log"));
  assert.ok(!perms.includes("manage_change_log"));
});
