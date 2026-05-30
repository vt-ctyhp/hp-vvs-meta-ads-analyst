import assert from "node:assert/strict";
import test from "node:test";

import {
  firstWorkspaceHref,
  resolveLandingPath,
  roomsForRoles,
} from "../src/lib/permission-routing.ts";

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

test("resolveLandingPath sends sales to the desktop inbox", () => {
  assert.equal(resolveLandingPath(["sales"]), "/convert/inbox");
});

test("resolveLandingPath does not treat Client Advisor or JOC as inbox sales operators", () => {
  assert.equal(resolveLandingPath(["client_advisor"]), "/no-access");
  assert.equal(resolveLandingPath(["joc"]), "/no-access");
});

test("sales get the Convert room (desktop inbox) but not Analyst/Operate", () => {
  assert.deepEqual(roomsForRoles(["sales"]), ["convert"]);
});

test("firstWorkspaceHref sends inbox-only Convert access to the inbox, not the dashboard", () => {
  assert.equal(firstWorkspaceHref(["convert"], ["view_inbox"]), "/convert/inbox");
});

test("firstWorkspaceHref keeps dashboard users on the Convert home", () => {
  assert.equal(firstWorkspaceHref(["convert"], ["view_dashboard"]), "/convert");
});
