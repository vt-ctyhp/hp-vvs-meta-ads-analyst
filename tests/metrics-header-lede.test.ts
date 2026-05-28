import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import test from "node:test";
import * as ts from "typescript";

const require = createRequire(import.meta.url);
const React = require("react");

const { selectLede, formatTrendDelta } = loadModule(
  "src/components/v2/inbox/metrics-header-lede.tsx",
) as {
  selectLede: (m: unknown) => string;
  formatTrendDelta: (todaySec: number | null, yesterdaySec: number | null) => string;
};

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

test("Normal state names needs-reply, urgent count, trend, and encouragement", () => {
  const lede = selectLede(metrics());
  assert.match(lede, /6 of your 50 need a reply/);
  assert.match(lede, /2 are urgent/);
  assert.match(lede, /down 15/); // (3900-3000)/60 = 15 min improvement
  assert.match(lede, /Keep going/);
});

test("All caught up when needsReply == 0 during hours", () => {
  const lede = selectLede(metrics({ pipeline: { assigned: 50, needsReply: 0, atRisk: 0 } }));
  assert.match(lede, /All caught up\. 14 replies sent today\./);
});

test("Slow start when repliesSent == 0 during hours", () => {
  const lede = selectLede(metrics({ today: { avgResponseSec: null, onTimeRate: null, repliesSent: 0 } }));
  assert.match(lede, /Day's open\. 6 of your 50 need a reply\./);
});

test("Before hours references yesterday's carryover", () => {
  const lede = selectLede(metrics({ windowState: "before_hours", pipeline: { assigned: 50, needsReply: 4, atRisk: 0 } }));
  assert.match(lede, /Business hours start at 10\. 4 from yesterday still need a reply\./);
});

test("After hours summarizes the day", () => {
  const lede = selectLede(metrics({ windowState: "after_hours", today: { avgResponseSec: 3000, onTimeRate: 0.9, repliesSent: 12 } }));
  assert.match(lede, /Day's done\. 12 replies sent, 90% on-time\. See you tomorrow\./);
});

test("Trend delta suppressed below 10 minutes", () => {
  assert.equal(formatTrendDelta(3000, 3500), ""); // 8.3 min < 10 → no delta
  assert.equal(formatTrendDelta(3000, 3600), "down 10"); // exactly 10 → shown
  assert.equal(formatTrendDelta(3600, 3000), "up 10");
  assert.equal(formatTrendDelta(3000, null), "");
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
