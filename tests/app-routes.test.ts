import assert from "node:assert/strict";
import test from "node:test";

import {
  canAccessAppPath,
  firstPermittedAppPath,
  getPostLoginDestination,
  hasInternalAppAccess,
  normalizeAppNextPath,
} from "../src/lib/app-routes.ts";

test("dashboard users land on the legacy broadsheet after login (legacy auth flow)", () => {
  // The legacy auth flow (firstPermittedAppPath) still points dashboard-
  // permitted users at the broadsheet. Phase 12 moved that surface from `/`
  // to `/broadsheet`; `/` itself now redirects per role via
  // resolveLandingPath, but getPostLoginDestination is part of the legacy
  // route table and stays in lockstep with APP_NAV_ROUTES.
  const destination = getPostLoginDestination({
    authenticated: true,
    active: true,
    missingAppProfile: false,
    permissions: ["view_dashboard", "view_inbox"],
  });

  assert.equal(destination, "/broadsheet");
});

test("inbox-only users land on their first permitted page", () => {
  const permissions = ["view_inbox"] as const;

  assert.equal(firstPermittedAppPath([...permissions]), "/inbox");
  assert.equal(
    getPostLoginDestination({
      authenticated: true,
      active: true,
      missingAppProfile: false,
      permissions: [...permissions],
    }),
    "/inbox",
  );
});

test("post-login next path is honored only when permitted", () => {
  const profile = {
    authenticated: true,
    active: true,
    missingAppProfile: false,
    permissions: ["view_inbox"],
  } as const;

  assert.equal(getPostLoginDestination(profile, "/inbox?source=next"), "/inbox?source=next");
  assert.equal(getPostLoginDestination(profile, "/analysis"), "/inbox");
});

test("unsafe or non-app next paths are ignored", () => {
  assert.equal(normalizeAppNextPath("/attribution-ledger"), "/attribution-ledger");
  assert.equal(normalizeAppNextPath("https://example.com/inbox"), null);
  assert.equal(normalizeAppNextPath("//example.com/inbox"), null);
  assert.equal(normalizeAppNextPath("/api/users"), null);
  assert.equal(normalizeAppNextPath("/login"), null);
});

test("inactive or missing-profile users do not have internal app access", () => {
  assert.equal(
    hasInternalAppAccess({
      authenticated: true,
      active: false,
      missingAppProfile: false,
      permissions: ["view_dashboard"],
    }),
    false,
  );
  assert.equal(
    hasInternalAppAccess({
      authenticated: true,
      active: true,
      missingAppProfile: true,
      permissions: ["view_dashboard"],
    }),
    false,
  );
});

test("page permission checks follow the route permission map", () => {
  assert.equal(canAccessAppPath(["view_inbox"], "/inbox/thread/1"), true);
  assert.equal(canAccessAppPath(["view_inbox"], "/"), false);
  assert.equal(canAccessAppPath(["view_dashboard"], "/website-funnel"), true);
  assert.equal(canAccessAppPath(["view_dashboard"], "/attribution-ledger"), true);
  assert.equal(canAccessAppPath(["view_inbox"], "/attribution-ledger"), false);
});
