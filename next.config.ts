import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";

import type { NextConfig } from "next";

/**
 * Find the nearest ancestor directory that has a `node_modules`. When the
 * project is checked out as a git worktree, the worktree itself has no
 * `node_modules` — install lives in the parent repo. Turbopack rejects
 * symlinks that escape its root, so we widen the root instead.
 */
function findWorkspaceRoot(start: string): string {
  let dir = start;
  while (true) {
    if (existsSync(resolve(dir, "node_modules"))) return dir;
    const parent = dirname(dir);
    if (parent === dir) return start;
    dir = parent;
  }
}

const nextConfig: NextConfig = {
  devIndicators: false,
  turbopack: {
    root: findWorkspaceRoot(process.cwd()),
  },
};

export default nextConfig;
