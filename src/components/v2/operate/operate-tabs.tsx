"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { useMemo } from "react";

/**
 * URL-driven tab navigator for the Operate room.
 *
 * Persists the selected tab in ?tab so links and refreshes are shareable
 * and the server page can render the right panel without client-side
 * routing.
 */

export type OperateTab = "pipelines" | "coverage" | "health" | "people";

const TABS: Array<{ key: OperateTab; label: string; description: string }> = [
  { key: "pipelines", label: "Pipelines", description: "Sync runs + backfill jobs + manual sync" },
  { key: "coverage", label: "Coverage", description: "Historical insight coverage by month and account" },
  { key: "health", label: "Health", description: "Meta token, env fence, module credentials, sync freshness" },
  { key: "people", label: "People", description: "Read-only roster from the analytics identity view" },
];

export function OperateTabs({ active }: { active: OperateTab }) {
  const pathname = usePathname() ?? "/operate";
  const params = useSearchParams();

  const buildHref = useMemo(
    () => (tab: OperateTab) => {
      const next = new URLSearchParams(params.toString());
      next.set("tab", tab);
      return `${pathname}?${next.toString()}`;
    },
    [params, pathname],
  );

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
            href={buildHref(tab.key)}
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
