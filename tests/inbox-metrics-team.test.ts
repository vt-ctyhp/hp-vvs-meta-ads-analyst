import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  periodToDays,
  mapAssigneeRowToTeamRow,
  type AssigneeRowLike,
} from "../src/lib/inbox-metrics.ts";

describe("periodToDays", () => {
  it("maps periods to day spans", () => {
    assert.equal(periodToDays("today"), 1);
    assert.equal(periodToDays("yesterday"), 2); // window includes yesterday
    assert.equal(periodToDays("7d"), 7);
    assert.equal(periodToDays("30d"), 30);
  });
});

describe("mapAssigneeRowToTeamRow", () => {
  it("maps the dashboard row plus adjunct business-hours fields", () => {
    const row: AssigneeRowLike = {
      assigneeUserId: "11111111-1111-4111-8111-111111111111",
      label: "1111...",
      totalConversations: 12,
      needsReply: 4,
      missedFollowUps: 1,
      failedSends: 0,
      averageFirstResponseMinutes: 30,
    };
    const teamRow = mapAssigneeRowToTeamRow(row, {
      name: "Ana",
      role: "member",
      atRisk: 2,
      avgResponseSec: 1800,
      onTimeRate: 0.75,
      teamClaims: 3,
      oldestUnansweredSec: 5400,
      lastActiveAt: new Date("2026-05-27T18:00:00Z"),
      repliesSent: 9,
    });
    assert.equal(teamRow?.userId, "11111111-1111-4111-8111-111111111111");
    assert.equal(teamRow?.name, "Ana");
    assert.equal(teamRow?.assigned, 12);
    assert.equal(teamRow?.needsReply, 4);
    assert.equal(teamRow?.atRisk, 2);
    assert.equal(teamRow?.avgResponseSec, 1800);
    assert.equal(teamRow?.onTimeRate, 0.75);
    assert.equal(teamRow?.repliesSent, 9);
    assert.equal(teamRow?.teamClaims, 3);
    assert.equal(teamRow?.oldestUnansweredSec, 5400);
    assert.equal(teamRow?.lastActiveAt?.toISOString(), "2026-05-27T18:00:00.000Z");
  });

  it("skips the unassigned bucket (assigneeUserId null)", () => {
    assert.equal(
      mapAssigneeRowToTeamRow({ assigneeUserId: null } as AssigneeRowLike, {
        name: "", role: "", atRisk: 0, avgResponseSec: null, onTimeRate: null,
        teamClaims: 0, oldestUnansweredSec: null, lastActiveAt: null, repliesSent: 0,
      }),
      null,
    );
  });
});
