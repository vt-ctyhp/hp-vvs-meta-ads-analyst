"use client";

/**
 * Filter chip group — a smallcaps label followed by a row of toggle
 * chips. Used by the universal filter bar on /analyst and /analysis
 * for Brand / Delivery / etc. filters. The active chip fills ink;
 * inactive chips are bordered with rule color.
 *
 * Pure controlled component — owns no state.
 */

import { memo } from "react";

type Props = {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: { value: string; label: string }[];
};

export const FilterChipGroup = memo(function FilterChipGroup({
  label,
  value,
  onChange,
  options,
}: Props) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="pr-1 text-[10px] uppercase tracking-[0.14em] text-hp-muted">
        {label}
      </span>
      {options.map((option) => {
        const isActive = value === option.value;
        return (
          <button
            key={option.value}
            type="button"
            onClick={() => onChange(option.value)}
            className={`h-9 border px-3 text-[11px] uppercase tracking-[0.14em] transition-colors duration-150 ${
              isActive
                ? "border-hp-ink bg-hp-ink text-hp-foundation"
                : "border-hp-rule text-hp-body hover:border-hp-ink"
            }`}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
});
