import { readFileSync } from "node:fs";
import assert from "node:assert/strict";
import { describe, it } from "node:test";

const DESKTOP_INBOX = readFileSync("src/components/social-inbox-client.tsx", "utf8");
const MOBILE_COMPOSER = readFileSync("src/components/v2/inbox/reply-composer.tsx", "utf8");

describe("social inbox UI contract", () => {
  it("surfaces normalized queue, source, and workflow panels in the desktop inbox", () => {
    assert.match(DESKTOP_INBOX, /QueueTabs/);
    assert.match(DESKTOP_INBOX, /ConversationSourcePanel/);
    assert.match(DESKTOP_INBOX, /WorkflowStatePanel/);
    assert.match(DESKTOP_INBOX, /META_INBOX_QUEUE_CATEGORIES/);
    assert.match(DESKTOP_INBOX, /META_INBOX_SOURCE_CHANNELS/);
  });

  it("keeps active AI reply controls out of the foundation inbox surfaces", () => {
    const combined = `${DESKTOP_INBOX}\n${MOBILE_COMPOSER}`;

    assert.equal(combined.includes("/api/social-inbox/suggest-reply"), false);
    assert.equal(combined.includes("Ask AI"), false);
    assert.equal(combined.includes("Suggest Reply"), false);
    assert.equal(combined.includes("AI Suggestion"), false);
  });
});
