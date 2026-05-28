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

const { ReadOnlyProvider, useReadOnly } = loadModule(
  "src/components/v2/inbox/read-only-context.tsx",
) as {
  ReadOnlyProvider: (props: Record<string, unknown>) => React.ReactElement;
  useReadOnly: () => boolean;
};

function Probe() {
  return React.createElement("span", null, useReadOnly() ? "readonly" : "editable");
}

test("useReadOnly defaults to false outside a provider", () => {
  const markup = renderToStaticMarkup(React.createElement(Probe));
  assert.match(markup, /editable/);
});

test("ReadOnlyProvider value=true makes useReadOnly true", () => {
  const markup = renderToStaticMarkup(
    React.createElement(ReadOnlyProvider, { value: true }, React.createElement(Probe)),
  );
  assert.match(markup, /readonly/);
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
