"use client";

import { ExternalLink, FileDown, ImageIcon, Search, X } from "lucide-react";
import { useMemo, useState } from "react";

import type { CreativeAnalysisPayload, CreativeAnalysisRow } from "@/lib/creative-analysis";
import { RunSyncButton } from "./sync-button";

type Props = {
  data: CreativeAnalysisPayload;
  brand?: string | null;
  group?: string | null;
  delivery?: string;
  focus?: string | null;
  canRefreshDiagnostics?: boolean;
};

type SortKey =
  | "score"
  | "spend"
  | "results"
  | "cost"
  | "ctr"
  | "hook"
  | "hold"
  | "fatigue";

const SORT_LABELS: Record<SortKey, string> = {
  score: "Score",
  spend: "Spend",
  results: "Results",
  cost: "Cost / result",
  ctr: "CTR",
  hook: "Hook",
  hold: "Hold",
  fatigue: "Fatigue",
};

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
const NUMBER = new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 });

export function CreativesPanel({
  data,
  brand = "all",
  group = "all",
  delivery = "all",
  focus = null,
  canRefreshDiagnostics = false,
}: Props) {
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("all");
  const [campaign, setCampaign] = useState("all");
  const [adSet, setAdSet] = useState("all");
  const [minSpend, setMinSpend] = useState("");
  const [sort, setSort] = useState<SortKey>("score");
  const [hideFinancials, setHideFinancials] = useState(false);
  const [selectedTarget, setSelectedTarget] = useState<string | null>(focus);
  const selected = useMemo(
    () =>
      selectedTarget
        ? data.rows.find((row) => matchesFocus(row, selectedTarget)) ?? null
        : null,
    [data.rows, selectedTarget],
  );

  const statusOptions = useMemo(
    () => unique(data.rows.map((row) => row.status)).sort(),
    [data.rows],
  );
  const campaignOptions = useMemo(
    () => unique(data.rows.map((row) => row.campaignName)).sort(),
    [data.rows],
  );
  const adSetOptions = useMemo(
    () => unique(data.rows.map((row) => row.adSetName)).sort(),
    [data.rows],
  );

  const rows = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    const spendFloor = Number(minSpend);
    const hasSpendFloor = Number.isFinite(spendFloor) && spendFloor > 0;
    const deliveryFilter = normalizeDeliveryFilter(delivery);

    return data.rows
      .filter((row) => {
        if (status !== "all" && row.status !== status) return false;
        if (brand !== "all" && row.brandCode !== brand && row.brandName !== brand) {
          return false;
        }
        if (group !== "all" && row.campaignUmbrella !== group) return false;
        if (campaign !== "all" && row.campaignName !== campaign) return false;
        if (adSet !== "all" && row.adSetName !== adSet) return false;
        if (deliveryFilter !== "all" && deliveryState(row) !== deliveryFilter) return false;
        if (hasSpendFloor && row.spend < spendFloor) return false;
        if (!normalizedQuery) return true;
        return [
          row.adName,
          row.creativeName,
          row.creativeTitle,
          row.creativeBody,
          row.campaignName,
          row.adSetName,
          row.adId,
          row.creativeId,
        ].some((value) => value?.toLowerCase().includes(normalizedQuery));
      })
      .sort((a, b) => compareRows(a, b, sort));
  }, [adSet, brand, campaign, data.rows, delivery, group, minSpend, query, sort, status]);

  if (!data.configured) {
    return (
      <section className="rounded-xl border border-dashed border-stone-300 bg-white p-6 text-sm text-stone-600">
        Creative diagnostics are missing required configuration:{" "}
        <code className="rounded bg-stone-100 px-1">{data.missingEnv.join(", ") || "—"}</code>.
      </section>
    );
  }

  return (
    <section className="space-y-4">
      <div className="rounded-xl border border-stone-200 bg-white p-4">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <h2 className="text-sm font-semibold text-stone-950">Creative diagnostics</h2>
            <p className="max-w-3xl pt-1 text-xs leading-5 text-stone-600">
              Score, status, hook, hold, conversion efficiency, Meta rankings, and fatigue
              signals from the current Creative Analysis model.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {canRefreshDiagnostics ? (
              <RunSyncButton
                size="sm"
                mode="diagnostics"
                variant="secondary"
                label="Refresh live diagnostics"
                runningLabel="Refreshing diagnostics…"
              />
            ) : null}
            <label className="inline-flex h-9 items-center gap-2 rounded-md border border-stone-300 bg-white px-3 text-xs font-medium text-stone-700">
              <input
                type="checkbox"
                checked={hideFinancials}
                onChange={(event) => setHideFinancials(event.target.checked)}
                className="h-4 w-4 accent-stone-900"
              />
              Hide financials
            </label>
            <button
              type="button"
              onClick={() => exportCreatives(rows, hideFinancials)}
              className="inline-flex h-9 items-center gap-2 rounded-md bg-stone-900 px-3 text-xs font-medium text-stone-50 hover:bg-stone-800"
            >
              <FileDown size={14} />
              Export PDF
            </button>
          </div>
        </div>

        <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-4">
          <SummaryStat label="Rows" value={NUMBER.format(rows.length)} />
          <SummaryStat label="Scale candidates" value={NUMBER.format(countStatus(rows, "Scale Candidate"))} />
          <SummaryStat label="Fatigue watch" value={NUMBER.format(countStatus(rows, "Fatigue Watch"))} />
          <SummaryStat label="Avg score" value={averageScore(rows)} />
        </div>
      </div>

      <div className="rounded-xl border border-stone-200 bg-white p-3">
        <div className="flex flex-wrap items-center gap-2">
          <label className="flex h-9 min-w-0 flex-1 items-center gap-2 rounded-md border border-stone-300 px-2 text-sm text-stone-800 sm:min-w-64 sm:flex-none">
            <Search size={15} className="text-stone-400" />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search creatives"
              className="min-w-0 flex-1 bg-transparent outline-none placeholder:text-stone-400"
            />
          </label>
          <Select label="Status" value={status} onChange={setStatus} options={["all", ...statusOptions]} />
          <Select label="Campaign" value={campaign} onChange={setCampaign} options={["all", ...campaignOptions]} />
          <Select label="Group of Ads" value={adSet} onChange={setAdSet} options={["all", ...adSetOptions]} />
          <label className="inline-flex h-9 items-center gap-2 rounded-md border border-stone-300 bg-white px-2 text-xs text-stone-500">
            Min spend
            <input
              value={minSpend}
              onChange={(event) => setMinSpend(event.target.value)}
              inputMode="decimal"
              placeholder="0"
              className="w-16 bg-transparent text-sm text-stone-900 outline-none placeholder:text-stone-400"
            />
          </label>
          <Select
            label="Sort"
            value={sort}
            onChange={(value) => setSort(value as SortKey)}
            options={Object.keys(SORT_LABELS)}
            labels={SORT_LABELS}
          />
        </div>
      </div>

      {data.warnings.length ? (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          {data.warnings.join(" ")}
        </div>
      ) : null}

      <div className="overflow-hidden rounded-xl border border-stone-200 bg-white">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1180px] text-sm">
            <thead className="bg-stone-50 text-[10px] uppercase tracking-wider text-stone-500">
              <tr>
                <Th>Creative</Th>
                <Th>Score</Th>
                <Th>Status</Th>
                <Th>Delivery</Th>
                {!hideFinancials ? <Th align="right">Spend</Th> : null}
                <Th align="right">Result</Th>
                {!hideFinancials ? <Th align="right">Cost / result</Th> : null}
                <Th align="right">CTR</Th>
                <Th align="right">Hook views</Th>
                <Th align="right">Hold views</Th>
                <Th align="right">Completion</Th>
                <Th>Fatigue</Th>
                <Th>Meta rankings</Th>
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-100">
              {rows.length ? (
                rows.map((row) => (
                  <tr
                    key={row.id}
                    className="cursor-pointer hover:bg-stone-50"
                    onClick={() => setSelectedTarget(row.id)}
                  >
                    <td className="px-3 py-2">
                      <div className="flex min-w-0 items-center gap-3">
                        <Preview row={row} />
                        <div className="min-w-0">
                          <p className="line-clamp-1 font-medium text-stone-950">
                            {row.adName}
                          </p>
                          <p className="line-clamp-1 text-[11px] text-stone-500">
                            {row.adSetName} · {row.campaignName}
                          </p>
                        </div>
                      </div>
                    </td>
                    <td className="px-3 py-2">
                      <ScorePill score={row.internalScore} />
                    </td>
                    <td className="px-3 py-2">
                      <StatusPill status={row.status} />
                    </td>
                    <td className="px-3 py-2">
                      <DeliveryPill state={deliveryState(row)} />
                    </td>
                    {!hideFinancials ? (
                      <Td align="right">{MONEY.format(row.spend)}</Td>
                    ) : null}
                    <Td align="right">
                      {NUMBER.format(row.resultCount)}
                      <span className="block text-[10px] uppercase tracking-wider text-stone-400">
                        {row.resultKpiLabel}
                      </span>
                    </Td>
                    {!hideFinancials ? (
                      <Td align="right">{formatMoney(row.costPerResult)}</Td>
                    ) : null}
                    <Td align="right">{formatPercent(row.ctr)}</Td>
                    <Td align="right">
                      {formatCount(row.hookViews)}
                      <span className="block text-[10px] text-stone-400">
                        {formatRate(row.hookRate)}
                      </span>
                    </Td>
                    <Td align="right" title={row.holdRateSource}>
                      {formatCount(row.holdViews)}
                      <span className="block text-[10px] text-stone-400">
                        {formatRate(row.holdRate)}
                      </span>
                    </Td>
                    <Td align="right">
                      {formatCount(row.completionViews)}
                      <span className="block text-[10px] text-stone-400">
                        {formatRate(row.completionRate)}
                      </span>
                    </Td>
                    <td className="px-3 py-2">
                      <FatiguePill row={row} />
                    </td>
                    <td className="px-3 py-2 text-xs text-stone-600">
                      {rankingSummary(row)}
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td
                    colSpan={hideFinancials ? 11 : 13}
                    className="px-4 py-10 text-center text-sm text-stone-500"
                  >
                    No creatives match these filters.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <footer className="flex items-center justify-between border-t border-stone-200 bg-stone-50 px-3 py-2 text-xs text-stone-500">
          <span>{rows.length} creatives</span>
          <span>Click a row for score details</span>
        </footer>
      </div>

      {selected ? (
        <CreativeDiagnosticsDrawer
          row={selected}
          hideFinancials={hideFinancials}
          onClose={() => setSelectedTarget(null)}
        />
      ) : null}
    </section>
  );
}

function CreativeDiagnosticsDrawer({
  row,
  hideFinancials,
  onClose,
}: {
  row: CreativeAnalysisRow;
  hideFinancials: boolean;
  onClose: () => void;
}) {
  const adsManagerUrl = row.adId
    ? `https://business.facebook.com/adsmanager/manage/ads/edit?selected_ad_ids=${encodeURIComponent(row.adId)}`
    : null;

  return (
    <div className="fixed inset-0 z-50 flex">
      <button
        type="button"
        onClick={onClose}
        aria-label="Close creative detail"
        className="flex-1 bg-stone-900/30 backdrop-blur-sm"
      />
      <aside
        aria-label="Creative diagnostics"
        className="flex h-full w-full max-w-2xl flex-col overflow-y-auto border-l border-stone-200 bg-white shadow-2xl"
      >
        <header className="sticky top-0 z-10 flex items-start gap-3 border-b border-stone-200 bg-white px-5 py-4">
          <div className="min-w-0 flex-1">
            <p className="text-[10px] uppercase tracking-wider text-stone-500">
              Creative diagnostics
            </p>
            <h2 className="line-clamp-2 pt-1 text-base font-semibold text-stone-950">
              {row.adName}
            </h2>
            <p className="line-clamp-1 pt-0.5 text-xs text-stone-500">
              {row.adSetName} · {row.campaignName}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-stone-300 text-stone-600 hover:bg-stone-50"
            aria-label="Close"
          >
            <X size={15} />
          </button>
        </header>

        <div className="space-y-5 p-5">
          <div className="grid gap-5 lg:grid-cols-[220px_1fr]">
            <LargePreview row={row} />
            <section className="rounded-lg border border-stone-200 p-4">
              <div className="flex flex-wrap items-start gap-3">
                <ScorePill score={row.internalScore} large />
                <StatusPill status={row.status} />
                <DeliveryPill state={deliveryState(row)} />
              </div>
              <p className="pt-4 text-lg leading-7 text-stone-950">{row.diagnosis}</p>
              <div className="mt-4 border-t border-stone-200 pt-3">
                <p className="text-[10px] uppercase tracking-wider text-stone-500">
                  Suggested next step
                </p>
                <p className="pt-1 text-sm leading-6 text-stone-700">{row.nextAction}</p>
              </div>
            </section>
          </div>

          <section className="rounded-lg border border-stone-200 p-4">
            <div className="mb-3 flex items-baseline justify-between">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-stone-700">
                Key numbers
              </h3>
              {row.previousSnapshot ? (
                <span className="text-[10px] uppercase tracking-wider text-stone-400">
                  Prior-period deltas available
                </span>
              ) : null}
            </div>
            <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
              {!hideFinancials ? <Metric label="Spend" value={MONEY.format(row.spend)} /> : null}
              <Metric label={row.resultKpiLabel} value={NUMBER.format(row.resultCount)} />
              {!hideFinancials ? <Metric label="Cost / result" value={formatMoney(row.costPerResult)} /> : null}
              <Metric label="CTR" value={formatPercent(row.ctr)} />
              <Metric label="Frequency" value={`${row.frequency.toFixed(2)}x`} />
              <Metric label="Hook views" value={formatCount(row.hookViews)} helper={formatRate(row.hookRate)} />
              <Metric label="Hold views" value={formatCount(row.holdViews)} helper={formatRate(row.holdRate)} />
              <Metric label="Completion views" value={formatCount(row.completionViews)} helper={formatRate(row.completionRate)} />
            </div>
          </section>

          <section className="rounded-lg border border-stone-200 p-4">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-stone-700">
              Why this score
            </h3>
            <p className="pt-1 text-xs leading-5 text-stone-500">
              Internal heuristic only. It compares this creative against the selected account
              set and current KPI resolution, not final sales quality.
            </p>
            <div className="mt-4 space-y-3">
              <ScoreLine label="Hook strength" value={row.scoreBreakdown.hookStrength} />
              <ScoreLine label="Hold / retention" value={row.scoreBreakdown.holdRetention} />
              <ScoreLine label="Click intent" value={row.scoreBreakdown.clickIntent} />
              <ScoreLine label="Primary KPI efficiency" value={row.scoreBreakdown.conversionEfficiency} />
              <ScoreLine label="Meta ranking diagnostics" value={row.scoreBreakdown.metaRankingDiagnostics} />
              <ScoreLine label="Fatigue resistance" value={row.scoreBreakdown.fatigueRisk} />
            </div>
          </section>

          <section className="rounded-lg border border-stone-200 p-4">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-stone-700">
              Fatigue check
            </h3>
            <ul className="mt-3 space-y-2 text-sm leading-6 text-stone-700">
              {row.fatigueSignal.reasons.map((reason) => (
                <li key={reason} className="flex gap-2">
                  <span aria-hidden className="text-stone-400">•</span>
                  <span>{reason}</span>
                </li>
              ))}
            </ul>
          </section>

          {row.creativeBody ? (
            <section className="rounded-lg border border-stone-200 p-4">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-stone-700">
                Body copy
              </h3>
              <p className="whitespace-pre-wrap pt-2 text-sm leading-6 text-stone-700">
                {row.creativeBody}
              </p>
            </section>
          ) : null}

          <details className="rounded-lg border border-stone-200 p-4">
            <summary className="cursor-pointer text-xs font-semibold uppercase tracking-wider text-stone-700">
              Technical details
            </summary>
            <dl className="mt-3 grid gap-2 text-xs text-stone-700 sm:grid-cols-2">
              <Detail label="Ad ID" value={row.adId} mono />
              <Detail label="Creative ID" value={row.creativeId} mono />
              <Detail label="Campaign ID" value={row.campaignId} mono />
              <Detail label="Ad set ID" value={row.adSetId} mono />
              <Detail label="Objective" value={row.objective} />
              <Detail label="Optimization" value={row.optimizationGoal} />
              <Detail label="Quality ranking" value={row.qualityRanking} />
              <Detail label="Engagement ranking" value={row.engagementRateRanking} />
              <Detail label="Conversion ranking" value={row.conversionRateRanking} />
              <Detail label="Hook source" value={row.hookRateSource} />
              <Detail label="Hold source" value={row.holdRateSource} />
              <Detail label="Synced" value={formatDateTime(row.adStatusSyncedAt)} />
            </dl>
          </details>

          <footer className="flex flex-col gap-2 sm:flex-row">
            {row.previewUrl ? (
              <a
                href={row.previewUrl}
                target="_blank"
                rel="noreferrer"
                className="inline-flex h-10 flex-1 items-center justify-center gap-2 rounded-md border border-stone-300 text-sm font-medium text-stone-800 hover:bg-stone-50"
              >
                Preview ad <ExternalLink size={14} />
              </a>
            ) : null}
            {adsManagerUrl ? (
              <a
                href={adsManagerUrl}
                target="_blank"
                rel="noreferrer"
                className="inline-flex h-10 flex-1 items-center justify-center gap-2 rounded-md bg-stone-900 text-sm font-medium text-stone-50 hover:bg-stone-800"
              >
                Open in Ads Manager <ExternalLink size={14} />
              </a>
            ) : null}
          </footer>
        </div>
      </aside>
    </div>
  );
}

function Select({
  label,
  value,
  options,
  labels,
  onChange,
}: {
  label: string;
  value: string;
  options: string[];
  labels?: Record<string, string>;
  onChange: (value: string) => void;
}) {
  return (
    <label className="inline-flex h-9 items-center gap-2 rounded-md border border-stone-300 bg-white px-2 text-xs text-stone-500">
      <span>{label}</span>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="max-w-44 bg-transparent text-sm font-medium text-stone-900 outline-none"
      >
        {options.map((option) => (
          <option key={option} value={option}>
            {labels?.[option] ?? (option === "all" ? "All" : option)}
          </option>
        ))}
      </select>
    </label>
  );
}

function SummaryStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-stone-200 bg-stone-50 px-3 py-2">
      <p className="text-[10px] uppercase tracking-wider text-stone-500">{label}</p>
      <p className="pt-1 text-lg font-semibold tabular-nums text-stone-950">{value}</p>
    </div>
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
    <th className={`px-3 py-2 ${align === "right" ? "text-right" : "text-left"}`}>
      {children}
    </th>
  );
}

function Td({
  children,
  align = "left",
  title,
}: {
  children: React.ReactNode;
  align?: "left" | "right";
  title?: string | null;
}) {
  return (
    <td
      title={title ?? undefined}
      className={[
        "px-3 py-2 align-middle tabular-nums text-stone-800",
        align === "right" ? "text-right" : "",
      ].join(" ")}
    >
      {children}
    </td>
  );
}

function Preview({ row }: { row: CreativeAnalysisRow }) {
  const [failed, setFailed] = useState(false);
  const src = failed ? null : row.thumbnailUrl ?? row.imageUrl;
  if (!src) {
    return (
      <div className="grid h-11 w-11 shrink-0 place-items-center rounded-md border border-stone-200 bg-stone-100 text-stone-400">
        <ImageIcon size={15} />
      </div>
    );
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt=""
      className="h-11 w-11 shrink-0 rounded-md border border-stone-200 object-cover"
      loading="lazy"
      onError={() => setFailed(true)}
    />
  );
}

function LargePreview({ row }: { row: CreativeAnalysisRow }) {
  const [failed, setFailed] = useState(false);
  const src = failed ? null : row.imageUrl ?? row.thumbnailUrl;
  if (!src) {
    return (
      <div className="grid aspect-square w-full place-items-center rounded-lg border border-dashed border-stone-300 text-stone-400">
        <ImageIcon size={24} />
      </div>
    );
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt=""
      className="aspect-square w-full rounded-lg border border-stone-200 object-cover"
      onError={() => setFailed(true)}
    />
  );
}

function ScorePill({ score, large = false }: { score: number; large?: boolean }) {
  const color = score >= 75 ? "bg-emerald-50 text-emerald-800 border-emerald-200" :
    score >= 55 ? "bg-amber-50 text-amber-800 border-amber-200" :
      "bg-rose-50 text-rose-800 border-rose-200";
  return (
    <span
      className={[
        "inline-flex items-center rounded-full border font-semibold tabular-nums",
        large ? "h-9 px-3 text-sm" : "h-7 px-2 text-xs",
        color,
      ].join(" ")}
    >
      {score}/100
    </span>
  );
}

function StatusPill({ status }: { status: CreativeAnalysisRow["status"] }) {
  const color = status === "Scale Candidate" ? "border-emerald-200 bg-emerald-50 text-emerald-800" :
    status === "Fatigue Watch" ? "border-amber-200 bg-amber-50 text-amber-800" :
      status.includes("Needs") || status === "Clickbait Risk" ? "border-rose-200 bg-rose-50 text-rose-800" :
        "border-stone-200 bg-stone-50 text-stone-700";
  return (
    <span className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-medium ${color}`}>
      {status}
    </span>
  );
}

function DeliveryPill({ state }: { state: string }) {
  const color = state === "live" ? "border-emerald-200 bg-emerald-50 text-emerald-800" :
    state === "paused" ? "border-amber-200 bg-amber-50 text-amber-800" :
      "border-stone-200 bg-stone-100 text-stone-700";
  return (
    <span className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-medium capitalize ${color}`}>
      {state}
    </span>
  );
}

function FatiguePill({ row }: { row: CreativeAnalysisRow }) {
  const level = row.fatigueSignal.level;
  const color = level === "high" ? "text-rose-700" :
    level === "watch" ? "text-amber-700" :
      level === "low" ? "text-emerald-700" :
        "text-stone-500";
  return <span className={`text-xs font-medium capitalize ${color}`}>{level}</span>;
}

function Metric({
  label,
  value,
  helper,
}: {
  label: string;
  value: string;
  helper?: string;
}) {
  return (
    <div className="rounded-md bg-stone-50 px-3 py-2">
      <p className="text-[10px] uppercase tracking-wider text-stone-500">{label}</p>
      <p className="pt-1 text-sm font-semibold tabular-nums text-stone-950">{value}</p>
      {helper ? <p className="pt-0.5 text-xs tabular-nums text-stone-500">{helper}</p> : null}
    </div>
  );
}

function ScoreLine({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <div className="flex items-center justify-between gap-3 text-xs">
        <span className="text-stone-700">{label}</span>
        <span className="font-medium tabular-nums text-stone-950">{Math.round(value)}</span>
      </div>
      <div className="mt-1 h-2 rounded-full bg-stone-100">
        <div
          className="h-2 rounded-full bg-stone-900"
          style={{ width: `${Math.max(0, Math.min(100, value))}%` }}
        />
      </div>
    </div>
  );
}

function Detail({
  label,
  value,
  mono,
}: {
  label: string;
  value: string | null | undefined;
  mono?: boolean;
}) {
  if (!value) return null;
  return (
    <div className="min-w-0">
      <dt className="text-[10px] uppercase tracking-wider text-stone-500">{label}</dt>
      <dd className={["truncate pt-0.5 text-stone-800", mono ? "font-mono text-[11px]" : ""].join(" ")} title={value}>
        {value}
      </dd>
    </div>
  );
}

function unique(values: Array<string | null | undefined>) {
  return Array.from(new Set(values.filter((value): value is string => Boolean(value))));
}

function normalizeDeliveryFilter(value: string) {
  return value === "live" || value === "paused" || value === "off" ? value : "all";
}

function matchesFocus(row: CreativeAnalysisRow, focus: string) {
  return row.id === focus || row.creativeId === focus || row.adId === focus;
}

function compareRows(a: CreativeAnalysisRow, b: CreativeAnalysisRow, sort: SortKey) {
  switch (sort) {
    case "score":
      return b.internalScore - a.internalScore;
    case "spend":
      return b.spend - a.spend;
    case "results":
      return b.resultCount - a.resultCount;
    case "cost":
      return (a.costPerResult ?? Infinity) - (b.costPerResult ?? Infinity);
    case "ctr":
      return b.ctr - a.ctr;
    case "hook":
      return (b.hookRate ?? -1) - (a.hookRate ?? -1);
    case "hold":
      return (b.holdRate ?? -1) - (a.holdRate ?? -1);
    case "fatigue":
      return fatigueRank(b.fatigueSignal.level) - fatigueRank(a.fatigueSignal.level);
    default: {
      const exhaustive: never = sort;
      return exhaustive;
    }
  }
}

function fatigueRank(level: string) {
  if (level === "high") return 3;
  if (level === "watch") return 2;
  if (level === "low") return 1;
  return 0;
}

function countStatus(rows: CreativeAnalysisRow[], status: CreativeAnalysisRow["status"]) {
  return rows.filter((row) => row.status === status).length;
}

function averageScore(rows: CreativeAnalysisRow[]) {
  if (!rows.length) return "—";
  return String(Math.round(rows.reduce((sum, row) => sum + row.internalScore, 0) / rows.length));
}

function deliveryState(row: CreativeAnalysisRow) {
  const state = (row.adEffectiveStatus || row.adConfiguredStatus || "").toLowerCase();
  if (state.includes("active")) return "live";
  if (state.includes("paused")) return "paused";
  return "off";
}

function formatMoney(value: number | null) {
  if (value === null || !Number.isFinite(value)) return "—";
  return value >= 100 ? MONEY.format(value) : MONEY_CENTS.format(value);
}

function formatPercent(value: number | null) {
  if (value === null || !Number.isFinite(value)) return "—";
  return `${value.toFixed(2)}%`;
}

function formatRate(value: number | null) {
  if (value === null || !Number.isFinite(value)) return "—";
  return `${Math.round(value * 100)}%`;
}

function formatCount(value: number | null) {
  if (value === null || !Number.isFinite(value)) return "—";
  return NUMBER.format(value);
}

function rankingSummary(row: CreativeAnalysisRow) {
  const parts = [
    row.qualityRanking ? `Q ${rankingLabel(row.qualityRanking)}` : null,
    row.engagementRateRanking ? `E ${rankingLabel(row.engagementRateRanking)}` : null,
    row.conversionRateRanking ? `C ${rankingLabel(row.conversionRateRanking)}` : null,
  ].filter(Boolean);
  return parts.length ? parts.join(" · ") : "Unavailable";
}

function rankingLabel(value: string) {
  return value.replace(/_/g, " ").replace(/\b\w/g, (char) => char.toUpperCase());
}

function formatDateTime(value: string | null) {
  if (!value) return null;
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function exportCreatives(rows: CreativeAnalysisRow[], hideFinancials: boolean) {
  const html = buildExportHtml(rows, hideFinancials);
  const printWindow = window.open("", "_blank", "noopener,noreferrer,width=1200,height=800");
  if (!printWindow) return;
  printWindow.document.open();
  printWindow.document.write(html);
  printWindow.document.close();
  printWindow.focus();
  printWindow.print();
}

function buildExportHtml(rows: CreativeAnalysisRow[], hideFinancials: boolean) {
  const financialHeaders = hideFinancials ? "" : "<th>Spend</th><th>Cost / result</th>";
  const body = rows
    .map((row) => {
      const financialCells = hideFinancials
        ? ""
        : `<td>${escapeHtml(MONEY.format(row.spend))}</td><td>${escapeHtml(formatMoney(row.costPerResult))}</td>`;
      return `<tr>
        <td>${escapeHtml(row.adName)}</td>
        <td>${escapeHtml(row.campaignName)}</td>
        <td>${escapeHtml(String(row.internalScore))}</td>
        <td>${escapeHtml(row.status)}</td>
        ${financialCells}
        <td>${escapeHtml(NUMBER.format(row.resultCount))}</td>
        <td>${escapeHtml(formatPercent(row.ctr))}</td>
        <td>${escapeHtml(formatCount(row.hookViews))}</td>
        <td>${escapeHtml(formatCount(row.holdViews))}</td>
        <td>${escapeHtml(row.fatigueSignal.level)}</td>
      </tr>`;
    })
    .join("");

  return `<!doctype html>
    <html>
      <head>
        <title>Optimize Creatives Export</title>
        <style>
          body { font-family: ui-serif, Georgia, serif; color: #292524; padding: 28px; }
          h1 { font-size: 22px; margin: 0 0 4px; }
          p { margin: 0 0 18px; color: #78716c; font-size: 12px; }
          table { width: 100%; border-collapse: collapse; font-size: 11px; }
          th { text-align: left; border-bottom: 1px solid #d6d3d1; padding: 7px 6px; text-transform: uppercase; letter-spacing: .08em; color: #78716c; }
          td { border-bottom: 1px solid #e7e5e4; padding: 7px 6px; vertical-align: top; }
        </style>
      </head>
      <body>
        <h1>Optimize Creatives</h1>
        <p>${rows.length} rows · generated ${new Date().toLocaleString()}${hideFinancials ? " · financials hidden" : ""}</p>
        <table>
          <thead>
            <tr>
              <th>Creative</th><th>Campaign</th><th>Score</th><th>Status</th>${financialHeaders}<th>Results</th><th>CTR</th><th>Hook views</th><th>Hold views</th><th>Fatigue</th>
            </tr>
          </thead>
          <tbody>${body}</tbody>
        </table>
      </body>
    </html>`;
}

function escapeHtml(value: string | number | null | undefined) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}
