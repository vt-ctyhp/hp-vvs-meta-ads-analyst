import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import test from "node:test";
import * as ts from "typescript";

const require = createRequire(import.meta.url);
const React = require("react");
const { renderToStaticMarkup } = require("react-dom/server");

const { InboxMetricsHeaderStrip } = loadModule(
  "src/components/v2/inbox/metrics-header-strip.tsx",
) as { InboxMetricsHeaderStrip: (p: Record<string, unknown>) => React.ReactElement };

function metrics(overrides: Record<string, unknown> = {}) {
  return {
    windowState: "open",
    user: { id: "u", timezone: "America/Los_Angeles", businessSecondsRemainingToday: 15480 },
    pipeline: { assigned: 50, needsReply: 6, atRisk: 2 },
    today: { avgResponseSec: 3000, onTimeRate: 0.92, repliesSent: 14 },
    yesterday: { avgResponseSec: 3900 },
    team: { unassigned: 8, claimedByMe: 3, todayUnassignedDenominator: 10, oldestUnassignedSec: 2820 },
    ...overrides,
  };
}

const syncRun = { id: "s", trigger: "manual", status: "success", started_at: "2026-05-27T18:58:00Z", completed_at: "2026-05-27T18:58:00Z", metrics: {}, errors: [] };

test("renders the stat strip and the absorbed sync button", () => {
  const markup = renderToStaticMarkup(
    React.createElement(InboxMetricsHeaderStrip, {
      metrics: metrics(),
      onSync: () => {},
      isSyncing: false,
      syncDisabled: false,
      syncRun,
      now: new Date("2026-05-27T19:00:00Z"),
    }),
  );
  assert.match(markup, /On time/);
  assert.match(markup, /92%/);
  assert.match(markup, /Sent/);
  assert.match(markup, />14</);
  assert.match(markup, /Team Q/);
  assert.match(markup, /8 waiting/);
  assert.match(markup, /claimed/);
  assert.match(markup, /3/);
  assert.match(markup, /Oldest in queue/);
  assert.match(markup, /47m/); // 2820s = 47 min
  assert.match(markup, /Last sync/); // freshness label present
  assert.match(markup, /button/); // sync affordance present
});

test("at-risk number uses the warning (pink) tone", () => {
  const markup = renderToStaticMarkup(
    React.createElement(InboxMetricsHeaderStrip, {
      metrics: metrics(),
      onSync: () => {}, isSyncing: false, syncDisabled: false, syncRun,
      now: new Date("2026-05-27T19:00:00Z"),
    }),
  );
  assert.match(markup, /text-signal-warning/);
});

test("hides the You-claimed stat when denominator is 0", () => {
  const markup = renderToStaticMarkup(
    React.createElement(InboxMetricsHeaderStrip, {
      metrics: metrics({ team: { unassigned: 8, claimedByMe: 0, todayUnassignedDenominator: 0, oldestUnassignedSec: 2820 } }),
      onSync: () => {}, isSyncing: false, syncDisabled: false, syncRun,
      now: new Date("2026-05-27T19:00:00Z"),
    }),
  );
  assert.doesNotMatch(markup, /claimed/);
});

test("strip uses flex-wrap so stats reflow on narrow viewports", () => {
  const markup = renderToStaticMarkup(
    React.createElement(InboxMetricsHeaderStrip, {
      metrics: metrics(), onSync: () => {}, isSyncing: false, syncDisabled: false, syncRun,
      now: new Date("2026-05-27T19:00:00Z"),
    }),
  );
  assert.match(markup, /flex-wrap/);
});

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
