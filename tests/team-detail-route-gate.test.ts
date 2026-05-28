import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { canLeadViewUser } from "../src/lib/inbox-team-peek.ts";

describe("team detail gate", () => {
  it("allows a lead viewing a teammate; denies otherwise", () => {
    assert.equal(canLeadViewUser({ teamLead: true, teamUserIds: ["u2"] }, "u2"), true);
    assert.equal(canLeadViewUser({ teamLead: true, teamUserIds: ["u2"] }, "u9"), false);
    assert.equal(canLeadViewUser({ teamLead: false, teamUserIds: ["u2"] }, "u2"), false);
  });
});
