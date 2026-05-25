import assert from "node:assert/strict";
import test from "node:test";

import { firstWorkspaceHref, resolveLandingPath } from "../src/lib/permission-routing.ts";

test("firstWorkspaceHref sends users-only Operate access to users", () => {
  assert.equal(firstWorkspaceHref(["operate"], ["view_users"]), "/operate/users");
});

test("firstWorkspaceHref keeps backfill Operate access on pipelines", () => {
  assert.equal(
    firstWorkspaceHref(["operate"], ["view_backfill", "view_users"]),
    "/operate/pipelines",
  );
});

test("firstWorkspaceHref preserves Analyst priority", () => {
  assert.equal(
    firstWorkspaceHref(["analyst", "operate"], ["view_ai_analysis", "view_users"]),
    "/analysis",
  );
});

test("resolveLandingPath sends sales to the mobile inbox", () => {
  assert.equal(resolveLandingPath(["sales"]), "/m/inbox");
});

test("resolveLandingPath does not treat Client Advisor or JOC as inbox sales operators", () => {
  assert.equal(resolveLandingPath(["client_advisor"]), "/no-access");
  assert.equal(resolveLandingPath(["joc"]), "/no-access");
});
