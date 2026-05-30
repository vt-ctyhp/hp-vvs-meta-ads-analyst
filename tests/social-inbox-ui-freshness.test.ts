import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

import {
  clearConversationTextState,
  readConversationTextState,
  resolveActiveReplyWindowInput,
  resolveReplyWindowState,
  timeUntilLabel,
  writeConversationTextState,
} from "../src/lib/social-inbox-ui-freshness.ts";

const DESKTOP_INBOX = readFileSync("src/components/social-inbox-client.tsx", "utf8");
const INBOX_MUTATIONS = readFileSync(
  "src/components/v2/inbox/use-social-inbox-mutations.ts",
  "utf8",
);
const CONVERSATION_HEADER = readFileSync(
  "src/components/v2/inbox/conversation-header.tsx",
  "utf8",
);
const DETAILS_DRAWER = readFileSync("src/components/v2/inbox/details-drawer-panel.tsx", "utf8");
const REPLY_COMPOSER = readFileSync("src/components/v2/inbox/reply-composer.tsx", "utf8");

describe("resolveActiveReplyWindowInput", () => {
  const NOW = Date.parse("2026-05-29T19:14:00.000Z");

  it("prefers the freshly-loaded conversation eligibility over a stale item", () => {
    // Reproduces the bug: the page-load snapshot said the window was closed, but
    // the conversation later received an inbound. The live history fetch carries
    // the fresh, open eligibility, so the composer must trust that, not the snapshot.
    const staleItem = {
      sendEligibility: "expired",
      replyWindowExpiresAt: null,
      humanAgentWindowExpiresAt: null,
    };
    const freshConversation = {
      send_eligibility: "standard_reply_allowed",
      reply_window_expires_at: "2026-05-30T19:10:35.126+00:00",
      human_agent_window_expires_at: "2026-06-05T19:10:35.126+00:00",
    };

    const active = resolveActiveReplyWindowInput(staleItem, freshConversation);
    assert.equal(resolveReplyWindowState(active, NOW).canAttemptSend, true);
  });

  it("falls back to the item's own eligibility when no fresh conversation is loaded", () => {
    const staleItem = {
      sendEligibility: "expired",
      replyWindowExpiresAt: null,
      humanAgentWindowExpiresAt: null,
    };
    const active = resolveActiveReplyWindowInput(staleItem, null);
    assert.deepEqual(active, staleItem);
    assert.equal(resolveReplyWindowState(active, NOW).canAttemptSend, false);
  });

  it("wires the freshly-loaded conversation into the desktop reply composer", () => {
    assert.match(DESKTOP_INBOX, /resolveActiveReplyWindowInput/);
  });
});

describe("social inbox UI freshness contracts", () => {
  it("keeps text drafts keyed by conversation id", () => {
    const withFirstDraft = writeConversationTextState({}, "conversation-a", "Draft A");
    const withBothDrafts = writeConversationTextState(
      withFirstDraft,
      "conversation-b",
      "Draft B",
    );

    assert.equal(readConversationTextState(withBothDrafts, "conversation-a"), "Draft A");
    assert.equal(readConversationTextState(withBothDrafts, "conversation-b"), "Draft B");
    assert.equal(readConversationTextState(withBothDrafts, null), "");

    const clearedFirst = clearConversationTextState(withBothDrafts, "conversation-a");
    assert.equal(readConversationTextState(clearedFirst, "conversation-a"), "");
    assert.equal(readConversationTextState(clearedFirst, "conversation-b"), "Draft B");
  });

  it("updates reply-window labels from the provided clock", () => {
    const windowInput = {
      sendEligibility: "standard_reply_allowed",
      replyWindowExpiresAt: "2026-05-25T12:10:00.000Z",
      humanAgentWindowExpiresAt: null,
    };

    assert.deepEqual(
      resolveReplyWindowState(windowInput, Date.parse("2026-05-25T12:00:00.000Z")),
      {
        canAttemptSend: true,
        label: "Standard Reply",
        detail: "10 min remaining for standard response.",
      },
    );
    assert.equal(
      timeUntilLabel(
        "2026-05-25T12:10:00.000Z",
        Date.parse("2026-05-25T12:10:01.000Z"),
      ),
      "Expired",
    );
    assert.deepEqual(
      resolveReplyWindowState(windowInput, Date.parse("2026-05-25T12:11:00.000Z")),
      {
        canAttemptSend: false,
        label: "Expired",
        detail: "Meta reply window is closed for normal send attempts.",
      },
    );
  });

  it("keys draft/action/note/QA/template panels to the selected conversation", () => {
    assert.match(DESKTOP_INBOX, /replyDraftByConversationId/);
    assert.match(DESKTOP_INBOX, /replyInstructionByConversationId/);
    assert.doesNotMatch(DESKTOP_INBOX, /replyContextId/);
    assert.match(DESKTOP_INBOX, /key=\{conversationPanelKey\(selectedItem, "reply-attempt"\)\}/);
    assert.match(DESKTOP_INBOX, /key=\{conversationPanelKey\(selectedItem, "comment-actions"\)\}/);
    assert.match(DESKTOP_INBOX, /key=\{conversationPanelKey\(selectedItem, "notes-drawer"\)\}/);
    assert.match(DESKTOP_INBOX, /key=\{conversationPanelKey\(selectedItem, "qa-drawer"\)\}/);
  });

  it("keeps sync, presence, and reply windows fresh for the current conversation", () => {
    assert.match(DESKTOP_INBOX, /selectedConversationIdRef/);
    assert.match(INBOX_MUTATIONS, /loadConversationHistory\(refreshedSelectedConversationId\)/);
    assert.match(DESKTOP_INBOX, /setPresenceByConversationId\(\(current\) => \(\{/);
    assert.match(DESKTOP_INBOX, /\[conversationId\]: \{/);
    assert.match(DESKTOP_INBOX, /replyWindowNow/);
    assert.match(DESKTOP_INBOX, /window\.setInterval\(\(\) => setReplyWindowNow\(Date\.now\(\)\), 60_000\)/);
    assert.match(REPLY_COMPOSER, /Reply window closed/);
  });

  it("allows long selected customer labels to wrap instead of blocking replies", () => {
    assert.match(DESKTOP_INBOX, /ConversationPane/);
    assert.match(CONVERSATION_HEADER, /break-words\s+text-\[22px\]/);
    assert.match(DETAILS_DRAWER, /break-words[\s\S]*text-hp-ink/);
    assert.match(DETAILS_DRAWER, /break-all/);
  });
});
