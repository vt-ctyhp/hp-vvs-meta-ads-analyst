import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { deriveTeamMembership } from "../src/lib/app-auth.ts";

const ME = "11111111-1111-4111-8111-111111111111";
const T1 = "team-1";
const T2 = "team-2";
const MATE = "22222222-2222-4222-8222-222222222222";

describe("deriveTeamMembership", () => {
  it("marks teamLead and collects team ids + teammate user ids", () => {
    const rows = [
      { team_id: T1, app_user_id: ME, role: "lead" },
      { team_id: T1, app_user_id: MATE, role: "member" },
      { team_id: T2, app_user_id: ME, role: "member" }, // member elsewhere
    ];
    const r = deriveTeamMembership(rows, ME);
    assert.equal(r.teamLead, true); // lead in at least one team
    assert.deepEqual([...r.teamIds].sort(), [T1, T2].sort());
    // teammate user ids = members of teams where ME is lead (T1), excluding ME
    assert.deepEqual(r.teamUserIds, [MATE]);
  });
  it("non-lead has teamLead false and no teammate ids", () => {
    const rows = [{ team_id: T1, app_user_id: ME, role: "member" }];
    const r = deriveTeamMembership(rows, ME);
    assert.equal(r.teamLead, false);
    assert.deepEqual(r.teamIds, [T1]);
    assert.deepEqual(r.teamUserIds, []);
  });
  it("handles a null appUserId", () => {
    const r = deriveTeamMembership([], null);
    assert.equal(r.teamLead, false);
    assert.deepEqual(r.teamIds, []);
    assert.deepEqual(r.teamUserIds, []);
  });
});
