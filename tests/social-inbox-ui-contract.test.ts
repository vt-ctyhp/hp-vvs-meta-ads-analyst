import { readFileSync } from "node:fs";
import assert from "node:assert/strict";
import { describe, it } from "node:test";

const DESKTOP_INBOX = readFileSync("src/components/social-inbox-client.tsx", "utf8");
const DESKTOP_INBOX_PAGE = readFileSync("src/app/(workspace)/convert/inbox/page.tsx", "utf8");
const MOBILE_COMPOSER = readFileSync("src/components/v2/inbox/reply-composer.tsx", "utf8");
const SOCIAL_INBOX_LIB = readFileSync("src/lib/social-inbox.ts", "utf8");

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

  it("surfaces reply-window countdown and failed-send retry shell", () => {
    assert.match(DESKTOP_INBOX, /Reply Window/);
    assert.match(DESKTOP_INBOX, /Failed Send Inbox/);
    assert.match(DESKTOP_INBOX, /Record Send Attempt/);
    assert.match(DESKTOP_INBOX, /\/api\/social-inbox\/conversations\/\$\{encodeURIComponent\(conversationId\)\}\/send-attempts/);
    assert.match(DESKTOP_INBOX, /\/api\/social-inbox\/conversations\/\$\{encodeURIComponent\(conversationId\)\}\/send-attempts\/retry/);
    assert.match(DESKTOP_INBOX, /live Meta delivery remains disabled/);
  });

  it("surfaces normalized message attachments in conversation history", () => {
    assert.match(DESKTOP_INBOX, /MessageAttachmentList/);
    assert.match(DESKTOP_INBOX, /message\.attachments\.length/);
    assert.match(DESKTOP_INBOX, /attachment\.mediaUrl/);
    assert.match(SOCIAL_INBOX_LIB, /normalizeMetaInboxAttachments/);
    assert.match(SOCIAL_INBOX_LIB, /attachmentIds\?: string\[\] \| null/);
  });

  it("keeps inbox error copy human-readable instead of rendering object strings", () => {
    assert.match(DESKTOP_INBOX_PAGE, /safeErrorMessage\(error\)/);
    assert.match(SOCIAL_INBOX_LIB, /return safeErrorMessage\(error\)/);
    assert.doesNotMatch(DESKTOP_INBOX_PAGE, /String\(error\)/);
  });
});
