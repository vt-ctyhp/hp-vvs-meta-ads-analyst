"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";

import { FilterChipGroup } from "@/components/filter-chip-group";
import { UniversalFilterBar } from "@/components/universal-filter-bar";
import { buildConvertFilterSummary } from "@/lib/active-filter-summary";
import type { ConvertLedgerFilters } from "@/lib/convert-customer-ledger";

type Props = {
  appointmentTypes: string[];
  filters: ConvertLedgerFilters;
  range: {
    days: number;
    end: string;
    start: string;
  };
};

export function ConvertFilterBar({ appointmentTypes, filters, range }: Props) {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [query, setQuery] = useState(filters.query);

  useEffect(() => {
    const handle = window.setTimeout(() => setQuery(filters.query), 0);
    return () => window.clearTimeout(handle);
  }, [filters.query]);

  const updateParam = useCallback(
    (key: string, value: string, defaultValue = "all") => {
      const params = new URLSearchParams(searchParams.toString());
      if (!value || value === defaultValue) params.delete(key);
      else params.set(key, value);
      params.delete("visitorId");
      params.delete("acuityAppointmentId");
      params.delete("eventId");
      const next = params.toString();
      router.replace(next ? `${pathname}?${next}` : pathname, { scroll: false });
    },
    [pathname, router, searchParams],
  );

  useEffect(() => {
    if (query.trim() === filters.query) return;
    const handle = window.setTimeout(() => {
      updateParam("q", query.trim(), "");
    }, 350);
    return () => window.clearTimeout(handle);
  }, [filters.query, query, updateParam]);

  const setDays = useCallback(
    (days: string) => {
      const params = new URLSearchParams(searchParams.toString());
      params.set("days", days);
      params.delete("start");
      params.delete("end");
      params.delete("visitorId");
      params.delete("acuityAppointmentId");
      params.delete("eventId");
      router.replace(`${pathname}?${params.toString()}`, { scroll: false });
    },
    [pathname, router, searchParams],
  );

  const typeOptions = useMemo(
    () => [
      { value: "all", label: "All" },
      ...appointmentTypes.slice(0, 12).map((type) => ({ value: type, label: shortLabel(type) })),
    ],
    [appointmentTypes],
  );

  const rangeValue = searchParams.get("start") || searchParams.get("end")
    ? "custom"
    : String(searchParams.get("days") || range.days);

  return (
    <UniversalFilterBar
      summary={buildConvertFilterSummary({
        capi: filters.capi,
        endDate: range.end,
        query: filters.query,
        source: filters.source,
        stage: filters.stage,
        startDate: range.start,
        type: filters.type,
      })}
    >
      <div className="mx-auto mt-2 flex max-w-7xl flex-col gap-4 border-y border-hp-rule py-4 xl:flex-row xl:flex-wrap xl:items-center xl:justify-between xl:gap-x-6">
        <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
          <FilterChipGroup
            label="Range"
            value={rangeValue}
            onChange={(value) => {
              if (value !== "custom") setDays(value);
            }}
            options={[
              { value: "30", label: "30d" },
              { value: "7", label: "7d" },
              { value: "90", label: "90d" },
              { value: "custom", label: "Custom" },
            ]}
          />
          <FilterChipGroup
            label="Source"
            value={filters.source}
            onChange={(value) => updateParam("source", value)}
            options={[
              { value: "all", label: "All" },
              { value: "paid_meta", label: "Paid Meta" },
              { value: "direct", label: "Direct" },
              { value: "unattributed", label: "Unknown" },
            ]}
          />
          <FilterChipGroup
            label="CAPI"
            value={filters.capi}
            onChange={(value) => updateParam("capi", value)}
            options={[
              { value: "all", label: "All" },
              { value: "gap", label: "Gaps" },
              { value: "sent", label: "Sent" },
              { value: "failed", label: "Failed" },
            ]}
          />
          <label className="flex h-9 items-center gap-2 border border-hp-rule px-3 text-[10px] uppercase tracking-[0.14em] text-hp-muted">
            <span>Type</span>
            <select
              className="h-7 min-w-[150px] bg-transparent text-[11px] uppercase tracking-[0.10em] text-hp-ink outline-none"
              value={filters.type}
              onChange={(event) => updateParam("type", event.target.value)}
            >
              {typeOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
        </div>
        <label className="flex h-9 min-w-[220px] items-center gap-2 border border-hp-rule px-3 text-[10px] uppercase tracking-[0.14em] text-hp-muted">
          <span>Search</span>
          <input
            className="h-7 min-w-0 flex-1 bg-transparent text-sm normal-case tracking-normal text-hp-ink outline-none placeholder:text-hp-muted"
            placeholder="Customer, ad, campaign, appointment"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        </label>
      </div>
    </UniversalFilterBar>
  );
}

function shortLabel(value: string) {
  return value.length > 28 ? `${value.slice(0, 25)}...` : value;
}
