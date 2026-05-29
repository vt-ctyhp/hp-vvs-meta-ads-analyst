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

const lucideMock = new Proxy(
  {},
  {
    get: (_target, key) => {
      if (key === "__esModule") return false;
      return ({ className }: { className?: string }) =>
        React.createElement("svg", {
          className,
          "data-icon": String(key),
          "aria-hidden": "true",
        });
    },
  },
);

const { DrawerOverlay } = loadModule(
  "src/components/v2/inbox/drawer-overlay.tsx",
) as {
  DrawerOverlay: (props: Record<string, unknown>) => React.ReactElement | null;
};
const { DetailsDrawerPanel } = loadModule(
  "src/components/v2/inbox/details-drawer-panel.tsx",
) as {
  DetailsDrawerPanel: (props: Record<string, unknown>) => React.ReactElement;
};
const { AuditDrawerPanel } = loadModule(
  "src/components/v2/inbox/audit-drawer-panel.tsx",
) as {
  AuditDrawerPanel: (props: Record<string, unknown>) => React.ReactElement;
};
const { NotesDrawerPanel } = loadModule(
  "src/components/v2/inbox/notes-drawer-panel.tsx",
) as {
  NotesDrawerPanel: (props: Record<string, unknown>) => React.ReactElement;
};
const { QaDrawerPanel } = loadModule(
  "src/components/v2/inbox/qa-drawer-panel.tsx",
) as {
  QaDrawerPanel: (props: Record<string, unknown>) => React.ReactElement;
};

test("DrawerOverlay renders right-side shell, header context, and close controls", () => {
  let closeCalls = 0;
  const props = {
    item: itemFixture(),
    drawer: "audit",
    onClose: () => {
      closeCalls += 1;
    },
    children: React.createElement("p", null, "Audit drawer body"),
  };
  const markup = renderToStaticMarkup(React.createElement(DrawerOverlay, props));

  assert.match(markup, /data-component="drawer-overlay"/);
  assert.match(markup, /data-drawer="audit"/);
  assert.match(markup, /shadow-\[0_8px_24px_rgba\(42,39,37,0\.18\)\]/);
  assert.match(markup, /Emma Customer · HP/);
  assert.match(markup, /Audit trail/);
  assert.match(markup, /Audit drawer body/);
  assert.match(markup, /aria-label="Close drawer backdrop"/);
  assert.match(markup, />Close ×</);

  const tree = DrawerOverlay(props);
  findElementByAriaLabel(tree, "Close drawer backdrop").props.onClick?.();
  findButton(tree, "Close ×").props.onClick?.();
  assert.equal(closeCalls, 2);
});

test("DetailsDrawerPanel renders customer source, workflow fields, and read-only permission state", () => {
  const instagramMarkup = renderToStaticMarkup(
    React.createElement(
      DetailsDrawerPanel,
      detailsProps({
        item: itemFixture({
          sourceChannel: "instagram_message",
          platform: "instagram",
          profile: profileFixture({
            platform: "instagram",
            username: "emmaposes",
            profile_url: "https://instagram.com/emmaposes",
          }),
        }),
        canManageInboxState: false,
      }),
    ),
  );

  assert.match(instagramMarkup, /@emmaposes/);
  assert.match(instagramMarkup, /Open on Instagram →/);
  assert.doesNotMatch(instagramMarkup, /Routing Explanation/);
  assert.match(instagramMarkup, /\(555\) 111-2222/);
  for (const label of [
    "Queue",
    "Status",
    "Lead Quality",
    "Inbox Outcome",
    "Reason Tags",
    "Follow-Up",
    "Change Note",
  ]) {
    assert.match(instagramMarkup, new RegExp(escapeRegExp(label)));
  }
  assert.match(instagramMarkup, /Sales and sales lead users can claim, route, label, close/);
  assert.match(instagramMarkup, /disabled=""/);

  const facebookMarkup = renderToStaticMarkup(
    React.createElement(
      DetailsDrawerPanel,
      detailsProps({
        item: itemFixture({
          sourceChannel: "facebook_message",
          platform: "facebook",
          channel: "Facebook",
          profile: profileFixture({
            platform: "facebook",
            username: "some.vanity",
            profile_url: "https://facebook.com/some.vanity",
          }),
        }),
      }),
    ),
  );
  assert.doesNotMatch(facebookMarkup, /@some\.vanity/);
  assert.match(facebookMarkup, /Open on Facebook →/);

  const unknownMarkup = renderToStaticMarkup(
    React.createElement(
      DetailsDrawerPanel,
      detailsProps({
        item: itemFixture({
          sourceChannel: "other_unknown",
          profile: profileFixture({ username: null, profile_url: null }),
        }),
      }),
    ),
  );
  assert.match(unknownMarkup, /No profile link available/);
});

test("DetailsDrawerPanel builds the Instagram profile link from username when Meta omits a profile URL", () => {
  const markup = renderToStaticMarkup(
    React.createElement(
      DetailsDrawerPanel,
      detailsProps({
        item: itemFixture({
          sourceChannel: "instagram_message",
          platform: "instagram",
          profile: profileFixture({
            platform: "instagram",
            username: "emmaposes",
            profile_url: null,
          }),
        }),
      }),
    ),
  );

  assert.match(markup, /href="https:\/\/instagram\.com\/emmaposes"/);
  assert.match(markup, /Open on Instagram →/);
  assert.doesNotMatch(markup, /No profile link available/);
});

test("DetailsDrawerPanel does not fabricate a profile link for Facebook usernames", () => {
  const markup = renderToStaticMarkup(
    React.createElement(
      DetailsDrawerPanel,
      detailsProps({
        item: itemFixture({
          sourceChannel: "facebook_message",
          platform: "facebook",
          channel: "Facebook",
          profile: profileFixture({
            platform: "facebook",
            username: "some.vanity",
            profile_url: null,
          }),
        }),
      }),
    ),
  );

  assert.doesNotMatch(markup, /Open on Facebook →/);
  assert.doesNotMatch(markup, /instagram\.com\/some\.vanity/);
  assert.match(markup, /No profile link available/);
});

test("DetailsDrawerPanel renders enabled workflow and contact controls with permission", () => {
  const markup = renderToStaticMarkup(
    React.createElement(
      DetailsDrawerPanel,
      detailsProps({
        canManageInboxState: true,
      }),
    ),
  );

  assert.match(markup, />Add Contact</);
  assert.match(markup, />Claim for Me</);
  assert.match(markup, />Send to Team</);
  assert.match(markup, />Save Changes</);
  assert.doesNotMatch(markup, /Sales and sales lead users can claim, route, label, close/);
});

test("Details drawer close preset warns, defaults status to closed, and blocks incomplete save", () => {
  const markup = renderToStaticMarkup(
    React.createElement(
      DrawerOverlay,
      {
        item: itemFixture(),
        drawer: "details",
        preset: "close",
        onClose: () => {},
      },
      React.createElement(
        DetailsDrawerPanel,
        detailsProps({
          canManageInboxState: true,
          preset: "close",
        }),
      ),
    ),
  );

  assert.match(markup, /Close conversation/);
  assert.match(markup, /Closing this conversation/);
  assert.match(markup, /Status is pre-set to Closed/);
  assert.match(markup, /Lead quality/);
  assert.match(markup, /reason tag/);
  assert.match(markup, /Outcome/);
  assert.match(markup, /<select aria-label="Status"[^>]*data-tone="warning"[^>]*>/);
  assert.match(markup, /<option value="closed" selected="">Closed<\/option>/);
  assert.match(markup, /<button type="button" disabled=""[^>]*>Save Changes<\/button>/);
});

test("Details drawer without close preset keeps normal status and default border", () => {
  const markup = renderToStaticMarkup(
    React.createElement(
      DrawerOverlay,
      {
        item: itemFixture(),
        drawer: "details",
        onClose: () => {},
      },
      React.createElement(
        DetailsDrawerPanel,
        detailsProps({
          canManageInboxState: true,
        }),
      ),
    ),
  );

  assert.match(markup, /Details · Customer \+ Status/);
  assert.doesNotMatch(markup, /Closing this conversation/);
  assert.doesNotMatch(markup, /<select aria-label="Status"[^>]*data-tone="warning"[^>]*>/);
  assert.match(markup, /<option value="needs_reply" selected="">Needs Reply<\/option>/);
});

test("AuditDrawerPanel renders six recent events and payload-hiding footer", () => {
  const events = Array.from({ length: 7 }, (_value, index) =>
    eventFixture({
      id: `event-${index + 1}`,
      event_at:
        index === 0 ? "2026-05-25T20:00:00.000Z" : `2026-05-25T1${index}:00:00.000Z`,
      actor_user_id: index === 0 ? "advisor-1" : null,
      event_type: index === 0 ? "status_changed" : "note_added",
      new_value: index === 0
        ? { conversationStatus: "closed" }
        : { noteType: "internal_note", mentionCount: 0 },
      metadata: index === 0 ? { changeReason: "Resolved in store." } : {},
    }),
  );
  const markup = renderToStaticMarkup(
    React.createElement(AuditDrawerPanel, {
      item: itemFixture({ conversationEvents: events }),
    }),
  );

  assert.match(markup, /6 recent/);
  assert.match(markup, /Status Changed/);
  assert.match(markup, /Status Closed · Resolved in store\./);
  assert.match(markup, /Actor advisor-1/);
  assert.doesNotMatch(markup, /event-1/);
  assert.match(markup, /Raw Meta payload stays hidden by design\./);

  const emptyMarkup = renderToStaticMarkup(
    React.createElement(AuditDrawerPanel, { item: itemFixture({ conversationEvents: [] }) }),
  );
  assert.match(emptyMarkup, /No audit events yet for this conversation\./);
});

test("NotesDrawerPanel gates note creation and manager-coaching option", () => {
  const readOnlyMarkup = renderToStaticMarkup(
    React.createElement(NotesDrawerPanel, {
      item: itemFixture({ notes: [noteFixture()] }),
      canManageInboxState: false,
      canCreateManagerCoaching: true,
      mutationState: mutationState(),
      onCreateNote: async () => {},
    }),
  );

  assert.match(readOnlyMarkup, /Internal Note/);
  assert.match(readOnlyMarkup, /Sizing context shared by client/);
  assert.match(readOnlyMarkup, /Notes are read-only for this role/);
  assert.doesNotMatch(readOnlyMarkup, />Add Note</);

  const noCoachingMarkup = renderToStaticMarkup(
    React.createElement(NotesDrawerPanel, {
      item: itemFixture(),
      canManageInboxState: true,
      canCreateManagerCoaching: false,
      mutationState: mutationState(),
      onCreateNote: async () => {},
    }),
  );

  assert.match(noCoachingMarkup, />Internal Note</);
  assert.doesNotMatch(noCoachingMarkup, />Manager Coaching</);
  assert.match(noCoachingMarkup, /0 \/ 4000/);

  const coachingMarkup = renderToStaticMarkup(
    React.createElement(NotesDrawerPanel, {
      item: itemFixture(),
      canManageInboxState: true,
      canCreateManagerCoaching: true,
      mutationState: mutationState(),
      onCreateNote: async () => {},
    }),
  );
  assert.match(coachingMarkup, />Manager Coaching</);
});

test("QaDrawerPanel gates scorecard creation and keeps history visible", () => {
  const readOnlyMarkup = renderToStaticMarkup(
    React.createElement(QaDrawerPanel, {
      item: itemFixture({ qaScorecards: [scorecardFixture()] }),
      canManageInboxState: true,
      canCreateManagerCoaching: false,
      mutationState: mutationState(),
      onCreateScorecard: async () => {},
    }),
  );

  assert.match(readOnlyMarkup, /Overall 4\.5 \/ 5/);
  assert.match(readOnlyMarkup, /Excellent next step\./);
  assert.match(readOnlyMarkup, /QA scorecards are manager coaching only/);
  assert.doesNotMatch(readOnlyMarkup, />Add Scorecard</);

  const editableMarkup = renderToStaticMarkup(
    React.createElement(QaDrawerPanel, {
      item: itemFixture({ sendAttempts: [sendAttemptFixture()] }),
      canManageInboxState: true,
      canCreateManagerCoaching: true,
      mutationState: mutationState(),
      onCreateScorecard: async () => {},
    }),
  );

  for (const label of ["Tone", "Complete", "Accurate", "Next Step", "Speed", "Policy"]) {
    assert.match(editableMarkup, new RegExp(escapeRegExp(label)));
  }
  assert.match(editableMarkup, />Add Scorecard</);
  assert.match(editableMarkup, /Attempt ready/);
});

function detailsProps(overrides: Record<string, unknown> = {}) {
  return {
    item: itemFixture(),
    canManageInboxState: false,
    mutationState: mutationState(),
    onContactMethodMutation: () => {},
    onWorkflowUpdate: () => {},
    instruction: "",
    onInstructionChange: () => {},
    replyWindowNow: new Date("2026-05-25T18:00:00.000Z").getTime(),
    ...overrides,
  };
}

function mutationState(overrides: Record<string, unknown> = {}) {
  return {
    conversationId: "conv-1",
    status: "idle",
    message: null,
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
    profile: profileFixture(),
    contactMethods: [contactMethodFixture()],
    firstTouch: firstTouchFixture(),
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

function contactMethodFixture(overrides: Record<string, unknown> = {}) {
  return {
    id: "contact-1",
    customer_profile_id: "profile-1",
    type: "phone",
    value_normalized: "5551112222",
    value_display: "(555) 111-2222",
    source: "sales_entered",
    raw_input: "(555) 111-2222",
    verified_for_matching_at: null,
    entered_by: "advisor-1",
    entered_at: "2026-05-25T17:00:00.000Z",
    deleted_by: null,
    deleted_at: null,
    ...overrides,
  };
}

function firstTouchFixture(overrides: Record<string, unknown> = {}) {
  return {
    id: "first-touch-1",
    conversation_id: "conv-1",
    first_message_id: "message-1",
    first_message_at: "2026-05-25T16:15:00.000Z",
    ad_id: "ad-1",
    ref: "book-ref",
    source_post_id: "post-1",
    source_media_id: null,
    source_comment_id: null,
    source_product_id: null,
    source_permalink: "https://facebook.com/source-post",
    campaign_umbrella_id: "appointment-umbrella",
    campaign_id: "campaign-1",
    adset_id: "adset-1",
    creative_id: "creative-1",
    attribution_method: "referral",
    attribution_confidence: 0.9,
    ...overrides,
  };
}

function eventFixture(overrides: Record<string, unknown> = {}) {
  return {
    id: "event-1",
    conversation_id: "conv-1",
    event_type: "status_changed",
    actor_user_id: "advisor-1",
    event_at: "2026-05-25T17:00:00.000Z",
    previous_value: null,
    new_value: { conversationStatus: "closed" },
    metadata: { changeReason: "Resolved." },
    created_at: "2026-05-25T17:00:00.000Z",
    ...overrides,
  };
}

function noteFixture(overrides: Record<string, unknown> = {}) {
  return {
    id: "note-1",
    conversation_id: "conv-1",
    note_type: "internal_note",
    body: "Sizing context shared by client.",
    created_by: "advisor-1",
    mention_user_ids: [],
    metadata: {},
    deleted_by: null,
    deleted_at: null,
    created_at: "2026-05-25T17:00:00.000Z",
    updated_at: "2026-05-25T17:00:00.000Z",
    ...overrides,
  };
}

function scorecardFixture(overrides: Record<string, unknown> = {}) {
  return {
    id: "scorecard-1",
    conversation_id: "conv-1",
    send_attempt_id: null,
    reviewed_user_id: "advisor-1",
    reviewed_by: "manager-1",
    tone_score: 5,
    completeness_score: 4,
    accuracy_score: 5,
    next_step_score: 4,
    speed_score: 4,
    policy_compliance_score: 5,
    overall_score: 4.5,
    coaching_note: "Excellent next step.",
    metadata: {},
    deleted_by: null,
    deleted_at: null,
    created_at: "2026-05-25T17:00:00.000Z",
    updated_at: "2026-05-25T17:00:00.000Z",
    ...overrides,
  };
}

function sendAttemptFixture(overrides: Record<string, unknown> = {}) {
  return {
    id: "attempt-1",
    conversation_id: "conv-1",
    reply_text: "Attempt ready.",
    approved_by: "advisor-1",
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
    attempt_count: 0,
    next_retry_at: null,
    last_attempted_at: null,
    sent_at: null,
    idempotency_key: "attempt-key",
    created_at: "2026-05-25T17:00:00.000Z",
    updated_at: "2026-05-25T17:00:00.000Z",
    ...overrides,
  };
}

type TestElement = {
  type?: unknown;
  props: {
    "aria-label"?: string;
    children?: unknown;
    onClick?: () => void;
  };
};

function findButton(node: unknown, label: string): TestElement {
  const button = findElements(node, "button").find((element) =>
    textContent(element).includes(label),
  );
  if (!button) throw new Error(`No button found for ${label}`);
  return button;
}

function findElementByAriaLabel(node: unknown, label: string): TestElement {
  const element = findAllElements(node).find((candidate) => candidate.props["aria-label"] === label);
  if (!element) throw new Error(`No element found for ${label}`);
  return element;
}

function findElements(node: unknown, type: string): TestElement[] {
  return findAllElements(node).filter((element) => element.type === type);
}

function findAllElements(node: unknown): TestElement[] {
  if (!node || typeof node !== "object") return [];

  const element = node as TestElement;
  const children = element.props?.children;
  const stack = Array.isArray(children) ? children : [children];

  return element.props ? [element, ...stack.flatMap(findAllElements)] : [];
}

function textContent(node: unknown): string {
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (!node || typeof node !== "object") return "";
  const children = (node as TestElement).props?.children;
  if (Array.isArray(children)) return children.map(textContent).join("");
  return textContent(children);
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
        if (id === "lucide-react") return lucideMock;
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
