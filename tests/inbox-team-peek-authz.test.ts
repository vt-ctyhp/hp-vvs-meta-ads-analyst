import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { canLeadViewUser } from "../src/lib/inbox-team-peek.ts";

const MATE = "22222222-2222-4222-8222-222222222222";
const STRANGER = "33333333-3333-4333-8333-333333333333";

describe("canLeadViewUser", () => {
  it("allows a lead to view a teammate", () => {
    assert.equal(canLeadViewUser({ teamLead: true, teamUserIds: [MATE] }, MATE), true);
  });
  it("denies a non-lead", () => {
    assert.equal(canLeadViewUser({ teamLead: false, teamUserIds: [MATE] }, MATE), false);
  });
  it("denies viewing a non-teammate", () => {
    assert.equal(canLeadViewUser({ teamLead: true, teamUserIds: [MATE] }, STRANGER), false);
  });
});
