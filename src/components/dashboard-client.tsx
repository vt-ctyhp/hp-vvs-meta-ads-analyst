"use client";

/* eslint-disable @next/next/no-img-element */

import {
  AlertTriangle,
  BarChart3,
  Bot,
  CalendarRange,
  ChevronDown,
  FileDown,
  GalleryHorizontalEnd,
  MessageSquare,
  RefreshCw,
  Search,
  Send,
  Sparkles,
  Table2,
} from "lucide-react";
import { useMemo, useState } from "react";
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import type { DashboardPayload, PerformanceRow } from "@/lib/analytics";

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

const CREATIVE_EXPORT_GALLERY_LIMIT = 24;

export function DashboardClient({ initialData }: Props) {
  const [data] = useState(initialData);
  const [brand, setBrand] = useState("all");
  const [umbrella, setUmbrella] = useState("all");
  const [startDate, setStartDate] = useState(data.sourceTransparency.timeRange.start || "");
  const [endDate, setEndDate] = useState(data.sourceTransparency.timeRange.end || "");
  const [query, setQuery] = useState("");
  const [viewMode, setViewMode] = useState<ViewMode>("table");
  const [sortKey, setSortKey] = useState<SortKey>("spend");
  const [expandedPanel, setExpandedPanel] = useState<string | null>("opportunities");
  const [isSyncing, setIsSyncing] = useState(false);
  const [isReporting, setIsReporting] = useState(false);
  const [reportStatus, setReportStatus] = useState("");
  const [chatInput, setChatInput] = useState("");
  const [chatSessionId, setChatSessionId] = useState<string | null>(null);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [isChatting, setIsChatting] = useState(false);

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
      data.campaigns
        .filter((row) => rowMatchesFilters(row, brand, umbrella, query))
        .sort((a, b) => Number(b[sortKey] || 0) - Number(a[sortKey] || 0)),
    [brand, data.campaigns, query, sortKey, umbrella],
  );

  const filteredAdSets = useMemo(
    () =>
      data.adSets
        .filter((row) => rowMatchesFilters(row, brand, umbrella, query))
        .sort((a, b) => Number(b[sortKey] || 0) - Number(a[sortKey] || 0)),
    [brand, data.adSets, query, sortKey, umbrella],
  );

  const filteredCreatives = useMemo(() => {
    return data.creatives
      .filter((creative) => rowMatchesFilters(creative, brand, umbrella, query))
      .sort((a, b) => Number(b[sortKey] || 0) - Number(a[sortKey] || 0));
  }, [brand, data.creatives, query, sortKey, umbrella]);

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

  async function runManualSync() {
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
  }

  async function generateReport() {
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
  }

  async function sendChatMessage() {
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
  }

  function applyDateRange(nextStart = startDate, nextEnd = endDate) {
    if (!nextStart || !nextEnd) return;
    const url = new URL(window.location.href);
    url.searchParams.set("start", nextStart);
    url.searchParams.set("end", nextEnd);
    url.searchParams.delete("days");
    window.location.assign(`${url.pathname}${url.search}`);
  }

  function applyQuickRange(days: number) {
    const end = data.sourceTransparency.timeRange.end || toDateInput(new Date());
    const start = shiftDate(end, -(days - 1));
    setStartDate(start);
    setEndDate(end);
    applyDateRange(start, end);
  }

  async function exportCreativesPdf() {
    const activeRange = data.sourceTransparency.timeRange;
    const html = buildCreativePdfHtml({
      rows: filteredCreatives,
      dateRange: formatDateRange(
        activeRange.start || startDate,
        activeRange.end || endDate,
      ),
      umbrellaName: formatUmbrellaName(umbrella),
      brandName: brand === "all" ? "All Brands" : brand,
      searchQuery: query,
      sortLabel: SORT_LABELS[sortKey],
      generatedAt: new Date(),
    });

    await printHtmlDocument(html);
  }

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
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
          <MetricTile label="Spend" value={formatMetric(data.overview.spend, "money")} />
          <MetricTile label="Impressions" value={formatMetric(data.overview.impressions, "number")} />
          <MetricTile label="CTR" value={formatMetric(data.overview.ctr, "percent")} />
          <MetricTile label="CPC" value={formatMetric(data.overview.cpc, "money")} />
          <MetricTile label="Primary Results" value={formatMetric(data.overview.primaryResults, "number")} />
        </div>
      </section>

      <section className="mx-auto mt-8 max-w-7xl border border-hp-rule bg-hp-card p-6">
        <SectionHeader eyebrow="Campaign Umbrellas" title="Spend by internal grouping" />
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          {data.byUmbrella.map((row) => (
            <button
              key={row.id}
              onClick={() => setUmbrella(row.campaignUmbrella || row.name)}
              className={`border p-4 text-left transition-colors ${
                umbrella === row.campaignUmbrella
                  ? "border-hp-ink bg-hp-ink text-hp-foundation"
                  : "border-hp-rule hover:border-hp-ink"
              }`}
            >
              <div className="min-h-10 text-sm font-medium leading-5">{row.name}</div>
              <div className="mt-3 flex items-end justify-between gap-3">
                <span className="text-xl tabular-nums">{formatMetric(row.spend, "money")}</span>
                <span className="text-right text-xs tabular-nums">
                  {formatMetric(row.primaryResults, "number")} {row.primaryResultLabel}
                </span>
              </div>
            </button>
          ))}
        </div>
      </section>

      <section className="mx-auto mt-8 grid max-w-7xl gap-6 xl:grid-cols-[1.2fr_0.8fr]">
        <div className="border border-hp-rule bg-hp-card p-6">
          <SectionHeader eyebrow="Trend Analysis" title="Filtered spend and response" />
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
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

        <div className="border border-hp-rule bg-hp-card p-6">
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
              onApply={() => applyDateRange()}
              onQuickRange={applyQuickRange}
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
                value={umbrella}
                onChange={(event) => setUmbrella(event.target.value)}
                className="h-10 min-w-0 border border-hp-rule bg-transparent px-3 text-sm outline-none focus:border-hp-pink sm:w-72"
              >
                {umbrellaOptions.map((option) => (
                  <option key={option} value={option}>
                    {option === "all" ? "All Umbrellas" : option}
                  </option>
                ))}
              </select>

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
          <PerformanceSection title="Campaign Performance" rows={filteredCampaigns.slice(0, 10)} />
          <PerformanceSection title="Ad Set Performance" rows={filteredAdSets.slice(0, 10)} />

          <div className="min-w-0 border border-hp-rule bg-hp-card p-4 sm:p-6">
            <SectionHeader
              eyebrow="Creative Leaderboard"
              title="Creative gallery and table"
              actions={
                <button
                  onClick={() => void exportCreativesPdf()}
                  className="flex h-10 items-center justify-center gap-2 border border-hp-ink px-3 text-[10px] uppercase tracking-[0.14em] text-hp-ink transition-colors hover:bg-hp-ink hover:text-hp-foundation"
                >
                  <FileDown size={15} />
                  Export PDF
                </button>
              }
            />
            {viewMode === "table" && <CreativeTable rows={filteredCreatives.slice(0, 50)} />}
            {viewMode === "cards" && <CreativeCards rows={filteredCreatives.slice(0, 18)} />}
            {viewMode === "gallery" && <CreativeGallery rows={filteredCreatives.slice(0, 24)} />}
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

          <InsightPanel
            id="opportunities"
            title="Top Opportunities"
            icon={<Sparkles size={18} />}
            expandedPanel={expandedPanel}
            setExpandedPanel={setExpandedPanel}
            items={data.opportunities}
          />
          <InsightPanel
            id="risks"
            title="Fatigue Risk"
            icon={<AlertTriangle size={18} />}
            expandedPanel={expandedPanel}
            setExpandedPanel={setExpandedPanel}
            items={data.fatigueRisks.map((risk) => `${risk.name}: ${risk.riskReason}`)}
          />
          <InsightPanel
            id="recommendations"
            title="Recommendation Queue"
            icon={<BarChart3 size={18} />}
            expandedPanel={expandedPanel}
            setExpandedPanel={setExpandedPanel}
            items={data.recommendationQueue}
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
    </main>
  );
}

function ShellHeader({ data }: { data: DashboardPayload }) {
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
}

function SectionHeader({
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
}

function MetricTile({ label, value }: { label: string; value: string }) {
  return (
    <div className="border border-hp-rule bg-hp-card p-5">
      <div className="text-[11px] uppercase tracking-[0.14em] text-hp-muted">{label}</div>
      <div className="mt-3 text-2xl tabular-nums text-hp-ink">{value}</div>
    </div>
  );
}

function DateRangeControls({
  startDate,
  endDate,
  onStartDateChange,
  onEndDateChange,
  onApply,
  onQuickRange,
}: {
  startDate: string;
  endDate: string;
  onStartDateChange: (value: string) => void;
  onEndDateChange: (value: string) => void;
  onApply: () => void;
  onQuickRange: (days: number) => void;
}) {
  return (
    <div className="flex flex-col gap-2 lg:flex-row lg:items-center">
      <div className="flex min-w-0 flex-wrap items-center gap-2 border border-hp-rule px-3 py-2">
        <CalendarRange size={16} className="text-hp-muted" />
        <input
          aria-label="Start date"
          type="date"
          value={startDate}
          onChange={(event) => onStartDateChange(event.target.value)}
          className="h-8 bg-transparent text-sm outline-none"
        />
        <span className="text-hp-muted">to</span>
        <input
          aria-label="End date"
          type="date"
          value={endDate}
          onChange={(event) => onEndDateChange(event.target.value)}
          className="h-8 bg-transparent text-sm outline-none"
        />
        <button
          onClick={onApply}
          className="h-8 border border-hp-ink px-3 text-[10px] uppercase tracking-[0.14em] text-hp-ink transition-colors hover:bg-hp-ink hover:text-hp-foundation"
        >
          Apply
        </button>
      </div>
      <div className="flex items-center gap-1">
        {[7, 14, 30].map((days) => (
          <button
            key={days}
            onClick={() => onQuickRange(days)}
            className="h-8 border border-hp-rule px-3 text-[10px] uppercase tracking-[0.14em] text-hp-muted transition-colors hover:border-hp-ink hover:text-hp-ink"
          >
            {days}D
          </button>
        ))}
      </div>
    </div>
  );
}

function SegmentedView({
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
}

function PerformanceSection({ title, rows }: { title: string; rows: PerformanceRow[] }) {
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
}

function CreativeTable({ rows }: { rows: PerformanceRow[] }) {
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
            <tr key={row.id} className="border-b border-hp-rule align-top last:border-b-0">
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
}

function CreativeCards({ rows }: { rows: PerformanceRow[] }) {
  return (
    <div className="grid gap-4 md:grid-cols-2">
      {rows.map((row) => (
        <article key={row.id} className="border border-hp-rule bg-hp-card p-4">
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
}

function CreativeGallery({ rows }: { rows: PerformanceRow[] }) {
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {rows.map((row) => (
        <article key={row.id} className="border border-hp-rule bg-hp-card">
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
}

function CreativePreview({
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
}

function RiskBadge({ level }: { level?: PerformanceRow["riskLevel"] }) {
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
}

function ResultCell({ row, align = "left" }: { row: PerformanceRow; align?: "left" | "right" }) {
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
}

function MiniMetric({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-[0.14em] text-hp-muted">{label}</div>
      <div className="mt-1 tabular-nums text-hp-ink">{value}</div>
    </div>
  );
}

function InsightPanel({
  id,
  title,
  icon,
  expandedPanel,
  setExpandedPanel,
  items,
}: {
  id: string;
  title: string;
  icon: React.ReactNode;
  expandedPanel: string | null;
  setExpandedPanel: (panel: string | null) => void;
  items: string[];
}) {
  const isOpen = expandedPanel === id;
  return (
    <section className="border border-hp-rule bg-hp-card">
      <button
        onClick={() => setExpandedPanel(isOpen ? null : id)}
        className="flex w-full items-center justify-between gap-3 p-4 text-left"
      >
        <span className="flex items-center gap-2 text-hp-ink">
          {icon}
          <span className="text-[11px] uppercase tracking-[0.14em]">{title}</span>
        </span>
        <ChevronDown size={16} className={`transition-transform ${isOpen ? "rotate-180" : ""}`} />
      </button>
      {isOpen ? (
        <div className="border-t border-hp-rule p-4">
          {items.length ? (
            <ol className="space-y-3 text-sm">
              {items.map((item) => (
                <li key={item} className="leading-6 text-hp-body [overflow-wrap:anywhere]">
                  {item}
                </li>
              ))}
            </ol>
          ) : (
            <p className="text-sm text-hp-muted">No current signal.</p>
          )}
        </div>
      ) : null}
    </section>
  );
}

function ActionPanel({
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
}

function ChatPanel({
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
}

function SourcePanel({ data }: { data: DashboardPayload }) {
  const counts = Object.entries(data.sourceTransparency.recordCounts);
  return (
    <section className="border border-hp-rule bg-hp-card p-4">
      <div className="text-[11px] uppercase tracking-[0.14em] text-hp-muted">
        Source Transparency
      </div>
      <div className="mt-3 space-y-2 text-sm">
        <div>{data.sourceTransparency.timeRange.days} day window</div>
        <div>{data.sourceTransparency.adAccountsAnalyzed.join(", ") || "No accounts"}</div>
        {counts.map(([key, value]) => (
          <div key={key} className="flex justify-between gap-4 border-t border-hp-rule pt-2">
            <span>{key}</span>
            <span className="tabular-nums">{formatMetric(Number(value), "number")}</span>
          </div>
        ))}
      </div>
    </section>
  );
}

type CreativePdfHtmlOptions = {
  rows: PerformanceRow[];
  dateRange: string;
  umbrellaName: string;
  brandName: string;
  searchQuery: string;
  sortLabel: string;
  generatedAt: Date;
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
}: CreativePdfHtmlOptions) {
  const galleryRows = rows.slice(0, CREATIVE_EXPORT_GALLERY_LIMIT);
  const totalSpend = rows.reduce((sum, row) => sum + row.spend, 0);
  const totalPrimaryResults = rows.reduce((sum, row) => sum + row.primaryResults, 0);
  const totalNewMessagingContacts = rows.reduce(
    (sum, row) => sum + row.newMessagingContacts,
    0,
  );
  const highRiskCount = rows.filter((row) => row.riskLevel === "high").length;
  const generatedLabel = new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(generatedAt);
  const searchLabel = searchQuery.trim() ? searchQuery.trim() : "None";
  const subtitleParts = [
    `Brand: ${brandName}`,
    `Sorted by: ${sortLabel}`,
    `Search: ${searchLabel}`,
  ];

  return `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <title>${escapeHtml(`Creative Export - ${umbrellaName} - ${dateRange}`)}</title>
    <style>
      @page {
        size: letter landscape;
        margin: 0.34in;
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
        font-size: 9.5px;
        line-height: 1.35;
      }

      body {
        -webkit-print-color-adjust: exact;
        print-color-adjust: exact;
      }

      .report-header {
        display: grid;
        grid-template-columns: minmax(0, 1fr) 2.35in;
        gap: 0.22in;
        align-items: end;
        border-bottom: 1px solid #2a2725;
        padding-bottom: 0.14in;
        margin-bottom: 0.16in;
      }

      .kicker,
      .label,
      th {
        color: #8a8178;
        font-size: 7px;
        letter-spacing: 0.08em;
        text-transform: uppercase;
      }

      h1 {
        margin: 0.04in 0 0;
        color: #2a2725;
        font-size: 23px;
        font-weight: 500;
        line-height: 1.05;
        overflow-wrap: anywhere;
      }

      h2 {
        margin: 0.02in 0 0;
        color: #2a2725;
        font-size: 14px;
        font-weight: 500;
        line-height: 1.15;
      }

      .subtitle,
      .meta,
      .muted {
        color: #4a4540;
      }

      .meta {
        display: grid;
        gap: 0.05in;
        text-align: right;
      }

      .meta strong {
        display: block;
        color: #2a2725;
        font-size: 9px;
        font-weight: 700;
      }

      .summary {
        display: grid;
        grid-template-columns: repeat(5, minmax(0, 1fr));
        gap: 0.08in;
        margin-bottom: 0.18in;
      }

      .metric {
        min-height: 0.42in;
        border: 1px solid #d4cfc4;
        padding: 0.06in 0.08in;
        break-inside: avoid;
      }

      .metric-value {
        margin-top: 0.03in;
        color: #2a2725;
        font-size: 13px;
        font-variant-numeric: tabular-nums;
        line-height: 1.1;
        overflow-wrap: anywhere;
      }

      .section-heading {
        display: flex;
        align-items: end;
        justify-content: space-between;
        gap: 0.16in;
        border-top: 1px solid #d4cfc4;
        padding-top: 0.1in;
        margin: 0.04in 0 0.1in;
        break-after: avoid;
        page-break-after: avoid;
      }

      .section-count {
        color: #8a8178;
        font-size: 8px;
        text-align: right;
        white-space: nowrap;
      }

      .gallery-grid {
        display: grid;
        grid-template-columns: repeat(4, minmax(0, 1fr));
        gap: 0.08in;
        margin-bottom: 0.18in;
      }

      .gallery-card {
        min-width: 0;
        border: 1px solid #d4cfc4;
        background: #fbf7f1;
        break-inside: avoid;
        page-break-inside: avoid;
      }

      .gallery-media {
        height: 0.92in;
        border-bottom: 1px solid #d4cfc4;
        background: #efe8dd;
      }

      .gallery-body {
        padding: 0.07in;
      }

      .gallery-name,
      .table-name {
        color: #2a2725;
        font-weight: 700;
        overflow-wrap: anywhere;
      }

      .gallery-name {
        max-height: 2.6em;
        overflow: hidden;
      }

      .gallery-umbrella {
        margin-top: 0.03in;
        color: #8a8178;
        font-size: 7px;
        letter-spacing: 0.06em;
        text-transform: uppercase;
        overflow-wrap: anywhere;
      }

      .gallery-metrics {
        display: grid;
        grid-template-columns: repeat(3, minmax(0, 1fr));
        gap: 0.05in;
        margin-top: 0.06in;
      }

      .mini-value {
        margin-top: 0.01in;
        color: #2a2725;
        font-size: 8px;
        font-variant-numeric: tabular-nums;
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
        padding: 0.04in 0.05in;
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
        font-size: 8px;
      }

      .table-copy {
        margin-top: 0.02in;
        color: #8a8178;
        font-size: 7px;
        max-height: 3.7em;
        overflow: hidden;
      }

      .table-preview {
        width: 0.48in;
        height: 0.48in;
        border: 1px solid #d4cfc4;
        background: #efe8dd;
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
    <header class="report-header">
      <div>
        <div class="kicker">Creative Gallery and Table PDF Export</div>
        <h1>${escapeHtml(umbrellaName)}</h1>
        <div class="subtitle">Internal Campaign Umbrella</div>
      </div>
      <div class="meta">
        <div>
          <strong>Date range</strong>
          ${escapeHtml(dateRange)}
        </div>
        <div>
          <strong>Filters</strong>
          ${escapeHtml(subtitleParts.join(" | "))}
        </div>
        <div>
          <strong>Generated</strong>
          ${escapeHtml(generatedLabel)}
        </div>
      </div>
    </header>

    <section class="summary" aria-label="Creative export summary">
      ${metricMarkup("Creatives", formatMetric(rows.length, "number"))}
      ${metricMarkup("Spend", formatMetric(totalSpend, "money"))}
      ${metricMarkup("Primary Results", formatMetric(totalPrimaryResults, "number"))}
      ${metricMarkup("New Msg Contacts", formatMetric(totalNewMessagingContacts, "number"))}
      ${metricMarkup("High Risk", formatMetric(highRiskCount, "number"))}
    </section>

    <section>
      <div class="section-heading">
        <div>
          <div class="kicker">Creative Gallery</div>
          <h2>Top previews by ${escapeHtml(sortLabel)}</h2>
        </div>
        <div class="section-count">Top ${formatMetric(galleryRows.length, "number")} of ${formatMetric(rows.length, "number")}</div>
      </div>
      ${
        galleryRows.length
          ? `<div class="gallery-grid">${galleryRows.map(galleryCardMarkup).join("")}</div>`
          : `<div class="empty-state">No creatives match the selected filters.</div>`
      }
    </section>

    <section>
      <div class="section-heading">
        <div>
          <div class="kicker">Creative Table</div>
          <h2>Filtered creative performance</h2>
        </div>
        <div class="section-count">${formatMetric(rows.length, "number")} rows</div>
      </div>
      ${rows.length ? creativeTableMarkup(rows) : `<div class="empty-state">No creatives match the selected filters.</div>`}
    </section>
  </body>
</html>`;
}

function metricMarkup(label: string, value: string) {
  return `<div class="metric">
    <div class="label">${escapeHtml(label)}</div>
    <div class="metric-value">${escapeHtml(value)}</div>
  </div>`;
}

function galleryCardMarkup(row: PerformanceRow) {
  return `<article class="gallery-card">
    <div class="gallery-media preview">${creativePreviewMarkup(row)}</div>
    <div class="gallery-body">
      <div class="gallery-name">${escapeHtml(truncateText(row.name, 74))}</div>
      <div class="gallery-umbrella">${escapeHtml(row.brandCode)} | ${escapeHtml(row.campaignUmbrella || "Unassigned")}</div>
      <div class="gallery-metrics">
        ${miniMetricMarkup("Spend", formatMetric(row.spend, "money"))}
        ${miniMetricMarkup("CTR", formatMetric(row.ctr, "percent"))}
        ${miniMetricMarkup(row.primaryResultLabel, formatMetric(row.primaryResults, "number"))}
      </div>
    </div>
  </article>`;
}

function miniMetricMarkup(label: string, value: string) {
  return `<div>
    <div class="label">${escapeHtml(truncateText(label, 22))}</div>
    <div class="mini-value">${escapeHtml(value)}</div>
  </div>`;
}

function creativeTableMarkup(rows: PerformanceRow[]) {
  return `<table>
    <colgroup>
      <col style="width: 25%" />
      <col style="width: 9%" />
      <col style="width: 6%" />
      <col style="width: 13%" />
      <col style="width: 8%" />
      <col style="width: 7%" />
      <col style="width: 7%" />
      <col style="width: 6%" />
      <col style="width: 13%" />
      <col style="width: 6%" />
    </colgroup>
    <thead>
      <tr>
        <th>Creative</th>
        <th>Preview</th>
        <th>Brand</th>
        <th>Umbrella</th>
        <th class="num">Spend</th>
        <th class="num">CTR</th>
        <th class="num">CPC</th>
        <th class="num">Freq.</th>
        <th class="num">Primary KPI</th>
        <th>Risk</th>
      </tr>
    </thead>
    <tbody>
      ${rows.map(creativeTableRowMarkup).join("")}
    </tbody>
  </table>`;
}

function creativeTableRowMarkup(row: PerformanceRow) {
  return `<tr>
    <td>
      <div class="table-name">${escapeHtml(truncateText(row.name, 120))}</div>
      ${row.body ? `<div class="table-copy">${escapeHtml(truncateText(row.body, 170))}</div>` : ""}
    </td>
    <td><div class="table-preview preview">${creativePreviewMarkup(row)}</div></td>
    <td>${escapeHtml(row.brandCode)}</td>
    <td>${escapeHtml(row.campaignUmbrella || "Unassigned")}</td>
    <td class="num">${escapeHtml(formatMetric(row.spend, "money"))}</td>
    <td class="num">${escapeHtml(formatMetric(row.ctr, "percent"))}</td>
    <td class="num">${escapeHtml(formatMetric(row.cpc, "money"))}</td>
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

function rowMatchesFilters(row: PerformanceRow, brand: string, umbrella: string, query: string) {
  if (brand !== "all" && row.brandCode !== brand) return false;
  if (umbrella !== "all" && row.campaignUmbrella !== umbrella) return false;

  const normalizedQuery = query.trim().toLowerCase();
  if (!normalizedQuery) return true;

  return [
    row.name,
    row.title,
    row.body,
    row.brandCode,
    row.campaignUmbrella,
    row.objective,
    row.status,
    row.effectiveStatus,
  ]
    .filter(Boolean)
    .some((value) => String(value).toLowerCase().includes(normalizedQuery));
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
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      maximumFractionDigits: value >= 100 ? 0 : 2,
    }).format(value);
  }
  if (kind === "percent") return `${value.toFixed(2)}%`;
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(value);
}
