"use client";

/**
 * Week-over-week window toggle.
 *
 * Two-option segmented control that writes its state to the URL as
 * `?wow=cal|rolling`. The server-side `loadDashboardPagePayload` resolver
 * picks the value up and derives the date range for the page.
 *
 * When the user clicks a mode, this component also drops `start`, `end`, and
 * `days` from the URL so they can't fight the wow mode.
 *
 * Lands as a primitive in v1 Day 3; rendered on the executive snapshot in
 * v1 Days 4-5 (and any other surface that opts into the toggle).
 */

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useMemo } from "react";

import type { WowMode } from "@/lib/wow-window";

const OPTIONS: { value: WowMode; label: string; description: string }[] = [
  { value: "cal", label: "This Week", description: "Monday through today" },
  { value: "rolling", label: "Rolling 7d", description: "Trailing seven days" },
];

export function WeekWindowToggle({
  defaultMode = "cal",
  className,
}: {
  defaultMode?: WowMode;
  className?: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const current = useMemo<WowMode>(() => {
    const raw = searchParams.get("wow");
    return raw === "cal" || raw === "rolling" ? raw : defaultMode;
  }, [defaultMode, searchParams]);

  function select(mode: WowMode) {
    const next = new URLSearchParams(searchParams.toString());
    next.set("wow", mode);
    // Wow mode takes precedence; clear the legacy controls so they don't fight.
    next.delete("start");
    next.delete("end");
    next.delete("days");
    const query = next.toString();
    router.push(query ? `${pathname}?${query}` : pathname);
  }

  return (
    <div
      role="group"
      aria-label="Window"
      className={`flex h-10 border border-hp-rule ${className ?? ""}`.trim()}
    >
      {OPTIONS.map((option, index) => {
        const isActive = current === option.value;
        return (
          <button
            key={option.value}
            type="button"
            onClick={() => select(option.value)}
            title={option.description}
            aria-pressed={isActive}
            className={`px-3 text-[11px] uppercase tracking-[0.14em] transition-colors duration-150 ${
              isActive
                ? "bg-hp-ink text-hp-foundation"
                : "text-hp-body hover:bg-hp-inset"
            } ${index > 0 ? "border-l border-hp-rule" : ""}`}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
