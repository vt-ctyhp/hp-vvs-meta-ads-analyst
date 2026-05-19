"use client";

/* eslint-disable @next/next/no-img-element */

/**
 * Analyst v2 — from-scratch deep-dive surface.
 *
 * Workflow: an analyst lands here knowing roughly what they want to look at
 * (an umbrella, a date range, a brand). They drill down — Campaigns → Ad
 * Sets → Creatives → Drawer — INLINE, one focal path at a time, each level
 * pushing the next level into the row directly below.
 *
 * State split:
 *   - Filters (brand / umbrella / delivery / query) live in the URL, because
 *     changing them changes the data slice we render.
 *   - Drill-down selection (which campaign + ad set + creative are expanded)
 *     is purely local React state, so clicks are instant — no router.push,
 *     no server refetch.
 */

import { ChevronRight, ExternalLink, Search, X as XIcon } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";

import type { DashboardPayload, PerformanceRow } from "@/lib/analytics";
import { TERMS, formatAdDelivery } from "@/lib/glossary";

import { WeekWindowToggle } from "../week-window-toggle";

const MONEY = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
});
const MONEY_CENTS = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 2,
});
const COUNT = new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 });

type DeliveryFilter = "all" | "active" | "paused";

// Columns are stable across all 3 tiers. Sub-tier rows render inline beneath
// their parent via colSpan, so the column layout stays consistent.
const CAMPAIGN_COLS = 6;

export function AnalystV2Client({ data }: { data: DashboardPayload }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  // ── URL-derived filter state (changing these refetches the dashboard) ────
  const brand = searchParams.get("brand") || "all";
  const umbrella = searchParams.get("umbrella") || "all";
  const delivery = (searchParams.get("delivery") || "all") as DeliveryFilter;
  const query = searchParams.get("query") || "";

  // ── Local drill-down state (instant; no URL roundtrip) ──────────────────
  const [expandedCampaignId, setExpandedCampaignId] = useState<string | null>(null);
  const [expandedAdSetId, setExpandedAdSetId] = useState<string | null>(null);
  const [drawerCreativeId, setDrawerCreativeId] = useState<string | null>(null);

  // ── URL helpers ─────────────────────────────────────────────────────────
  const updateParams = useCallback(
    (patch: Record<string, string | null>) => {
      const next = new URLSearchParams(searchParams.toString());
      for (const [key, value] of Object.entries(patch)) {
        if (value === null || value === "") next.delete(key);
        else next.set(key, value);
      }
      const queryString = next.toString();
      router.push(queryString ? `${pathname}?${queryString}` : pathname);
    },
    [pathname, router, searchParams],
  );

  // Local search input — debounced into the URL so the field stays snappy.
  // The URL is source of truth; this local draft is just for in-flight typing.
  const [searchDraft, setSearchDraft] = useState(query);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSearchDraft((prev) => (prev === query ? prev : query));
  }, [query]);
  useEffect(() => {
    if (searchDraft === query) return;
    const handle = window.setTimeout(() => {
      updateParams({ query: searchDraft || null });
    }, 350);
    return () => window.clearTimeout(handle);
  }, [searchDraft, query, updateParams]);

  // When filters change in URL, collapse the drill-down (selected campaign
  // may no longer match the filter). Standard cross-state sync; lint rule is
  // conservative here.
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    setExpandedCampaignId(null);
    setExpandedAdSetId(null);
  }, [brand, umbrella, delivery, query]);
  /* eslint-enable react-hooks/set-state-in-effect */

  // ── Filter pipeline ─────────────────────────────────────────────────────
  const brandOptions = useMemo(
    () => ["all", ...Array.from(new Set(data.byBrand.map((row) => row.brandCode)))],
    [data.byBrand],
  );
  const umbrellaOptions = useMemo(
    () => ["all", ...data.campaignUmbrellas],
    [data.campaignUmbrellas],
  );

  const baseFilter = useCallback(
    (row: PerformanceRow) => {
      if (brand !== "all" && row.brandCode !== brand) return false;
      if (umbrella !== "all" && row.campaignUmbrella !== umbrella) return false;
      if (delivery !== "all") {
        const isActive = (row.effectiveStatus || "").toUpperCase() === "ACTIVE";
        if (delivery === "active" && !isActive) return false;
        if (delivery === "paused" && isActive) return false;
      }
      if (query) {
        const q = query.toLowerCase();
        const matches = [
          row.name,
          row.brandCode,
          row.campaignUmbrella,
          row.objective,
        ]
          .map((value) => (value || "").toString().toLowerCase())
          .some((value) => value.includes(q));
        if (!matches) return false;
      }
      return true;
    },
    [brand, delivery, query, umbrella],
  );

  // Build campaign → ad sets and ad set → creatives lookups once per slice.
  // Drill-down doesn't re-filter — it just reads from these maps.
  const visibleCampaigns = useMemo(
    () => data.campaigns.filter(baseFilter).sort((a, b) => b.spend - a.spend),
    [baseFilter, data.campaigns],
  );

  const adSetsByCampaignId = useMemo(() => {
    const map = new Map<string, PerformanceRow[]>();
    for (const adSet of data.adSets) {
      if (!adSet.campaignId) continue;
      if (!baseFilter(adSet)) continue;
      const list = map.get(adSet.campaignId) || [];
      list.push(adSet);
      map.set(adSet.campaignId, list);
    }
    for (const list of map.values()) {
      list.sort((a, b) => b.spend - a.spend);
    }
    return map;
  }, [baseFilter, data.adSets]);

  const creativesByAdSetId = useMemo(() => {
    const map = new Map<string, PerformanceRow[]>();
    for (const creative of data.creatives) {
      if (!creative.adSetId) continue;
      if (!baseFilter(creative)) continue;
      const list = map.get(creative.adSetId) || [];
      list.push(creative);
      map.set(creative.adSetId, list);
    }
    for (const list of map.values()) {
      list.sort((a, b) => b.spend - a.spend);
    }
    return map;
  }, [baseFilter, data.creatives]);

  // Δ lookups for campaigns (we already ship prior-period campaign data)
  const priorCampaignById = useMemo(
    () => new Map(data.comparison.campaigns.map((row) => [row.id, row])),
    [data.comparison.campaigns],
  );

  // Selected creative for drawer
  const selectedCreative = useMemo(
    () => (drawerCreativeId ? data.creatives.find((c) => c.id === drawerCreativeId) ?? null : null),
    [drawerCreativeId, data.creatives],
  );

  // ── Handlers ────────────────────────────────────────────────────────────
  const toggleCampaign = useCallback((id: string) => {
    setExpandedCampaignId((prev) => (prev === id ? null : id));
    setExpandedAdSetId(null);
  }, []);

  const toggleAdSet = useCallback((id: string) => {
    setExpandedAdSetId((prev) => (prev === id ? null : id));
  }, []);

  const openDrawer = useCallback((id: string) => setDrawerCreativeId(id), []);
  const closeDrawer = useCallback(() => setDrawerCreativeId(null), []);

  function clearAllFilters() {
    updateParams({
      brand: null,
      umbrella: null,
      delivery: null,
      query: null,
    });
    setSearchDraft("");
  }

  const activeFilterCount =
    (brand !== "all" ? 1 : 0) +
    (umbrella !== "all" ? 1 : 0) +
    (delivery !== "all" ? 1 : 0) +
    (query ? 1 : 0);

  // Close drawer on Escape
  useEffect(() => {
    if (!selectedCreative) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") closeDrawer();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [selectedCreative, closeDrawer]);

  return (
    <main className="min-h-screen bg-hp-foundation px-4 py-8 text-hp-body md:px-8">
      <section className="mx-auto max-w-7xl">
        <header className="flex flex-col gap-3 border-b border-hp-rule pb-4 md:flex-row md:items-end md:justify-between md:gap-6">
          <div>
            <p className="text-[10px] uppercase tracking-[0.14em] text-hp-muted">
              Analyst · drill-down view
            </p>
            <h1 className="mt-2 font-title text-2xl leading-tight text-hp-ink md:text-3xl">
              {sliceTitle({ brand, umbrella })}
            </h1>
            <p className="mt-1 text-xs text-hp-muted">
              {formatDateRange(
                data.sourceTransparency.timeRange.start,
                data.sourceTransparency.timeRange.end,
              )}
              {" · "}
              {COUNT.format(visibleCampaigns.length)} campaign
              {visibleCampaigns.length === 1 ? "" : "s"} in view
            </p>
          </div>
          <WeekWindowToggle defaultMode="cal" />
        </header>

        <FilterStrip
          brand={brand}
          brandOptions={brandOptions}
          onBrand={(v) => updateParams({ brand: v === "all" ? null : v })}
          umbrella={umbrella}
          umbrellaOptions={umbrellaOptions}
          onUmbrella={(v) => updateParams({ umbrella: v === "all" ? null : v })}
          delivery={delivery}
          onDelivery={(v) => updateParams({ delivery: v === "all" ? null : v })}
          searchDraft={searchDraft}
          onSearchChange={setSearchDraft}
          activeCount={activeFilterCount}
          onClearAll={activeFilterCount > 0 ? clearAllFilters : undefined}
        />

        <CampaignsTable
          rows={visibleCampaigns}
          priorById={priorCampaignById}
          adSetsByCampaignId={adSetsByCampaignId}
          creativesByAdSetId={creativesByAdSetId}
          expandedCampaignId={expandedCampaignId}
          expandedAdSetId={expandedAdSetId}
          onToggleCampaign={toggleCampaign}
          onToggleAdSet={toggleAdSet}
          onOpenDrawer={openDrawer}
        />
      </section>

      {selectedCreative ? (
        <CreativeDrawer creative={selectedCreative} onClose={closeDrawer} />
      ) : null}
    </main>
  );
}

// ── Filter strip ───────────────────────────────────────────────────────────

function FilterStrip({
  brand,
  brandOptions,
  onBrand,
  umbrella,
  umbrellaOptions,
  onUmbrella,
  delivery,
  onDelivery,
  searchDraft,
  onSearchChange,
  activeCount,
  onClearAll,
}: {
  brand: string;
  brandOptions: string[];
  onBrand: (v: string) => void;
  umbrella: string;
  umbrellaOptions: string[];
  onUmbrella: (v: string) => void;
  delivery: DeliveryFilter;
  onDelivery: (v: DeliveryFilter) => void;
  searchDraft: string;
  onSearchChange: (v: string) => void;
  activeCount: number;
  onClearAll?: () => void;
}) {
  return (
    <div className="mt-4 flex flex-col gap-3 border-y border-hp-rule py-3 lg:flex-row lg:flex-wrap lg:items-center lg:gap-x-4">
      <label className="flex h-9 min-w-0 items-center gap-2 border-b border-hp-rule px-1 focus-within:border-hp-pink lg:w-64">
        <Search size={14} className="text-hp-muted" />
        <input
          value={searchDraft}
          onChange={(event) => onSearchChange(event.target.value)}
          placeholder="Search campaigns, ad sets, creatives"
          className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-hp-muted"
        />
        {searchDraft ? (
          <button
            type="button"
            onClick={() => onSearchChange("")}
            aria-label="Clear search"
            className="text-hp-muted transition-colors duration-150 hover:text-hp-ink"
          >
            <XIcon size={13} />
          </button>
        ) : null}
      </label>

      <FilterSelect
        label="Brand"
        value={brand}
        options={brandOptions.map((option) => ({
          value: option,
          label: option === "all" ? "All brands" : option,
        }))}
        onChange={onBrand}
      />
      <FilterSelect
        label={TERMS.campaignUmbrella}
        value={umbrella}
        options={umbrellaOptions.map((option) => ({
          value: option,
          label: option === "all" ? "All umbrellas" : option,
        }))}
        onChange={onUmbrella}
      />
      <SegmentedFilter
        label="Delivery"
        value={delivery}
        onChange={onDelivery}
        options={[
          { value: "all" as const, label: "All" },
          { value: "active" as const, label: "Live" },
          { value: "paused" as const, label: "Paused" },
        ]}
      />

      {onClearAll ? (
        <button
          type="button"
          onClick={onClearAll}
          className="ml-auto text-[10px] uppercase tracking-[0.14em] text-hp-muted underline-offset-4 transition-colors duration-150 hover:text-hp-ink hover:underline"
        >
          Clear filters ({activeCount})
        </button>
      ) : null}
    </div>
  );
}

function FilterSelect({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: { value: string; label: string }[];
  onChange: (v: string) => void;
}) {
  return (
    <label className="flex h-9 items-center gap-2">
      <span className="text-[10px] uppercase tracking-[0.14em] text-hp-muted">{label}</span>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="h-8 border border-hp-rule bg-transparent px-2 text-xs outline-none focus:border-hp-pink"
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

function SegmentedFilter<T extends string>({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: string }[];
}) {
  return (
    <div className="flex h-9 items-center gap-2">
      <span className="text-[10px] uppercase tracking-[0.14em] text-hp-muted">{label}</span>
      <div className="flex h-8 border border-hp-rule">
        {options.map((option, index) => {
          const isActive = value === option.value;
          return (
            <button
              key={option.value}
              type="button"
              onClick={() => onChange(option.value)}
              aria-pressed={isActive}
              className={`px-2 text-[11px] uppercase tracking-[0.14em] transition-colors duration-150 ${
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
    </div>
  );
}

// ── Tier 1: Campaigns table with inline expansion ──────────────────────────

function CampaignsTable({
  rows,
  priorById,
  adSetsByCampaignId,
  creativesByAdSetId,
  expandedCampaignId,
  expandedAdSetId,
  onToggleCampaign,
  onToggleAdSet,
  onOpenDrawer,
}: {
  rows: PerformanceRow[];
  priorById: Map<string, PerformanceRow>;
  adSetsByCampaignId: Map<string, PerformanceRow[]>;
  creativesByAdSetId: Map<string, PerformanceRow[]>;
  expandedCampaignId: string | null;
  expandedAdSetId: string | null;
  onToggleCampaign: (id: string) => void;
  onToggleAdSet: (id: string) => void;
  onOpenDrawer: (id: string) => void;
}) {
  return (
    <section className="mt-4 border border-hp-rule bg-hp-card">
      <header className="flex flex-col gap-1 border-b border-hp-rule px-4 py-3 md:flex-row md:items-baseline md:justify-between">
        <div>
          <p className="text-[10px] uppercase tracking-[0.14em] text-hp-muted">Campaigns</p>
          <h2 className="mt-0.5 font-title text-xl leading-tight text-hp-ink">
            {COUNT.format(rows.length)}{" "}
            <span className="font-body text-base text-hp-muted">in view</span>
          </h2>
        </div>
        <p className="text-[11px] text-hp-muted">
          Click a row to drill into ad sets; drill again to reveal creatives.
        </p>
      </header>

      {rows.length === 0 ? (
        <EmptyState message="No campaigns match the current filters." inline />
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[800px] table-fixed border-collapse text-sm">
            <colgroup>
              <col className="w-[34%]" />
              <col className="w-[10%]" />
              <col className="w-[14%]" />
              <col className="w-[14%]" />
              <col className="w-[14%]" />
              <col className="w-[14%]" />
            </colgroup>
            <thead className="bg-hp-inset">
              <tr>
                <Th>Campaign</Th>
                <Th>Delivery</Th>
                <Th align="right">Spend</Th>
                <Th align="right">{TERMS.primaryKpi}</Th>
                <Th align="right">Cost / Result</Th>
                <Th align="right">CTR</Th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => {
                const prior = priorById.get(row.id);
                const isExpanded = expandedCampaignId === row.id;
                const childAdSets = adSetsByCampaignId.get(row.id) || [];
                return (
                  <CampaignRow
                    key={row.id}
                    row={row}
                    prior={prior}
                    isExpanded={isExpanded}
                    childAdSets={childAdSets}
                    expandedAdSetId={expandedAdSetId}
                    creativesByAdSetId={creativesByAdSetId}
                    onToggleCampaign={onToggleCampaign}
                    onToggleAdSet={onToggleAdSet}
                    onOpenDrawer={onOpenDrawer}
                  />
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function CampaignRow({
  row,
  prior,
  isExpanded,
  childAdSets,
  expandedAdSetId,
  creativesByAdSetId,
  onToggleCampaign,
  onToggleAdSet,
  onOpenDrawer,
}: {
  row: PerformanceRow;
  prior?: PerformanceRow;
  isExpanded: boolean;
  childAdSets: PerformanceRow[];
  expandedAdSetId: string | null;
  creativesByAdSetId: Map<string, PerformanceRow[]>;
  onToggleCampaign: (id: string) => void;
  onToggleAdSet: (id: string) => void;
  onOpenDrawer: (id: string) => void;
}) {
  return (
    <>
      <tr
        onClick={() => onToggleCampaign(row.id)}
        className={`cursor-pointer border-b border-hp-rule align-middle transition-colors duration-150 hover:bg-hp-inset ${
          isExpanded ? "bg-hp-inset" : ""
        }`}
      >
        <td className="px-4 py-3 text-hp-ink">
          <div className="flex items-center gap-2">
            <ChevronRight
              size={12}
              className={`text-hp-muted transition-transform duration-150 ${
                isExpanded ? "rotate-90 text-hp-ink" : ""
              }`}
              aria-hidden
            />
            <span className="font-body">{row.name}</span>
          </div>
          <div className="ml-5 mt-1 text-[10px] uppercase tracking-[0.14em] text-hp-muted">
            {row.campaignUmbrella || "Unassigned"} · {row.brandCode}
          </div>
        </td>
        <td className="px-4 py-3 text-xs text-hp-body">
          <DeliveryPill row={row} />
        </td>
        <ValueCell value={MONEY.format(row.spend)} current={row.spend} prior={prior?.spend} />
        <ValueCell
          value={COUNT.format(row.primaryResults)}
          current={row.primaryResults}
          prior={prior?.primaryResults}
          label={row.primaryResultLabel}
        />
        <ValueCell
          value={row.costPerPrimaryResult == null ? "—" : MONEY_CENTS.format(row.costPerPrimaryResult)}
          current={row.costPerPrimaryResult ?? undefined}
          prior={prior?.costPerPrimaryResult ?? undefined}
          lowerIsBetter
        />
        <td className="px-4 py-3 text-right tabular-nums text-hp-ink">
          {row.ctr.toFixed(2)}%
        </td>
      </tr>

      {isExpanded ? (
        <tr className="border-b border-hp-rule">
          <td colSpan={CAMPAIGN_COLS} className="bg-hp-foundation p-0">
            <div className="border-l-[3px] border-l-hp-ink/30 pl-4">
              <AdSetsInline
                rows={childAdSets}
                expandedAdSetId={expandedAdSetId}
                creativesByAdSetId={creativesByAdSetId}
                onToggleAdSet={onToggleAdSet}
                onOpenDrawer={onOpenDrawer}
                campaignName={row.name}
              />
            </div>
          </td>
        </tr>
      ) : null}
    </>
  );
}

// ── Tier 2: Ad Sets inline expansion ───────────────────────────────────────

function AdSetsInline({
  rows,
  expandedAdSetId,
  creativesByAdSetId,
  onToggleAdSet,
  onOpenDrawer,
  campaignName,
}: {
  rows: PerformanceRow[];
  expandedAdSetId: string | null;
  creativesByAdSetId: Map<string, PerformanceRow[]>;
  onToggleAdSet: (id: string) => void;
  onOpenDrawer: (id: string) => void;
  campaignName: string;
}) {
  if (rows.length === 0) {
    return (
      <div className="py-4 pr-4 text-sm text-hp-muted">
        No ad sets in &ldquo;{campaignName}&rdquo; match the current filters.
      </div>
    );
  }
  return (
    <div className="py-3 pr-4">
      <p className="mb-2 text-[10px] uppercase tracking-[0.14em] text-hp-muted">
        {COUNT.format(rows.length)} ad set{rows.length === 1 ? "" : "s"} in this campaign
      </p>
      <table className="w-full table-fixed border-collapse text-sm">
        <colgroup>
          <col className="w-[44%]" />
          <col className="w-[12%]" />
          <col className="w-[14%]" />
          <col className="w-[14%]" />
          <col className="w-[16%]" />
        </colgroup>
        <thead>
          <tr className="border-b border-hp-rule bg-hp-inset/60">
            <Th>Ad Set</Th>
            <Th>Delivery</Th>
            <Th align="right">Spend</Th>
            <Th align="right">{TERMS.primaryKpi}</Th>
            <Th align="right">Cost / Result</Th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const isExpanded = expandedAdSetId === row.id;
            const childCreatives = creativesByAdSetId.get(row.id) || [];
            return (
              <AdSetRow
                key={row.id}
                row={row}
                isExpanded={isExpanded}
                childCreatives={childCreatives}
                onToggleAdSet={onToggleAdSet}
                onOpenDrawer={onOpenDrawer}
              />
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function AdSetRow({
  row,
  isExpanded,
  childCreatives,
  onToggleAdSet,
  onOpenDrawer,
}: {
  row: PerformanceRow;
  isExpanded: boolean;
  childCreatives: PerformanceRow[];
  onToggleAdSet: (id: string) => void;
  onOpenDrawer: (id: string) => void;
}) {
  return (
    <>
      <tr
        onClick={() => onToggleAdSet(row.id)}
        className={`cursor-pointer border-b border-hp-rule align-middle transition-colors duration-150 hover:bg-hp-inset ${
          isExpanded ? "bg-hp-inset" : ""
        }`}
      >
        <td className="px-3 py-2.5 text-hp-ink">
          <div className="flex items-center gap-2">
            <ChevronRight
              size={11}
              className={`text-hp-muted transition-transform duration-150 ${
                isExpanded ? "rotate-90 text-hp-ink" : ""
              }`}
              aria-hidden
            />
            <span className="font-body">{row.name}</span>
          </div>
        </td>
        <td className="px-3 py-2.5">
          <DeliveryPill row={row} />
        </td>
        <td className="px-3 py-2.5 text-right tabular-nums text-hp-ink">
          {MONEY.format(row.spend)}
        </td>
        <td className="px-3 py-2.5 text-right tabular-nums text-hp-ink">
          <div>{COUNT.format(row.primaryResults)}</div>
          <div className="mt-0.5 text-[9px] uppercase tracking-[0.14em] text-hp-muted">
            {row.primaryResultLabel}
          </div>
        </td>
        <td className="px-3 py-2.5 text-right tabular-nums text-hp-ink">
          {row.costPerPrimaryResult == null
            ? "—"
            : MONEY_CENTS.format(row.costPerPrimaryResult)}
        </td>
      </tr>
      {isExpanded ? (
        <tr className="border-b border-hp-rule">
          <td colSpan={5} className="bg-hp-foundation p-0">
            <div className="border-l-[3px] border-l-hp-ink/30 pl-4">
              <CreativesInline
                rows={childCreatives}
                onOpenDrawer={onOpenDrawer}
                adSetName={row.name}
              />
            </div>
          </td>
        </tr>
      ) : null}
    </>
  );
}

// ── Tier 3: Creatives inline table (not cards) ─────────────────────────────

function CreativesInline({
  rows,
  onOpenDrawer,
  adSetName,
}: {
  rows: PerformanceRow[];
  onOpenDrawer: (id: string) => void;
  adSetName: string;
}) {
  if (rows.length === 0) {
    return (
      <div className="py-4 pr-4 text-sm text-hp-muted">
        No creatives in &ldquo;{adSetName}&rdquo; match the current filters.
      </div>
    );
  }
  return (
    <div className="py-3 pr-4">
      <p className="mb-2 text-[10px] uppercase tracking-[0.14em] text-hp-muted">
        {COUNT.format(rows.length)} creative{rows.length === 1 ? "" : "s"} in this ad set
      </p>
      <table className="w-full table-fixed border-collapse text-sm">
        <colgroup>
          <col className="w-[8%]" />
          <col className="w-[34%]" />
          <col className="w-[10%]" />
          <col className="w-[12%]" />
          <col className="w-[14%]" />
          <col className="w-[12%]" />
          <col className="w-[10%]" />
        </colgroup>
        <thead>
          <tr className="border-b border-hp-rule bg-hp-inset/60">
            <Th>Preview</Th>
            <Th>Creative</Th>
            <Th>Delivery</Th>
            <Th align="right">Spend</Th>
            <Th align="right">{TERMS.primaryKpi}</Th>
            <Th align="right">Cost / Result</Th>
            <Th align="right">CTR</Th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr
              key={row.id}
              onClick={() => onOpenDrawer(row.id)}
              className="cursor-pointer border-b border-hp-rule align-middle transition-colors duration-150 last:border-b-0 hover:bg-hp-inset"
            >
              <td className="px-3 py-2">
                <ThumbCell creative={row} />
              </td>
              <td className="px-3 py-2 text-hp-ink">
                <span className="font-body">{row.name}</span>
              </td>
              <td className="px-3 py-2">
                <DeliveryPill row={row} />
              </td>
              <td className="px-3 py-2 text-right tabular-nums text-hp-ink">
                {MONEY.format(row.spend)}
              </td>
              <td className="px-3 py-2 text-right tabular-nums text-hp-ink">
                {COUNT.format(row.primaryResults)}
              </td>
              <td className="px-3 py-2 text-right tabular-nums text-hp-ink">
                {row.costPerPrimaryResult == null
                  ? "—"
                  : MONEY_CENTS.format(row.costPerPrimaryResult)}
              </td>
              <td className="px-3 py-2 text-right tabular-nums text-hp-ink">
                {row.ctr.toFixed(2)}%
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ThumbCell({ creative }: { creative: PerformanceRow }) {
  const src =
    creative.thumbnailUrl ||
    creative.imageUrl ||
    creative.videoThumbnailUrl ||
    creative.previewUrl;
  if (!src) {
    return (
      <div className="h-12 w-12 border border-dashed border-hp-rule bg-hp-card" aria-hidden />
    );
  }
  return (
    <div className="h-12 w-12 overflow-hidden border border-hp-rule bg-hp-card">
      <img
        src={src}
        alt=""
        referrerPolicy="no-referrer"
        className="h-full w-full object-cover"
      />
    </div>
  );
}

// ── Creative Drawer ────────────────────────────────────────────────────────

function CreativeDrawer({
  creative,
  onClose,
}: {
  creative: PerformanceRow;
  onClose: () => void;
}) {
  const adsManagerUrl = creative.adId
    ? `https://business.facebook.com/adsmanager/manage/ads/edit?selected_ad_ids=${encodeURIComponent(creative.adId)}`
    : null;
  const previewSrc =
    creative.thumbnailUrl ||
    creative.imageUrl ||
    creative.videoThumbnailUrl ||
    creative.previewUrl;
  return (
    <div className="fixed inset-0 z-50 flex">
      <button
        type="button"
        aria-label="Close drawer"
        onClick={onClose}
        className="flex-1 bg-hp-ink/40"
      />
      <aside
        role="dialog"
        aria-modal="true"
        className="flex h-full w-full max-w-[480px] flex-col border-l border-hp-rule bg-hp-card shadow-[-8px_0_24px_rgba(42,39,37,0.08)]"
      >
        <header className="flex items-start justify-between gap-3 border-b border-hp-rule px-6 py-5">
          <div className="min-w-0">
            <p className="text-[10px] uppercase tracking-[0.14em] text-hp-muted">Creative</p>
            <h3 className="mt-1 font-title text-xl leading-tight text-hp-ink break-words">
              {creative.name}
            </h3>
            <div className="mt-2 flex flex-wrap items-center gap-2 text-[10px] uppercase tracking-[0.14em] text-hp-muted">
              <span>{creative.brandCode}</span>
              {creative.campaignUmbrella ? (
                <>
                  <span aria-hidden>·</span>
                  <span>{creative.campaignUmbrella}</span>
                </>
              ) : null}
              <DeliveryPill row={creative} />
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="shrink-0 border border-hp-rule px-3 py-1 text-[10px] uppercase tracking-[0.14em] text-hp-muted transition-colors duration-150 hover:border-hp-ink hover:text-hp-ink"
          >
            Close
          </button>
        </header>
        <div className="flex-1 overflow-y-auto">
          <div className="border-b border-hp-rule p-6">
            {previewSrc ? (
              <div className="aspect-[4/3] w-full overflow-hidden border border-hp-rule bg-hp-card">
                <img
                  src={previewSrc}
                  alt={creative.name}
                  referrerPolicy="no-referrer"
                  className="h-full w-full object-cover"
                />
              </div>
            ) : (
              <div className="flex aspect-[4/3] w-full items-center justify-center border border-dashed border-hp-rule bg-hp-card text-[10px] uppercase tracking-[0.14em] text-hp-muted">
                No preview
              </div>
            )}
            <dl className="mt-4 grid grid-cols-2 gap-3">
              <DrawerStat label="Spend" value={MONEY.format(creative.spend)} />
              <DrawerStat
                label={creative.primaryResultLabel}
                value={COUNT.format(creative.primaryResults)}
              />
              <DrawerStat
                label="Cost / Result"
                value={
                  creative.costPerPrimaryResult == null
                    ? "—"
                    : MONEY_CENTS.format(creative.costPerPrimaryResult)
                }
              />
              <DrawerStat label="CTR" value={`${creative.ctr.toFixed(2)}%`} />
              <DrawerStat label="CPC" value={MONEY_CENTS.format(creative.cpc)} />
              <DrawerStat label="Frequency" value={`${creative.frequency.toFixed(2)}x`} />
            </dl>
          </div>
          <section className="border-b border-hp-rule p-6">
            <p className="text-[10px] uppercase tracking-[0.14em] text-hp-muted">Placement</p>
            <dl className="mt-3 space-y-3 text-sm">
              <PlacementRow label="Campaign" value={creative.campaignName} id={creative.campaignId} />
              <PlacementRow label="Ad Set" value={creative.adSetName} id={creative.adSetId} />
              <PlacementRow label="Ad" value={creative.adName} id={creative.adId} />
              <PlacementRow label="Creative" value={creative.name} id={creative.id} />
            </dl>
          </section>
          {creative.body ? (
            <section className="border-b border-hp-rule p-6">
              <p className="text-[10px] uppercase tracking-[0.14em] text-hp-muted">Body copy</p>
              <p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-hp-body break-words">
                {creative.body}
              </p>
            </section>
          ) : null}
        </div>
        <footer className="border-t border-hp-rule px-6 py-5">
          {adsManagerUrl ? (
            <a
              href={adsManagerUrl}
              target="_blank"
              rel="noreferrer noopener"
              className="flex items-center justify-center gap-2 bg-hp-ink px-4 py-3 text-[11px] uppercase tracking-[0.14em] text-hp-foundation transition-colors duration-150 hover:bg-hp-pink"
            >
              Open in Meta Ads Manager <ExternalLink size={12} />
            </a>
          ) : (
            <div className="text-center text-xs text-hp-muted">
              No ad ID — open Ads Manager directly.
            </div>
          )}
        </footer>
      </aside>
    </div>
  );
}

function DrawerStat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-[9px] uppercase tracking-[0.14em] text-hp-muted">{label}</div>
      <div className="mt-0.5 font-body text-sm tabular-nums text-hp-ink">{value}</div>
    </div>
  );
}

function PlacementRow({
  label,
  value,
  id,
}: {
  label: string;
  value?: string | null;
  id?: string | null;
}) {
  return (
    <div className="grid grid-cols-[100px_1fr] gap-3">
      <dt className="text-[10px] uppercase tracking-[0.14em] text-hp-muted">{label}</dt>
      <dd className="min-w-0 break-words text-hp-ink">
        <div className="text-sm">{value || "—"}</div>
        {id ? (
          <div className="mt-0.5 font-mono text-[10px] text-hp-muted">{id}</div>
        ) : null}
      </dd>
    </div>
  );
}

// ── Tiny shared bits ───────────────────────────────────────────────────────

function Th({
  children,
  align = "left",
}: {
  children: React.ReactNode;
  align?: "left" | "right";
}) {
  return (
    <th
      className={`border-b border-hp-rule px-3 py-2.5 text-[10px] font-normal uppercase tracking-[0.14em] text-hp-muted ${
        align === "right" ? "text-right" : "text-left"
      }`}
    >
      {children}
    </th>
  );
}

function ValueCell({
  value,
  current,
  prior,
  lowerIsBetter,
  label,
}: {
  value: string;
  current?: number | null;
  prior?: number | null;
  lowerIsBetter?: boolean;
  label?: string;
}) {
  return (
    <td className="px-4 py-3 text-right tabular-nums text-hp-ink">
      <div>{value}</div>
      {label ? (
        <div className="mt-0.5 text-[10px] uppercase tracking-[0.14em] text-hp-muted">
          {label}
        </div>
      ) : null}
      <div className="mt-0.5 text-[11px]">
        <Delta current={current} prior={prior} lowerIsBetter={lowerIsBetter} />
      </div>
    </td>
  );
}

function Delta({
  current,
  prior,
  lowerIsBetter,
}: {
  current?: number | null;
  prior?: number | null;
  lowerIsBetter?: boolean;
}) {
  if (current == null || prior == null || prior === 0) {
    return <span className="text-hp-muted">— no prior</span>;
  }
  const change = ((current - prior) / Math.abs(prior)) * 100;
  if (!Number.isFinite(change)) return <span className="text-hp-muted">— no prior</span>;
  if (Math.abs(change) < 3) return <span className="text-hp-muted">Flat</span>;
  const isUp = change > 0;
  const isGood = lowerIsBetter ? !isUp : isUp;
  const color = isGood ? "#245D4D" : "#8D2E2E";
  return (
    <span style={{ color }}>
      {isUp ? "▲" : "▼"} {Math.round(Math.abs(change))}%
    </span>
  );
}

function DeliveryPill({ row }: { row: PerformanceRow }) {
  const label = formatAdDelivery(row.status, row.effectiveStatus);
  const color =
    label === "Live"
      ? "#245D4D"
      : label === "Paused"
        ? "#8B5B19"
        : label === "Off"
          ? "#8D2E2E"
          : "var(--ink-muted)";
  return (
    <span
      className="inline-flex items-center gap-1 text-[10px] uppercase tracking-[0.14em]"
      style={{ color }}
    >
      <span aria-hidden className="h-1.5 w-1.5 rounded-full" style={{ background: color }} />
      {label}
    </span>
  );
}

function EmptyState({
  message,
  inline = false,
}: {
  message: string;
  inline?: boolean;
}) {
  return (
    <div
      className={`text-center text-sm text-hp-muted ${
        inline ? "border-t border-hp-rule px-4 py-8" : "mt-6 border border-dashed border-hp-rule p-8"
      }`}
    >
      {message}
    </div>
  );
}

// ── Title + date helpers ───────────────────────────────────────────────────

function sliceTitle({
  brand,
  umbrella,
}: {
  brand: string;
  umbrella: string;
}) {
  if (umbrella !== "all") return umbrella;
  if (brand !== "all") return `${brand} — all umbrellas`;
  return "All campaigns";
}

function formatDateRange(start: string | null, end: string | null) {
  if (!start || !end) return "—";
  return `${formatMonthDay(start)} – ${formatMonthDay(end)}`;
}

function formatMonthDay(iso: string) {
  const date = new Date(`${iso}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return iso;
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  }).format(date);
}
