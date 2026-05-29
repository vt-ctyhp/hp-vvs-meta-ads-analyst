import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { createRequire } from "node:module";
import { runInNewContext } from "node:vm";
import test from "node:test";

import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import * as ts from "typescript";

const require = createRequire(import.meta.url);

const { ConversationHeader, platformOf } = loadModule(
  "src/components/v2/inbox/conversation-header.tsx",
) as {
  ConversationHeader: (props: Record<string, unknown>) => React.ReactElement;
  platformOf: (sourceChannel: string) => "FB" | "IG" | null;
};
const { ConversationPane } = loadModule(
  "src/components/v2/inbox/conversation-pane.tsx",
) as {
  ConversationPane: (props: Record<string, unknown>) => React.ReactElement;
};

test("ConversationHeader renders IG handle only for Instagram source channels", () => {
  const now = new Date("2026-05-25T18:00:00.000Z");

  const instagramMarkup = renderToStaticMarkup(
    React.createElement(ConversationHeader, {
      item: itemFixture({
        sourceChannel: "instagram_message",
        platform: "instagram",
        channel: "Instagram",
        profile: profileFixture({ username: "emmaposes" }),
      }),
      now,
    }),
  );
  assert.match(instagramMarkup, /Emma Customer/);
  assert.match(instagramMarkup, /@emmaposes/);
  assert.match(instagramMarkup, /data-handle-platform="IG"/);
  assert.match(instagramMarkup, /italic/);

  const facebookMarkup = renderToStaticMarkup(
    React.createElement(ConversationHeader, {
      item: itemFixture({
        sourceChannel: "facebook_message",
        platform: "facebook",
        channel: "Facebook",
        profile: profileFixture({ username: "some.vanity" }),
      }),
      now,
    }),
  );
  assert.doesNotMatch(facebookMarkup, /@some\.vanity/);
  assert.doesNotMatch(facebookMarkup, /data-handle-platform/);

  const noHandleMarkup = renderToStaticMarkup(
    React.createElement(ConversationHeader, {
      item: itemFixture({
        sourceChannel: "instagram_message",
        profile: profileFixture({ username: null }),
      }),
      now,
    }),
  );
  assert.doesNotMatch(noHandleMarkup, /@/);

  assert.equal(platformOf("instagram_public_comment"), "IG");
  assert.equal(platformOf("facebook_public_comment"), "FB");
  assert.equal(platformOf("ad_referral"), null);
});

test("ConversationHeader renders source context, assignment, and drawer chips (no routing or reply window)", () => {
  const markup = renderToStaticMarkup(
    React.createElement(ConversationHeader, {
      item: itemFixture({
        routingConfidence: 0.918,
        routingExplanation: "Asked for a Saturday appointment.",
        inboxConversation: conversationFixture({
          assigned_user_id: "Mia",
          latest_inbound_at: "2026-05-25T16:15:00.000Z",
          send_eligibility: "standard_reply_allowed",
          reply_window_expires_at: "2026-05-26T16:15:00.000Z",
        }),
      }),
      now: new Date("2026-05-25T18:00:00.000Z"),
    }),
  );

  assert.match(markup, /HP · Instagram Message · Book Appointment/);
  assert.match(markup, /Assigned to Mia/);
  assert.match(markup, /2h since last inbound/);
  assert.doesNotMatch(markup, /Routing/);
  assert.doesNotMatch(markup, /Asked for a Saturday appointment\./);
  assert.doesNotMatch(markup, /Reply window/);
  for (const chip of ["Profile", "Notes", "History", "Quality", "Close →"]) {
    assert.match(markup, new RegExp(`>${escapeRegExp(chip)}<`));
  }

  const unassigned = renderToStaticMarkup(
    React.createElement(ConversationHeader, {
      item: itemFixture({
        inboxConversation: conversationFixture({ assigned_user_id: null }),
      }),
      now: new Date("2026-05-25T18:00:00.000Z"),
    }),
  );
  assert.match(unassigned, /Unassigned/);
});

test("ConversationPane swaps reply composer and public comment actions by item type", () => {
  const messageMarkup = renderToStaticMarkup(
    React.createElement(ConversationPane, {
      item: itemFixture({ type: "message" }),
      thread: React.createElement("div", null, "Thread bubbles"),
      replyComposer: React.createElement("div", null, "ReplyComposer"),
      commentActions: React.createElement("div", null, "PublicCommentActionPanel"),
      legacySideRail: React.createElement("div", null, "Legacy side rail"),
    }),
  );

  assert.match(messageMarkup, /data-component="conversation-pane"/);
  assert.match(messageMarkup, /Thread bubbles/);
  assert.match(messageMarkup, /ReplyComposer/);
  assert.doesNotMatch(messageMarkup, /PublicCommentActionPanel/);
  assert.doesNotMatch(messageMarkup, /Legacy side rail/);
  assert.doesNotMatch(messageMarkup, /data-slot="legacy-side-rail"/);

  const commentMarkup = renderToStaticMarkup(
    React.createElement(ConversationPane, {
      item: itemFixture({ type: "comment" }),
      thread: React.createElement("div", null, "Thread bubbles"),
      replyComposer: React.createElement("div", null, "ReplyComposer"),
      commentActions: React.createElement("div", null, "PublicCommentActionPanel"),
    }),
  );

  assert.match(commentMarkup, /PublicCommentActionPanel/);
  assert.doesNotMatch(commentMarkup, /ReplyComposer/);
});

test("ConversationPane drawer chips invoke their supplied drawer callbacks", () => {
  const calls: string[] = [];
  const pane = ConversationPane({
    item: itemFixture({ type: "message" }),
    thread: React.createElement("div", null, "Thread bubbles"),
    replyComposer: React.createElement("div", null, "ReplyComposer"),
    onOpenDetails: () => calls.push("details"),
    onOpenAudit: () => calls.push("audit"),
    onOpenNotes: () => calls.push("notes"),
    onOpenQa: () => calls.push("qa"),
    onCloseConversation: () => calls.push("close"),
  });

  const header = findComponent(pane, "ConversationHeader");
  header.props.onOpenDetails?.();
  header.props.onOpenAudit?.();
  header.props.onOpenNotes?.();
  header.props.onOpenQa?.();
  header.props.onCloseConversation?.();

  assert.deepEqual(calls, ["details", "audit", "notes", "qa", "close"]);
});

function itemFixture(overrides: Record<string, unknown> = {}) {
  const conversation = conversationFixture();
  return {
    id: "conversation:conv-1",
    sourceId: "thread-1",
    channel: "Instagram",
    platform: "instagram",
    brand: "HP",
    type: "message",
    sender: "Emma Customer",
    preview: "Can I book Saturday?",
    status: "Needs reply",
    time: "May 25, 4:15 PM",
    timestamp: "2026-05-25T16:15:00.000Z",
    sourceChannel: "instagram_message",
    queueCategoryKey: "book_appointment",
    conversationStatus: "needs_reply",
    sendEligibility: conversation.send_eligibility,
    replyWindowExpiresAt: conversation.reply_window_expires_at,
    humanAgentWindowExpiresAt: conversation.human_agent_window_expires_at,
    routingExplanation: "Asked for a Saturday appointment.",
    routingConfidence: 0.91,
    inboxConversation: conversation,
    profile: profileFixture(),
    contactMethods: [],
    firstTouch: null,
    sendAttempts: [],
    commentActions: [],
    conversationEvents: [],
    savedReplies: [],
    notes: [],
    qaScorecards: [],
    ...overrides,
  };
}

function conversationFixture(overrides: Record<string, unknown> = {}) {
  return {
    id: "conv-1",
    canonical_conversation_key: "instagram:thread-1",
    source_channel: "instagram_message",
    source_type: "message_thread",
    platform: "instagram",
    customer_profile_id: "profile-1",
    page_id: "page-1",
    ig_user_id: "ig-1",
    participant_id: "participant-1",
    platform_thread_id: "thread-1",
    parent_content_id: null,
    source_id: "thread-1",
    first_inbound_at: "2026-05-25T16:15:00.000Z",
    latest_inbound_at: "2026-05-25T16:15:00.000Z",
    latest_outbound_at: null,
    last_activity_at: "2026-05-25T16:15:00.000Z",
    needs_reply: true,
    reply_window_expires_at: "2026-05-26T16:15:00.000Z",
    human_agent_window_expires_at: "2026-05-30T16:15:00.000Z",
    send_eligibility: "standard_reply_allowed",
    conversation_status: "needs_reply",
    assigned_team_id: null,
    assigned_user_id: null,
    follow_up_at: null,
    lead_quality: null,
    lead_quality_reason_tags: [],
    inbox_outcome: "no_outcome_yet",
    inbox_lost_reason: null,
    queue_category_key: "book_appointment",
    routing_source: "ai",
    routing_confidence: 0.91,
    routing_explanation: "Asked for a Saturday appointment.",
    ...overrides,
  };
}

function profileFixture(overrides: Record<string, unknown> = {}) {
  return {
    id: "profile-1",
    platform: "instagram",
    page_id: "page-1",
    ig_user_id: "ig-1",
    participant_id: "participant-1",
    display_name: "Emma Customer",
    username: "emmaposes",
    profile_picture_url: null,
    profile_url: "https://instagram.com/emmaposes",
    profile_reference: "participant-1",
    last_profile_synced_at: null,
    ...overrides,
  };
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function loadModule(filePath: string) {
  const cache = new Map<string, Record<string, unknown>>();
  return load(resolve(filePath));

  function load(absolutePath: string): Record<string, unknown> {
    const cached = cache.get(absolutePath);
    if (cached) return cached;

    const output = ts.transpileModule(readFileSync(absolutePath, "utf8"), {
      compilerOptions: {
        esModuleInterop: true,
        jsx: ts.JsxEmit.ReactJSX,
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
      },
      fileName: absolutePath,
    }).outputText;
    const commonJsModule = { exports: {} as Record<string, unknown> };
    cache.set(absolutePath, commonJsModule.exports);

    runInNewContext(output, {
      console,
      exports: commonJsModule.exports,
      module: commonJsModule,
      require(id: string) {
        if (id.startsWith(".")) return load(resolveLocalImport(dirname(absolutePath), id));
        if (id.startsWith("@/")) return load(resolve(id.replace("@/", "src/")));
        return require(id);
      },
    });

    return commonJsModule.exports;
  }
}

function resolveLocalImport(baseDir: string, id: string): string {
  const candidate = resolve(baseDir, id);
  const candidates = id.match(/\.[cm]?[tj]sx?$/)
    ? [candidate]
    : [`${candidate}.ts`, `${candidate}.tsx`, `${candidate}.js`, resolve(candidate, "index.ts")];

  for (const path of candidates) {
    try {
      readFileSync(path);
      return path;
    } catch {
      // Try next extension.
    }
  }

  throw new Error(`Cannot resolve ${id} from ${baseDir}`);
}

type TestElement = {
  type?: unknown;
  props: {
    children?: unknown;
    onClick?: () => void;
    onOpenDetails?: () => void;
    onOpenAudit?: () => void;
    onOpenNotes?: () => void;
    onOpenQa?: () => void;
    onCloseConversation?: () => void;
  };
};

function findComponent(node: unknown, name: string): TestElement {
  const component = findAllElements(node).find((element) => {
    const type = element.type;
    return typeof type === "function" && type.name === name;
  });
  if (!component) throw new Error(`No component found for ${name}`);
  return component;
}

function findAllElements(node: unknown): TestElement[] {
  if (!node || typeof node !== "object") return [];

  const element = node as TestElement;
  const children = element.props?.children;
  const stack = Array.isArray(children) ? children : [children];

  return element.props ? [element, ...stack.flatMap(findAllElements)] : [];
}
