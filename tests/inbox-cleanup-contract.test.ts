import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

const root = process.cwd();

test("convert inbox uses only the production SocialInboxClient route", () => {
  const pagePath = resolve(root, "src/app/(workspace)/convert/inbox/page.tsx");
  const pageSource = readFileSync(pagePath, "utf8");

  assert.doesNotMatch(pageSource, /inbox-prototype/);
  assert.doesNotMatch(pageSource, /parseVariant/);
  assert.doesNotMatch(pageSource, /searchParams\.variant/);
  assert.doesNotMatch(pageSource, /process\.env\.NODE_ENV !== "production"/);
  assert.match(pageSource, /<SocialInboxClient[\s\S]*initialData=/);
});

test("inbox cleanup keeps major UI pieces in per-file modules", () => {
  const expectedModules = [
    "src/components/v2/inbox/inbox-layout-shell.tsx",
    "src/components/v2/inbox/inbox-eyebrow.tsx",
    "src/components/v2/inbox/inbox-status-sentence.tsx",
    "src/components/v2/inbox/inbox-health-row.tsx",
    "src/components/v2/inbox/queue-rail.tsx",
    "src/components/v2/inbox/queue-row.tsx",
    "src/components/v2/inbox/conversation-pane.tsx",
    "src/components/v2/inbox/conversation-header.tsx",
    "src/components/v2/inbox/drawer-overlay.tsx",
    "src/components/v2/inbox/details-drawer-panel.tsx",
    "src/components/v2/inbox/audit-drawer-panel.tsx",
    "src/components/v2/inbox/notes-drawer-panel.tsx",
    "src/components/v2/inbox/qa-drawer-panel.tsx",
    "src/components/v2/inbox/reply-composer.tsx",
    "src/components/v2/inbox/selected-item-detail.tsx",
    "src/components/v2/inbox/message-attachment-list.tsx",
    "src/components/v2/inbox/presence-collision-banner.tsx",
    "src/components/v2/inbox/history-status-strip.tsx",
    "src/components/v2/inbox/public-comment-action-panel.tsx",
    "src/components/v2/inbox/empty-thread-state.tsx",
  ];

  for (const modulePath of expectedModules) {
    assert.equal(existsSync(resolve(root, modulePath)), true, `${modulePath} should exist`);
  }

  assert.equal(
    existsSync(resolve(root, "src/components/inbox-prototype")),
    false,
    "prototype directory should be deleted",
  );
});

test("SocialInboxClient stays a thin inbox orchestrator", () => {
  const sourcePath = resolve(root, "src/components/social-inbox-client.tsx");
  const source = readFileSync(sourcePath, "utf8");
  const lineCount = source.split("\n").length;

  assert.ok(lineCount < 1000, `expected under 1000 lines, got ${lineCount}`);
  assert.doesNotMatch(source, /^function SelectedItemDetail\(/m);
  assert.doesNotMatch(source, /^function MessageAttachmentList\(/m);
  assert.doesNotMatch(source, /^function PublicCommentActionPanel\(/m);
  assert.doesNotMatch(source, /^function PresenceCollisionBanner\(/m);
  assert.doesNotMatch(source, /^function HistoryStatusStrip\(/m);
  assert.doesNotMatch(source, /^function EmptyThreadState\(/m);
});
