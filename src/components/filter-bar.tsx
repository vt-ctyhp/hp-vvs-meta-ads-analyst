"use client";

/**
 * Platform filter primitive. Every data surface should adopt this shape so
 * users build muscle memory for filtering across the app.
 *
 * Layout:
 * 1. Primary row: always-visible chips / segmented controls for the 1–3
 *    dominant filters (brand, status, delivery, etc).
 * 2. More filters disclosure: a single affordance that opens a panel with
 *    every secondary filter. A small count chip shows how many are active.
 * 3. Active chips strip: each applied non-default filter is a removable
 *    pill, plus a single "Clear all" link.
 *
 * The primitive is presentational. Pages own the filter state and pass in
 * children for the primary controls and the secondary panel. The active
 * chip list is declarative — pass an array of `{ label, onClear }`.
 */

import { ChevronDown, X } from "lucide-react";
import { type ReactNode, useEffect, useRef, useState } from "react";

export type ActiveFilter = {
  /** Short label shown in the chip, e.g. "Brand: HP" or "Min spend: $50". */
  label: string;
  onClear: () => void;
};

export function FilterBar({
  primary,
  secondary,
  active,
  onClearAll,
  searchSlot,
}: {
  /** Always-visible row of the most important filters. */
  primary: ReactNode;
  /** Optional dense panel of additional filters. If omitted, no "More filters" affordance shows. */
  secondary?: ReactNode;
  /** Removable pills, one per non-default applied filter. */
  active: ActiveFilter[];
  /** Called when the user clicks the universal "Clear all" affordance. */
  onClearAll?: () => void;
  /** Optional right-aligned search input. */
  searchSlot?: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const panelRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    function onClick(event: MouseEvent) {
      if (!panelRef.current) return;
      if (panelRef.current.contains(event.target as Node)) return;
      setOpen(false);
    }
    window.addEventListener("keydown", onKey);
    window.addEventListener("mousedown", onClick);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("mousedown", onClick);
    };
  }, [open]);

  const showSecondary = Boolean(secondary);

  return (
    <div className="border-y border-hp-rule bg-hp-card">
      <div className="flex flex-col gap-3 px-4 py-3 lg:flex-row lg:items-center lg:justify-between lg:gap-4">
        <div className="flex min-w-0 flex-wrap items-center gap-2">{primary}</div>
        <div className="flex flex-wrap items-center gap-2 lg:justify-end">
          {searchSlot}
          {showSecondary ? (
            <div ref={panelRef} className="relative">
              <button
                type="button"
                onClick={() => setOpen((value) => !value)}
                aria-haspopup="dialog"
                aria-expanded={open}
                className={`flex h-10 items-center gap-2 border px-3 text-[11px] uppercase tracking-[0.14em] transition-colors duration-150 ${
                  open
                    ? "border-hp-ink bg-hp-ink text-hp-foundation"
                    : "border-hp-rule text-hp-body hover:border-hp-ink hover:bg-hp-inset"
                }`}
              >
                <span>More filters</span>
                {active.length ? (
                  <span
                    className={`inline-flex h-5 min-w-[20px] items-center justify-center px-1.5 text-[10px] ${
                      open ? "bg-hp-foundation text-hp-ink" : "bg-hp-ink text-hp-foundation"
                    }`}
                  >
                    {active.length}
                  </span>
                ) : null}
                <ChevronDown size={14} aria-hidden />
              </button>
              {open ? (
                <div
                  role="dialog"
                  aria-label="Filters"
                  className="absolute right-0 top-12 z-40 w-[320px] border border-hp-rule bg-hp-card p-4 shadow-[0_8px_24px_rgba(42,39,37,0.08)]"
                >
                  {secondary}
                </div>
              ) : null}
            </div>
          ) : null}
        </div>
      </div>

      {active.length ? (
        <div className="flex flex-wrap items-center gap-2 border-t border-hp-rule px-4 py-2">
          <span className="text-[10px] uppercase tracking-[0.14em] text-hp-muted">
            Active filters
          </span>
          {active.map((filter, index) => (
            <button
              key={`${filter.label}-${index}`}
              type="button"
              onClick={filter.onClear}
              className="inline-flex items-center gap-1 border border-hp-rule px-2 py-1 text-[11px] text-hp-body transition-colors duration-150 hover:border-hp-ink hover:text-hp-ink"
            >
              <span>{filter.label}</span>
              <X size={11} aria-hidden />
            </button>
          ))}
          {onClearAll ? (
            <button
              type="button"
              onClick={onClearAll}
              className="text-[10px] uppercase tracking-[0.14em] text-hp-muted underline-offset-4 transition-colors duration-150 hover:text-hp-ink hover:underline"
            >
              Clear all
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

/**
 * Convenience labeled `<select>` for use inside the secondary panel. Keeps
 * every page's "More filters" panel visually consistent.
 */
export function FilterField({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: { value: string; label: string }[];
  onChange: (value: string) => void;
}) {
  return (
    <label className="mb-3 block last:mb-0">
      <span className="block text-[10px] uppercase tracking-[0.14em] text-hp-muted">{label}</span>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="mt-1 h-10 w-full border border-hp-rule bg-transparent px-3 text-sm outline-none focus:border-hp-pink"
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}

/**
 * Convenience text input variant (e.g. min spend). Same styling rules.
 */
export function FilterNumberField({
  label,
  value,
  placeholder,
  onChange,
}: {
  label: string;
  value: string;
  placeholder?: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="mb-3 block last:mb-0">
      <span className="block text-[10px] uppercase tracking-[0.14em] text-hp-muted">{label}</span>
      <input
        type="number"
        inputMode="decimal"
        value={value}
        placeholder={placeholder}
        onChange={(event) => onChange(event.target.value)}
        className="mt-1 h-10 w-full border-0 border-b border-hp-rule bg-transparent px-1 text-sm outline-none focus:border-b-2 focus:border-hp-pink"
      />
    </label>
  );
}
