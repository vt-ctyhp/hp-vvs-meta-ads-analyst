import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { createRequire } from "node:module";
import { runInNewContext } from "node:vm";
import test from "node:test";

import * as ts from "typescript";

const require = createRequire(import.meta.url);
const React = require("react");
const { renderToStaticMarkup } = require("react-dom/server");

const {
  InboxEyebrow,
  formatLastSyncLabel,
} = loadModule("src/components/v2/inbox/inbox-eyebrow.tsx") as {
  InboxEyebrow: (props: Record<string, unknown>) => React.ReactElement;
  formatLastSyncLabel: (syncRun: unknown, now?: Date | number) => string;
};
const { InboxStatusSentence } = loadModule(
  "src/components/v2/inbox/inbox-status-sentence.tsx",
) as {
  InboxStatusSentence: (props: Record<string, unknown>) => React.ReactElement;
};
const { InboxLayoutShell } = loadModule(
  "src/components/v2/inbox/inbox-layout-shell.tsx",
) as {
  InboxLayoutShell: (props: Record<string, unknown>) => React.ReactElement;
};
const { InboxHealthRow } = loadModule("src/components/v2/inbox/inbox-health-row.tsx") as {
  InboxHealthRow: (props: Record<string, unknown>) => React.ReactElement | null;
};

test("InboxEyebrow renders the five real manager metrics and sync freshness", () => {
  const markup = renderToStaticMarkup(
    React.createElement(InboxEyebrow, {
      dashboard: dashboardFixture({
        needsReply: 9,
        unassigned: 6,
        staleConversations: 3,
        medianFirstResponseMinutes: 8,
        averageQaScore: 4.34,
      }),
      syncRun: syncRunFixture({
        completed_at: "2026-05-25T16:56:00.000Z",
        status: "success",
      }),
      now: new Date("2026-05-25T17:00:00.000Z"),
      onSync: () => {},
      isSyncing: false,
      syncDisabled: false,
    }),
  );

  assert.match(markup, /Needs reply/);
  assert.match(markup, /data-metric="needs-reply"[^>]*data-tone="ink"[^>]*>9</);
  assert.match(markup, /data-metric="unassigned"[^>]*data-tone="ink"[^>]*>6</);
  assert.match(markup, /data-metric="stale"[^>]*data-tone="warning"[^>]*>3</);
  assert.match(markup, /data-metric="median-first"[^>]*>8m</);
  assert.match(markup, /data-metric="qa-avg"[^>]*data-tone="positive"[^>]*>4\.3</);
  assert.match(markup, /Last sync · 4 min ago · success/);
  assert.match(markup, />Sync Inbox</);
  assert.doesNotMatch(markup, /SLA breach|Advisors|View team/);
});

test("InboxEyebrow renders null metric values as unavailable and invokes sync", () => {
  let syncCalls = 0;
  const props = {
    dashboard: dashboardFixture({
      staleConversations: 0,
      medianFirstResponseMinutes: null,
      averageQaScore: null,
    }),
    syncRun: syncRunFixture({
      completed_at: "2026-05-25T16:56:00.000Z",
      status: "partial",
    }),
    now: new Date("2026-05-25T17:00:00.000Z"),
    onSync: () => {
      syncCalls += 1;
    },
    isSyncing: false,
    syncDisabled: false,
  };

  const markup = renderToStaticMarkup(React.createElement(InboxEyebrow, props));
  assert.match(markup, /data-metric="stale"[^>]*data-tone="ink"[^>]*>0</);
  assert.equal((markup.match(/>—</g) || []).length, 2);

  const button = findElement(InboxEyebrow(props), "button");
  assert.equal(typeof button.props.onClick, "function");
  button.props.onClick?.();
  assert.equal(syncCalls, 1);
});

test("InboxEyebrow loading state matches the sync action vocabulary", () => {
  const markup = renderToStaticMarkup(
    React.createElement(InboxEyebrow, {
      dashboard: dashboardFixture(),
      syncRun: null,
      onSync: () => {},
      isSyncing: true,
      syncDisabled: false,
    }),
  );

  assert.match(markup, />Syncing</);
  assert.match(markup, /disabled=""/);
  assert.equal(formatLastSyncLabel(null), "Last sync · unavailable");
});

test("InboxStatusSentence renders computeInboxHighlights output on one line", () => {
  const cases = [
    [[], /Inbox is empty for the current connection/],
    [[queueItem({ id: "n1", status: "Needs reply" })], /1 needing reply/],
    [
      [
        queueItem({ id: "s1", status: "Synced" }),
        queueItem({ id: "n1", status: "Needs reply" }),
      ],
      /1 needing reply/,
    ],
    [
      [
        queueItem({ id: "s1", status: "Synced" }),
        queueItem({ id: "s2", status: "Synced" }),
      ],
      /2 threads, all caught up/,
    ],
  ] as const;

  for (const [queue, expected] of cases) {
    const markup = renderToStaticMarkup(
      React.createElement(InboxStatusSentence, { queue }),
    );
    assert.match(markup, expected);
    assert.match(markup, /border-b border-hp-rule/);
  }
});

test("InboxLayoutShell renders queue and conversation slots in the shell grid", () => {
  const markup = renderToStaticMarkup(
    React.createElement(InboxLayoutShell, {
      queue: React.createElement("p", null, "Queue slot"),
      conversation: React.createElement("p", null, "Conversation slot"),
      drawer: React.createElement("p", null, "Drawer slot"),
    }),
  );

  assert.match(markup, /data-component="inbox-layout-shell"/);
  assert.match(markup, /xl:grid-cols-\[400px_minmax\(0,1fr\)\]/);
  assert.match(markup, /data-slot="queue"[\s\S]*Queue slot/);
  assert.match(markup, /data-slot="conversation"[\s\S]*Conversation slot/);
  assert.match(markup, /Drawer slot/);
});

test("InboxHealthRow renders nothing when inbox and sync health are green", () => {
  const markup = renderToStaticMarkup(
    React.createElement(InboxHealthRow, {
      status: statusFixture(),
      syncRun: syncRunFixture({ status: "success" }),
    }),
  );

  assert.equal(markup, "");
});

test("InboxHealthRow renders social inbox read failures with status pills", () => {
  const markup = renderToStaticMarkup(
    React.createElement(InboxHealthRow, {
      status: statusFixture({
        readiness: { socialInbox: false },
        permissions: {
          socialInbox: { missing: ["pages_messaging"] },
        },
      }),
      syncRun: syncRunFixture(),
    }),
  );

  assert.match(markup, /Inbox can&#x27;t read Meta messages/);
  assert.match(markup, /data-component="inbox-health-row"/);
  assert.match(markup, /data-status-pill="inbox-read"[^>]*data-tone="warning"[\s\S]*>Blocked</);
  assert.match(markup, /data-status-pill="replies"[^>]*data-tone="positive"[\s\S]*>Ready</);
  assert.match(markup, />Show details</);
  assert.doesNotMatch(markup, /Meta Integration Status/);
});

test("InboxHealthRow uses permission headline when replies are blocked", () => {
  const markup = renderToStaticMarkup(
    React.createElement(InboxHealthRow, {
      status: statusFixture({
        readiness: { socialReply: false },
        permissions: {
          socialReply: { missing: ["pages_manage_metadata", "instagram_manage_messages"] },
        },
      }),
      syncRun: syncRunFixture(),
    }),
  );

  assert.match(markup, /2 permissions missing for replies/);
  assert.match(markup, /data-status-pill="inbox-read"[^>]*data-tone="positive"[\s\S]*>Ready</);
  assert.match(markup, /data-status-pill="replies"[^>]*data-tone="warning"[\s\S]*>Limited</);
});

test("InboxHealthRow uses connection headline for missing env and failed sync", () => {
  const missingEnvMarkup = renderToStaticMarkup(
    React.createElement(InboxHealthRow, {
      status: statusFixture({ missingEnv: ["META_ACCESS_TOKEN"] }),
      syncRun: syncRunFixture(),
    }),
  );
  assert.match(missingEnvMarkup, /Inbox connection issue/);
  assert.match(missingEnvMarkup, /META_ACCESS_TOKEN/);

  const failedSyncMarkup = renderToStaticMarkup(
    React.createElement(InboxHealthRow, {
      status: statusFixture(),
      syncRun: syncRunFixture({
        status: "failed",
        errors: ["Meta timeout"],
      }),
    }),
  );
  assert.match(failedSyncMarkup, /Inbox connection issue/);
  assert.match(failedSyncMarkup, /Last sync failed/);
});

test("InboxHealthRow toggle reveals readiness and sync details", () => {
  const harness = loadHealthRowHarness();
  const props = {
    status: statusFixture({
      readiness: { socialReply: false },
      permissions: {
        socialReply: {
          missing: ["instagram_manage_messages"],
          warnings: ["Instagram reply token expires soon."],
        },
      },
    }),
    syncRun: syncRunFixture({
      status: "failed",
      completed_at: "2026-05-25T17:00:00.000Z",
      metrics: { threads: 3, messages: 4, comments: 2 },
      errors: ["Meta timeout"],
    }),
  };

  let tree = harness.render(props);
  assert.match(textContent(tree), /Show details/);
  assert.doesNotMatch(textContent(tree), /Meta Integration Status/);

  buttonByText(tree, "Show details").props.onClick?.();
  tree = harness.render(props);

  assert.match(textContent(tree), /Hide details/);
  assert.match(textContent(tree), /Meta Integration Status/);
  assert.match(textContent(tree), /Remaining Setup/);
  assert.match(textContent(tree), /instagram_manage_messages/);
  assert.match(textContent(tree), /Instagram reply token expires soon\./);
  assert.match(textContent(tree), /Last sync failed/);
  assert.match(textContent(tree), /Threads3/);
  assert.match(textContent(tree), /First errorMeta timeout/);
});

function dashboardFixture(overrides: Record<string, unknown> = {}) {
  return {
    metrics: {
      totalConversations: 12,
      needsReply: 0,
      unassigned: 0,
      missedFollowUps: 0,
      staleConversations: 0,
      failedSends: 0,
      retryBacklog: 0,
      missingLeadQuality: 0,
      closeoutIncomplete: 0,
      qaScorecardsReviewed: 0,
      averageQaScore: 4,
      labelCompletenessPercent: 100,
      averageFirstResponseMinutes: 12,
      medianFirstResponseMinutes: 10,
      ...overrides,
    },
  };
}

function syncRunFixture(overrides: Record<string, unknown> = {}) {
  return {
    id: "sync-1",
    trigger: "manual",
    status: "success",
    started_at: "2026-05-25T16:55:00.000Z",
    completed_at: "2026-05-25T16:56:00.000Z",
    metrics: {},
    errors: [],
    ...overrides,
  };
}

function statusFixture(overrides: Record<string, unknown> = {}) {
  const {
    readiness: readinessInput = {},
    permissions: permissionsInput = {},
    ...rest
  } = overrides;
  const readinessOverrides = readinessInput as Record<string, unknown>;
  const permissionOverrides = permissionsInput as Record<string, unknown>;
  return {
    ok: true,
    missingEnv: [],
    accounts: [
      {
        brandCode: "HP",
        accountId: "act-1",
        ok: true,
        name: "HP Meta",
        accountStatus: 1,
      },
    ],
    readiness: {
      adsSync: true,
      socialInbox: true,
      socialReply: true,
      ...readinessOverrides,
    },
    permissions: {
      granted: ["pages_messaging", "instagram_manage_messages"],
      forbiddenGranted: [],
      adsSync: permissionBlock(),
      socialInbox: permissionBlock(),
      socialReply: permissionBlock(),
      ...permissionOverrides,
    },
    error: null,
    ...rest,
  };
}

function permissionBlock(overrides: Record<string, unknown> = {}) {
  return {
    ok: true,
    required: [],
    missing: [],
    optionalMissing: [],
    warnings: [],
    ...overrides,
  };
}

function queueItem(overrides: Record<string, unknown>) {
  return {
    id: "item",
    status: "Synced",
    ...overrides,
  };
}

type TestElement = {
  type?: unknown;
  props: {
    children?: unknown;
    onClick?: () => void;
  };
};

function loadHealthRowHarness() {
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

  const healthRowModule = loadModule("src/components/v2/inbox/inbox-health-row.tsx", {
    react: fakeReact,
  }) as {
    InboxHealthRow: (props: Record<string, unknown>) => TestElement | null;
  };

  return {
    render(props: Record<string, unknown>) {
      cursor = 0;
      return materialize(healthRowModule.InboxHealthRow(props)) as TestElement;
    },
  };
}

function buttonByText(tree: TestElement, label: string) {
  const button = elementsByType(tree, "button").find((node) => textContent(node).includes(label));
  if (!button) throw new Error(`No button found for ${label}`);
  return button;
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
        if (id === "lucide-react") {
          return new Proxy(
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
        }
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
