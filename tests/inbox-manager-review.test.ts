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

const { ManagerReview } = loadModule("src/components/v2/inbox/manager-review.tsx") as {
  ManagerReview: (props: Record<string, unknown>) => React.ReactElement;
};

test("ManagerReview owners tab resolves assignee names and falls back to the label", () => {
  const markup = renderToStaticMarkup(
    React.createElement(ManagerReview, {
      dashboard: dashboardFixture(),
      names: { "uuid-joanna": "Joanna Pham" },
    }),
  );

  // Tabs render; owners is the default view.
  assert.match(markup, />Owners</);
  assert.match(markup, />Attribution</);
  assert.match(markup, /38 awaiting reply across 3 owners/);
  assert.match(markup, /213 unassigned/);

  // Mapped id resolves to a name; unmapped id falls back to its label.
  assert.match(markup, /Joanna Pham/);
  assert.match(markup, /1a2b3c4d…/);
  assert.doesNotMatch(markup, /uuid-joanna/);

  // Unassigned row is flagged.
  assert.match(markup, /Unassigned/);
  assert.match(markup, /needs routing/);
});

test("ManagerReview owners tab degrades to an empty state with no assignees", () => {
  const markup = renderToStaticMarkup(
    React.createElement(ManagerReview, {
      dashboard: dashboardFixture({ byAssignee: [] }),
      names: {},
    }),
  );
  assert.match(markup, /No assigned conversations in this window/);
});

function dashboardFixture(overrides: Record<string, unknown> = {}) {
  return {
    range: { label: "Last 7 days", startAt: "", endAt: "", days: 7 },
    metrics: {
      totalConversations: 263,
      needsReply: 38,
      unassigned: 213,
      missedFollowUps: 12,
      staleConversations: 151,
      failedSends: 4,
      retryBacklog: 2,
      missingLeadQuality: 47,
      closeoutIncomplete: 9,
      qaScorecardsReviewed: 18,
      averageQaScore: 4.2,
      labelCompletenessPercent: 82,
      averageFirstResponseMinutes: 221,
      medianFirstResponseMinutes: 204,
    },
    responseAgeBuckets: [
      { key: "under_1h", label: "< 1h", count: 9 },
      { key: "over_24h", label: "> 24h", count: 6 },
    ],
    byQueue: [
      { queueCategoryKey: "cash_for_gold", label: "Cash for Gold", totalConversations: 96, needsReply: 14, missedFollowUps: 4, failedSends: 1 },
    ],
    byAssignee: [
      { assigneeUserId: null, label: "Unassigned", totalConversations: 213, needsReply: 18, missedFollowUps: 5, failedSends: 1, averageFirstResponseMinutes: null },
      { assigneeUserId: "uuid-joanna", label: "1a2b3c4d…", totalConversations: 21, needsReply: 7, missedFollowUps: 2, failedSends: 1, averageFirstResponseMinutes: 142 },
      { assigneeUserId: "uuid-marco", label: "1a2b3c4d…", totalConversations: 12, needsReply: 5, missedFollowUps: 2, failedSends: 1, averageFirstResponseMinutes: 268 },
    ],
    bySourceChannel: [],
    byOutcome: [],
    byCampaignUmbrella: [],
    byAd: [],
    byCreative: [],
    ...overrides,
  };
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
