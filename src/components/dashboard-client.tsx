"use client";

/* eslint-disable @next/next/no-img-element */

import {
  AlertTriangle,
  BarChart3,
  Bot,
  CalendarRange,
  ChevronRight,
  FileDown,
  GalleryHorizontalEnd,
  MessageSquare,
  RefreshCw,
  Search,
  Send,
  Table2,
} from "lucide-react";
import {
  type FormEvent,
  memo,
  useCallback,
  useDeferredValue,
  useEffect,
  useMemo,
  useState,
} from "react";
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import type { ActionBucket, ActionItem, DashboardPayload, PerformanceRow } from "@/lib/analytics";

type ViewMode = "table" | "cards" | "gallery";
type SortKey = "spend" | "primaryResults" | "ctr" | "cpc" | "newMessagingContacts" | "frequency";

type Props = {
  initialData: DashboardPayload;
};

type ChatMessage = {
  role: "user" | "assistant";
  content: string;
};

const SORT_LABELS: Record<SortKey, string> = {
  spend: "Spend",
  primaryResults: "Primary KPI",
  ctr: "CTR",
  cpc: "CPC",
  newMessagingContacts: "New Msg Contacts",
  frequency: "Frequency",
};

const MONEY_FORMATTER_WITH_CENTS = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 2,
});
const MONEY_FORMATTER_WHOLE = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
});
const NUMBER_FORMATTER = new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 });

export function DashboardClient({ initialData }: Props) {
  const data = initialData;
  const [brand, setBrand] = useState("all");
  const [umbrella, setUmbrella] = useState("all");
  const [startDate, setStartDate] = useState(data.sourceTransparency.timeRange.start || "");
  const [endDate, setEndDate] = useState(data.sourceTransparency.timeRange.end || "");
  const [isApplyingRange, setIsApplyingRange] = useState(false);
  const [query, setQuery] = useState("");
  const [viewMode, setViewMode] = useState<ViewMode>("table");
  const [sortKey, setSortKey] = useState<SortKey>("spend");
  const [compareEnabled, setCompareEnabled] = useState(true);
  const [drawerCreativeId, setDrawerCreativeId] = useState<string | null>(null);
  const [isSyncing, setIsSyncing] = useState(false);
  const [isReporting, setIsReporting] = useState(false);
  const [reportStatus, setReportStatus] = useState("");
  const [chatInput, setChatInput] = useState("");
  const [chatSessionId, setChatSessionId] = useState<string | null>(null);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [isChatting, setIsChatting] = useState(false);
  const [hidePdfFinancials, setHidePdfFinancials] = useState(false);
  const deferredQuery = useDeferredValue(query);
  const normalizedQuery = useMemo(
    () => deferredQuery.trim().toLowerCase(),
    [deferredQuery],
  );

  useEffect(() => {
    setStartDate(data.sourceTransparency.timeRange.start || "");
    setEndDate(data.sourceTransparency.timeRange.end || "");
    setIsApplyingRange(false);
  }, [data.sourceTransparency.timeRange.end, data.sourceTransparency.timeRange.start]);

  useEffect(() => {
    if (!drawerCreativeId) return;
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") setDrawerCreativeId(null);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [drawerCreativeId]);

  const brands = useMemo(
    () => ["all", ...Array.from(new Set(data.byBrand.map((row) => row.brandCode)))],
    [data.byBrand],
  );

  const umbrellaOptions = useMemo(
    () => ["all", ...data.campaignUmbrellas],
    [data.campaignUmbrellas],
  );

  const filteredCampaigns = useMemo(
    () =>
      filterAndSortRows(data.campaigns, brand, umbrella, normalizedQuery, sortKey),
    [brand, data.campaigns, normalizedQuery, sortKey, umbrella],
  );

  const filteredAdSets = useMemo(
    () =>
      filterAndSortRows(data.adSets, brand, umbrella, normalizedQuery, sortKey),
    [brand, data.adSets, normalizedQuery, sortKey, umbrella],
  );

  const filteredCreatives = useMemo(() => {
    return filterAndSortRows(data.creatives, brand, umbrella, normalizedQuery, sortKey);
  }, [brand, data.creatives, normalizedQuery, sortKey, umbrella]);

  const creativeById = useMemo(() => {
    const map = new Map<string, PerformanceRow>();
    for (const creative of data.creatives) {
      map.set(creative.id, creative);
    }
    return map;
  }, [data.creatives]);

  const drawerCreative = drawerCreativeId ? creativeById.get(drawerCreativeId) || null : null;

  const openCreativeDrawer = useCallback((creativeId: string) => {
    setDrawerCreativeId(creativeId);
  }, []);
  const closeCreativeDrawer = useCallback(() => setDrawerCreativeId(null), []);

  const visibleCampaigns = useMemo(() => filteredCampaigns.slice(0, 10), [filteredCampaigns]);
  const visibleAdSets = useMemo(() => filteredAdSets.slice(0, 10), [filteredAdSets]);
  const visibleCreativeTableRows = useMemo(
    () => filteredCreatives.slice(0, 50),
    [filteredCreatives],
  );
  const visibleCreativeCardRows = useMemo(
    () => filteredCreatives.slice(0, 18),
    [filteredCreatives],
  );
  const visibleCreativeGalleryRows = useMemo(
    () => filteredCreatives.slice(0, 24),
    [filteredCreatives],
  );

  const overviewSparklines = useMemo(() => {
    const byDate = new Map<
      string,
      { spend: number; impressions: number; clicks: number; primaryResults: number }
    >();
    for (const row of data.dailyTrend) {
      const existing = byDate.get(row.date) || {
        spend: 0,
        impressions: 0,
        clicks: 0,
        primaryResults: 0,
      };
      existing.spend += row.spend;
      existing.impressions += row.impressions;
      existing.clicks += row.clicks;
      existing.primaryResults += row.primaryResults;
      byDate.set(row.date, existing);
    }
    const ordered = Array.from(byDate.entries()).sort(([a], [b]) => a.localeCompare(b));
    return {
      spend: ordered.map(([, v]) => v.spend),
      impressions: ordered.map(([, v]) => v.impressions),
      ctr: ordered.map(([, v]) => (v.impressions > 0 ? (v.clicks / v.impressions) * 100 : 0)),
      cpc: ordered.map(([, v]) => (v.clicks > 0 ? v.spend / v.clicks : 0)),
      primaryResults: ordered.map(([, v]) => v.primaryResults),
    };
  }, [data.dailyTrend]);

  const umbrellaScorecard = useMemo(() => {
    const priorById = new Map(
      data.comparison.byUmbrella.map((row) => [row.id, row]),
    );
    return data.byUmbrella.map((row) => {
      const prior = priorById.get(row.id);
      return { current: row, prior };
    });
  }, [data.byUmbrella, data.comparison.byUmbrella]);

  const trendRows = useMemo(() => {
    const byDate = new Map<string, Record<string, string | number>>();
    for (const row of data.dailyTrend.filter((trend) => {
      return (
        (brand === "all" || trend.brandCode === brand) &&
        (umbrella === "all" || trend.campaignUmbrella === umbrella)
      );
    })) {
      const existing = byDate.get(row.date) || { date: row.date };
      existing[`${row.brandCode} spend`] = row.spend;
      existing[`${row.brandCode} ctr`] = row.ctr;
      byDate.set(row.date, existing);
    }
    return Array.from(byDate.values());
  }, [brand, data.dailyTrend, umbrella]);

  const runManualSync = useCallback(async function runManualSync() {
    setIsSyncing(true);
    try {
      const response = await fetch("/api/sync", { method: "POST" });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Sync failed");
      window.location.reload();
    } catch (error) {
      setReportStatus(error instanceof Error ? error.message : String(error));
    } finally {
      setIsSyncing(false);
    }
  }, []);

  const generateReport = useCallback(async function generateReport() {
    setIsReporting(true);
    setReportStatus("");
    try {
      const response = await fetch("/api/reports", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          days: data.sourceTransparency.timeRange.days,
          startDate,
          endDate,
        }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Report generation failed");
      setReportStatus(`Report generated: ${payload.title}`);
      window.location.reload();
    } catch (error) {
      setReportStatus(error instanceof Error ? error.message : String(error));
    } finally {
      setIsReporting(false);
    }
  }, [data.sourceTransparency.timeRange.days, endDate, startDate]);

  const sendChatMessage = useCallback(async function sendChatMessage() {
    const message = chatInput.trim();
    if (!message) return;
    setChatInput("");
    setChatMessages((messages) => [...messages, { role: "user", content: message }]);
    setIsChatting(true);

    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          sessionId: chatSessionId,
          message,
          days: data.sourceTransparency.timeRange.days,
          startDate,
          endDate,
        }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Chat failed");
      setChatSessionId(payload.sessionId);
      setChatMessages((messages) => [
        ...messages,
        { role: "assistant", content: payload.answer },
      ]);
    } catch (error) {
      setChatMessages((messages) => [
        ...messages,
        {
          role: "assistant",
          content: error instanceof Error ? error.message : String(error),
        },
      ]);
    } finally {
      setIsChatting(false);
    }
  }, [chatInput, chatSessionId, data.sourceTransparency.timeRange.days, endDate, startDate]);

  const applyDateRange = useCallback(function applyDateRange(nextStart = startDate, nextEnd = endDate) {
    if (!nextStart || !nextEnd) return;
    const url = new URL(window.location.href);
    url.searchParams.set("start", nextStart);
    url.searchParams.set("end", nextEnd);
    url.searchParams.delete("days");
    setIsApplyingRange(true);
    window.location.assign(url.toString());
  }, [endDate, startDate]);

  const applyQuickRange = useCallback(function applyQuickRange(days: number) {
    const end = data.sourceTransparency.timeRange.end || toDateInput(new Date());
    const start = shiftDate(end, -(days - 1));
    setStartDate(start);
    setEndDate(end);
    applyDateRange(start, end);
  }, [applyDateRange, data.sourceTransparency.timeRange.end]);

  const exportCreativesPdf = useCallback(async function exportCreativesPdf() {
    const activeRange = data.sourceTransparency.timeRange;
    const hideFinancialSort = hidePdfFinancials && isFinancialSortKey(sortKey);
    const exportRows = hideFinancialSort
      ? [...filteredCreatives].sort(
          (a, b) => Number(b.primaryResults || 0) - Number(a.primaryResults || 0),
        )
      : filteredCreatives;
    const html = buildCreativePdfHtml({
      rows: exportRows,
      dateRange: formatDateRange(
        activeRange.start || startDate,
        activeRange.end || endDate,
      ),
      umbrellaName: formatUmbrellaName(umbrella),
      brandName: brand === "all" ? "All Brands" : brand,
      searchQuery: query,
      sortLabel: hideFinancialSort ? SORT_LABELS.primaryResults : SORT_LABELS[sortKey],
      generatedAt: new Date(),
      hideFinancials: hidePdfFinancials,
    });

    await printHtmlDocument(html);
  }, [
    brand,
    data.sourceTransparency.timeRange,
    endDate,
    filteredCreatives,
    hidePdfFinancials,
    query,
    sortKey,
    startDate,
    umbrella,
  ]);

  if (!data.configured) {
    return (
      <main className="min-h-screen bg-hp-foundation px-6 py-8 text-hp-body md:px-10">
        <ShellHeader data={data} />
        <section className="mx-auto mt-10 max-w-4xl border border-hp-rule bg-hp-card p-8">
          <span className="text-[11px] uppercase tracking-[0.14em] text-hp-muted">
            Setup Required
          </span>
          <h1 className="mt-3 font-title text-4xl leading-tight text-hp-ink">
            Configuration incomplete
          </h1>
          <div className="mt-6 grid gap-2 sm:grid-cols-2">
            {data.missingEnv.map((env) => (
              <div key={env} className="border border-hp-rule bg-hp-inset px-4 py-3 text-sm">
                {env}
              </div>
            ))}
          </div>
        </section>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-hp-foundation px-4 py-6 text-hp-body md:px-8">
      <ShellHeader data={data} />

      <section className="mx-auto mt-8 max-w-7xl">
        <DataCoverageNotice data={data} />

        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
          <MetricTile
            label="Spend"
            value={formatMetric(data.overview.spend, "money")}
            current={data.overview.spend}
            previous={data.comparison.overview.spend}
            sparkline={overviewSparklines.spend}
            showComparison={compareEnabled}
          />
          <MetricTile
            label="Impressions"
            value={formatMetric(data.overview.impressions, "number")}
            current={data.overview.impressions}
            previous={data.comparison.overview.impressions}
            sparkline={overviewSparklines.impressions}
            showComparison={compareEnabled}
          />
          <MetricTile
            label="CTR"
            value={formatMetric(data.overview.ctr, "percent")}
            current={data.overview.ctr}
            previous={data.comparison.overview.ctr}
            sparkline={overviewSparklines.ctr}
            showComparison={compareEnabled}
          />
          <MetricTile
            label="CPC"
            value={formatMetric(data.overview.cpc, "money")}
            current={data.overview.cpc}
            previous={data.comparison.overview.cpc}
            lowerIsBetter
            sparkline={overviewSparklines.cpc}
            showComparison={compareEnabled}
          />
          <MetricTile
            label={data.overview.primaryResultLabel || "Primary Results"}
            value={formatMetric(data.overview.primaryResults, "number")}
            current={data.overview.primaryResults}
            previous={data.comparison.overview.primaryResults}
            sparkline={overviewSparklines.primaryResults}
            showComparison={compareEnabled}
          />
        </div>
      </section>

      <section className="mx-auto mt-6 max-w-7xl">
        <UmbrellaTabs
          umbrellas={umbrellaOptions}
          value={umbrella}
          onChange={setUmbrella}
        />
      </section>

      {umbrella === "all" ? (
        <section className="mx-auto mt-6 max-w-7xl border border-hp-rule bg-hp-card p-6 sm:p-8">
          <SectionHeader
            eyebrow="Campaign Umbrellas"
            title="Performance scorecard"
          />
          <UmbrellaScorecard
            rows={umbrellaScorecard}
            showComparison={compareEnabled}
            onSelect={setUmbrella}
          />
        </section>
      ) : null}

      <section className="mx-auto mt-8 grid w-full max-w-7xl min-w-0 gap-6 xl:grid-cols-[minmax(0,1.2fr)_minmax(0,0.8fr)]">
        <div className="min-w-0 border border-hp-rule bg-hp-card p-6">
          <SectionHeader eyebrow="Trend Analysis" title="Filtered spend and response" />
          <div className="h-72 min-w-0">
            <ResponsiveContainer
              width="100%"
              height="100%"
              initialDimension={{ width: 1, height: 1 }}
            >
              <LineChart data={trendRows} margin={{ top: 8, right: 18, bottom: 0, left: 0 }}>
                <CartesianGrid stroke="#D4CFC4" vertical={false} />
                <XAxis dataKey="date" tickLine={false} axisLine={false} tick={{ fill: "#8A8178", fontSize: 11 }} />
                <YAxis tickLine={false} axisLine={false} tick={{ fill: "#8A8178", fontSize: 11 }} />
                <Tooltip
                  contentStyle={{
                    background: "#FBF7F1",
                    border: "1px solid #D4CFC4",
                    borderRadius: 2,
                    color: "#2A2725",
                  }}
                />
                <Line type="monotone" dataKey="HP spend" stroke="#2A2725" strokeWidth={2} dot={false} />
                <Line type="monotone" dataKey="VVS spend" stroke="#8B5B19" strokeWidth={2} dot={false} />
                <Line type="monotone" dataKey="HP ctr" stroke="#245D4D" strokeWidth={1.5} dot={false} />
                <Line type="monotone" dataKey="VVS ctr" stroke="#8D2E2E" strokeWidth={1.5} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="min-w-0 border border-hp-rule bg-hp-card p-6">
          <SectionHeader eyebrow="Executive Overview" title="Brand comparison" />
          <div className="space-y-3">
            {data.byBrand.map((row) => (
              <div key={row.id} className="border-b border-hp-rule pb-4 last:border-b-0">
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <div className="font-title text-2xl text-hp-ink">{row.name}</div>
                    <div className="text-sm text-hp-muted">
                      {formatMetric(row.impressions, "number")} impressions
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-xl tabular-nums text-hp-ink">
                      {formatMetric(row.spend, "money")}
                    </div>
                    <div className="text-sm text-hp-muted">{formatMetric(row.ctr, "percent")} CTR</div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="mx-auto mt-8 max-w-7xl">
        <div className="flex flex-col gap-4 border-y border-hp-rule py-5">
          <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
            <div className="flex flex-wrap items-center gap-2">
              {brands.map((brandOption) => (
                <button
                  key={brandOption}
                  onClick={() => setBrand(brandOption)}
                  className={`h-10 border px-4 text-[11px] uppercase tracking-[0.14em] transition-colors ${
                    brand === brandOption
                      ? "border-hp-ink bg-hp-ink text-hp-foundation"
                      : "border-hp-rule text-hp-body hover:border-hp-ink"
                  }`}
                >
                  {brandOption === "all" ? "All Brands" : brandOption}
                </button>
              ))}
            </div>

            <DateRangeControls
              startDate={startDate}
              endDate={endDate}
              onStartDateChange={setStartDate}
              onEndDateChange={setEndDate}
              onApply={applyDateRange}
              onQuickRange={applyQuickRange}
              isApplying={isApplyingRange}
              compareEnabled={compareEnabled}
              onCompareChange={setCompareEnabled}
              comparisonRange={data.comparison.timeRange}
            />
          </div>

          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <label className="flex min-w-0 flex-1 items-center gap-2 border-b border-hp-rule px-1 py-2 focus-within:border-hp-pink lg:max-w-xl">
              <Search size={16} className="text-hp-muted" />
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search names, copy, umbrella"
                className="w-full bg-transparent text-sm outline-none placeholder:text-hp-muted"
              />
            </label>

            <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
              <select
                value={sortKey}
                onChange={(event) => setSortKey(event.target.value as SortKey)}
                className="h-10 border border-hp-rule bg-transparent px-3 text-sm outline-none focus:border-hp-pink sm:w-48"
              >
                {Object.entries(SORT_LABELS).map(([key, label]) => (
                  <option key={key} value={key}>
                    {label}
                  </option>
                ))}
              </select>

              <SegmentedView value={viewMode} onChange={setViewMode} />
            </div>
          </div>
        </div>
      </section>

      <section className="mx-auto mt-8 grid w-full max-w-7xl min-w-0 gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(320px,360px)]">
        <div className="min-w-0 space-y-8">
          <PerformanceSection title="Campaign Performance" rows={visibleCampaigns} />
          <PerformanceSection title="Ad Set Performance" rows={visibleAdSets} />

          <div className="min-w-0 border border-hp-rule bg-hp-card p-4 sm:p-6">
            <SectionHeader
              eyebrow="Creative Leaderboard"
              title="Creative gallery and table"
              actions={
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                  <label className="flex h-10 items-center gap-2 border border-hp-rule px-3 text-[10px] uppercase tracking-[0.14em] text-hp-muted">
                    <input
                      type="checkbox"
                      checked={hidePdfFinancials}
                      onChange={(event) => setHidePdfFinancials(event.target.checked)}
                      className="h-4 w-4 accent-hp-ink"
                    />
                    Hide financials
                  </label>
                  <button
                    onClick={() => void exportCreativesPdf()}
                    className="flex h-10 items-center justify-center gap-2 border border-hp-ink px-3 text-[10px] uppercase tracking-[0.14em] text-hp-ink transition-colors hover:bg-hp-ink hover:text-hp-foundation"
                  >
                    <FileDown size={15} />
                    Export PDF
                  </button>
                </div>
              }
            />
            {viewMode === "table" && (
              <CreativeTable rows={visibleCreativeTableRows} onSelect={openCreativeDrawer} />
            )}
            {viewMode === "cards" && (
              <CreativeCards rows={visibleCreativeCardRows} onSelect={openCreativeDrawer} />
            )}
            {viewMode === "gallery" && (
              <CreativeGallery rows={visibleCreativeGalleryRows} onSelect={openCreativeDrawer} />
            )}
          </div>
        </div>

        <aside className="min-w-0 space-y-6">
          <ActionPanel
            isSyncing={isSyncing}
            isReporting={isReporting}
            reportStatus={reportStatus}
            onSync={runManualSync}
            onReport={generateReport}
          />

          <ActionQueue
            items={data.actionQueue}
            onSelect={(item) => {
              if (item.entityType === "creative") {
                openCreativeDrawer(item.entityId);
              }
            }}
          />

          <ChatPanel
            messages={chatMessages}
            value={chatInput}
            isLoading={isChatting}
            onChange={setChatInput}
            onSend={sendChatMessage}
          />

          <SourcePanel data={data} />
        </aside>
      </section>

      <CreativeDrawer creative={drawerCreative} onClose={closeCreativeDrawer} />
    </main>
  );
}

const ShellHeader = memo(function ShellHeader({ data }: { data: DashboardPayload }) {
  const range = data.sourceTransparency.timeRange;
  return (
    <header className="mx-auto flex max-w-7xl flex-col gap-5 border-b border-hp-rule pb-6 md:flex-row md:items-end md:justify-between">
      <div>
        <span className="text-[11px] uppercase tracking-[0.14em] text-hp-muted">
          HP/VVS Meta Ads
        </span>
        <h1 className="mt-2 font-title text-4xl leading-tight text-hp-ink md:text-5xl">
          AI Analyst Command Center
        </h1>
      </div>
      <div className="text-sm text-hp-muted md:text-right">
        <div>
          {range.start || "No data"} to {range.end || "No data"}
        </div>
        <div>{data.sourceTransparency.adAccountsAnalyzed.length} ad accounts analyzed</div>
      </div>
    </header>
  );
});

const SectionHeader = memo(function SectionHeader({
  eyebrow,
  title,
  actions,
}: {
  eyebrow: string;
  title: string;
  actions?: React.ReactNode;
}) {
  return (
    <div className="mb-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <span className="block text-[11px] uppercase tracking-[0.14em] text-hp-muted">
            {eyebrow}
          </span>
          <h2 className="mt-2 font-title text-[28px] leading-tight text-hp-ink">{title}</h2>
        </div>
        {actions ? <div className="flex shrink-0 items-center">{actions}</div> : null}
      </div>
      <div className="mt-4 h-px bg-hp-rule" />
    </div>
  );
});

const MetricTile = memo(function MetricTile({
  label,
  value,
  current,
  previous,
  lowerIsBetter,
  sparkline,
  showComparison,
}: {
  label: string;
  value: string;
  current?: number | null;
  previous?: number | null;
  lowerIsBetter?: boolean;
  sparkline?: number[];
  showComparison?: boolean;
}) {
  const sparklineData = useMemo(
    () => (sparkline || []).map((v, i) => ({ i, v })),
    [sparkline],
  );
  return (
    <div className="border border-hp-rule bg-hp-card p-6">
      <div className="text-[11px] uppercase tracking-[0.14em] text-hp-muted">{label}</div>
      <div className="mt-3 font-title text-[28px] leading-tight tabular-nums text-hp-ink">
        {value}
      </div>
      {showComparison ? (
        <div className="mt-2 flex items-center justify-between gap-3">
          <DeltaChip current={current} previous={previous} lowerIsBetter={lowerIsBetter} />
        </div>
      ) : null}
      {sparklineData.length > 1 ? (
        <div className="mt-4 h-8 min-w-0">
          <ResponsiveContainer width="100%" height="100%" initialDimension={{ width: 1, height: 1 }}>
            <LineChart data={sparklineData} margin={{ top: 2, right: 2, bottom: 2, left: 2 }}>
              <Line
                type="monotone"
                dataKey="v"
                stroke="#2A2725"
                strokeWidth={1}
                dot={false}
                isAnimationActive={false}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      ) : null}
    </div>
  );
});

const DeltaChip = memo(function DeltaChip({
  current,
  previous,
  lowerIsBetter,
}: {
  current?: number | null;
  previous?: number | null;
  lowerIsBetter?: boolean;
}) {
  if (current == null || previous == null || previous === 0) {
    return (
      <span className="text-[10px] uppercase tracking-[0.14em] text-hp-muted">
        — vs prev
      </span>
    );
  }
  const change = ((current - previous) / Math.abs(previous)) * 100;
  const rounded = Math.round(change * 10) / 10;
  if (!Number.isFinite(rounded)) {
    return (
      <span className="text-[10px] uppercase tracking-[0.14em] text-hp-muted">
        — vs prev
      </span>
    );
  }
  const isFlat = rounded === 0;
  const isUp = rounded > 0;
  const isGood = isFlat ? false : lowerIsBetter ? !isUp : isUp;
  const arrow = isFlat ? "→" : isUp ? "▲" : "▼";
  const colorStyle = isFlat
    ? undefined
    : { color: isGood ? "#245D4D" : "#8D2E2E" };
  const colorClass = isFlat ? "text-hp-muted" : "";
  return (
    <span
      className={`inline-flex items-baseline gap-1 font-body text-xs tabular-nums ${colorClass}`}
      style={colorStyle}
      title={`Previous: ${previous}`}
    >
      <span aria-hidden className="text-[10px]">{arrow}</span>
      <span>{Math.abs(rounded).toFixed(1)}%</span>
    </span>
  );
});

const DataCoverageNotice = memo(function DataCoverageNotice({ data }: { data: DashboardPayload }) {
  const coverage = data.sourceTransparency.dataCoverage;
  if (coverage.isComplete || coverage.expectedDays === 0) return null;

  return (
    <div className="mb-4 flex gap-3 border border-hp-pink/70 bg-hp-card px-4 py-3 text-sm text-hp-ink">
      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-hp-pink" />
      <div>
        <div>
          Stored Meta coverage is incomplete: {coverage.storedDays} of {coverage.expectedDays}{" "}
          selected days have rows.
        </div>
        <div className="mt-1 text-hp-muted">
          Totals below only include stored days. Missing days: {coverage.missingDays}.
        </div>
      </div>
    </div>
  );
});

const DateRangeControls = memo(function DateRangeControls({
  startDate,
  endDate,
  onStartDateChange,
  onEndDateChange,
  onApply,
  onQuickRange,
  isApplying,
  compareEnabled,
  onCompareChange,
  comparisonRange,
}: {
  startDate: string;
  endDate: string;
  onStartDateChange: (value: string) => void;
  onEndDateChange: (value: string) => void;
  onApply: (startDate: string, endDate: string) => void;
  onQuickRange: (days: number) => void;
  isApplying: boolean;
  compareEnabled: boolean;
  onCompareChange: (value: boolean) => void;
  comparisonRange: { start: string; end: string; days: number };
}) {
  function submitDateRange(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    onApply(String(formData.get("start") || ""), String(formData.get("end") || ""));
  }

  return (
    <form onSubmit={submitDateRange} className="flex flex-col gap-2 lg:flex-row lg:items-center">
      <div className="flex min-w-0 flex-wrap items-center gap-2 border border-hp-rule px-3 py-2">
        <CalendarRange size={16} className="text-hp-muted" />
        <input
          aria-label="Start date"
          name="start"
          type="date"
          value={startDate}
          onChange={(event) => onStartDateChange(event.target.value)}
          className="h-8 bg-transparent text-sm outline-none"
        />
        <span className="text-hp-muted">to</span>
        <input
          aria-label="End date"
          name="end"
          type="date"
          value={endDate}
          onChange={(event) => onEndDateChange(event.target.value)}
          className="h-8 bg-transparent text-sm outline-none"
        />
        <button
          type="submit"
          disabled={isApplying}
          className="h-8 border border-hp-ink px-3 text-[10px] uppercase tracking-[0.14em] text-hp-ink transition-colors hover:bg-hp-ink hover:text-hp-foundation"
        >
          {isApplying ? "Updating" : "Apply"}
        </button>
      </div>
      <div className="flex items-center gap-1">
        {[7, 14, 30].map((days) => (
          <button
            type="button"
            key={days}
            onClick={() => onQuickRange(days)}
            className="h-8 border border-hp-rule px-3 text-[10px] uppercase tracking-[0.14em] text-hp-muted transition-colors hover:border-hp-ink hover:text-hp-ink"
          >
            {days}D
          </button>
        ))}
      </div>
      <label
        title={
          compareEnabled && comparisonRange.start
            ? `Comparing to ${comparisonRange.start} → ${comparisonRange.end}`
            : "Toggle prior-period comparison"
        }
        className={`flex h-8 items-center gap-2 border px-3 text-[10px] uppercase tracking-[0.14em] transition-colors ${
          compareEnabled
            ? "border-hp-ink bg-hp-ink text-hp-foundation"
            : "border-hp-rule text-hp-muted hover:border-hp-ink hover:text-hp-ink"
        }`}
      >
        <input
          type="checkbox"
          checked={compareEnabled}
          onChange={(event) => onCompareChange(event.target.checked)}
          className="sr-only"
        />
        vs Prev
      </label>
    </form>
  );
});

type UmbrellaScorecardRow = {
  current: PerformanceRow;
  prior?: PerformanceRow;
};

type ScorecardSortKey = "spend" | "primaryResults" | "costPerPrimaryResult" | "ctr";

const UmbrellaScorecard = memo(function UmbrellaScorecard({
  rows,
  showComparison,
  onSelect,
}: {
  rows: UmbrellaScorecardRow[];
  showComparison: boolean;
  onSelect: (umbrella: string) => void;
}) {
  const [sortKey, setSortKey] = useState<ScorecardSortKey>("spend");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  const sorted = useMemo(() => {
    const direction = sortDir === "asc" ? 1 : -1;
    const copy = [...rows];
    copy.sort((a, b) => {
      const av = readScorecardValue(a.current, sortKey);
      const bv = readScorecardValue(b.current, sortKey);
      if (av == null && bv == null) return 0;
      if (av == null) return 1;
      if (bv == null) return -1;
      return (av - bv) * direction;
    });
    return copy;
  }, [rows, sortKey, sortDir]);

  if (!rows.length) {
    return <div className="text-sm text-hp-muted">No umbrella data in this period.</div>;
  }

  function toggle(key: ScorecardSortKey) {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir(key === "costPerPrimaryResult" ? "asc" : "desc");
    }
  }

  return (
    <div className="w-full overflow-x-auto">
      <table className="w-full min-w-[760px] table-fixed border-collapse text-sm">
        <colgroup>
          <col className="w-[26%]" />
          <col className="w-[18%]" />
          <col className="w-[20%]" />
          <col className="w-[18%]" />
          <col className="w-[18%]" />
        </colgroup>
        <thead>
          <tr className="bg-hp-inset text-left">
            <th className="border-b border-hp-rule px-4 py-3 text-[10px] font-normal uppercase tracking-[0.14em] text-hp-muted">
              Umbrella
            </th>
            <ScorecardHeader label="Spend" active={sortKey === "spend"} dir={sortDir} onClick={() => toggle("spend")} />
            <ScorecardHeader label="Primary KPI" active={sortKey === "primaryResults"} dir={sortDir} onClick={() => toggle("primaryResults")} />
            <ScorecardHeader label="Cost / Result" active={sortKey === "costPerPrimaryResult"} dir={sortDir} onClick={() => toggle("costPerPrimaryResult")} />
            <ScorecardHeader label="CTR" active={sortKey === "ctr"} dir={sortDir} onClick={() => toggle("ctr")} />
          </tr>
        </thead>
        <tbody>
          {sorted.map(({ current, prior }) => (
            <tr
              key={current.id}
              className="cursor-pointer border-b border-hp-rule bg-hp-card align-top transition-colors duration-150 hover:bg-hp-inset"
              onClick={() => onSelect(current.campaignUmbrella || current.name)}
            >
              <td className="px-4 py-4 text-hp-ink">
                <div className="font-body text-base">{current.name}</div>
                <div className="mt-1 text-[11px] uppercase tracking-[0.14em] text-hp-muted">
                  {formatMetric(current.impressions, "number")} impressions
                </div>
              </td>
              <ScorecardCell
                value={formatMetric(current.spend, "money")}
                current={current.spend}
                previous={prior?.spend}
                showComparison={showComparison}
              />
              <ScorecardCell
                value={`${formatMetric(current.primaryResults, "number")} ${current.primaryResultLabel}`}
                current={current.primaryResults}
                previous={prior?.primaryResults}
                showComparison={showComparison}
              />
              <ScorecardCell
                value={formatMetric(current.costPerPrimaryResult, "money")}
                current={current.costPerPrimaryResult}
                previous={prior?.costPerPrimaryResult}
                lowerIsBetter
                showComparison={showComparison}
              />
              <ScorecardCell
                value={formatMetric(current.ctr, "percent")}
                current={current.ctr}
                previous={prior?.ctr}
                showComparison={showComparison}
              />
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
});

function readScorecardValue(row: PerformanceRow, key: ScorecardSortKey): number | null {
  if (key === "costPerPrimaryResult") return row.costPerPrimaryResult;
  if (key === "spend") return row.spend;
  if (key === "primaryResults") return row.primaryResults;
  return row.ctr;
}

const ScorecardHeader = memo(function ScorecardHeader({
  label,
  active,
  dir,
  onClick,
}: {
  label: string;
  active: boolean;
  dir: "asc" | "desc";
  onClick: () => void;
}) {
  return (
    <th className="border-b border-hp-rule px-4 py-3 text-[10px] font-normal uppercase tracking-[0.14em] text-hp-muted">
      <button
        type="button"
        onClick={onClick}
        className={`inline-flex items-center gap-1.5 transition-colors duration-150 hover:text-hp-ink ${
          active ? "text-hp-ink" : ""
        }`}
      >
        <span>{label}</span>
        <span aria-hidden className={active ? "text-hp-ink" : "text-hp-muted/60"}>
          {active ? (dir === "asc" ? "↑" : "↓") : "↕"}
        </span>
      </button>
    </th>
  );
});

const ScorecardCell = memo(function ScorecardCell({
  value,
  current,
  previous,
  lowerIsBetter,
  showComparison,
}: {
  value: string;
  current?: number | null;
  previous?: number | null;
  lowerIsBetter?: boolean;
  showComparison: boolean;
}) {
  return (
    <td className="px-4 py-4 font-body tabular-nums text-hp-ink">
      <div className="text-base">{value}</div>
      {showComparison ? (
        <div className="mt-1.5">
          <DeltaChip current={current} previous={previous} lowerIsBetter={lowerIsBetter} />
        </div>
      ) : null}
    </td>
  );
});

const UmbrellaTabs = memo(function UmbrellaTabs({
  umbrellas,
  value,
  onChange,
}: {
  umbrellas: string[];
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <div className="border-y border-hp-rule">
      <div className="flex items-center gap-1 overflow-x-auto py-3">
        <span className="shrink-0 pr-3 text-[10px] uppercase tracking-[0.14em] text-hp-muted">
          Umbrella
        </span>
        {umbrellas.map((option) => {
          const isActive = value === option;
          const label = option === "all" ? "All" : option;
          return (
            <button
              key={option}
              type="button"
              onClick={() => onChange(option)}
              className={`h-9 shrink-0 whitespace-nowrap border px-3 text-xs transition-colors ${
                isActive
                  ? "border-hp-ink bg-hp-ink text-hp-foundation"
                  : "border-hp-rule text-hp-body hover:border-hp-ink"
              }`}
            >
              {label}
            </button>
          );
        })}
      </div>
    </div>
  );
});

const SegmentedView = memo(function SegmentedView({
  value,
  onChange,
}: {
  value: ViewMode;
  onChange: (value: ViewMode) => void;
}) {
  const options: { value: ViewMode; icon: React.ReactNode; label: string }[] = [
    { value: "table", icon: <Table2 size={16} />, label: "Table" },
    { value: "cards", icon: <BarChart3 size={16} />, label: "Cards" },
    { value: "gallery", icon: <GalleryHorizontalEnd size={16} />, label: "Gallery" },
  ];

  return (
    <div className="flex border border-hp-rule">
      {options.map((option) => (
        <button
          key={option.value}
          title={option.label}
          onClick={() => onChange(option.value)}
          className={`flex h-10 w-11 items-center justify-center border-r border-hp-rule last:border-r-0 ${
            value === option.value ? "bg-hp-ink text-hp-foundation" : "text-hp-body hover:bg-hp-inset"
          }`}
        >
          {option.icon}
        </button>
      ))}
    </div>
  );
});

const PerformanceSection = memo(function PerformanceSection({ title, rows }: { title: string; rows: PerformanceRow[] }) {
  return (
    <div className="min-w-0 border border-hp-rule bg-hp-card p-4 sm:p-6">
      <SectionHeader eyebrow="Performance" title={title} />
      <div className="w-full overflow-x-auto">
        <table className="w-full min-w-[760px] table-fixed border-collapse text-sm">
          <colgroup>
            <col className="w-[31%]" />
            <col className="w-[7%]" />
            <col className="w-[16%]" />
            <col className="w-[9%]" />
            <col className="w-[8%]" />
            <col className="w-[8%]" />
            <col className="w-[21%]" />
          </colgroup>
          <thead>
            <tr className="bg-hp-inset text-left text-[11px] uppercase tracking-[0.14em] text-hp-muted">
              <th className="whitespace-nowrap border-b border-hp-rule px-3 py-3">Name</th>
              <th className="whitespace-nowrap border-b border-hp-rule px-3 py-3">Brand</th>
              <th className="whitespace-nowrap border-b border-hp-rule px-3 py-3">Umbrella</th>
              <th className="whitespace-nowrap border-b border-hp-rule px-3 py-3 text-right">Spend</th>
              <th className="whitespace-nowrap border-b border-hp-rule px-3 py-3 text-right">CTR</th>
              <th className="whitespace-nowrap border-b border-hp-rule px-3 py-3 text-right">CPC</th>
              <th className="whitespace-nowrap border-b border-hp-rule px-3 py-3 text-right">Primary KPI</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id} className="border-b border-hp-rule align-top last:border-b-0">
                <td className="px-3 py-4 text-hp-ink">
                  <div className="max-w-full leading-6 [overflow-wrap:anywhere]">{row.name}</div>
                </td>
                <td className="px-3 py-4">{row.brandCode}</td>
                <td className="px-3 py-4 text-xs leading-5 text-hp-muted [overflow-wrap:anywhere]">
                  {row.campaignUmbrella}
                </td>
                <td className="px-3 py-4 text-right tabular-nums">{formatMetric(row.spend, "money")}</td>
                <td className="px-3 py-4 text-right tabular-nums">{formatMetric(row.ctr, "percent")}</td>
                <td className="px-3 py-4 text-right tabular-nums">{formatMetric(row.cpc, "money")}</td>
                <td className="px-3 py-4 text-right">
                  <ResultCell row={row} align="right" />
                </td>
              </tr>
            ))}
            {!rows.length ? (
              <tr>
                <td colSpan={7} className="px-3 py-8 text-center text-sm text-hp-muted">
                  No rows match the selected filters.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </div>
  );
});

const CreativeTable = memo(function CreativeTable({
  rows,
  onSelect,
}: {
  rows: PerformanceRow[];
  onSelect: (id: string) => void;
}) {
  return (
    <div className="w-full overflow-x-auto">
      <table className="w-full min-w-[840px] table-fixed border-collapse text-sm">
        <colgroup>
          <col className="w-[26%]" />
          <col className="w-[10%]" />
          <col className="w-[6%]" />
          <col className="w-[13%]" />
          <col className="w-[9%]" />
          <col className="w-[7%]" />
          <col className="w-[7%]" />
          <col className="w-[7%]" />
          <col className="w-[11%]" />
          <col className="w-[4%]" />
        </colgroup>
        <thead>
          <tr className="bg-hp-inset text-left text-[11px] uppercase tracking-[0.14em] text-hp-muted">
            <th className="whitespace-nowrap border-b border-hp-rule px-3 py-3">Creative</th>
            <th className="whitespace-nowrap border-b border-hp-rule px-3 py-3">Preview</th>
            <th className="whitespace-nowrap border-b border-hp-rule px-3 py-3">Brand</th>
            <th className="whitespace-nowrap border-b border-hp-rule px-3 py-3">Umbrella</th>
            <th className="whitespace-nowrap border-b border-hp-rule px-3 py-3 text-right">Spend</th>
            <th className="whitespace-nowrap border-b border-hp-rule px-3 py-3 text-right">CTR</th>
            <th className="whitespace-nowrap border-b border-hp-rule px-3 py-3 text-right">CPC</th>
            <th className="whitespace-nowrap border-b border-hp-rule px-3 py-3 text-right">Freq.</th>
            <th className="whitespace-nowrap border-b border-hp-rule px-3 py-3 text-right">Primary KPI</th>
            <th className="whitespace-nowrap border-b border-hp-rule px-3 py-3">Risk</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr
              key={row.id}
              className="cursor-pointer border-b border-hp-rule align-top transition-colors duration-150 last:border-b-0 hover:bg-hp-inset"
              onClick={() => onSelect(row.id)}
            >
              <td className="px-3 py-4">
                <div className="max-w-full text-hp-ink [overflow-wrap:anywhere]">{row.name}</div>
                {row.body ? (
                  <div className="mt-1 line-clamp-2 text-xs leading-5 text-hp-muted [overflow-wrap:anywhere]">
                    {row.body}
                  </div>
                ) : null}
              </td>
              <td className="px-3 py-4">
                <CreativePreview creative={row} compact />
              </td>
              <td className="px-3 py-4">{row.brandCode}</td>
              <td className="px-3 py-4 text-xs leading-5 text-hp-muted [overflow-wrap:anywhere]">
                {row.campaignUmbrella}
              </td>
              <td className="px-3 py-4 text-right tabular-nums">{formatMetric(row.spend, "money")}</td>
              <td className="px-3 py-4 text-right tabular-nums">{formatMetric(row.ctr, "percent")}</td>
              <td className="px-3 py-4 text-right tabular-nums">{formatMetric(row.cpc, "money")}</td>
              <td className="px-3 py-4 text-right tabular-nums">{row.frequency.toFixed(2)}x</td>
              <td className="px-3 py-4 text-right">
                <ResultCell row={row} align="right" />
              </td>
              <td className="px-3 py-4">
                <RiskBadge level={row.riskLevel} />
              </td>
            </tr>
          ))}
          {!rows.length ? (
            <tr>
              <td colSpan={10} className="px-3 py-8 text-center text-sm text-hp-muted">
                No creatives match the selected filters.
              </td>
            </tr>
          ) : null}
        </tbody>
      </table>
    </div>
  );
});

const CreativeCards = memo(function CreativeCards({
  rows,
  onSelect,
}: {
  rows: PerformanceRow[];
  onSelect: (id: string) => void;
}) {
  return (
    <div className="grid gap-4 md:grid-cols-2">
      {rows.map((row) => (
        <article
          key={row.id}
          className="cursor-pointer border border-hp-rule bg-hp-card p-4 transition-colors duration-150 hover:bg-hp-inset"
          onClick={() => onSelect(row.id)}
        >
          <div className="grid grid-cols-[112px_1fr] gap-4">
            <CreativePreview creative={row} />
            <div>
              <div className="flex items-start justify-between gap-3">
                <h3 className="font-title text-xl leading-tight text-hp-ink">{row.name}</h3>
                <RiskBadge level={row.riskLevel} />
              </div>
              <div className="mt-2 text-[10px] uppercase tracking-[0.14em] text-hp-muted">
                {row.campaignUmbrella}
              </div>
              <div className="mt-3 grid grid-cols-3 gap-2 text-xs">
                <MiniMetric label="Spend" value={formatMetric(row.spend, "money")} />
                <MiniMetric label="CTR" value={formatMetric(row.ctr, "percent")} />
                <MiniMetric label={row.primaryResultLabel} value={formatMetric(row.primaryResults, "number")} />
              </div>
              {row.secondaryResultLabel && row.secondaryResults !== null ? (
                <div className="mt-2 text-xs text-hp-muted">
                  {formatMetric(row.secondaryResults, "number")} {row.secondaryResultLabel}
                </div>
              ) : null}
              {row.body ? <p className="mt-3 line-clamp-3 text-sm text-hp-muted">{row.body}</p> : null}
            </div>
          </div>
        </article>
      ))}
    </div>
  );
});

const CreativeGallery = memo(function CreativeGallery({
  rows,
  onSelect,
}: {
  rows: PerformanceRow[];
  onSelect: (id: string) => void;
}) {
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {rows.map((row) => (
        <article
          key={row.id}
          className="cursor-pointer border border-hp-rule bg-hp-card transition-colors duration-150 hover:bg-hp-inset"
          onClick={() => onSelect(row.id)}
        >
          <CreativePreview creative={row} gallery />
          <div className="border-t border-hp-rule p-4">
            <div className="flex items-start justify-between gap-3">
              <h3 className="font-title text-xl leading-tight text-hp-ink">{row.name}</h3>
              <span className="text-[11px] uppercase tracking-[0.14em] text-hp-muted">{row.brandCode}</span>
            </div>
            <div className="mt-2 text-[10px] uppercase tracking-[0.14em] text-hp-muted">
              {row.campaignUmbrella}
            </div>
            <div className="mt-3 grid grid-cols-3 gap-2 text-xs">
              <MiniMetric label="Spend" value={formatMetric(row.spend, "money")} />
              <MiniMetric label="CTR" value={formatMetric(row.ctr, "percent")} />
              <MiniMetric label={row.primaryResultLabel} value={formatMetric(row.primaryResults, "number")} />
            </div>
            {row.secondaryResultLabel && row.secondaryResults !== null ? (
              <div className="mt-3 text-xs text-hp-muted">
                {formatMetric(row.secondaryResults, "number")} {row.secondaryResultLabel}
              </div>
            ) : null}
          </div>
        </article>
      ))}
    </div>
  );
});

const CreativeDrawer = memo(function CreativeDrawer({
  creative,
  onClose,
}: {
  creative: PerformanceRow | null;
  onClose: () => void;
}) {
  if (!creative) return null;
  const adsManagerUrl = creative.adId
    ? `https://business.facebook.com/adsmanager/manage/ads/edit?selected_ad_ids=${encodeURIComponent(creative.adId)}`
    : null;

  return (
    <div className="fixed inset-0 z-50 flex">
      <button
        type="button"
        aria-label="Close drawer"
        onClick={onClose}
        className="flex-1 bg-hp-ink/40 transition-opacity duration-150"
      />
      <aside
        role="dialog"
        aria-modal="true"
        className="flex h-full w-full max-w-[480px] flex-col border-l border-hp-rule bg-hp-card shadow-[-8px_0_24px_rgba(42,39,37,0.08)]"
      >
        <header className="flex items-start justify-between gap-3 border-b border-hp-rule px-6 py-5">
          <div className="min-w-0">
            <div className="text-[10px] uppercase tracking-[0.14em] text-hp-muted">
              Creative
            </div>
            <h3 className="mt-1 font-title text-2xl leading-tight text-hp-ink [overflow-wrap:anywhere]">
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
              <RiskBadge level={creative.riskLevel} />
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="shrink-0 border border-hp-rule px-3 py-1.5 text-[10px] uppercase tracking-[0.14em] text-hp-muted transition-colors duration-150 hover:border-hp-ink hover:text-hp-ink"
          >
            Close
          </button>
        </header>

        <div className="flex-1 overflow-y-auto">
          <div className="border-b border-hp-rule p-6">
            <div className="grid grid-cols-[140px_1fr] gap-5">
              <CreativePreview creative={creative} />
              <div className="grid grid-cols-2 gap-3">
                <MiniMetric label="Spend" value={formatMetric(creative.spend, "money")} />
                <MiniMetric label={creative.primaryResultLabel} value={formatMetric(creative.primaryResults, "number")} />
                <MiniMetric label="CTR" value={formatMetric(creative.ctr, "percent")} />
                <MiniMetric label="CPC" value={formatMetric(creative.cpc, "money")} />
                <MiniMetric label="Cost / Result" value={formatMetric(creative.costPerPrimaryResult, "money")} />
                <MiniMetric label="Frequency" value={`${creative.frequency.toFixed(2)}x`} />
              </div>
            </div>
          </div>

          <section className="border-b border-hp-rule p-6">
            <div className="text-[10px] uppercase tracking-[0.14em] text-hp-muted">
              Placement
            </div>
            <dl className="mt-3 space-y-3 text-sm">
              <DrawerField label="Campaign" value={creative.campaignName} id={creative.campaignId} />
              <DrawerField label="Ad Set" value={creative.adSetName} id={creative.adSetId} />
              <DrawerField label="Ad" value={creative.adName} id={creative.adId} />
              <DrawerField label="Creative" value={creative.name} id={creative.id} />
            </dl>
          </section>

          {creative.body ? (
            <section className="border-b border-hp-rule p-6">
              <div className="text-[10px] uppercase tracking-[0.14em] text-hp-muted">
                Body Copy
              </div>
              <p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-hp-body [overflow-wrap:anywhere]">
                {creative.body}
              </p>
            </section>
          ) : null}

          {creative.riskReason ? (
            <section className="border-b border-hp-rule p-6">
              <div className="text-[10px] uppercase tracking-[0.14em] text-hp-muted">
                Diagnostic
              </div>
              <p className="mt-3 text-sm leading-6 text-hp-body">{creative.riskReason}</p>
            </section>
          ) : null}
        </div>

        <footer className="border-t border-hp-rule px-6 py-5">
          {adsManagerUrl ? (
            <a
              href={adsManagerUrl}
              target="_blank"
              rel="noreferrer noopener"
              className="block w-full bg-hp-ink px-4 py-3 text-center text-[11px] uppercase tracking-[0.14em] text-hp-foundation transition-colors duration-150 hover:bg-hp-pink"
            >
              Open in Meta Ads Manager
            </a>
          ) : (
            <div className="text-center text-xs text-hp-muted">
              No ad ID on record — open Ads Manager directly.
            </div>
          )}
        </footer>
      </aside>
    </div>
  );
});

const DrawerField = memo(function DrawerField({
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
      <dd className="min-w-0 text-hp-ink [overflow-wrap:anywhere]">
        <div className="text-sm">{value || "—"}</div>
        {id ? (
          <div className="mt-0.5 font-mono text-[11px] text-hp-muted">{id}</div>
        ) : null}
      </dd>
    </div>
  );
});

const CreativePreview = memo(function CreativePreview({
  creative,
  compact = false,
  gallery = false,
}: {
  creative: PerformanceRow;
  compact?: boolean;
  gallery?: boolean;
}) {
  const imageSrc = creative.previewUrl || creative.thumbnailUrl || creative.imageUrl || creative.videoThumbnailUrl;
  const dimensions = compact ? "h-14 w-14" : gallery ? "aspect-[4/3] w-full" : "h-28 w-28";

  if (creative.previewHtml && creative.previewSource === "ad_preview") {
    return (
      <iframe
        title={`${creative.name} preview`}
        srcDoc={creative.previewHtml}
        sandbox=""
        className={`${dimensions} border border-hp-rule bg-white`}
      />
    );
  }

  if (imageSrc) {
    return (
      <img
        src={imageSrc}
        alt={creative.name}
        className={`${dimensions} border border-hp-rule object-cover`}
        loading="lazy"
        referrerPolicy="no-referrer"
      />
    );
  }

  return (
    <div className={`${dimensions} flex items-center justify-center border border-hp-rule bg-hp-inset`}>
      <span className="text-[10px] uppercase tracking-[0.14em] text-hp-muted">No Preview</span>
    </div>
  );
});

const RiskBadge = memo(function RiskBadge({ level }: { level?: PerformanceRow["riskLevel"] }) {
  const color =
    level === "high"
      ? "text-signal-danger"
      : level === "medium"
        ? "text-signal-warning"
        : "text-signal-positive";

  return (
    <span className={`text-[10px] uppercase tracking-[0.14em] ${color}`}>
      {level || "low"}
    </span>
  );
});

const ResultCell = memo(function ResultCell({ row, align = "left" }: { row: PerformanceRow; align?: "left" | "right" }) {
  return (
    <div className={align === "right" ? "text-right" : "text-left"}>
      <div className="tabular-nums text-hp-ink">{formatMetric(row.primaryResults, "number")}</div>
      <div className="text-[10px] uppercase tracking-[0.14em] text-hp-muted [overflow-wrap:anywhere]">
        {row.primaryResultLabel}
      </div>
      {row.secondaryResultLabel && row.secondaryResults !== null ? (
        <div className="mt-1 text-xs tabular-nums text-hp-muted [overflow-wrap:anywhere]">
          {formatMetric(row.secondaryResults, "number")} {row.secondaryResultLabel}
        </div>
      ) : null}
    </div>
  );
});

const MiniMetric = memo(function MiniMetric({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-[0.14em] text-hp-muted">{label}</div>
      <div className="mt-1 tabular-nums text-hp-ink">{value}</div>
    </div>
  );
});

const ACTION_BUCKETS: { key: ActionBucket; label: string; description: string; tone: string }[] = [
  {
    key: "scale",
    label: "Scale",
    description: "Allocate more budget",
    tone: "border-l-[3px] border-l-[#245D4D]",
  },
  {
    key: "fix",
    label: "Fix",
    description: "Refresh or rotate",
    tone: "border-l-[3px] border-l-[#8D2E2E]",
  },
  {
    key: "watch",
    label: "Watch",
    description: "Spending without efficiency",
    tone: "border-l-[3px] border-l-hp-platinum",
  },
];

const BUCKET_TEXT_TONE: Record<ActionBucket, string> = {
  scale: "text-[#245D4D]",
  fix: "text-[#8D2E2E]",
  watch: "text-hp-muted",
};

const ActionQueue = memo(function ActionQueue({
  items,
  onSelect,
}: {
  items: ActionItem[];
  onSelect: (item: ActionItem) => void;
}) {
  const grouped = useMemo(() => {
    const map: Record<ActionBucket, ActionItem[]> = { scale: [], fix: [], watch: [] };
    for (const item of items) {
      if (map[item.bucket].length < 3) {
        map[item.bucket].push(item);
      }
    }
    return map;
  }, [items]);

  return (
    <section className="border border-hp-rule bg-hp-card">
      <header className="flex items-center justify-between border-b border-hp-rule px-5 py-4">
        <span className="text-[11px] uppercase tracking-[0.14em] text-hp-muted">
          Action Queue
        </span>
        <span className="text-[11px] uppercase tracking-[0.14em] text-hp-muted">
          {items.length} signals
        </span>
      </header>
      {items.length === 0 ? (
        <div className="p-5 text-sm text-hp-muted">No current signals in this period.</div>
      ) : (
        <div className="divide-y divide-hp-rule">
          {ACTION_BUCKETS.map((bucket) => (
            <ActionBucketBlock
              key={bucket.key}
              bucket={bucket}
              items={grouped[bucket.key]}
              onClick={onSelect}
            />
          ))}
        </div>
      )}
    </section>
  );
});

const ActionBucketBlock = memo(function ActionBucketBlock({
  bucket,
  items,
  onClick,
}: {
  bucket: { key: ActionBucket; label: string; description: string; tone: string };
  items: ActionItem[];
  onClick: (item: ActionItem) => void;
}) {
  return (
    <div className="p-5">
      <div className="mb-3 flex items-baseline justify-between gap-3">
        <span
          className={`text-[11px] uppercase tracking-[0.14em] ${BUCKET_TEXT_TONE[bucket.key]}`}
        >
          {bucket.label}
          <span className="ml-2 text-hp-muted">{items.length}</span>
        </span>
        <span className="text-[10px] uppercase tracking-[0.14em] text-hp-muted">
          {bucket.description}
        </span>
      </div>
      {items.length === 0 ? (
        <p className="text-xs text-hp-muted">No items.</p>
      ) : (
        <ul className="space-y-2">
          {items.map((item) => (
            <li key={item.id}>
              <button
                type="button"
                onClick={() => onClick(item)}
                className={`group flex w-full items-start gap-3 bg-hp-card px-3 py-3 text-left transition-colors duration-150 hover:bg-hp-inset ${bucket.tone}`}
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 text-sm text-hp-ink">
                    <span className="truncate font-body">{item.entityName}</span>
                    {item.campaignUmbrella ? (
                      <span className="shrink-0 border border-hp-rule px-1.5 py-0.5 text-[10px] uppercase tracking-[0.12em] text-hp-muted">
                        {item.campaignUmbrella}
                      </span>
                    ) : null}
                  </div>
                  <div className="mt-1 text-xs text-hp-body tabular-nums">{item.headline}</div>
                  <div className="mt-0.5 text-[11px] text-hp-muted tabular-nums">
                    {item.supporting}
                  </div>
                </div>
                <ChevronRight
                  size={14}
                  className="mt-1 shrink-0 text-hp-muted transition-colors group-hover:text-hp-ink"
                />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
});

const ActionPanel = memo(function ActionPanel({
  isSyncing,
  isReporting,
  reportStatus,
  onSync,
  onReport,
}: {
  isSyncing: boolean;
  isReporting: boolean;
  reportStatus: string;
  onSync: () => void;
  onReport: () => void;
}) {
  return (
    <section className="border border-hp-rule bg-hp-card p-4">
      <div className="grid grid-cols-2 gap-3">
        <button
          onClick={onSync}
          disabled={isSyncing}
          className="flex items-center justify-center gap-2 rounded-sm bg-hp-ink px-4 py-3 text-xs uppercase tracking-[0.14em] text-hp-foundation transition-colors hover:bg-hp-pink"
        >
          <RefreshCw size={15} className={isSyncing ? "animate-spin" : ""} />
          Sync
        </button>
        <button
          onClick={onReport}
          disabled={isReporting}
          className="flex items-center justify-center gap-2 rounded-sm border border-hp-ink px-4 py-3 text-xs uppercase tracking-[0.14em] text-hp-ink transition-colors hover:bg-hp-ink hover:text-hp-foundation"
        >
          <Bot size={15} />
          Report
        </button>
      </div>
      {reportStatus ? <p className="mt-3 text-sm text-hp-muted">{reportStatus}</p> : null}
    </section>
  );
});

const ChatPanel = memo(function ChatPanel({
  messages,
  value,
  isLoading,
  onChange,
  onSend,
}: {
  messages: ChatMessage[];
  value: string;
  isLoading: boolean;
  onChange: (value: string) => void;
  onSend: () => void;
}) {
  return (
    <section className="border border-hp-rule bg-hp-card p-4">
      <div className="mb-4 flex items-center gap-2 text-hp-ink">
        <MessageSquare size={18} />
        <span className="text-[11px] uppercase tracking-[0.14em]">AI Chat</span>
      </div>
      <div className="scrollbar-thin max-h-80 space-y-3 overflow-y-auto border-y border-hp-rule py-4">
        {messages.length ? (
          messages.map((message, index) => (
            <div
              key={`${message.role}-${index}`}
              className={`text-sm leading-6 [overflow-wrap:anywhere] ${
                message.role === "user" ? "text-hp-ink" : "text-hp-body"
              }`}
            >
              <span className="mr-2 text-[10px] uppercase tracking-[0.14em] text-hp-muted">
                {message.role}
              </span>
              {message.content}
            </div>
          ))
        ) : (
          <p className="text-sm text-hp-muted">Ask about spend, fatigue, winners, or risks.</p>
        )}
      </div>
      <div className="mt-4 flex gap-2">
        <input
          value={value}
          onChange={(event) => onChange(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") onSend();
          }}
          className="min-w-0 flex-1 border-b border-hp-rule bg-transparent px-1 py-2 text-sm outline-none focus:border-hp-pink"
          placeholder="Ask an executive question"
        />
        <button
          onClick={onSend}
          disabled={isLoading}
          title="Send"
          className="flex h-10 w-10 items-center justify-center border border-hp-ink text-hp-ink transition-colors hover:bg-hp-ink hover:text-hp-foundation"
        >
          <Send size={16} />
        </button>
      </div>
    </section>
  );
});

const SourcePanel = memo(function SourcePanel({ data }: { data: DashboardPayload }) {
  const counts = Object.entries(data.sourceTransparency.recordCounts);
  const coverage = data.sourceTransparency.dataCoverage;
  return (
    <section className="border border-hp-rule bg-hp-card p-4">
      <div className="text-[11px] uppercase tracking-[0.14em] text-hp-muted">
        Source Transparency
      </div>
      <div className="mt-3 space-y-2 text-sm">
        <div>{data.sourceTransparency.timeRange.days} day window</div>
        <div>{data.sourceTransparency.adAccountsAnalyzed.join(", ") || "No accounts"}</div>
        <div className="flex justify-between gap-4 border-t border-hp-rule pt-2">
          <span>stored_days</span>
          <span className="tabular-nums">
            {formatMetric(coverage.storedDays, "number")} /{" "}
            {formatMetric(coverage.expectedDays, "number")}
          </span>
        </div>
        <div className="flex justify-between gap-4 border-t border-hp-rule pt-2">
          <span>missing_days</span>
          <span className="tabular-nums">{formatMetric(coverage.missingDays, "number")}</span>
        </div>
        {counts.map(([key, value]) => (
          <div key={key} className="flex justify-between gap-4 border-t border-hp-rule pt-2">
            <span>{key}</span>
            <span className="tabular-nums">{formatMetric(Number(value), "number")}</span>
          </div>
        ))}
      </div>
    </section>
  );
});

type CreativePdfHtmlOptions = {
  rows: PerformanceRow[];
  dateRange: string;
  umbrellaName: string;
  brandName: string;
  searchQuery: string;
  sortLabel: string;
  generatedAt: Date;
  hideFinancials: boolean;
};

async function printHtmlDocument(html: string) {
  const frame = document.createElement("iframe");
  frame.setAttribute("aria-hidden", "true");
  frame.style.position = "fixed";
  frame.style.left = "-10000px";
  frame.style.top = "0";
  frame.style.width = "1120px";
  frame.style.height = "800px";
  frame.style.border = "0";
  frame.style.opacity = "0";

  document.body.appendChild(frame);

  const printWindow = frame.contentWindow;
  const printDocument = printWindow?.document;
  if (!printWindow || !printDocument) {
    frame.remove();
    window.alert("The PDF export could not be prepared in this browser.");
    return;
  }

  printDocument.open();
  printDocument.write(html);
  printDocument.close();

  await waitForPrintImages(printDocument, 2500);
  await new Promise((resolve) => window.setTimeout(resolve, 150));

  const cleanup = () => frame.remove();
  printWindow.addEventListener("afterprint", cleanup, { once: true });
  window.setTimeout(cleanup, 30000);
  printWindow.focus();
  printWindow.print();
}

function waitForPrintImages(printDocument: Document, timeoutMs: number) {
  const pendingImages = Array.from(printDocument.images).filter((image) => !image.complete);
  if (!pendingImages.length) return Promise.resolve();

  return new Promise<void>((resolve) => {
    let isSettled = false;
    let remaining = pendingImages.length;

    const settle = () => {
      if (isSettled) return;
      isSettled = true;
      window.clearTimeout(timeout);
      resolve();
    };

    const completeOne = () => {
      remaining -= 1;
      if (remaining <= 0) settle();
    };

    const timeout = window.setTimeout(settle, timeoutMs);

    for (const image of pendingImages) {
      image.addEventListener("load", completeOne, { once: true });
      image.addEventListener("error", completeOne, { once: true });
    }
  });
}

function buildCreativePdfHtml({
  rows,
  dateRange,
  umbrellaName,
  brandName,
  searchQuery,
  sortLabel,
  generatedAt,
  hideFinancials,
}: CreativePdfHtmlOptions) {
  const generatedLabel = new Intl.DateTimeFormat("en-US", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(generatedAt);
  const searchLabel = searchQuery.trim() ? searchQuery.trim() : "None";
  const reportContext = [
    `Brand: ${brandName}`,
    `Sorted by: ${sortLabel}`,
    `Search: ${searchLabel}`,
    hideFinancials ? "Financials hidden" : null,
    `${formatMetric(rows.length, "number")} rows`,
  ]
    .filter(Boolean)
    .join(" | ");
  const reportTitle = [
    "Creative Export",
    umbrellaName,
    dateRange,
  ];

  return `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <title>${escapeHtml(`Creative Export - ${umbrellaName} - ${dateRange}`)}</title>
    <style>
      @page {
        size: letter landscape;
        margin: 0.3in;
      }

      * {
        box-sizing: border-box;
      }

      html,
      body {
        margin: 0;
        background: #ffffff;
        color: #2a2725;
        font-family: Georgia, "Times New Roman", serif;
        font-size: 9px;
        line-height: 1.35;
      }

      body {
        -webkit-print-color-adjust: exact;
        print-color-adjust: exact;
      }

      th {
        color: #8a8178;
        font-size: 7.4px;
        letter-spacing: 0.06em;
        text-transform: uppercase;
      }

      .muted {
        color: #4a4540;
      }

      .table-name {
        color: #2a2725;
        font-weight: 700;
        overflow-wrap: anywhere;
      }

      .preview,
      .preview img,
      .preview iframe {
        width: 100%;
        height: 100%;
      }

      .preview img {
        display: block;
        object-fit: cover;
      }

      .preview iframe {
        display: block;
        border: 0;
        background: #ffffff;
      }

      .preview-empty {
        display: flex;
        width: 100%;
        height: 100%;
        align-items: center;
        justify-content: center;
        color: #8a8178;
        font-size: 7px;
        letter-spacing: 0.08em;
        text-align: center;
        text-transform: uppercase;
      }

      table {
        width: 100%;
        border-collapse: collapse;
        table-layout: fixed;
        page-break-inside: auto;
      }

      thead {
        display: table-header-group;
      }

      tr {
        break-inside: avoid;
        page-break-inside: avoid;
      }

      th,
      td {
        border-bottom: 1px solid #d4cfc4;
        padding: 0.035in 0.045in;
        text-align: left;
        vertical-align: top;
        overflow-wrap: anywhere;
        word-break: break-word;
      }

      th {
        background: #efe8dd;
        color: #4a4540;
        font-weight: 700;
      }

      td {
        font-size: 8.2px;
      }

      .table-copy {
        margin-top: 0.02in;
        color: #8a8178;
        font-size: 7.2px;
        max-height: 3.45em;
        overflow: hidden;
      }

      .table-preview {
        width: 0.38in;
        height: 0.38in;
        border: 1px solid #d4cfc4;
        background: #efe8dd;
      }

      .report-row th {
        background: #ffffff;
        border-bottom: 0;
        color: #2a2725;
        font-size: 10px;
        letter-spacing: 0;
        padding: 0 0 0.035in;
        text-transform: none;
      }

      .report-frame {
        display: grid;
        grid-template-columns: minmax(1.55in, 1fr) minmax(0, 3.9in) minmax(1.55in, 1fr);
        gap: 0.12in;
        align-items: end;
      }

      .report-generated {
        text-align: left;
      }

      .report-title {
        color: #2a2725;
        font-size: 10.5px;
        font-weight: 700;
        line-height: 1.2;
        text-align: center;
        overflow-wrap: anywhere;
      }

      .report-context {
        color: #8a8178;
        font-size: 6.8px;
        line-height: 1.25;
        text-align: right;
        overflow-wrap: anywhere;
      }

      .column-row th {
        white-space: nowrap;
      }

      .num {
        text-align: right;
        white-space: nowrap;
        font-variant-numeric: tabular-nums;
      }

      .risk-low {
        color: #245d4d;
      }

      .risk-medium {
        color: #8b5b19;
      }

      .risk-high {
        color: #8d2e2e;
      }

      .empty-state {
        border: 1px solid #d4cfc4;
        padding: 0.18in;
        color: #8a8178;
        text-align: center;
      }
    </style>
  </head>
  <body>
    ${rows.length ? creativeTableMarkup(rows, {
      generatedLabel,
      reportContext,
      reportTitle: reportTitle.map((part) => escapeHtml(part)).join(" - "),
      hideFinancials,
    }) : `<div class="empty-state">No creatives match the selected filters.</div>`}
  </body>
</html>`;
}

type CreativeTablePrintOptions = {
  generatedLabel: string;
  hideFinancials: boolean;
  reportContext: string;
  reportTitle: string;
};

function creativeTableMarkup(rows: PerformanceRow[], options: CreativeTablePrintOptions) {
  const columnCount = options.hideFinancials ? 8 : 10;

  return `<table>
    ${creativeTableColgroupMarkup(options.hideFinancials)}
    <thead>
      <tr class="report-row">
        <th colspan="${columnCount}">
          <div class="report-frame">
            <div class="report-generated">${escapeHtml(options.generatedLabel)}</div>
            <div class="report-title">${options.reportTitle}</div>
            <div class="report-context">${escapeHtml(options.reportContext)}</div>
          </div>
        </th>
      </tr>
      <tr class="column-row">
        <th>Creative</th>
        <th>Preview</th>
        <th>Brand</th>
        <th>Umbrella</th>
        ${options.hideFinancials ? "" : `<th class="num">Spend</th>`}
        <th class="num">CTR</th>
        ${options.hideFinancials ? "" : `<th class="num">CPC</th>`}
        <th class="num">Freq.</th>
        <th class="num">Primary KPI</th>
        <th>Risk</th>
      </tr>
    </thead>
    <tbody>
      ${rows.map((row) => creativeTableRowMarkup(row, options.hideFinancials)).join("")}
    </tbody>
  </table>`;
}

function creativeTableColgroupMarkup(hideFinancials: boolean) {
  if (hideFinancials) {
    return `<colgroup>
      <col style="width: 34%" />
      <col style="width: 7%" />
      <col style="width: 6%" />
      <col style="width: 17%" />
      <col style="width: 8%" />
      <col style="width: 7%" />
      <col style="width: 15%" />
      <col style="width: 6%" />
    </colgroup>`;
  }

  return `<colgroup>
    <col style="width: 27%" />
    <col style="width: 7%" />
    <col style="width: 6%" />
    <col style="width: 14%" />
    <col style="width: 7%" />
    <col style="width: 7%" />
    <col style="width: 7%" />
    <col style="width: 6%" />
    <col style="width: 13%" />
    <col style="width: 6%" />
  </colgroup>`;
}

function creativeTableRowMarkup(row: PerformanceRow, hideFinancials: boolean) {
  return `<tr>
    <td>
      <div class="table-name">${escapeHtml(truncateText(row.name, 120))}</div>
      ${row.body ? `<div class="table-copy">${escapeHtml(truncateText(row.body, 170))}</div>` : ""}
    </td>
    <td><div class="table-preview preview">${creativePreviewMarkup(row)}</div></td>
    <td>${escapeHtml(row.brandCode)}</td>
    <td>${escapeHtml(row.campaignUmbrella || "Unassigned")}</td>
    ${hideFinancials ? "" : `<td class="num">${escapeHtml(formatMetric(row.spend, "money"))}</td>`}
    <td class="num">${escapeHtml(formatMetric(row.ctr, "percent"))}</td>
    ${hideFinancials ? "" : `<td class="num">${escapeHtml(formatMetric(row.cpc, "money"))}</td>`}
    <td class="num">${Number.isFinite(row.frequency) ? `${row.frequency.toFixed(2)}x` : "n/a"}</td>
    <td class="num">
      ${escapeHtml(formatMetric(row.primaryResults, "number"))}
      <div class="muted">${escapeHtml(truncateText(row.primaryResultLabel, 28))}</div>
    </td>
    <td class="${riskClassName(row.riskLevel)}">${escapeHtml(row.riskLevel || "low")}</td>
  </tr>`;
}

function creativePreviewMarkup(row: PerformanceRow) {
  if (row.previewHtml && row.previewSource === "ad_preview") {
    return `<iframe title="${escapeHtml(`${row.name} preview`)}" srcdoc="${escapeHtml(row.previewHtml)}" sandbox=""></iframe>`;
  }

  const imageSrc = printablePreviewUrl(row);
  if (imageSrc) {
    return `<img src="${escapeHtml(imageSrc)}" alt="${escapeHtml(row.name)}" referrerpolicy="no-referrer" />`;
  }

  return `<div class="preview-empty">No Preview</div>`;
}

function printablePreviewUrl(row: PerformanceRow) {
  const src = row.previewUrl || row.thumbnailUrl || row.imageUrl || row.videoThumbnailUrl;
  if (!src) return null;
  const trimmed = src.trim();
  return /^(https?:\/\/|data:image\/|blob:|\/)/i.test(trimmed) ? trimmed : null;
}

function riskClassName(level?: PerformanceRow["riskLevel"]) {
  return `risk-${level || "low"}`;
}

function formatDateRange(start: string | null, end: string | null) {
  if (start && end) return `${formatDateLabel(start)} to ${formatDateLabel(end)}`;
  if (start) return `From ${formatDateLabel(start)}`;
  if (end) return `Through ${formatDateLabel(end)}`;
  return "No date range";
}

function formatDateLabel(value: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return value;

  const [, year, month, day] = match;
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  }).format(Date.UTC(Number(year), Number(month) - 1, Number(day)));
}

function formatUmbrellaName(value: string) {
  return value === "all" ? "All Campaign Umbrellas" : value;
}

function truncateText(value: string | null | undefined, maxLength: number) {
  const text = String(value || "").replace(/\s+/g, " ").trim();
  if (text.length <= maxLength) return text;
  return `${text.slice(0, Math.max(0, maxLength - 3)).trimEnd()}...`;
}

function escapeHtml(value: string | number | null | undefined) {
  return String(value ?? "").replace(/[&<>"']/g, (character) => {
    switch (character) {
      case "&":
        return "&amp;";
      case "<":
        return "&lt;";
      case ">":
        return "&gt;";
      case '"':
        return "&quot;";
      case "'":
        return "&#39;";
      default:
        return character;
    }
  });
}

function filterAndSortRows(
  rows: PerformanceRow[],
  brand: string,
  umbrella: string,
  normalizedQuery: string,
  sortKey: SortKey,
) {
  return rows
    .filter((row) => rowMatchesFilters(row, brand, umbrella, normalizedQuery))
    .sort((a, b) => Number(b[sortKey] || 0) - Number(a[sortKey] || 0));
}

function rowMatchesFilters(
  row: PerformanceRow,
  brand: string,
  umbrella: string,
  normalizedQuery: string,
) {
  if (brand !== "all" && row.brandCode !== brand) return false;
  if (umbrella !== "all" && row.campaignUmbrella !== umbrella) return false;

  if (!normalizedQuery) return true;

  return (
    searchValueMatches(row.name, normalizedQuery) ||
    searchValueMatches(row.title, normalizedQuery) ||
    searchValueMatches(row.body, normalizedQuery) ||
    searchValueMatches(row.brandCode, normalizedQuery) ||
    searchValueMatches(row.campaignUmbrella, normalizedQuery) ||
    searchValueMatches(row.objective, normalizedQuery) ||
    searchValueMatches(row.status, normalizedQuery) ||
    searchValueMatches(row.effectiveStatus, normalizedQuery)
  );
}

function searchValueMatches(value: string | null | undefined, normalizedQuery: string) {
  if (!value) return false;
  return value.toLowerCase().includes(normalizedQuery);
}

function isFinancialSortKey(sortKey: SortKey) {
  return sortKey === "spend" || sortKey === "cpc";
}

function shiftDate(date: string, days: number) {
  const value = new Date(`${date}T00:00:00Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return toDateInput(value);
}

function toDateInput(date: Date) {
  return date.toISOString().slice(0, 10);
}

function formatMetric(value: number | null, kind: "money" | "number" | "percent") {
  if (value === null || Number.isNaN(value)) return "n/a";
  if (kind === "money") {
    return (value >= 100 ? MONEY_FORMATTER_WHOLE : MONEY_FORMATTER_WITH_CENTS).format(value);
  }
  if (kind === "percent") return `${value.toFixed(2)}%`;
  return NUMBER_FORMATTER.format(value);
}
