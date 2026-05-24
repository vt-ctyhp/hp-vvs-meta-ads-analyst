"use client";

/**
 * Sticky filter standfirst shared by the analyst-room pages
 * (/analyst, /analyst/creative-analysis, /analysis).
 *
 * Wraps each page's filter UI so it renders normally in flow at the top
 * of the page, then collapses to a single editorial standfirst pinned
 * under the workspace nav header once the user has scrolled past it.
 *
 * The standfirst summarizes the active filters and offers a single
 * "Adjust filters" button that smooth-scrolls back to the in-flow
 * filter region. There is NO duplicate filter UI in the sticky bar:
 * the in-flow region is the single source of truth.
 *
 * Generic: each page builds its own ActiveFilterSummary array via a
 * sibling builder in src/lib/active-filter-summary.ts and passes it as
 * `summary`. The bar just renders the standfirst.
 *
 * See:
 *   - docs/superpowers/specs/2026-05-22-sticky-collapsible-filters-design.md
 *   - docs/superpowers/specs/2026-05-23-universal-filter-bar-design.md
 */

import { useEffect, useRef, useState, type ReactNode } from "react";

import { type ActiveFilterSummary } from "@/lib/active-filter-summary";

type Props = {
  /** Pre-computed standfirst segments. Each page builds its own
   *  via a sibling builder in src/lib/active-filter-summary.ts. */
  summary: ActiveFilterSummary;
  /** The filter UI. Rendered once, in-flow only. The sticky bar
   *  shows just the summary plus an "Adjust filters" button that
   *  scrolls back to this region. */
  children: ReactNode;
};

const NAV_HEADER_PX = 64; // workspace shell <header> is h-16

export function UniversalFilterBar({ summary, children }: Props) {
  const inFlowRef = useRef<HTMLDivElement | null>(null);
  const sentinelRef = useRef<HTMLDivElement | null>(null);

  const [isStuck, setIsStuck] = useState(false);

  // The bar sticks when the sentinel (placed immediately after the
  // children) crosses above the nav header's bottom edge.
  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel || typeof IntersectionObserver === "undefined") return;

    // Initial check — IO doesn't always fire on mount when the page
    // loaded already scrolled past the sentinel (e.g. browser restored
    // scroll position, deep-link with hash). Set isStuck from the
    // sentinel's current rect so the bar appears without requiring a
    // scroll event first.
    const initialRect = sentinel.getBoundingClientRect();
    setIsStuck(initialRect.top < NAV_HEADER_PX);

    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries[0];
        if (!entry) return;
        setIsStuck(!entry.isIntersecting);
      },
      { rootMargin: `-${NAV_HEADER_PX}px 0px 0px 0px`, threshold: 0 },
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, []);

  function scrollToFilters() {
    const target = inFlowRef.current;
    if (!target) return;
    const reduceMotion =
      typeof window !== "undefined" &&
      window.matchMedia &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const top = target.getBoundingClientRect().top + window.scrollY - NAV_HEADER_PX - 8;
    window.scrollTo({ top, behavior: reduceMotion ? "auto" : "smooth" });
  }

  return (
    <>
      <div ref={inFlowRef}>{children}</div>

      {/* IntersectionObserver sentinel — placed after the filter region
          so the bar appears only once the entire region has scrolled
          past the nav header. */}
      <div ref={sentinelRef} aria-hidden style={{ height: 1 }} />

      {isStuck ? (
        <div className="hp-bar-fade-in sticky top-16 z-20 -mx-6 border-b border-hp-rule bg-hp-card/95 px-6">
          <div className="mx-auto flex h-11 max-w-7xl items-center gap-2">
            <SummaryStandfirst summary={summary} onSegmentClick={scrollToFilters} />
            <button
              type="button"
              onClick={scrollToFilters}
              className="flex h-7 shrink-0 items-center gap-1 border border-hp-ink bg-transparent px-3 text-[10px] uppercase tracking-[0.14em] text-hp-ink transition-colors hover:bg-hp-ink hover:text-hp-foundation"
            >
              Adjust filters
            </button>
          </div>
        </div>
      ) : null}
    </>
  );
}

function SummaryStandfirst({
  summary,
  onSegmentClick,
}: {
  summary: ActiveFilterSummary;
  onSegmentClick: () => void;
}) {
  return (
    <div className="flex min-w-0 flex-1 items-center gap-1 overflow-hidden">
      {summary.map((seg, idx) => (
        <span key={seg.key} className="flex min-w-0 items-baseline gap-1">
          {idx > 0 ? (
            <span aria-hidden className="text-hp-rule">
              ·
            </span>
          ) : null}
          <button
            type="button"
            onClick={onSegmentClick}
            aria-label={`${seg.key}: ${seg.value}. Click to scroll to filters.`}
            className={[
              "inline-flex items-baseline gap-1.5 whitespace-nowrap px-2 py-1 text-[12px] leading-none transition-colors",
              seg.isActive
                ? "border border-hp-rule bg-hp-inset"
                : "border border-transparent hover:border-hp-rule hover:bg-hp-inset",
            ].join(" ")}
          >
            <span className="text-[10px] uppercase tracking-[0.14em] text-hp-muted">
              {seg.key}
            </span>
            <span className="font-[family-name:var(--font-title)] italic text-hp-ink">
              {seg.value}
            </span>
          </button>
        </span>
      ))}
    </div>
  );
}
