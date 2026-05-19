"use client";

/* eslint-disable @next/next/no-img-element */

/**
 * Analyst v2 — from-scratch deep-dive surface.
 *
 * Workflow: an analyst lands here knowing roughly what they want to look at
 * (an umbrella, a date range, a brand). They drill down — Campaigns → Ad
 * Sets → Creatives → Drawer — one focal point at a time. The drill-down
 * path is encoded in the URL so the back button works and a slice can be
 * shared.
 *
 * Intentionally NOT a port of the old DashboardClient. No chat, no trend
 * chart at the top, no creative leaderboard at the bottom. The page does
 * one job: explore down a hierarchy in response to a question that the
 * executive snapshot raised.
 */

import {
  ChevronRight,
  ExternalLink,
  Search,
  X as XIcon,
} from "lucide-react";
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

export function AnalystV2Client({ data }: { data: DashboardPayload }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  // ── URL-derived state ───────────────────────────────────────────────────
  const brand = searchParams.get("brand") || "all";
  const umbrella = searchParams.get("umbrella") || "all";
  const delivery = (searchParams.get("delivery") || "all") as DeliveryFilter;
  const query = searchParams.get("query") || "";
  const campaignId = searchParams.get("campaign");
  const adSetId = searchParams.get("adSet");
  const creativeId = searchParams.get("creative");

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
  // When the URL diverges externally (Clear filters, back button) we rebase.
  // The setState-in-effect here is the canonical "sync to URL" pattern; the
  // lint rule is conservative for the common case but we accept it here.
  const [searchDraft, setSearchDraft] = useState(query);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSearchDraft((prev) => (prev === query ? prev : query));
  }, [query]);
  useEffect(() => {
    if (searchDraft === query) return;
    const handle = window.setTimeout(() => {
      updateParams({ query: searchDraft || null });
    }, 300);
    return () => window.clearTimeout(handle);
  }, [searchDraft, query, updateParams]);

  // ── Derived data ────────────────────────────────────────────────────────
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

  const visibleCampaigns = useMemo(
    () => data.campaigns.filter(baseFilter).sort((a, b) => b.spend - a.spend),
    [baseFilter, data.campaigns],
  );

  const visibleAdSets = useMemo(() => {
    if (!campaignId) return [];
    return data.adSets
      .filter((adSet) => adSet.campaignId === campaignId && baseFilter(adSet))
      .sort((a, b) => b.spend - a.spend);
  }, [baseFilter, data.adSets, campaignId]);

  const visibleCreatives = useMemo(() => {
    if (!adSetId) return [];
    return data.creatives
      .filter((creative) => creative.adSetId === adSetId && baseFilter(creative))
      .sort((a, b) => b.spend - a.spend);
  }, [adSetId, baseFilter, data.creatives]);

  // Δ lookups for campaigns (we have these in comparison.campaigns)
  const priorCampaignById = useMemo(
    () => new Map(data.comparison.campaigns.map((row) => [row.id, row])),
    [data.comparison.campaigns],
  );

  // Drill-up names for breadcrumb display
  const selectedCampaign = useMemo(
    () => data.campaigns.find((c) => c.id === campaignId) || null,
    [campaignId, data.campaigns],
  );
  const selectedAdSet = useMemo(
    () => data.adSets.find((a) => a.id === adSetId) || null,
    [adSetId, data.adSets],
  );
  const selectedCreative = useMemo(
    () => data.creatives.find((c) => c.id === creativeId) || null,
    [creativeId, data.creatives],
  );

  // ── Handlers ────────────────────────────────────────────────────────────
  function selectCampaign(id: string | null) {
    // Selecting a campaign clears the lower tiers
    updateParams({ campaign: id, adSet: null, creative: null });
  }
  function selectAdSet(id: string | null) {
    updateParams({ adSet: id, creative: null });
  }
  function selectCreative(id: string | null) {
    updateParams({ creative: id });
  }

  function clearAllFilters() {
    updateParams({
      brand: null,
      umbrella: null,
      delivery: null,
      query: null,
      campaign: null,
      adSet: null,
      creative: null,
    });
    setSearchDraft("");
  }

  const activeFilterCount = [
    brand !== "all" ? 1 : 0,
    umbrella !== "all" ? 1 : 0,
    delivery !== "all" ? 1 : 0,
    query ? 1 : 0,
  ].reduce((a, b) => a + b, 0);

  // Close drawer on Escape
  useEffect(() => {
    if (!selectedCreative) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") selectCreative(null);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedCreative]);

  return (
    <main className="min-h-screen bg-hp-foundation px-4 py-8 text-hp-body md:px-8">
      <section className="mx-auto max-w-7xl">
        {/* Header */}
        <header className="flex flex-col gap-3 border-b border-hp-rule pb-4 md:flex-row md:items-end md:justify-between md:gap-6">
          <div>
            <p className="text-[10px] uppercase tracking-[0.14em] text-hp-muted">
              Analyst · drill-down view
            </p>
            <h1 className="mt-2 font-title text-2xl leading-tight text-hp-ink md:text-3xl">
              {sliceTitle({ brand, umbrella, selectedCampaign, selectedAdSet })}
            </h1>
            <p className="mt-1 text-xs text-hp-muted">
              {formatDateRange(
                data.sourceTransparency.timeRange.start,
                data.sourceTransparency.timeRange.end,
              )}
              {" · "}
              {COUNT.format(data.campaigns.length)} campaigns ·{" "}
              {COUNT.format(data.adSets.length)} ad sets ·{" "}
              {COUNT.format(data.creatives.length)} creatives in account
            </p>
          </div>
          <WeekWindowToggle defaultMode="cal" />
        </header>

        {/* Filter strip */}
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

        {/* Breadcrumb (drill-down path) */}
        <Breadcrumb
          selectedCampaign={selectedCampaign}
          selectedAdSet={selectedAdSet}
          onClearCampaign={() => selectCampaign(null)}
          onClearAdSet={() => selectAdSet(null)}
        />

        {/* Tier 1: Campaigns */}
        <CampaignsTable
          rows={visibleCampaigns}
          priorById={priorCampaignById}
          selectedId={campaignId}
          onSelect={selectCampaign}
        />

        {/* Tier 2: Ad Sets (only when a campaign is selected) */}
        {campaignId ? (
          <AdSetsTable
            rows={visibleAdSets}
            selectedId={adSetId}
            onSelect={selectAdSet}
            campaignName={selectedCampaign?.name || campaignId}
          />
        ) : null}

        {/* Tier 3: Creatives (only when an ad set is selected) */}
        {adSetId ? (
          <CreativesGrid
            rows={visibleCreatives}
            onSelect={(id) => selectCreative(id)}
            adSetName={selectedAdSet?.name || adSetId}
          />
        ) : null}

        {/* Helper hint when nothing selected and no filter narrows things */}
        {!campaignId && visibleCampaigns.length === 0 ? (
          <EmptyState message="No campaigns match the current filters." />
        ) : null}
      </section>

      {selectedCreative ? (
        <CreativeDrawer
          creative={selectedCreative}
          onClose={() => selectCreative(null)}
        />
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

// ── Breadcrumb (active drill-down path) ────────────────────────────────────

function Breadcrumb({
  selectedCampaign,
  selectedAdSet,
  onClearCampaign,
  onClearAdSet,
}: {
  selectedCampaign: PerformanceRow | null;
  selectedAdSet: PerformanceRow | null;
  onClearCampaign: () => void;
  onClearAdSet: () => void;
}) {
  if (!selectedCampaign) return null;
  return (
    <nav
      aria-label="Drill-down path"
      className="mt-3 flex flex-wrap items-center gap-2 text-[11px] uppercase tracking-[0.14em] text-hp-muted"
    >
      <button
        type="button"
        onClick={onClearCampaign}
        className="border border-hp-rule px-2 py-1 transition-colors duration-150 hover:border-hp-ink hover:text-hp-ink"
      >
        ← All campaigns
      </button>
      <ChevronRight size={12} aria-hidden />
      <span className="border border-hp-ink bg-hp-ink px-2 py-1 text-hp-foundation">
        {selectedCampaign.name}
      </span>
      {selectedAdSet ? (
        <>
          <ChevronRight size={12} aria-hidden />
          <button
            type="button"
            onClick={onClearAdSet}
            className="border border-hp-rule px-2 py-1 transition-colors duration-150 hover:border-hp-ink hover:text-hp-ink"
          >
            ← {selectedAdSet.name}
          </button>
        </>
      ) : null}
    </nav>
  );
}

// ── Tier 1: Campaigns ──────────────────────────────────────────────────────

function CampaignsTable({
  rows,
  priorById,
  selectedId,
  onSelect,
}: {
  rows: PerformanceRow[];
  priorById: Map<string, PerformanceRow>;
  selectedId: string | null;
  onSelect: (id: string | null) => void;
}) {
  if (rows.length === 0) return null;
  return (
    <section className="mt-4 border border-hp-rule bg-hp-card">
      <SectionHead
        eyebrow="Tier 1"
        title="Campaigns"
        count={rows.length}
        helper="Click a row to drill into ad sets."
      />
      <div className="overflow-x-auto">
        <table className="w-full min-w-[760px] table-fixed border-collapse text-sm">
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
              const isSelected = selectedId === row.id;
              return (
                <tr
                  key={row.id}
                  onClick={() => onSelect(isSelected ? null : row.id)}
                  className={`cursor-pointer border-b border-hp-rule align-middle transition-colors duration-150 last:border-b-0 hover:bg-hp-inset ${
                    isSelected ? "bg-hp-inset" : ""
                  }`}
                >
                  <td className="px-4 py-3 text-hp-ink">
                    <div className="flex items-center gap-2">
                      <ChevronRight
                        size={12}
                        className={`text-hp-muted transition-transform duration-150 ${
                          isSelected ? "rotate-90 text-hp-ink" : ""
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
                    value={
                      row.costPerPrimaryResult == null
                        ? "—"
                        : MONEY_CENTS.format(row.costPerPrimaryResult)
                    }
                    current={row.costPerPrimaryResult ?? undefined}
                    prior={prior?.costPerPrimaryResult ?? undefined}
                    lowerIsBetter
                  />
                  <td className="px-4 py-3 text-right tabular-nums text-hp-ink">
                    {row.ctr.toFixed(2)}%
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}

// ── Tier 2: Ad Sets ────────────────────────────────────────────────────────

function AdSetsTable({
  rows,
  selectedId,
  onSelect,
  campaignName,
}: {
  rows: PerformanceRow[];
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  campaignName: string;
}) {
  return (
    <section className="mt-4 border border-hp-rule bg-hp-card">
      <SectionHead
        eyebrow="Tier 2"
        title="Ad Sets"
        count={rows.length}
        helper={`Within "${campaignName}". Click a row to see its creatives.`}
      />
      {rows.length === 0 ? (
        <EmptyState message="This campaign has no ad sets in the current filter." inline />
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] table-fixed border-collapse text-sm">
            <colgroup>
              <col className="w-[44%]" />
              <col className="w-[12%]" />
              <col className="w-[14%]" />
              <col className="w-[14%]" />
              <col className="w-[16%]" />
            </colgroup>
            <thead className="bg-hp-inset">
              <tr>
                <Th>Ad Set</Th>
                <Th>Delivery</Th>
                <Th align="right">Spend</Th>
                <Th align="right">{TERMS.primaryKpi}</Th>
                <Th align="right">Cost / Result</Th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => {
                const isSelected = selectedId === row.id;
                return (
                  <tr
                    key={row.id}
                    onClick={() => onSelect(isSelected ? null : row.id)}
                    className={`cursor-pointer border-b border-hp-rule align-middle transition-colors duration-150 last:border-b-0 hover:bg-hp-inset ${
                      isSelected ? "bg-hp-inset" : ""
                    }`}
                  >
                    <td className="px-4 py-3 text-hp-ink">
                      <div className="flex items-center gap-2">
                        <ChevronRight
                          size={12}
                          className={`text-hp-muted transition-transform duration-150 ${
                            isSelected ? "rotate-90 text-hp-ink" : ""
                          }`}
                          aria-hidden
                        />
                        <span className="font-body">{row.name}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-xs">
                      <DeliveryPill row={row} />
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums text-hp-ink">
                      {MONEY.format(row.spend)}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums text-hp-ink">
                      <div>{COUNT.format(row.primaryResults)}</div>
                      <div className="mt-0.5 text-[10px] uppercase tracking-[0.14em] text-hp-muted">
                        {row.primaryResultLabel}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums text-hp-ink">
                      {row.costPerPrimaryResult == null
                        ? "—"
                        : MONEY_CENTS.format(row.costPerPrimaryResult)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

// ── Tier 3: Creatives ──────────────────────────────────────────────────────

function CreativesGrid({
  rows,
  onSelect,
  adSetName,
}: {
  rows: PerformanceRow[];
  onSelect: (id: string) => void;
  adSetName: string;
}) {
  return (
    <section className="mt-4 border border-hp-rule bg-hp-card">
      <SectionHead
        eyebrow="Tier 3"
        title="Creatives"
        count={rows.length}
        helper={`Within "${adSetName}". Click a card to open the drawer.`}
      />
      {rows.length === 0 ? (
        <EmptyState message="This ad set has no creatives in the current filter." inline />
      ) : (
        <ul className="grid gap-4 p-4 sm:grid-cols-2 lg:grid-cols-3">
          {rows.map((row) => (
            <li key={row.id}>
              <button
                type="button"
                onClick={() => onSelect(row.id)}
                className="group flex w-full flex-col gap-3 border border-hp-rule bg-hp-foundation p-3 text-left transition-colors duration-150 hover:border-hp-ink hover:bg-hp-inset"
              >
                <Preview creative={row} />
                <div className="min-w-0">
                  <div className="line-clamp-2 text-sm font-body text-hp-ink">{row.name}</div>
                  <div className="mt-1 text-[10px] uppercase tracking-[0.14em] text-hp-muted">
                    <DeliveryPill row={row} compact />
                  </div>
                </div>
                <dl className="grid grid-cols-3 gap-2 text-[10px]">
                  <Stat label="Spend" value={MONEY.format(row.spend)} />
                  <Stat
                    label={row.primaryResultLabel}
                    value={COUNT.format(row.primaryResults)}
                  />
                  <Stat
                    label="Cost / Result"
                    value={
                      row.costPerPrimaryResult == null
                        ? "—"
                        : MONEY_CENTS.format(row.costPerPrimaryResult)
                    }
                  />
                </dl>
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function Preview({ creative }: { creative: PerformanceRow }) {
  const src =
    creative.thumbnailUrl ||
    creative.imageUrl ||
    creative.videoThumbnailUrl ||
    creative.previewUrl;
  if (!src) {
    return (
      <div className="flex aspect-[4/3] w-full items-center justify-center border border-dashed border-hp-rule bg-hp-card text-[10px] uppercase tracking-[0.14em] text-hp-muted">
        No preview
      </div>
    );
  }
  return (
    <div className="aspect-[4/3] w-full overflow-hidden border border-hp-rule bg-hp-card">
      <img
        src={src}
        alt={creative.name}
        referrerPolicy="no-referrer"
        className="h-full w-full object-cover"
      />
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-[9px] uppercase tracking-[0.14em] text-hp-muted">{label}</div>
      <div className="mt-0.5 font-body text-sm tabular-nums text-hp-ink">{value}</div>
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
              <DeliveryPill row={creative} compact />
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
            <Preview creative={creative} />
            <dl className="mt-4 grid grid-cols-2 gap-3">
              <Stat label="Spend" value={MONEY.format(creative.spend)} />
              <Stat
                label={creative.primaryResultLabel}
                value={COUNT.format(creative.primaryResults)}
              />
              <Stat
                label="Cost / Result"
                value={
                  creative.costPerPrimaryResult == null
                    ? "—"
                    : MONEY_CENTS.format(creative.costPerPrimaryResult)
                }
              />
              <Stat label="CTR" value={`${creative.ctr.toFixed(2)}%`} />
              <Stat label="CPC" value={MONEY_CENTS.format(creative.cpc)} />
              <Stat label="Frequency" value={`${creative.frequency.toFixed(2)}x`} />
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

function SectionHead({
  eyebrow,
  title,
  count,
  helper,
}: {
  eyebrow: string;
  title: string;
  count: number;
  helper: string;
}) {
  return (
    <header className="flex flex-col gap-1 border-b border-hp-rule px-4 py-3 md:flex-row md:items-baseline md:justify-between">
      <div>
        <p className="text-[10px] uppercase tracking-[0.14em] text-hp-muted">{eyebrow}</p>
        <h2 className="mt-0.5 font-title text-xl leading-tight text-hp-ink">
          {title}{" "}
          <span className="ml-1 text-base font-body text-hp-muted">({COUNT.format(count)})</span>
        </h2>
      </div>
      <p className="text-[11px] text-hp-muted">{helper}</p>
    </header>
  );
}

function Th({
  children,
  align = "left",
}: {
  children: React.ReactNode;
  align?: "left" | "right";
}) {
  return (
    <th
      className={`border-b border-hp-rule px-4 py-3 text-[10px] font-normal uppercase tracking-[0.14em] text-hp-muted ${
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

function DeliveryPill({
  row,
  compact = false,
}: {
  row: PerformanceRow;
  compact?: boolean;
}) {
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
      className={`inline-flex items-center gap-1 text-[10px] uppercase tracking-[0.14em] ${compact ? "" : "border border-hp-rule px-2 py-0.5"}`}
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
  selectedCampaign,
  selectedAdSet,
}: {
  brand: string;
  umbrella: string;
  selectedCampaign: PerformanceRow | null;
  selectedAdSet: PerformanceRow | null;
}) {
  if (selectedAdSet) return selectedAdSet.name;
  if (selectedCampaign) return selectedCampaign.name;
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

