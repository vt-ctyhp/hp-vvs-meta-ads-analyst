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

const { LeadNudge } = loadModule("src/components/v2/inbox/lead-nudge.tsx") as {
  LeadNudge: (p: Record<string, unknown>) => React.ReactElement | null;
};

test("renders plural copy and a link to the team view", () => {
  const markup = renderToStaticMarkup(React.createElement(LeadNudge, { teammatesOverSla: 3 }));
  assert.match(markup, /3 teammates over SLA today/);
  assert.match(markup, /view team/);
  assert.match(markup, /href="\/m\/inbox\/team"/);
});

test("uses singular copy for exactly one teammate", () => {
  const markup = renderToStaticMarkup(React.createElement(LeadNudge, { teammatesOverSla: 1 }));
  assert.match(markup, /1 teammate over SLA today/);
});

test("renders nothing when count is 0", () => {
  const markup = renderToStaticMarkup(React.createElement(LeadNudge, { teammatesOverSla: 0 }));
  assert.equal(markup, "");
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
