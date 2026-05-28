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

const { TeamMetricsTable } = loadModule("src/components/v2/inbox/team-metrics-table.tsx") as {
  TeamMetricsTable: (p: Record<string, unknown>) => React.ReactElement;
};

function row(overrides = {}) {
  return {
    userId: "11111111-1111-4111-8111-111111111111",
    name: "Ana", role: "member",
    assigned: 12, needsReply: 4, atRisk: 2,
    avgResponseSec: 1800, onTimeRate: 0.75, repliesSent: 9,
    teamClaims: 3, oldestUnansweredSec: 5400,
    lastActiveAt: new Date("2026-05-27T18:00:00Z"),
    ...overrides,
  };
}

test("renders all ten columns and a full-report link per row", () => {
  const markup = renderToStaticMarkup(
    React.createElement(TeamMetricsTable, { rows: [row()], period: "today" }),
  );
  for (const head of ["Name", "Open", "Needs reply", "At risk", "Avg first", "On time", "Replies", "Claims", "Oldest", "Last active"]) {
    assert.match(markup, new RegExp(head));
  }
  assert.match(markup, /Ana/);
  assert.match(markup, /30m/);   // 1800s avg
  assert.match(markup, /75%/);   // on-time
  assert.match(markup, /text-signal-warning/); // at-risk pink
  assert.match(markup, /href="\/m\/inbox\/team\/11111111-1111-4111-8111-111111111111"/);
  assert.match(markup, /Full report/);
});

test("renders the distinct empty state when there are no rows", () => {
  const markup = renderToStaticMarkup(
    React.createElement(TeamMetricsTable, { rows: [], period: "today" }),
  );
  assert.match(markup, /No team members yet/);
  assert.doesNotMatch(markup, /Full report/);
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
        if (id === "next/link") {
          return {
            __esModule: true,
            default: ({ href, children, ...rest }: { href: string; children?: unknown }) =>
              React.createElement("a", { href, ...rest }, children),
          };
        }
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
