import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  APP_PERMISSIONS,
  hasPermission,
  permissionsForRoles,
} from "../src/lib/access-control.ts";

describe("access control", () => {
  it("gives admin all non-operational management access", () => {
    for (const permission of Object.keys(APP_PERMISSIONS) as Array<keyof typeof APP_PERMISSIONS>) {
      assert.equal(hasPermission(["admin"], permission), true, permission);
    }
  });

  it("gives marketing read-only inbox/reporting access", () => {
    const permissions = permissionsForRoles(["marketing"]);

    assert.equal(permissions.includes("view_dashboard"), true);
    assert.equal(permissions.includes("view_creative_analysis"), true);
    assert.equal(permissions.includes("view_ai_analysis"), true);
    assert.equal(permissions.includes("view_inbox"), true);
    assert.equal(permissions.includes("view_backfill"), true);
    assert.equal(permissions.includes("manage_backfill"), false);
    assert.equal(permissions.includes("manage_users"), false);
    assert.equal(permissions.includes("send_inbox_reply"), false);
    assert.equal(permissions.includes("manage_inbox_state"), false);
  });

  it("maps sales to inbox-only access with reply + state actions", () => {
    // Sales gets read + reply + state actions on the inbox so they can clear
    // the queue end-to-end (per UI rebuild PRD section 7). They never see
    // dashboard, creative, AI analysis, or backfill surfaces.
    const permissions = permissionsForRoles(["sales"]);

    assert.deepEqual(
      permissions.slice().sort(),
      ["manage_inbox_state", "send_inbox_reply", "view_inbox"].sort(),
    );
    assert.equal(hasPermission(["sales"], "view_creative_analysis"), false);
    assert.equal(hasPermission(["sales"], "view_dashboard"), false);
    assert.equal(hasPermission(["sales"], "view_ai_analysis"), false);
    assert.equal(hasPermission(["sales"], "view_backfill"), false);
    assert.equal(hasPermission(["sales"], "send_inbox_reply"), true);
    assert.equal(hasPermission(["sales"], "manage_inbox_state"), true);
  });

  it("gives sales lead inbox write access for managed queues", () => {
    assert.equal(hasPermission(["sales_lead"], "view_inbox"), true);
    assert.equal(hasPermission(["sales_lead"], "send_inbox_reply"), true);
    assert.equal(hasPermission(["sales_lead"], "manage_inbox_state"), true);
  });

  it("does not grant inbox operator access to legacy Sales app owner roles", () => {
    for (const role of ["client_advisor", "joc"] as const) {
      assert.equal(hasPermission([role], "view_inbox"), false, role);
      assert.equal(hasPermission([role], "send_inbox_reply"), false, role);
      assert.equal(hasPermission([role], "manage_inbox_state"), false, role);
    }
  });

  it("keeps the inbox state permission free of Snooze workflow copy", () => {
    const copy = APP_PERMISSIONS.manage_inbox_state.description.toLowerCase();

    assert.equal(copy.includes("snooze"), false);
    assert.equal(copy.includes("snoozed"), false);
  });
});
