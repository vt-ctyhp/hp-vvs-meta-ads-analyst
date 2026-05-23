"use client";

/**
 * Sticky + collapsible filter bar shared by the analyst-room pages
 * (/analyst, /analyst/creative-analysis, /analysis).
 *
 * Wraps each page's filter UI so it renders normally in flow at the top
 * of the page, then collapses to a single editorial standfirst pinned
 * under the workspace nav header once the user has scrolled past it.
 * Clicking the bar (or the "✎ Edit" toggle) opens an overlay panel
 * containing the same filter UI for editing without scrolling back to
 * the top.
 *
 * Generic: each page builds its own ActiveFilterSummary array via a
 * sibling builder in src/lib/active-filter-summary.ts and passes it as
 * `summary`. The bar just renders the standfirst — it doesn't know
 * which page it's on.
 *
 * See:
 *   - docs/superpowers/specs/2026-05-22-sticky-collapsible-filters-design.md
 *   - docs/superpowers/specs/2026-05-23-universal-filter-bar-design.md
 *
 * Pure UI behavior layer — filter state lives in each page's client
 * component. The wrapped children render twice when the panel is open
 * (once in flow, once inside the panel); both instances stay in sync
 * via the controlled props they receive from the parent.
 */

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";

import { type ActiveFilterSummary } from "@/lib/active-filter-summary";

type Props = {
  /** Pre-computed standfirst segments. Each page builds its own
   *  via a sibling builder in src/lib/active-filter-summary.ts. */
  summary: ActiveFilterSummary;
  /** The filter UI. Rendered once in-flow and a second time inside
   *  the expanded panel when the user opens it. */
  children: ReactNode;
};

const NAV_HEADER_PX = 64; // workspace shell <header> is h-16
const STICKY_BAR_PX = 44; // collapsed bar height

export function UniversalFilterBar({ summary, children }: Props) {
  const sentinelRef = useRef<HTMLDivElement | null>(null);
  const stickyBarRef = useRef<HTMLDivElement | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);
  const editButtonRef = useRef<HTMLButtonElement | null>(null);
  const wasPanelOpen = useRef(false);

  const [isStuck, setIsStuck] = useState(false);
  const [isPanelOpen, setIsPanelOpen] = useState(false);

  // The bar sticks when the sentinel (placed immediately after the
  // children) crosses above the nav header's bottom edge.
  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel || typeof IntersectionObserver === "undefined") return;
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

  // Scrolling back to the top auto-closes any open panel — no need to
  // keep an overlay sticky over the original full filter UI.
  useEffect(() => {
    if (!isStuck) setIsPanelOpen(false);
  }, [isStuck]);

  // Escape closes the panel.
  useEffect(() => {
    if (!isPanelOpen) return;
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") setIsPanelOpen(false);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [isPanelOpen]);

  // Click outside both the bar and the panel closes the panel. Clicks
  // on a bar segment do not close (they're a "switch focus to that
  // filter" affordance); the Edit toggle handles its own state.
  useEffect(() => {
    if (!isPanelOpen) return;
    function onMouseDown(event: MouseEvent) {
      const target = event.target as Node | null;
      if (!target) return;
      if (panelRef.current?.contains(target)) return;
      if (stickyBarRef.current?.contains(target)) return;
      setIsPanelOpen(false);
    }
    document.addEventListener("mousedown", onMouseDown);
    return () => document.removeEventListener("mousedown", onMouseDown);
  }, [isPanelOpen]);

  // After the panel closes, return focus to the Edit button so keyboard
  // users land somewhere predictable.
  useEffect(() => {
    if (wasPanelOpen.current && !isPanelOpen) {
      editButtonRef.current?.focus();
    }
    wasPanelOpen.current = isPanelOpen;
  }, [isPanelOpen]);

  const openPanel = useCallback(() => setIsPanelOpen(true), []);
  const togglePanel = useCallback(() => setIsPanelOpen((v) => !v), []);
  const closePanel = useCallback(() => setIsPanelOpen(false), []);

  return (
    <>
      {children}

      {/* IntersectionObserver sentinel — placed after the filter region
          so the bar appears only once the entire region has scrolled
          past the nav header. */}
      <div ref={sentinelRef} aria-hidden style={{ height: 1 }} />

      {isStuck ? (
        <div
          ref={stickyBarRef}
          className="hp-bar-fade-in sticky top-16 z-20 -mx-6 border-b border-hp-rule bg-hp-card/95 px-6 shadow-[0_4px_14px_rgba(42,39,37,0.05)] backdrop-blur"
        >
          <div className="mx-auto flex h-11 max-w-7xl items-center gap-2">
            <SummaryStandfirst summary={summary} onSegmentClick={openPanel} />
            <button
              ref={editButtonRef}
              type="button"
              aria-expanded={isPanelOpen}
              aria-controls="analyst-filter-panel"
              onClick={togglePanel}
              className={[
                "flex h-7 shrink-0 items-center gap-1 border px-3 text-[10px] uppercase tracking-[0.14em] transition-colors",
                isPanelOpen
                  ? "border-hp-ink bg-hp-ink text-hp-foundation"
                  : "border-hp-ink bg-transparent text-hp-ink hover:bg-hp-ink hover:text-hp-foundation",
              ].join(" ")}
            >
              <span aria-hidden>✎</span>
              <span>{isPanelOpen ? "Editing" : "Edit"}</span>
              <span aria-hidden>{isPanelOpen ? "▴" : "▾"}</span>
            </button>
          </div>

          {isPanelOpen ? (
            <div
              ref={panelRef}
              id="analyst-filter-panel"
              role="region"
              aria-label="Filters"
              className="absolute left-0 right-0 top-full border-b border-hp-rule bg-hp-card shadow-[0_12px_32px_rgba(42,39,37,0.10)]"
            >
              <div className="mx-auto max-w-7xl px-6 pb-5 pt-3">
                <div className="mb-3 flex items-baseline justify-between">
                  <p className="text-[10px] uppercase tracking-[0.14em] text-hp-muted">
                    Filters · changes apply on click
                  </p>
                  <button
                    type="button"
                    onClick={closePanel}
                    className="h-7 border border-hp-rule px-3 text-[10px] uppercase tracking-[0.14em] text-hp-muted transition-colors hover:border-hp-ink hover:text-hp-ink"
                  >
                    ✕ Close
                  </button>
                </div>
                {children}
              </div>
            </div>
          ) : null}
        </div>
      ) : null}

      {/* Page-content dim overlay. Sits below the sticky bar (z-20) and
          above page content (z 0). Pointer-events: none so clicks pass
          through; the click-outside listener handles closing. */}
      {isStuck && isPanelOpen ? (
        <div
          aria-hidden
          className="pointer-events-none fixed inset-x-0 bottom-0 z-10 bg-hp-foundation/55"
          style={{ top: `${NAV_HEADER_PX + STICKY_BAR_PX}px` }}
        />
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
            aria-label={`${seg.key}: ${seg.value}. Click to edit.`}
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
