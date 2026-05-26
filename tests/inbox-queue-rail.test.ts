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
import type {
  ItemTypeFilter,
  QueueCategoryFilter,
  SourceChannelFilter,
  StatusFilter,
} from "../src/components/v2/inbox/use-inbox-filters.ts";
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
    React.createElement(QueueRail, queueRailProps({
      queue: queueFixture(),
      queueCategories: visibleQueueCategories(dataAccessFixture("all")),
    })),
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
    React.createElement(QueueRail, queueRailProps({
      queue: queueFixture(),
      queueCategories: visibleQueueCategories(
        dataAccessFixture("team", ["cash_for_gold", "book_appointment"]),
      ),
    })),
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
        ...queueRailProps({
          queue: filters.filteredQueue,
          query: filters.query,
          onQueryChange: filters.setQuery,
          queueCategoryFilter: filters.effectiveQueueCategoryFilter,
          onQueueCategoryChange: filters.setQueueCategoryFilter,
          queueCategories: visibleQueueCategories(dataAccessFixture("all")),
        }),
      });
    }),
  );

  assert.match(markup, /Cora Custom/);
  assert.doesNotMatch(markup, /Ada Cash|Ben Booker/);
  assert.match(markup, /1 conversation · Sorted by age/);

  let selected: QueueCategoryFilter | null = null;
  const select = findElement(
    QueueRail(queueRailProps({
      queue,
      onQueueCategoryChange: (value: QueueCategoryFilter) => {
        selected = value;
      },
    })),
    "select",
  );

  const onChange = select.props.onChange;
  if (typeof onChange !== "function") {
    throw new Error("Queue category select is missing an onChange handler.");
  }
  (onChange as (event: { target: { value: string } }) => void)({
    target: { value: "cash_for_gold" },
  });
  assert.equal(selected, "cash_for_gold");
});

test("QueueRail owns collapsed filter disclosure and dirty reset affordances", () => {
  const cleanMarkup = renderToStaticMarkup(
    React.createElement(QueueRail, queueRailProps({ queue: queueFixture() })),
  );

  assert.match(cleanMarkup, /\+ Filters/);
  assert.match(cleanMarkup, /data-component="queue-filter-disclosure"/);
  assert.doesNotMatch(cleanMarkup, /data-component="queue-filter-disclosure"[^>]*checked/);
  assert.match(cleanMarkup, /3 conversations · Sorted by age/);
  assert.doesNotMatch(cleanMarkup, />Reset</);

  const dirtyMarkup = renderToStaticMarkup(
    React.createElement(
      QueueRail,
      queueRailProps({
        queue: queueFixture().slice(0, 1),
        filtersDirty: true,
      }),
    ),
  );

  assert.match(dirtyMarkup, /1 conversation ·/);
  assert.match(dirtyMarkup, />Reset</);
  assert.doesNotMatch(dirtyMarkup, /Sorted by age/);
});

test("QueueRail disclosure renders the rail-owned filter controls", () => {
  const markup = renderToStaticMarkup(
    React.createElement(
      QueueRail,
      queueRailProps({
        queue: queueFixture(),
        sourceChannelFilter: "instagram_message",
        campaignUmbrellaFilter: "cash-umbrella",
        itemTypeFilter: "messages",
        statusFilter: "needs-reply",
        filtersDirty: true,
      }),
    ),
  );

  assert.match(markup, />Source Channel</);
  assert.match(markup, />Campaign Umbrella</);
  assert.match(markup, />Item Type</);
  assert.match(markup, />Status</);
  assert.match(markup, />Facebook Message</);
  assert.match(markup, />Instagram Message</);
  assert.match(markup, />All Campaign Umbrellas</);
  assert.match(markup, />cash-umbrella</);
  assert.match(markup, />All Items</);
  assert.match(markup, />Messages</);
  assert.match(markup, />Comments</);
  assert.match(markup, />Unread</);
  assert.match(markup, />Needs Reply</);
});

test("QueueRail filter controls call the supplied filter handlers", () => {
  const changes: Record<string, string> = {};
  let reset = false;
  const rail = QueueRail(
    queueRailProps({
      queue: queueFixture(),
      filtersDirty: true,
      onSourceChannelChange: (value: SourceChannelFilter) => {
        changes.sourceChannel = value;
      },
      onCampaignUmbrellaChange: (value: string) => {
        changes.campaignUmbrella = value;
      },
      onItemTypeChange: (value: ItemTypeFilter) => {
        changes.itemType = value;
      },
      onStatusChange: (value: StatusFilter) => {
        changes.status = value;
      },
      onResetFilters: () => {
        reset = true;
      },
    }),
  );

  changeSelect(rail, "Source channel", "instagram_message");
  changeSelect(rail, "Campaign umbrella", "cash-umbrella");
  changeSelect(rail, "Item type", "comments");
  changeSelect(rail, "Status", "unread");
  clickButton(rail, "Reset");

  assert.deepEqual(changes, {
    sourceChannel: "instagram_message",
    campaignUmbrella: "cash-umbrella",
    itemType: "comments",
    status: "unread",
  });
  assert.equal(reset, true);
});

test("QueueRail empty filtered state points to Reset", () => {
  const markup = renderToStaticMarkup(
    React.createElement(
      QueueRail,
      queueRailProps({
        queue: [],
        filtersDirty: true,
      }),
    ),
  );

  assert.match(markup, /No conversations match/);
  assert.match(markup, /Try resetting/);
  assert.match(markup, />Reset</);
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
    "aria-label"?: string;
    ariaLabel?: string;
    children?: unknown;
    onClick?: () => void;
    onChange?: ((event: { target: { value: string } }) => void) | ((value: string) => void);
  };
};

type QueueRailProps = Parameters<typeof QueueRail>[0];

function queueRailProps(overrides: Partial<QueueRailProps> = {}): QueueRailProps {
  return {
    queue: queueFixture(),
    selectedId: null,
    query: "",
    onQueryChange: () => {},
    queueCategoryFilter: "all",
    onQueueCategoryChange: () => {},
    sourceChannelFilter: "all",
    onSourceChannelChange: () => {},
    campaignUmbrellaFilter: "all",
    onCampaignUmbrellaChange: () => {},
    itemTypeFilter: "all",
    onItemTypeChange: () => {},
    statusFilter: "all",
    onStatusChange: () => {},
    attributionFilterOptions: {
      campaignUmbrellas: [["cash-umbrella", "cash-umbrella"]],
      ads: [],
      creatives: [],
    },
    filtersDirty: false,
    onResetFilters: () => {},
    queueCategories: visibleQueueCategories(dataAccessFixture("all")),
    onSelect: () => {},
    now: new Date("2026-05-25T12:00:00.000Z"),
    ...overrides,
  };
}

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

function findElements(node: unknown, type: string): TestElement[] {
  if (!node || typeof node !== "object") return [];

  const maybeElement = node as TestElement;
  const matches = maybeElement.type === type ? [maybeElement] : [];
  const children = maybeElement.props?.children;
  const stack = Array.isArray(children) ? children : [children];

  for (const child of stack) {
    matches.push(...findElements(child, type));
  }

  return matches;
}

function changeSelect(node: unknown, label: string, value: string) {
  const select = findAllElements(node).find(
    (element) => element.props?.["aria-label"] === label || element.props?.ariaLabel === label,
  );
  if (!select?.props.onChange) {
    throw new Error(`No select found for ${label}`);
  }
  if (select.props["aria-label"] === label) {
    (select.props.onChange as (event: { target: { value: string } }) => void)({
      target: { value },
    });
  } else {
    (select.props.onChange as (nextValue: string) => void)(value);
  }
}

function clickButton(node: unknown, label: string) {
  const button = findElements(node, "button").find((element) =>
    textContent(element).includes(label),
  );
  if (!button?.props.onClick) {
    throw new Error(`No button found for ${label}`);
  }
  button.props.onClick();
}

function textContent(node: unknown): string {
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (!node || typeof node !== "object") return "";
  const children = (node as TestElement).props?.children;
  if (Array.isArray(children)) return children.map(textContent).join("");
  return textContent(children);
}

function findAllElements(node: unknown): TestElement[] {
  if (!node || typeof node !== "object") return [];

  const element = node as TestElement;
  const children = element.props?.children;
  const stack = Array.isArray(children) ? children : [children];

  return element.props ? [element, ...stack.flatMap(findAllElements)] : [];
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
