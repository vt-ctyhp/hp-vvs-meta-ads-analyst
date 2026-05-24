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

  it("loads selected desktop conversation history through the conversation-specific endpoint", () => {
    assert.match(DESKTOP_INBOX, /loadConversationHistory/);
    assert.match(DESKTOP_INBOX, /\/api\/social-inbox\/conversations\/\$\{encodeURIComponent\(conversationId\)\}\/messages/);
    assert.match(DESKTOP_INBOX, /HistoryStatusStrip/);
    assert.match(DESKTOP_INBOX, /Load Older History/);
  });

  it("surfaces audited sales workflow mutation controls without snooze", () => {
    assert.match(DESKTOP_INBOX, /Sales Workflow Controls/);
    assert.match(DESKTOP_INBOX, /Claim Self/);
    assert.match(DESKTOP_INBOX, /Save State/);
    assert.match(DESKTOP_INBOX, /\/api\/social-inbox\/conversations\/\$\{encodeURIComponent\(conversationId\)\}\/workflow/);
    assert.equal(/snooze/i.test(DESKTOP_INBOX), false);
  });

  it("surfaces audited customer contact method controls in the source panel", () => {
    assert.match(DESKTOP_INBOX, /Contact Methods/);
    assert.match(DESKTOP_INBOX, /Add Contact/);
    assert.match(DESKTOP_INBOX, /Delete Contact/);
    assert.match(DESKTOP_INBOX, /\/api\/social-inbox\/conversations\/\$\{encodeURIComponent\(conversationId\)\}\/contact-methods/);
    assert.match(DESKTOP_INBOX, /future verified matching/);
  });
});
