import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import { runInNewContext } from "node:vm";
import test from "node:test";

import React from "react";
import * as ts from "typescript";

const require = createRequire(import.meta.url);

test("ReplyComposer records a send attempt only after the second Send click", () => {
  const harness = loadReplyComposerHarness();
  let draft = "";
  const sendCalls: Array<{ conversationId: string; input: Record<string, unknown> }> = [];
  const draftChanges: string[] = [];

  const render = () =>
    harness.render(
      replyComposerProps({
        draft,
        onDraftChange(value: string) {
          draft = value;
          draftChanges.push(value);
        },
        onCreateSendAttempt(conversationId: string, input: Record<string, unknown>) {
          sendCalls.push({ conversationId, input });
        },
      }),
    );

  let tree = render();
  assert.equal(buttonByText(tree, "Send →").props.disabled, true);

  change(textarea(tree), "Can help Saturday.");
  tree = render();
  assert.equal(buttonByText(tree, "Send →").props.disabled, false);

  click(buttonByText(tree, "Send →"));
  tree = render();
  assert.match(textContent(tree), /Send as HP\? This will record a send attempt\./);
  assert.equal(sendCalls.length, 0);

  click(buttonByText(tree, "Send →"));
  tree = render();

  assert.equal(sendCalls.length, 1);
  assert.equal(sendCalls[0]?.conversationId, "conv-1");
  assert.equal(sendCalls[0]?.input.replyText, "Can help Saturday.");
  assert.equal(draftChanges.at(-1), "");
  assert.doesNotMatch(textContent(tree), /This will record a send attempt/);
});

test("ReplyComposer cancel exits confirmation without sending", () => {
  const harness = loadReplyComposerHarness();
  let draft = "Can help Saturday.";
  let sendCount = 0;
  const render = () =>
    harness.render(
      replyComposerProps({
        draft,
        onDraftChange(value: string) {
          draft = value;
        },
        onCreateSendAttempt() {
          sendCount += 1;
        },
      }),
    );

  let tree = render();
  click(buttonByText(tree, "Send →"));
  tree = render();
  click(buttonByText(tree, "Cancel"));
  tree = render();

  assert.equal(sendCount, 0);
  assert.equal(buttonByText(tree, "Send →").props.disabled, false);
  assert.doesNotMatch(textContent(tree), /This will record a send attempt/);
});

test("ReplyComposer disables send controls when the reply window is closed", () => {
  const harness = loadReplyComposerHarness();
  const tree = harness.render(
    replyComposerProps({
      draft: "Please call us.",
      item: itemFixture({
        sendEligibility: "expired",
        replyWindowExpiresAt: "2026-05-24T16:15:00.000Z",
        humanAgentWindowExpiresAt: "2026-05-24T16:15:00.000Z",
        inboxConversation: conversationFixture({
          send_eligibility: "expired",
          reply_window_expires_at: "2026-05-24T16:15:00.000Z",
          human_agent_window_expires_at: "2026-05-24T16:15:00.000Z",
        }),
      }),
    }),
  );

  assert.match(textContent(tree), /Reply window closed/);
  assert.equal(textarea(tree).props.disabled, true);
  assert.equal(
    textarea(tree).props.placeholder,
    "Reply window is closed. Use a saved follow-up template.",
  );
  assert.equal(buttonByText(tree, "Send →").props.disabled, true);
});

test("ReplyComposer inserts saved replies and toggles the saved replies card", () => {
  const harness = loadReplyComposerHarness();
  let draft = "Existing draft";
  const draftChanges: string[] = [];
  const render = () =>
    harness.render(
      replyComposerProps({
        draft,
        onDraftChange(value: string) {
          draft = value;
          draftChanges.push(value);
        },
        item: itemFixture({
          savedReplies: [
            savedReplyFixture({
              id: "reply-1",
              title: "Appointment intro",
              body: "We have Saturday openings.",
              visibility: "personal",
            }),
          ],
        }),
      }),
    );

  let tree = render();
  assert.match(textContent(tree), /Appointment intro/);
  assert.match(textContent(tree), /Personal Draft/);

  click(buttonByText(tree, "Insert →"));
  assert.equal(draftChanges.at(-1), "Existing draft\n\nWe have Saturday openings.");

  tree = render();
  click(buttonByText(tree, "Hide ↕"));
  tree = render();
  assert.doesNotMatch(textContent(tree), /Appointment intro/);
  click(buttonByText(tree, "Show ↕"));
  tree = render();
  assert.match(textContent(tree), /Appointment intro/);
});

test("ReplyComposer saves a personal draft only after body and draft name are filled", () => {
  const harness = loadReplyComposerHarness();
  let draft = "";
  const saveCalls: Array<{ conversationId: string; input: Record<string, unknown> }> = [];
  const render = () =>
    harness.render(
      replyComposerProps({
        draft,
        onDraftChange(value: string) {
          draft = value;
        },
        onCreateSavedReply(conversationId: string, input: Record<string, unknown>) {
          saveCalls.push({ conversationId, input });
        },
      }),
    );

  let tree = render();
  assert.equal(inputByPlaceholder(tree, "Draft name").props.disabled, true);
  assert.equal(buttonByText(tree, "Save Personal Draft").props.disabled, true);

  change(textarea(tree), "Please visit our showroom.");
  tree = render();
  assert.equal(inputByPlaceholder(tree, "Draft name").props.disabled, false);
  assert.equal(buttonByText(tree, "Save Personal Draft").props.disabled, true);

  change(inputByPlaceholder(tree, "Draft name"), "Showroom invite");
  tree = render();
  click(buttonByText(tree, "Save Personal Draft"));

  assert.equal(saveCalls.length, 1);
  assert.equal(saveCalls[0]?.conversationId, "conv-1");
  assert.deepEqual(
    {
      title: saveCalls[0]?.input.title,
      body: saveCalls[0]?.input.body,
      visibility: saveCalls[0]?.input.visibility,
    },
    {
      title: "Showroom invite",
      body: "Please visit our showroom.",
      visibility: "personal",
    },
  );
});

test("ReplyComposer keeps send attempts collapsed and exposes retry and queue actions when expanded", () => {
  const harness = loadReplyComposerHarness();
  const retryCalls: Array<{ conversationId: string; input: Record<string, unknown> }> = [];
  const queueCalls: Array<{ conversationId: string; input: Record<string, unknown> }> = [];
  const render = () =>
    harness.render(
      replyComposerProps({
        item: itemFixture({
          sendAttempts: [
            sendAttemptFixture({
              id: "attempt-failed",
              status: "failed_retryable",
              reply_text: "First try",
              created_at: "2026-05-25T17:30:00.000Z",
              updated_at: "2026-05-25T17:40:00.000Z",
            }),
            sendAttemptFixture({
              id: "attempt-approved",
              status: "approved",
              reply_text: "Approved try",
              created_at: "2026-05-25T17:00:00.000Z",
              updated_at: "2026-05-25T17:10:00.000Z",
            }),
          ],
        }),
        onRetrySendAttempt(conversationId: string, input: Record<string, unknown>) {
          retryCalls.push({ conversationId, input });
        },
        onQueueSendAttempt(conversationId: string, input: Record<string, unknown>) {
          queueCalls.push({ conversationId, input });
        },
      }),
    );

  let tree = render();
  assert.match(textContent(tree), /2 send attempts · last 20m ago/);
  assert.doesNotMatch(textContent(tree), /First try/);

  click(buttonByText(tree, "Show ↕"));
  tree = render();
  assert.match(textContent(tree), /First try/);
  assert.match(textContent(tree), /Approved try/);

  click(buttonByText(tree, "Retry"));
  click(buttonByText(tree, "Queue Delivery"));

  assert.equal(retryCalls.length, 1);
  assert.equal(retryCalls[0]?.conversationId, "conv-1");
  assert.equal(retryCalls[0]?.input.sendAttemptId, "attempt-failed");
  assert.equal(queueCalls.length, 1);
  assert.equal(queueCalls[0]?.conversationId, "conv-1");
  assert.equal(queueCalls[0]?.input.sendAttemptId, "attempt-approved");
});

function loadReplyComposerHarness() {
  const states: unknown[] = [];
  let cursor = 0;

  const fakeReact = {
    ...React,
    useState<T>(initial: T | (() => T)): [T, (next: T | ((current: T) => T)) => void] {
      const stateIndex = cursor++;
      if (!(stateIndex in states)) {
        states[stateIndex] = typeof initial === "function" ? (initial as () => T)() : initial;
      }
      return [
        states[stateIndex] as T,
        (next) => {
          states[stateIndex] =
            typeof next === "function" ? (next as (current: T) => T)(states[stateIndex] as T) : next;
        },
      ];
    },
  };

  const { ReplyComposer } = loadModule("src/components/v2/inbox/reply-composer.tsx", {
    react: fakeReact,
  }) as {
    ReplyComposer: (props: Record<string, unknown>) => TestElement;
  };

  return {
    render(props: Record<string, unknown>) {
      cursor = 0;
      return materialize(ReplyComposer(props)) as TestElement;
    },
  };
}

function replyComposerProps(overrides: Record<string, unknown> = {}) {
  return {
    item: itemFixture(),
    draft: "",
    onDraftChange: () => {},
    canSendInboxReply: true,
    mutationState: {
      conversationId: null,
      sendAttemptId: null,
      status: "idle",
      message: null,
    },
    savedReplyMutationState: {
      conversationId: null,
      status: "idle",
      message: null,
    },
    replyWindowNow: Date.parse("2026-05-25T18:00:00.000Z"),
    onCreateSendAttempt: () => {},
    onQueueSendAttempt: () => {},
    onRetrySendAttempt: () => {},
    onCreateSavedReply: () => {},
    ...overrides,
  };
}

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
    profile: null,
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

function savedReplyFixture(overrides: Record<string, unknown> = {}) {
  return {
    id: "reply-1",
    title: "Saved reply",
    body: "Saved body",
    visibility: "shared",
    approval_status: "approved",
    owner_user_id: null,
    created_by: "manager-1",
    approved_by: "manager-1",
    approved_at: "2026-05-25T16:00:00.000Z",
    queue_category_key: "book_appointment",
    source_channel: "instagram_message",
    language: "en",
    lead_quality: null,
    active: true,
    usage_count: 0,
    last_used_at: null,
    metadata: {},
    created_at: "2026-05-25T16:00:00.000Z",
    updated_at: "2026-05-25T16:00:00.000Z",
    ...overrides,
  };
}

function sendAttemptFixture(overrides: Record<string, unknown> = {}) {
  return {
    id: "attempt-1",
    conversation_id: "conv-1",
    reply_text: "Reply text",
    approved_by: "Mia",
    approved_at: "2026-05-25T17:00:00.000Z",
    status: "approved",
    messaging_type: "RESPONSE",
    tag: null,
    attachment_ids: [],
    meta_send_id: null,
    meta_error_message: null,
    meta_error_code: null,
    meta_error_subcode: null,
    meta_trace_id: null,
    attempt_count: 1,
    next_retry_at: null,
    last_attempted_at: null,
    sent_at: null,
    idempotency_key: "attempt-key",
    created_at: "2026-05-25T17:00:00.000Z",
    updated_at: "2026-05-25T17:00:00.000Z",
    ...overrides,
  };
}

function textarea(tree: TestElement) {
  const node = elementsByType(tree, "textarea")[0];
  if (!node) throw new Error("No textarea found");
  return node;
}

function inputByPlaceholder(tree: TestElement, placeholder: string) {
  const node = elementsByType(tree, "input").find(
    (element) => element.props.placeholder === placeholder,
  );
  if (!node) throw new Error(`No input found for ${placeholder}`);
  return node;
}

function buttonByText(tree: TestElement, label: string) {
  const button = elementsByType(tree, "button").find((node) => textContent(node).includes(label));
  if (!button) throw new Error(`No button found for ${label}`);
  return button;
}

function click(element: TestElement) {
  const onClick = element.props.onClick;
  if (typeof onClick !== "function") throw new Error("Element has no click handler");
  onClick();
}

function change(element: TestElement, value: string) {
  const onChange = element.props.onChange;
  if (typeof onChange !== "function") throw new Error("Element has no change handler");
  onChange({ target: { value } });
}

function elementsByType(node: unknown, type: string): TestElement[] {
  return findAllElements(node).filter((element) => element.type === type);
}

function materialize(node: unknown): unknown {
  if (!node || typeof node !== "object") return node;
  if (Array.isArray(node)) return node.map(materialize);

  const element = node as TestElement;
  if (typeof element.type === "function") {
    return materialize(element.type(element.props));
  }

  if (!element.props || !("children" in element.props)) return element;
  return {
    ...element,
    props: {
      ...element.props,
      children: materialize(element.props.children),
    },
  };
}

function textContent(node: unknown): string {
  if (node == null || typeof node === "boolean") return "";
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(textContent).join("");
  if (typeof node !== "object") return "";
  const element = node as TestElement;
  return textContent(element.props?.children);
}

function findAllElements(node: unknown): TestElement[] {
  if (!node || typeof node !== "object") return [];

  const element = node as TestElement;
  const children = element.props?.children;
  const stack = Array.isArray(children) ? children : [children];

  return element.props ? [element, ...stack.flatMap(findAllElements)] : [];
}

function loadModule(filePath: string, stubs: Record<string, unknown> = {}) {
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
        if (id in stubs) return stubs[id];
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
  type?: unknown | ((props: Record<string, unknown>) => unknown);
  props: {
    children?: unknown;
    disabled?: boolean;
    placeholder?: string;
    onClick?: () => void;
    onChange?: (event: { target: { value: string } }) => void;
  };
};
