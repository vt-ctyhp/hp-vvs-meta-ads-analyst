"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useMemo, useState, useTransition } from "react";

import { OPTIMIZE_DEFAULT_DAYS } from "@/lib/app-routes";
import { normalizeOptimizeStatusSelection } from "@/lib/optimize-filters";

/**
 * Optimize-room filter bar. URL-state driven so views are shareable.
 *
 * Filters (all optional):
 *   - brand   : HP | VVS | all
 *   - group   : campaign-umbrella code or "all"
 *   - days    : 7 | 14 | 30 | 90  (mutually exclusive with start/end)
 *   - start, end : custom ISO date range (overrides `days` when set)
 *   - status  : live | paused | off | all   (defaults to "live" on first land)
 *
 * Data filters propagate through the active Optimize tab:
 *   - fetchOptimizeSummaryData for the shared headline + options.
 *   - fetchPeriodPivot for the Breakdown tree+pivot table.
 *   - Creative, Triage, and AI views receive the same URL filter context.
 *   - Status is global and filters delivery state everywhere.
 */

type Option = { value: string; label: string };

type Props = {
  brands: Option[];
  groups: Option[];
};

const STATUS_OPTIONS: Option[] = [
  { value: "all", label: "All current statuses" },
  { value: "live", label: "Live" },
  { value: "paused", label: "Paused" },
  { value: "off", label: "Off" },
];

const DATE_PRESETS: Array<{ value: string; label: string }> = [
  { value: "7", label: "Last 7 days" },
  { value: "14", label: "Last 14 days" },
  { value: "30", label: "Last 30 days" },
  { value: "90", label: "Last 90 days" },
  { value: "custom", label: "Custom range…" },
];

const SERVER_DATA_KEYS = new Set(["brand", "group", "days", "start", "end", "status"]);
const DEFAULT_DAYS_VALUE = String(OPTIMIZE_DEFAULT_DAYS);

export function OptimizeFilterBar({ brands, groups }: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [pending, startTransition] = useTransition();

  const current = useMemo(() => {
    const brand = params.get("brand") ?? "all";
    const group = params.get("group") ?? "all";
    const days = params.get("days") ?? DEFAULT_DAYS_VALUE;
    const start = params.get("start") ?? "";
    const end = params.get("end") ?? "";
    // status defaults to "live" when the URL doesn't pin it. `status=all`
    // is explicit because deleting the param means "back to Live".
    const status = normalizeOptimizeStatusSelection(params.get("status")) ?? "live";
    return { brand, group, days, start, end, status };
  }, [params]);

  const hasCustomUrl = Boolean(current.start && current.end);
  // Local UI state — tracks whether the operator picked "Custom range…"
  // in the dropdown. We can't derive this from URL params alone because
  // they want to see the date inputs the moment they pick Custom, before
  // they've filled either field in.
  const [customMode, setCustomMode] = useState<boolean>(hasCustomUrl);
  const [customStart, setCustomStart] = useState(current.start);
  const [customEnd, setCustomEnd] = useState(current.end);

  const update = useCallback(
    (patch: Record<string, string | null>) => {
      const next = new URLSearchParams(params.toString());
      for (const [key, value] of Object.entries(patch)) {
        if (value === null || value === "") {
          next.delete(key);
        } else {
          next.set(key, value);
        }
      }
      if (Object.keys(patch).some((key) => SERVER_DATA_KEYS.has(key))) {
        next.delete("focus");
      }
      const qs = next.toString();
      const href = qs ? `${pathname}?${qs}` : pathname;
      const currentQs = params.toString();
      const currentHref = currentQs ? `${pathname}?${currentQs}` : pathname;
      if (href === currentHref) return;

      const changesServerData = Object.keys(patch).some((key) =>
        SERVER_DATA_KEYS.has(key),
      );
      if (changesServerData) {
        startTransition(() => {
          router.replace(href, { scroll: false });
        });
      } else {
        window.history.replaceState(null, "", href);
      }
    },
    [params, pathname, router, startTransition],
  );

  const brandOptions = useMemo(
    () => [{ value: "all", label: "All brands" }, ...brands],
    [brands],
  );
  const groupOptions = useMemo(
    () => [{ value: "all", label: "All groups" }, ...groups],
    [groups],
  );

  const rangeValue = customMode ? "custom" : current.days;

  function onRangeChange(value: string) {
    if (value === "custom") {
      // Reveal the date inputs. We don't touch the URL yet because the
      // operator hasn't picked dates; the inputs stay editable until both
      // are filled, at which point we commit.
      setCustomMode(true);
      return;
    }
    setCustomMode(false);
    update({ days: value, start: null, end: null });
  }

  function commitCustomRange(nextStart: string, nextEnd: string) {
    if (!nextStart || !nextEnd) return;
    if (nextEnd < nextStart) return;
    update({ start: nextStart, end: nextEnd, days: null });
  }

  return (
    <div
      aria-label="Optimize filters"
      aria-busy={pending}
      className={[
        "flex flex-wrap items-center gap-2 px-3 py-2 transition-colors",
        pending ? "bg-stone-50/70" : "",
      ].join(" ")}
    >
      <Select
        label="Brand"
        value={current.brand}
        options={brandOptions}
        disabled={pending}
        onChange={(value) => update({ brand: value === "all" ? null : value })}
      />
      <Select
        label="Group"
        value={current.group}
        options={groupOptions}
        disabled={pending}
        onChange={(value) => update({ group: value === "all" ? null : value })}
      />
      <Select
        label="Range"
        value={rangeValue}
        options={DATE_PRESETS}
        disabled={pending}
        onChange={onRangeChange}
      />
      {customMode ? (
        <span className="inline-flex items-center gap-1 text-xs text-stone-700">
          <input
            type="date"
            value={customStart}
            disabled={pending}
            onChange={(e) => {
              const nextStart = e.target.value;
              setCustomStart(nextStart);
              // Auto-commit the moment both inputs are valid — saves the
              // operator a click on a separate Apply button.
              commitCustomRange(nextStart, customEnd);
            }}
            className="h-9 rounded-md border border-stone-300 bg-white px-2 text-sm text-stone-900 focus:outline-none focus:ring-2 focus:ring-stone-400 disabled:cursor-wait disabled:bg-stone-50 disabled:text-stone-500"
            aria-label="Custom start date"
          />
          <span className="text-stone-400">→</span>
          <input
            type="date"
            value={customEnd}
            disabled={pending}
            onChange={(e) => {
              const nextEnd = e.target.value;
              setCustomEnd(nextEnd);
              commitCustomRange(customStart, nextEnd);
            }}
            className="h-9 rounded-md border border-stone-300 bg-white px-2 text-sm text-stone-900 focus:outline-none focus:ring-2 focus:ring-stone-400 disabled:cursor-wait disabled:bg-stone-50 disabled:text-stone-500"
            aria-label="Custom end date"
          />
        </span>
      ) : null}
      <Select
        label="Current status"
        value={current.status}
        options={STATUS_OPTIONS}
        disabled={pending}
        onChange={(value) => update({ status: value === "live" ? null : value })}
      />
      {pending ? (
        <span
          className="inline-flex items-center gap-2 rounded-full border border-stone-200 bg-white px-2.5 py-1 text-[11px] font-medium uppercase tracking-wider text-stone-500"
          aria-live="polite"
        >
          <span className="h-1.5 w-1.5 rounded-full bg-amber-500 shadow-[0_0_0_3px_rgba(245,158,11,0.18)]" />
          Updating data
        </span>
      ) : null}
      <button
        type="button"
        disabled={pending}
        onClick={() => {
          setCustomMode(false);
          setCustomStart("");
          setCustomEnd("");
          update({
            brand: null,
            group: null,
            days: null,
            start: null,
            end: null,
            status: null,
          });
        }}
        className="ml-auto text-xs text-stone-500 underline hover:text-stone-900 disabled:cursor-wait disabled:text-stone-300"
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
  disabled,
  onChange,
}: {
  label: string;
  value: string;
  options: Option[];
  disabled?: boolean;
  onChange: (value: string) => void;
}) {
  return (
    <label className="inline-flex items-center gap-2 text-xs text-stone-700">
      <span className="hidden uppercase tracking-wider text-stone-500 sm:inline">
        {label}
      </span>
      <select
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
        className="h-9 rounded-md border border-stone-300 bg-white px-2 text-sm font-medium text-stone-900 focus:outline-none focus:ring-2 focus:ring-stone-400 disabled:cursor-wait disabled:bg-stone-50 disabled:text-stone-500"
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
