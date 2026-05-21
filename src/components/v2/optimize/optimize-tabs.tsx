import Link from "next/link";

export type OptimizeTab = "breakdown" | "creatives" | "ai" | "triage";

type Props = {
  active: OptimizeTab;
  params: Record<string, string | string[] | undefined>;
};

const TABS: Array<{ key: OptimizeTab; label: string; description: string }> = [
  {
    key: "breakdown",
    label: "Breakdown",
    description: "Campaign, group of ads, and creative performance.",
  },
  {
    key: "creatives",
    label: "Creatives",
    description: "Creative score, diagnostics, and export.",
  },
  {
    key: "ai",
    label: "AI",
    description: "Saved analyses and ad-hoc questions.",
  },
  {
    key: "triage",
    label: "Triage",
    description: "Scale, fix, and watch queue.",
  },
];

export function OptimizeTabs({ active, params }: Props) {
  return (
    <nav
      aria-label="Optimize tabs"
      className="flex flex-wrap items-center gap-1 rounded-xl border border-stone-200 bg-white p-1"
    >
      {TABS.map((tab) => {
        const isActive = tab.key === active;
        return (
          <Link
            key={tab.key}
            href={hrefForTab(params, tab.key)}
            aria-current={isActive ? "page" : undefined}
            title={tab.description}
            className={[
              "inline-flex h-10 items-center rounded-lg px-4 text-sm font-medium transition-colors",
              isActive
                ? "bg-stone-900 text-stone-50 shadow-sm"
                : "text-stone-700 hover:bg-stone-100 hover:text-stone-950",
            ].join(" ")}
          >
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}

export function normalizeOptimizeTab(value: string | string[] | undefined): OptimizeTab {
  const tab = Array.isArray(value) ? value[0] : value;
  if (tab === "creatives" || tab === "ai" || tab === "triage") return tab;
  return "breakdown";
}

function hrefForTab(
  params: Record<string, string | string[] | undefined>,
  tab: OptimizeTab,
) {
  const next = new URLSearchParams();

  for (const [key, value] of Object.entries(params)) {
    if (key === "tab") continue;
    if (Array.isArray(value)) {
      for (const item of value) next.append(key, item);
    } else if (value !== undefined) {
      next.set(key, value);
    }
  }

  if (tab !== "breakdown") next.set("tab", tab);
  const query = next.toString();
  return query ? `/optimize?${query}` : "/optimize";
}
