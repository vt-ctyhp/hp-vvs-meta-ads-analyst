import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { planInboxRefetch } from "../src/components/v2/inbox/inbox-live-plan.ts";

describe("planInboxRefetch", () => {
  it("always refreshes the queue", () => {
    assert.equal(planInboxRefetch({ conversationId: "c1", kind: "event" }, null).queue, true);
    assert.equal(planInboxRefetch({}, "c1").queue, true);
  });

  it("refreshes the open thread only when the ping names it", () => {
    assert.equal(planInboxRefetch({ conversationId: "c1", kind: "event" }, "c1").thread, true);
    assert.equal(planInboxRefetch({ conversationId: "c2", kind: "event" }, "c1").thread, false);
  });

  it("refreshes the open thread when the ping carries no conversation id", () => {
    assert.equal(planInboxRefetch({ kind: "conversation" }, "c1").thread, true);
  });

  it("never refreshes a thread when none is open", () => {
    assert.equal(planInboxRefetch({ conversationId: "c1" }, null).thread, false);
  });
});
