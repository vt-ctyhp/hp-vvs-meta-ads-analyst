"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useMemo, useTransition } from "react";

/**
 * Optimize-room filter bar. URL-state driven so views are shareable.
 *
 * Filters (all optional):
 *   - brand: HP | VVS | all
 *   - group: campaign-umbrella code or "all"
 *   - start, end: ISO date range (or `days` shorthand)
 *   - status: live | paused | off | all
 *   - minSpend: number of dollars
 *
 * Submits as a single URL update so the server page can re-fetch with the
 * new params. We use startTransition so the chips don't flash blocked.
 */

type Option = { value: string; label: string };

type Props = {
  brands: Option[];
  groups: Option[];
};

const STATUS_OPTIONS: Option[] = [
  { value: "all", label: "All status" },
  { value: "live", label: "Live" },
  { value: "paused", label: "Paused" },
  { value: "off", label: "Off" },
];

const DATE_PRESETS: Array<{ value: string; label: string; days: number }> = [
  { value: "7", label: "Last 7 days", days: 7 },
  { value: "14", label: "Last 14 days", days: 14 },
  { value: "30", label: "Last 30 days", days: 30 },
  { value: "90", label: "Last 90 days", days: 90 },
];

export function OptimizeFilterBar({ brands, groups }: Props) {
  const router = useRouter();
  const params = useSearchParams();
  const [isPending, startTransition] = useTransition();

  const current = useMemo(
    () => ({
      brand: params.get("brand") ?? "all",
      group: params.get("group") ?? "all",
      days: params.get("days") ?? "30",
      status: params.get("status") ?? "all",
      minSpend: params.get("minSpend") ?? "",
    }),
    [params],
  );

  const update = useCallback(
    (patch: Record<string, string | null>) => {
      const next = new URLSearchParams(params.toString());
      for (const [key, value] of Object.entries(patch)) {
        if (value === null || value === "" || value === "all") {
          next.delete(key);
        } else {
          next.set(key, value);
        }
      }
      startTransition(() => {
        router.replace(`?${next.toString()}`, { scroll: false });
      });
    },
    [params, router, startTransition],
  );

  const brandOptions = useMemo(
    () => [{ value: "all", label: "All brands" }, ...brands],
    [brands],
  );
  const groupOptions = useMemo(
    () => [{ value: "all", label: "All groups" }, ...groups],
    [groups],
  );

  return (
    <div
      aria-label="Optimize filters"
      className={
        "flex flex-wrap items-center gap-2 rounded-xl border border-stone-200 bg-white px-3 py-2 " +
        (isPending ? "opacity-70" : "")
      }
    >
      <Select
        label="Brand"
        value={current.brand}
        options={brandOptions}
        onChange={(value) => update({ brand: value })}
      />
      <Select
        label="Group"
        value={current.group}
        options={groupOptions}
        onChange={(value) => update({ group: value })}
      />
      <Select
        label="Range"
        value={current.days}
        options={DATE_PRESETS.map((d) => ({ value: d.value, label: d.label }))}
        onChange={(value) => update({ days: value })}
      />
      <Select
        label="Status"
        value={current.status}
        options={STATUS_OPTIONS}
        onChange={(value) => update({ status: value })}
      />
      <NumberInput
        label="Min spend"
        value={current.minSpend}
        placeholder="$"
        onChange={(value) => update({ minSpend: value })}
      />
      <button
        type="button"
        onClick={() =>
          update({ brand: null, group: null, days: null, status: null, minSpend: null })
        }
        className="ml-auto text-xs text-stone-500 underline hover:text-stone-900"
      >
        Reset
      </button>
    </div>
  );
}

function Select({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: Option[];
  onChange: (value: string) => void;
}) {
  return (
    <label className="inline-flex items-center gap-2 text-xs text-stone-700">
      <span className="hidden uppercase tracking-wider text-stone-500 sm:inline">
        {label}
      </span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-9 rounded-md border border-stone-300 bg-white px-2 text-sm font-medium text-stone-900 focus:outline-none focus:ring-2 focus:ring-stone-400"
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );
}

function NumberInput({
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
    <label className="inline-flex items-center gap-2 text-xs text-stone-700">
      <span className="hidden uppercase tracking-wider text-stone-500 sm:inline">
        {label}
      </span>
      <input
        type="number"
        min={0}
        step={50}
        inputMode="decimal"
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        className="h-9 w-24 rounded-md border border-stone-300 bg-white px-2 text-sm tabular-nums text-stone-900 focus:outline-none focus:ring-2 focus:ring-stone-400"
      />
    </label>
  );
}
