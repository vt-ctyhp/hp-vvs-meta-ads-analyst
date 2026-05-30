import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, it } from "node:test";

describe("vercel cron config", () => {
  it("schedules the social inbox backstop every 2 minutes", () => {
    const config = JSON.parse(readFileSync(resolve("vercel.json"), "utf8")) as {
      crons: Array<{ path: string; schedule: string }>;
    };
    const cron = config.crons.find((c) => c.path === "/api/cron/social-inbox-sync");
    assert.ok(cron, "expected a cron entry for /api/cron/social-inbox-sync");
    assert.equal(cron?.schedule, "*/2 * * * *");
  });
});
