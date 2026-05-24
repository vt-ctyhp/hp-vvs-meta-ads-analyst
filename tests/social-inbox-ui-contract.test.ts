import { readFileSync } from "node:fs";
import assert from "node:assert/strict";
import { describe, it } from "node:test";

const DESKTOP_INBOX = readFileSync("src/components/social-inbox-client.tsx", "utf8");
const DESKTOP_INBOX_PAGE = readFileSync("src/app/(workspace)/convert/inbox/page.tsx", "utf8");
const MOBILE_INBOX_PAGE = readFileSync("src/app/m/inbox/page.tsx", "utf8");
const MOBILE_INBOX_DETAIL_PAGE = readFileSync("src/app/m/inbox/[conversationId]/page.tsx", "utf8");
const MOBILE_CONVERSATION_DETAIL = readFileSync(
  "src/components/v2/inbox/conversation-detail.tsx",
  "utf8",
);
const MOBILE_COMPOSER = readFileSync("src/components/v2/inbox/reply-composer.tsx", "utf8");
const LEGACY_SEND_ROUTE = readFileSync("src/app/api/social-inbox/send-reply/route.ts", "utf8");
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

  it("loads mobile inbox list and detail through normalized conversations", () => {
    assert.match(MOBILE_INBOX_PAGE, /buildMetaInboxMobileConversationItems/);
    assert.match(MOBILE_INBOX_DETAIL_PAGE, /getSocialInboxConversationHistory/);
    assert.doesNotMatch(MOBILE_INBOX_DETAIL_PAGE, /inbox\.messages\s*\.filter/);
    assert.doesNotMatch(MOBILE_INBOX_DETAIL_PAGE, /inbox\.threads\.find/);
    assert.doesNotMatch(MOBILE_INBOX_DETAIL_PAGE, /inbox\.comments\.find/);
  });

  it("uses normalized conversation send attempts for mobile replies", () => {
    assert.match(MOBILE_CONVERSATION_DETAIL, /conversationId/);
    assert.match(
      MOBILE_COMPOSER,
      /\/api\/social-inbox\/conversations\/\$\{encodeURIComponent\(conversationId\)\}\/send-attempts/,
    );
    assert.doesNotMatch(MOBILE_COMPOSER, /\/api\/social-inbox\/send-reply/);
  });

  it("rejects the legacy raw-source reply route before any Meta send call", () => {
    assert.match(LEGACY_SEND_ROUTE, /Legacy raw-source send endpoint is disabled/);
    assert.doesNotMatch(LEGACY_SEND_ROUTE, /sendSocialReply/);
  });

  it("surfaces audited sales workflow mutation controls without snooze", () => {
    assert.match(DESKTOP_INBOX, /Sales Workflow Controls/);
    assert.match(DESKTOP_INBOX, /Claim Self/);
    assert.match(DESKTOP_INBOX, /Save State/);
    assert.match(DESKTOP_INBOX, /\/api\/social-inbox\/conversations\/\$\{encodeURIComponent\(conversationId\)\}\/workflow/);
    assert.equal(/snooze/i.test(DESKTOP_INBOX), false);
  });

  it("initializes workflow drafts from selected conversation values before saving", () => {
    assert.match(DESKTOP_INBOX, /key=\{workflowPanelKey\(selectedItem\)\}/);
    assert.match(DESKTOP_INBOX, /useState\(conversation\?\.lead_quality \|\| ""\)/);
    assert.match(DESKTOP_INBOX, /conversation\?\.lead_quality_reason_tags \|\| \[\]/);
    assert.match(
      DESKTOP_INBOX,
      /conversation\?\.inbox_outcome \|\| "no_outcome_yet"/,
    );
    assert.match(DESKTOP_INBOX, /conversation\?\.inbox_lost_reason \|\| ""/);
  });

  it("does not use random client idempotency keys for inbox sends or comment actions", () => {
    assert.doesNotMatch(DESKTOP_INBOX, /crypto\.randomUUID/);
    assert.doesNotMatch(DESKTOP_INBOX, /Math\.random/);
    assert.match(DESKTOP_INBOX, /stableIdempotencyKey/);
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

  it("surfaces public comment actions with hide-delete reason controls", () => {
    assert.match(DESKTOP_INBOX, /PublicCommentActionPanel/);
    assert.match(DESKTOP_INBOX, /Public Comment Actions/);
    assert.match(DESKTOP_INBOX, /Public Reply/);
    assert.match(DESKTOP_INBOX, /Private DM/);
    assert.match(DESKTOP_INBOX, /Like/);
    assert.match(DESKTOP_INBOX, /Hide/);
    assert.match(DESKTOP_INBOX, /Delete/);
    assert.match(DESKTOP_INBOX, /Reason note required for hide\/delete/);
    assert.match(DESKTOP_INBOX, /window\.confirm/);
    assert.match(DESKTOP_INBOX, /Queue Action/);
    assert.match(DESKTOP_INBOX, /Retry Action/);
    assert.match(
      DESKTOP_INBOX,
      /\/api\/social-inbox\/conversations\/\$\{encodeURIComponent\(conversationId\)\}\/comment-actions/,
    );
    assert.match(
      DESKTOP_INBOX,
      /\/api\/social-inbox\/conversations\/\$\{encodeURIComponent\(conversationId\)\}\/comment-actions\/queue/,
    );
    assert.match(
      DESKTOP_INBOX,
      /\/api\/social-inbox\/conversations\/\$\{encodeURIComponent\(conversationId\)\}\/comment-actions\/retry/,
    );
    assert.match(SOCIAL_INBOX_LIB, /commentActions: SocialInboxCommentAction\[\]/);
    assert.match(SOCIAL_INBOX_LIB, /createSocialInboxCommentAction/);
    assert.match(SOCIAL_INBOX_LIB, /queueSocialInboxCommentAction/);
    assert.match(SOCIAL_INBOX_LIB, /retrySocialInboxCommentAction/);
  });

  it("surfaces advisory presence collision warnings", () => {
    assert.match(DESKTOP_INBOX, /PresenceCollisionBanner/);
    assert.match(DESKTOP_INBOX, /sendPresenceHeartbeat/);
    assert.match(DESKTOP_INBOX, /\/api\/social-inbox\/conversations\/\$\{encodeURIComponent\(conversationId\)\}\/presence/);
    assert.match(DESKTOP_INBOX, /is replying now/);
    assert.match(DESKTOP_INBOX, /Advisory collision warning only/);
    assert.match(SOCIAL_INBOX_LIB, /recordSocialInboxPresence/);
  });

  it("surfaces the first manager dashboard snapshot", () => {
    assert.match(DESKTOP_INBOX, /ManagerSnapshotPanel/);
    assert.match(DESKTOP_INBOX, /buildMetaInboxManagerDashboard/);
    assert.match(DESKTOP_INBOX, /Manager Snapshot/);
    assert.match(DESKTOP_INBOX, /Needs Reply/);
    assert.match(DESKTOP_INBOX, /Missed Follow-Up/);
    assert.match(DESKTOP_INBOX, /Avg first response/);
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
