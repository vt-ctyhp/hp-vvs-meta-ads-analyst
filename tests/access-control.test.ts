import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  APP_PERMISSIONS,
  hasPermission,
  permissionsForRoles,
} from "../src/lib/access-control.ts";

describe("access control", () => {
  it("gives admin full management access", () => {
    for (const permission of Object.keys(APP_PERMISSIONS) as Array<keyof typeof APP_PERMISSIONS>) {
      assert.equal(hasPermission(["admin"], permission), true);
    }
  });

  it("gives marketing dashboard, analysis, inbox, and read-only backfill access", () => {
    const permissions = permissionsForRoles(["marketing"]);

    assert.equal(permissions.includes("view_dashboard"), true);
    assert.equal(permissions.includes("view_creative_analysis"), true);
    assert.equal(permissions.includes("view_ai_analysis"), true);
    assert.equal(permissions.includes("view_inbox"), true);
    assert.equal(permissions.includes("view_backfill"), true);
    assert.equal(permissions.includes("manage_backfill"), false);
    assert.equal(permissions.includes("manage_users"), false);
  });

  it("maps sales to inbox-only access", () => {
    const permissions = permissionsForRoles(["sales"]);

    assert.deepEqual(permissions, ["view_inbox"]);
    assert.equal(hasPermission(["sales"], "view_creative_analysis"), false);
    assert.equal(hasPermission(["sales"], "view_dashboard"), false);
    assert.equal(hasPermission(["sales"], "view_ai_analysis"), false);
    assert.equal(hasPermission(["sales"], "view_backfill"), false);
  });
});
