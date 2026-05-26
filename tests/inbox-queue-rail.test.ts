import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { createRequire } from "node:module";
import { runInNewContext } from "node:vm";
import test from "node:test";

import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import * as ts from "typescript";

import { useInboxFilters } from "../src/components/v2/inbox/use-inbox-filters.ts";
import type { QueueCategoryFilter } from "../src/components/v2/inbox/use-inbox-filters.ts";
import type { MetaInboxQueueDisplayItem } from "../src/lib/meta-inbox-queue-view.ts";
import type { MetaInboxQueueCategoryKey } from "../src/lib/meta-inbox-vocabulary.ts";
import type { SocialInboxData } from "../src/lib/social-inbox.ts";

const require = createRequire(import.meta.url);

const lucideMock = new Proxy(
  {},
  {
    get: (_target, key) => {
      if (key === "__esModule") return false;
      return ({ className }: { className?: string }) =>
        React.createElement("svg", { className, "aria-hidden": "true" });
    },
  },
);

const {
  QueueRail,
  QueueRow,
  visibleQueueCategories,
} = loadModule("src/components/v2/inbox/queue-rail.tsx") as {
  QueueRail: (props: Record<string, unknown>) => React.ReactElement;
  QueueRow: (props: Record<string, unknown>) => React.ReactElement;
  visibleQueueCategories: (
    data: Pick<SocialInboxData, "queueAccess">,
  ) => readonly { key: string; label: string }[];
};

test("QueueRow exposes needs-reply, over-SLA, active, and default visual modes", () => {
  const now = new Date("2026-05-25T12:00:00.000Z");

  const needsReply = renderToStaticMarkup(
    React.createElement(QueueRow, {
      item: itemFixture({
        id: "needs",
        sender: "Ada Customer",
        status: "Needs reply",
        conversationStatus: "needs_reply",
        timestamp: "2026-05-25T10:00:00.000Z",
      }),
      active: false,
      now,
      onSelect: () => {},
    }),
  );
  assert.match(needsReply, /data-visual-mode="needs-reply"/);
  assert.match(needsReply, /data-over-sla="false"/);
  assert.match(needsReply, /data-label-tone="pink"/);
  assert.match(needsReply, />Needs reply</);

  const overSla = renderToStaticMarkup(
    React.createElement(QueueRow, {
      item: itemFixture({
        id: "over",
        sender: "Ben Late",
        status: "Needs reply",
        conversationStatus: "needs_reply",
        timestamp: "2026-05-24T08:00:00.000Z",
      }),
      active: false,
      now,
      onSelect: () => {},
    }),
  );
  assert.match(overSla, /data-visual-mode="needs-reply"/);
  assert.match(overSla, /data-over-sla="true"/);
  assert.match(overSla, /data-label-tone="warning"/);
  assert.match(overSla, />↑ Over SLA</);
  assert.doesNotMatch(overSla, />Needs reply</);

  const active = renderToStaticMarkup(
    React.createElement(QueueRow, {
      item: itemFixture({
        id: "active",
        sender: "Cora Active",
        status: "Needs reply",
        conversationStatus: "needs_reply",
        timestamp: "2026-05-24T08:00:00.000Z",
      }),
      active: true,
      now,
      onSelect: () => {},
    }),
  );
  assert.match(active, /data-visual-mode="active"/);
  assert.match(active, /data-active="true"/);

  const resolved = renderToStaticMarkup(
    React.createElement(QueueRow, {
      item: itemFixture({
        id: "resolved",
        sender: "Rae Resolved",
        status: "Synced",
        conversationStatus: "waiting_on_customer",
      }),
      active: false,
      now,
      onSelect: () => {},
    }),
  );
  assert.match(resolved, /data-visual-mode="default"/);
  assert.match(resolved, /data-over-sla="false"/);
  assert.match(resolved, /data-label-tone="none"/);
  assert.doesNotMatch(resolved, /Needs reply|Over SLA/);
});

test("QueueRail renders admin and team-scoped category options", () => {
  const adminMarkup = renderToStaticMarkup(
    React.createElement(QueueRail, {
      queue: queueFixture(),
      selectedId: null,
      query: "",
      onQueryChange: () => {},
      queueCategoryFilter: "all",
      onQueueCategoryChange: () => {},
      queueCategories: visibleQueueCategories(dataAccessFixture("all")),
      onSelect: () => {},
      now: new Date("2026-05-25T12:00:00.000Z"),
    }),
  );

  assert.match(adminMarkup, />All categories</);
  for (const label of [
    "Cash for Gold",
    "Book Appointment",
    "US Product",
    "VN Product",
    "Custom Jewelry",
    "Repair / Service",
    "General Inquiry",
    "Uncategorized / Needs Review",
  ]) {
    assert.match(adminMarkup, new RegExp(`>${escapeRegExp(label)}<`));
  }

  const teamMarkup = renderToStaticMarkup(
    React.createElement(QueueRail, {
      queue: queueFixture(),
      selectedId: null,
      query: "",
      onQueryChange: () => {},
      queueCategoryFilter: "all",
      onQueueCategoryChange: () => {},
      queueCategories: visibleQueueCategories(
        dataAccessFixture("team", ["cash_for_gold", "book_appointment"]),
      ),
      onSelect: () => {},
      now: new Date("2026-05-25T12:00:00.000Z"),
    }),
  );

  assert.match(teamMarkup, />Cash for Gold</);
  assert.match(teamMarkup, />Book Appointment</);
  assert.doesNotMatch(teamMarkup, />Custom Jewelry</);
  assert.doesNotMatch(teamMarkup, />Repair \/ Service</);
});

test("QueueRail category select drives useInboxFilters and narrows rendered rows", () => {
  const queue = queueFixture();
  const visibleQueueKeys = new Set<MetaInboxQueueCategoryKey>([
    "cash_for_gold",
    "book_appointment",
    "custom_jewelry",
  ]);
  const markup = renderToStaticMarkup(
    React.createElement(function Probe() {
      const filters = useInboxFilters(queue, { visibleQueueKeys });

      if (filters.queueCategoryFilter !== "custom_jewelry") {
        filters.setQueueCategoryFilter("custom_jewelry");
        return React.createElement("div");
      }

      return React.createElement(QueueRail, {
        queue: filters.filteredQueue,
        selectedId: null,
        query: filters.query,
        onQueryChange: filters.setQuery,
        queueCategoryFilter: filters.effectiveQueueCategoryFilter,
        onQueueCategoryChange: filters.setQueueCategoryFilter,
        queueCategories: visibleQueueCategories(dataAccessFixture("all")),
        onSelect: () => {},
        now: new Date("2026-05-25T12:00:00.000Z"),
      });
    }),
  );

  assert.match(markup, /Cora Custom/);
  assert.doesNotMatch(markup, /Ada Cash|Ben Booker/);
  assert.match(markup, /1 conversation · Sorted by age/);

  let selected: QueueCategoryFilter | null = null;
  const select = findElement(
    QueueRail({
      queue,
      selectedId: null,
      query: "",
      onQueryChange: () => {},
      queueCategoryFilter: "all",
      onQueueCategoryChange: (value: QueueCategoryFilter) => {
        selected = value;
      },
      queueCategories: visibleQueueCategories(dataAccessFixture("all")),
      onSelect: () => {},
      now: new Date("2026-05-25T12:00:00.000Z"),
    }),
    "select",
  );

  const onChange = select.props.onChange;
  if (typeof onChange !== "function") {
    throw new Error("Queue category select is missing an onChange handler.");
  }
  onChange({ target: { value: "cash_for_gold" } });
  assert.equal(selected, "cash_for_gold");
});

function queueFixture(): MetaInboxQueueDisplayItem[] {
  return [
    itemFixture({
      id: "cash",
      brand: "HP",
      channel: "Instagram",
      platform: "instagram",
      type: "message",
      sender: "Ada Cash",
      preview: "Can you price this necklace?",
      status: "Needs reply",
      conversationStatus: "needs_reply",
      timestamp: "2026-05-25T10:00:00.000Z",
      sourceChannel: "instagram_message",
      queueCategoryKey: "cash_for_gold",
    }),
    itemFixture({
      id: "book",
      brand: "VVS",
      channel: "Facebook",
      platform: "facebook",
      type: "comment",
      sender: "Ben Booker",
      preview: "Need Saturday visit.",
      status: "Unread",
      conversationStatus: "new_inquiry",
      timestamp: "2026-05-25T09:00:00.000Z",
      sourceChannel: "facebook_public_comment",
      queueCategoryKey: "book_appointment",
    }),
    itemFixture({
      id: "custom",
      brand: "HP",
      channel: "Facebook",
      platform: "facebook",
      type: "message",
      sender: "Cora Custom",
      preview: "Can you remake my ring?",
      status: "Synced",
      conversationStatus: "waiting_on_customer",
      timestamp: "2026-05-25T08:00:00.000Z",
      sourceChannel: "facebook_message",
      queueCategoryKey: "custom_jewelry",
    }),
  ];
}

function itemFixture(
  overrides: Partial<MetaInboxQueueDisplayItem> = {},
): MetaInboxQueueDisplayItem {
  return {
    id: "item",
    sourceId: "source",
    channel: "Facebook",
    platform: "facebook",
    brand: "HP",
    type: "message",
    sender: "Customer",
    preview: "Preview",
    status: "Synced",
    time: "1h",
    timestamp: "2026-05-25T11:00:00.000Z",
    sourceChannel: "facebook_message",
    queueCategoryKey: "general_inquiry",
    conversationStatus: "new_inquiry",
    sendEligibility: "unknown",
    replyWindowExpiresAt: null,
    humanAgentWindowExpiresAt: null,
    routingExplanation: null,
    routingConfidence: null,
    inboxConversation: null,
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

function dataAccessFixture(
  mode: "all" | "team",
  allowedQueueCategoryKeys: SocialInboxData["queueAccess"]["allowedQueueCategoryKeys"] = null,
): Pick<SocialInboxData, "queueAccess"> {
  if (mode === "all") {
    return {
      queueAccess: {
        mode: "all",
        allowedQueueCategoryKeys: null,
        reason: "full_access_role",
      },
    };
  }

  return {
    queueAccess: {
      mode: "team",
      allowedQueueCategoryKeys: allowedQueueCategoryKeys || [],
      reason: "team_queue_access",
    },
  };
}

type TestElement = {
  type?: unknown;
  props: {
    children?: unknown;
    onChange?: (event: { target: { value: string } }) => void;
  };
};

function findElement(node: unknown, type: string): TestElement {
  if (!node || typeof node !== "object") {
    throw new Error(`No ${type} element found`);
  }

  const maybeElement = node as TestElement;
  if (maybeElement.type === type) return maybeElement;

  const children = maybeElement.props?.children;
  const stack = Array.isArray(children) ? children : [children];
  for (const child of stack) {
    if (child && typeof child === "object") {
      try {
        return findElement(child, type);
      } catch {
        // Continue searching siblings.
      }
    }
  }

  throw new Error(`No ${type} element found`);
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
