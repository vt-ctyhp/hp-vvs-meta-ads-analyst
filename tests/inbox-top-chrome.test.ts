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
    [[queueItem({ id: "u1", status: "Unread" })], /1 unread/],
    [[queueItem({ id: "n1", status: "Needs reply" })], /1 needing reply/],
    [
      [
        queueItem({ id: "u1", status: "Unread" }),
        queueItem({ id: "n1", status: "Needs reply" }),
      ],
      /1 unread<\/span><span class="text-hp-muted"> · <\/span><span data-tone="warning"/,
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
        if (id === "lucide-react") {
          return {
            RefreshCw: ({ className }: { className?: string }) =>
              React.createElement("svg", { className, "aria-hidden": "true" }),
          };
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
