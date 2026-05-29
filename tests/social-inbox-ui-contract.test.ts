import { readFileSync } from "node:fs";
import assert from "node:assert/strict";
import { describe, it } from "node:test";

const DESKTOP_INBOX = readFileSync("src/components/social-inbox-client.tsx", "utf8");
const DETAILS_DRAWER = readFileSync("src/components/v2/inbox/details-drawer-panel.tsx", "utf8");
const INBOX_EYEBROW = readFileSync("src/components/v2/inbox/inbox-eyebrow.tsx", "utf8");
const INBOX_CLIENT_STATE = readFileSync(
  "src/components/v2/inbox/inbox-client-state.ts",
  "utf8",
);
const INBOX_MUTATIONS = readFileSync(
  "src/components/v2/inbox/use-social-inbox-mutations.ts",
  "utf8",
);
const HISTORY_STATUS_STRIP = readFileSync(
  "src/components/v2/inbox/history-status-strip.tsx",
  "utf8",
);
const MESSAGE_ATTACHMENT_LIST = readFileSync(
  "src/components/v2/inbox/message-attachment-list.tsx",
  "utf8",
);
const PRESENCE_COLLISION_BANNER = readFileSync(
  "src/components/v2/inbox/presence-collision-banner.tsx",
  "utf8",
);
const PUBLIC_COMMENT_ACTION_PANEL = readFileSync(
  "src/components/v2/inbox/public-comment-action-panel.tsx",
  "utf8",
);
const SELECTED_ITEM_DETAIL = readFileSync(
  "src/components/v2/inbox/selected-item-detail.tsx",
  "utf8",
);
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
const DESKTOP_INBOX_SURFACE = [
  DESKTOP_INBOX,
  DETAILS_DRAWER,
  INBOX_CLIENT_STATE,
  INBOX_MUTATIONS,
  HISTORY_STATUS_STRIP,
  MESSAGE_ATTACHMENT_LIST,
  PRESENCE_COLLISION_BANNER,
  PUBLIC_COMMENT_ACTION_PANEL,
  SELECTED_ITEM_DETAIL,
].join("\n");

describe("social inbox UI contract", () => {
  it("surfaces normalized queue, source, and workflow panels in the desktop inbox", () => {
    assert.match(DESKTOP_INBOX, /QueueRail/);
    assert.match(DESKTOP_INBOX, /DetailsDrawerPanel/);
    assert.match(DESKTOP_INBOX, /DrawerOverlay/);
    assert.match(DETAILS_DRAWER, /META_INBOX_QUEUE_CATEGORIES/);
    assert.match(DETAILS_DRAWER, /META_INBOX_SOURCE_CHANNELS/);
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
    assert.match(SELECTED_ITEM_DETAIL, /HistoryStatusStrip/);
    assert.match(HISTORY_STATUS_STRIP, /Load Older History/);
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
    assert.match(DETAILS_DRAWER, /Workflow/);
    assert.match(DETAILS_DRAWER, /Claim for Me/);
    assert.match(DETAILS_DRAWER, /Save Changes/);
    assert.match(INBOX_MUTATIONS, /\/api\/social-inbox\/conversations\/\$\{encodeURIComponent\(conversationId\)\}\/workflow/);
    assert.equal(/snooze/i.test(DESKTOP_INBOX_SURFACE), false);
  });

  it("wires the Close chip to the Details drawer close preset", () => {
    assert.match(DESKTOP_INBOX, /onCloseConversation=\{\(\) => drawerState\.open\("details", "close"\)\}/);
    assert.match(DESKTOP_INBOX, /preset=\{drawerState\.preset\}/);
    assert.match(DETAILS_DRAWER, /preset === "close" \? "closed"/);
    assert.match(DETAILS_DRAWER, /warning=\{preset === "close"\}/);
  });

  it("initializes workflow drafts from selected conversation values before saving", () => {
    assert.match(DESKTOP_INBOX, /key=\{conversationPanelKey\(selectedItem, "details-drawer"\)\}/);
    assert.match(DETAILS_DRAWER, /useState\(conversation\?\.lead_quality \|\| ""\)/);
    assert.match(DETAILS_DRAWER, /conversation\?\.lead_quality_reason_tags \|\| \[\]/);
    assert.match(
      DETAILS_DRAWER,
      /conversation\?\.inbox_outcome \|\| "no_outcome_yet"/,
    );
    assert.match(DETAILS_DRAWER, /conversation\?\.inbox_lost_reason \|\| ""/);
  });

  it("does not use random client idempotency keys for inbox sends or comment actions", () => {
    assert.doesNotMatch(DESKTOP_INBOX_SURFACE, /crypto\.randomUUID/);
    assert.doesNotMatch(DESKTOP_INBOX_SURFACE, /Math\.random/);
    assert.match(INBOX_CLIENT_STATE, /stableIdempotencyKey/);
  });

  it("surfaces audited customer contact method controls in the source panel", () => {
    assert.match(DETAILS_DRAWER, /Contact Methods/);
    assert.match(DETAILS_DRAWER, /Add Contact/);
    assert.match(DETAILS_DRAWER, /Delete Contact/);
    assert.match(INBOX_MUTATIONS, /\/api\/social-inbox\/conversations\/\$\{encodeURIComponent\(conversationId\)\}\/contact-methods/);
    assert.match(DETAILS_DRAWER, /phone or email/);
  });

  it("surfaces reply-window countdown and failed-send retry shell", () => {
    assert.match(MOBILE_COMPOSER, /Reply as/);
    assert.match(MOBILE_COMPOSER, /Reply window closed/);
    assert.match(MOBILE_COMPOSER, /send attempt/);
    assert.match(MOBILE_COMPOSER, /This will record \{pendingSendAttemptCount\}/);
    assert.match(MOBILE_COMPOSER, /Retry/);
    assert.match(MOBILE_COMPOSER, /Queue Delivery/);
    assert.match(INBOX_MUTATIONS, /\/api\/social-inbox\/conversations\/\$\{encodeURIComponent\(conversationId\)\}\/send-attempts/);
    assert.match(INBOX_MUTATIONS, /\/api\/social-inbox\/conversations\/\$\{encodeURIComponent\(conversationId\)\}\/send-attempts\/retry/);
    assert.match(INBOX_MUTATIONS, /live Meta delivery remains disabled/);
  });

  it("surfaces public comment actions with hide-delete reason controls", () => {
    assert.match(DESKTOP_INBOX, /PublicCommentActionPanel/);
    assert.match(PUBLIC_COMMENT_ACTION_PANEL, /Public Comment Actions/);
    assert.match(PUBLIC_COMMENT_ACTION_PANEL, /Public Reply/);
    assert.match(PUBLIC_COMMENT_ACTION_PANEL, /Private DM/);
    assert.match(PUBLIC_COMMENT_ACTION_PANEL, /Like/);
    assert.match(PUBLIC_COMMENT_ACTION_PANEL, /Hide/);
    assert.match(PUBLIC_COMMENT_ACTION_PANEL, /Delete/);
    assert.match(PUBLIC_COMMENT_ACTION_PANEL, /Reason note required for hide\/delete/);
    assert.match(PUBLIC_COMMENT_ACTION_PANEL, /window\.confirm/);
    assert.match(PUBLIC_COMMENT_ACTION_PANEL, /Queue Action/);
    assert.match(PUBLIC_COMMENT_ACTION_PANEL, /Retry Action/);
    assert.match(
      INBOX_MUTATIONS,
      /\/api\/social-inbox\/conversations\/\$\{encodeURIComponent\(conversationId\)\}\/comment-actions/,
    );
    assert.match(
      INBOX_MUTATIONS,
      /\/api\/social-inbox\/conversations\/\$\{encodeURIComponent\(conversationId\)\}\/comment-actions\/queue/,
    );
    assert.match(
      INBOX_MUTATIONS,
      /\/api\/social-inbox\/conversations\/\$\{encodeURIComponent\(conversationId\)\}\/comment-actions\/retry/,
    );
    assert.match(SOCIAL_INBOX_LIB, /commentActions: SocialInboxCommentAction\[\]/);
    assert.match(SOCIAL_INBOX_LIB, /createSocialInboxCommentAction/);
    assert.match(SOCIAL_INBOX_LIB, /queueSocialInboxCommentAction/);
    assert.match(SOCIAL_INBOX_LIB, /retrySocialInboxCommentAction/);
  });

  it("surfaces advisory presence collision warnings", () => {
    assert.match(SELECTED_ITEM_DETAIL, /PresenceCollisionBanner/);
    assert.match(DESKTOP_INBOX, /sendPresenceHeartbeat/);
    assert.match(DESKTOP_INBOX, /\/api\/social-inbox\/conversations\/\$\{encodeURIComponent\(conversationId\)\}\/presence/);
    assert.match(PRESENCE_COLLISION_BANNER, /is replying now/);
    assert.match(PRESENCE_COLLISION_BANNER, /Advisory collision warning only/);
    assert.match(SOCIAL_INBOX_LIB, /recordSocialInboxPresence/);
  });

  it("surfaces the first manager dashboard snapshot", () => {
    assert.match(DESKTOP_INBOX, /buildMetaInboxManagerDashboard/);
    assert.match(DESKTOP_INBOX, /InboxEyebrow/);
    assert.match(INBOX_EYEBROW, /Needs reply/);
    assert.match(INBOX_EYEBROW, /Median first/);
    assert.match(INBOX_EYEBROW, /QA avg/);
  });

  it("surfaces normalized message attachments in conversation history", () => {
    assert.match(SELECTED_ITEM_DETAIL, /MessageAttachmentList/);
    assert.match(SELECTED_ITEM_DETAIL, /message\.attachments\.length/);
    assert.match(SELECTED_ITEM_DETAIL, /message\.attachments\.length \? null/);
    assert.doesNotMatch(SELECTED_ITEM_DETAIL, /Attachment or unsupported message/);
    assert.match(MESSAGE_ATTACHMENT_LIST, /attachment\.mediaUrl/);
    assert.match(MESSAGE_ATTACHMENT_LIST, /attachment\.previewUrl \|\| attachment\.mediaUrl/);
    assert.match(MESSAGE_ATTACHMENT_LIST, /next\/image/);
    assert.match(MESSAGE_ATTACHMENT_LIST, /unoptimized/);
    assert.match(SOCIAL_INBOX_LIB, /normalizeMetaInboxAttachments/);
    assert.match(SOCIAL_INBOX_LIB, /messageAttachmentsFromRow/);
    assert.match(SOCIAL_INBOX_LIB, /rawMessage\.attachments \|\| rawJson\.attachments/);
    assert.match(SOCIAL_INBOX_LIB, /attachmentIds\?: string\[\] \| null/);
  });

  it("wires operator attachment uploads into approved send attempts", () => {
    assert.match(MOBILE_COMPOSER, /type="file"/);
    assert.match(MOBILE_COMPOSER, /onUploadAttachment/);
    assert.match(INBOX_MUTATIONS, /\/api\/social-inbox\/conversations\/\$\{encodeURIComponent\(conversationId\)\}\/attachments/);
    assert.match(SOCIAL_INBOX_LIB, /createSocialInboxAttachmentUpload/);
    assert.match(SOCIAL_INBOX_LIB, /meta_inbox_attachments/);
    assert.match(SOCIAL_INBOX_LIB, /send_attempt_id/);
  });

  it("keeps inbox error copy human-readable instead of rendering object strings", () => {
    assert.match(DESKTOP_INBOX_PAGE, /safeErrorMessage\(error\)/);
    assert.match(SOCIAL_INBOX_LIB, /return safeErrorMessage\(error\)/);
    assert.doesNotMatch(DESKTOP_INBOX_PAGE, /String\(error\)/);
  });
});
