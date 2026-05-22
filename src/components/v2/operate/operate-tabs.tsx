"use client";

import Link from "next/link";

/**
 * Child-route navigator for the Operate room.
 */

export type OperateTab = "pipelines" | "coverage" | "health" | "users";

const TABS: Array<{ key: OperateTab; href: string; label: string; description: string }> = [
  { key: "pipelines", href: "/operate/pipelines", label: "Pipelines", description: "Sync runs + backfill jobs + manual sync" },
  { key: "coverage", href: "/operate/coverage", label: "Coverage", description: "Monthly backfill sync, Supabase load, and lock status" },
  { key: "health", href: "/operate/health", label: "Health", description: "Meta token, env fence, module credentials, sync freshness" },
  { key: "users", href: "/operate/users", label: "Users", description: "Read-only roster from the analytics identity view" },
];

export function OperateTabs({ active }: { active: OperateTab }) {
  return (
    <nav
      aria-label="Operate tabs"
      className="flex flex-wrap items-center gap-1 rounded-xl border border-stone-200 bg-white p-1 text-sm font-medium"
    >
      {TABS.map((tab) => {
        const isActive = tab.key === active;
        return (
          <Link
            key={tab.key}
            href={tab.href}
            title={tab.description}
            aria-current={isActive ? "page" : undefined}
            className={[
              "inline-flex h-9 items-center rounded-lg px-3 transition-colors",
              isActive
                ? "bg-stone-900 text-stone-50 shadow-sm"
                : "text-stone-700 hover:bg-stone-100",
            ].join(" ")}
          >
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}
