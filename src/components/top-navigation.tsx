"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { BarChart3, Brain } from "lucide-react";

const NAV_ITEMS = [
  { href: "/", label: "Dashboard", icon: BarChart3 },
  { href: "/analysis", label: "AI Analysis", icon: Brain },
];

export function TopNavigation() {
  const pathname = usePathname();

  return (
    <nav className="border-b border-hp-rule bg-hp-card/90 text-hp-body">
      <div className="mx-auto flex max-w-7xl flex-col gap-3 px-4 py-3 md:flex-row md:items-center md:justify-between md:px-8">
        <Link href="/" className="min-w-0">
          <div className="text-[10px] uppercase tracking-[0.18em] text-hp-muted">
            HP/VVS Meta Ads
          </div>
          <div className="mt-1 font-title text-xl leading-none text-hp-ink">
            AI Analyst
          </div>
        </Link>

        <div className="flex flex-wrap items-center gap-2">
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            const isActive =
              item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={isActive ? "page" : undefined}
                className={`flex h-10 items-center gap-2 border px-4 text-[11px] uppercase tracking-[0.14em] transition-colors ${
                  isActive
                    ? "border-hp-ink bg-hp-ink text-hp-foundation"
                    : "border-hp-rule text-hp-body hover:border-hp-ink hover:bg-hp-inset"
                }`}
              >
                <Icon size={15} />
                {item.label}
              </Link>
            );
          })}
        </div>
      </div>
    </nav>
  );
}
