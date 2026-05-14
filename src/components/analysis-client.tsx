"use client";

import {
  BarChart3,
  Brain,
  Check,
  Gauge,
  History,
  Loader2,
  Pencil,
  Save,
  Send,
  Sparkles,
  Table2,
  Trash2,
  X,
} from "lucide-react";
import { useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import type {
  AnalysisMetric,
  AnalysisResult,
  AnalysisSpec,
  AnalysisTableColumn,
  SavedAnalysisDashboard,
} from "@/lib/ad-hoc-analytics";
import type { AnalysisMode } from "@/lib/env";

type Props = {
  initialSaved: SavedAnalysisDashboard[];
};

const CHART_COLORS = ["#2A2725", "#245D4D", "#8B5B19", "#8D2E2E", "#E91D79"];

export function AnalysisClient({ initialSaved }: Props) {
  const [mode, setMode] = useState<AnalysisMode>("fast");
  const [prompt, setPrompt] = useState("");
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [saved, setSaved] = useState(initialSaved);
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState("");
  const [actionStatus, setActionStatus] = useState("");
  const [editPrompt, setEditPrompt] = useState("");
  const [titleDraft, setTitleDraft] = useState("");
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameDraft, setRenameDraft] = useState("");

  async function generateAnalysis() {
    const nextPrompt = prompt.trim();
    if (!nextPrompt) return;

    setLoading(true);
    setStatus("");
    setActionStatus("");
    setResult(null);
    setTitleDraft("");
    try {
      const response = await fetch("/api/analysis", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ prompt: nextPrompt, mode }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Analysis failed");
      setResult(payload);
      setTitleDraft(payload.title || "");
      setEditPrompt("");
      setActionStatus(payload.dashboardId ? "Dashboard saved automatically." : "");
      await refreshSaved();
    } catch (error) {
      setStatus(error instanceof Error ? error.message : String(error));
    } finally {
      setLoading(false);
    }
  }

  async function loadSavedDashboard(dashboardId: string) {
    setLoading(true);
    setStatus("");
    setActionStatus("");
    try {
      const response = await fetch(`/api/analysis?dashboardId=${encodeURIComponent(dashboardId)}`);
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Could not load saved dashboard");
      setResult(payload);
      setTitleDraft(payload.title || "");
      setPrompt(payload.prompt || prompt);
      setMode(payload.mode || "fast");
      setEditPrompt("");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : String(error));
    } finally {
      setLoading(false);
    }
  }

  async function applyDashboardEdit() {
    const nextPrompt = editPrompt.trim();
    if (!nextPrompt || !result) return;

    setLoading(true);
    setStatus("");
    setActionStatus("");
    try {
      const response = await fetch("/api/analysis", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          action: "edit",
          dashboardId: result.dashboardId,
          currentPrompt: result.prompt,
          currentSpec: result.spec,
          prompt: nextPrompt,
          mode,
        }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Dashboard edit failed");
      setResult(payload);
      setTitleDraft(payload.title || "");
      setPrompt(payload.prompt || nextPrompt);
      setEditPrompt("");
      setActionStatus(payload.dashboardId ? "Dashboard updated and saved." : "");
      await refreshSaved();
    } catch (error) {
      setStatus(error instanceof Error ? error.message : String(error));
    } finally {
      setLoading(false);
    }
  }

  async function renameDashboard(dashboardId: string, title: string) {
    const nextTitle = title.trim();
    if (!nextTitle) return;

    setLoading(true);
    setStatus("");
    setActionStatus("");
    try {
      const response = await fetch("/api/analysis", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ dashboardId, title: nextTitle }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Rename failed");
      setSaved((dashboards) =>
        dashboards.map((dashboard) =>
          dashboard.id === dashboardId ? { ...dashboard, ...payload } : dashboard,
        ),
      );
      setResult((current) =>
        current?.dashboardId === dashboardId
          ? {
              ...current,
              title: payload.title,
              spec: { ...current.spec, title: payload.title },
            }
          : current,
      );
      setRenamingId(null);
      setRenameDraft("");
      setTitleDraft(payload.title || nextTitle);
      setActionStatus("Dashboard renamed.");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : String(error));
    } finally {
      setLoading(false);
    }
  }

  async function deleteDashboard(dashboardId: string) {
    if (!window.confirm("Delete this saved ad-hoc dashboard?")) return;

    setLoading(true);
    setStatus("");
    setActionStatus("");
    try {
      const response = await fetch(`/api/analysis?dashboardId=${encodeURIComponent(dashboardId)}`, {
        method: "DELETE",
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Delete failed");
      setSaved((dashboards) => dashboards.filter((dashboard) => dashboard.id !== dashboardId));
      if (result?.dashboardId === dashboardId) {
        setResult(null);
        setTitleDraft("");
        setEditPrompt("");
      }
      setActionStatus("Dashboard deleted.");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : String(error));
    } finally {
      setLoading(false);
    }
  }

  async function refreshSaved() {
    const response = await fetch("/api/analysis");
    if (!response.ok) return;
    const payload = await response.json();
    if (Array.isArray(payload.dashboards)) setSaved(payload.dashboards);
  }

  return (
    <main className="min-h-screen bg-hp-foundation px-4 py-6 text-hp-body md:px-8">
      <header className="mx-auto flex max-w-7xl flex-col gap-5 border-b border-hp-rule pb-6 md:flex-row md:items-end md:justify-between">
        <div>
          <span className="text-[11px] uppercase tracking-[0.14em] text-hp-muted">
            HP/VVS Meta Ads
          </span>
          <h1 className="mt-2 font-title text-4xl leading-tight text-hp-ink md:text-5xl">
            Ad-Hoc AI Analysis
          </h1>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <ModeSwitch value={mode} onChange={setMode} />
        </div>
      </header>

      <section className="mx-auto mt-8 grid max-w-7xl gap-6 xl:grid-cols-[360px_1fr]">
        <aside className="space-y-6">
          <section className="border border-hp-rule bg-hp-card p-4">
            <div className="mb-4 flex items-center gap-2 text-hp-ink">
              <Sparkles size={18} />
              <span className="text-[11px] uppercase tracking-[0.14em]">Build Analysis</span>
            </div>
            <textarea
              value={prompt}
              onChange={(event) => setPrompt(event.target.value)}
              rows={6}
              placeholder="Ad spend by campaign umbrella since January 1, 2026, month by month."
              className="w-full resize-none border border-hp-rule bg-hp-inset p-3 text-sm leading-6 outline-none focus:border-hp-pink"
            />
            <button
              onClick={generateAnalysis}
              disabled={loading || !prompt.trim()}
              className="mt-3 flex w-full items-center justify-center gap-2 bg-hp-ink px-4 py-3 text-xs uppercase tracking-[0.14em] text-hp-foundation transition-colors hover:bg-hp-pink"
            >
              {loading ? <Loader2 size={15} className="animate-spin" /> : <Send size={15} />}
              Generate
            </button>
            {actionStatus ? <p className="mt-3 text-sm text-signal-positive">{actionStatus}</p> : null}
            {status ? <p className="mt-3 text-sm text-signal-danger">{status}</p> : null}
          </section>

          <section className="border border-hp-rule bg-hp-card p-4">
            <div className="mb-4 flex items-center gap-2 text-hp-ink">
              <History size={18} />
              <span className="text-[11px] uppercase tracking-[0.14em]">Saved Dashboards</span>
            </div>
            <div className="space-y-2">
              {saved.length ? (
                saved.map((dashboard) => (
                  <article key={dashboard.id} className="border border-hp-rule">
                    <button
                      onClick={() => loadSavedDashboard(dashboard.id)}
                      className="w-full p-3 text-left transition-colors hover:bg-hp-inset"
                    >
                      <div className="line-clamp-2 text-sm text-hp-ink">{dashboard.title}</div>
                      <div className="mt-2 flex items-center justify-between gap-3 text-[10px] uppercase tracking-[0.14em] text-hp-muted">
                        <span>{dashboard.mode}</span>
                        <span>{new Date(dashboard.updatedAt).toLocaleDateString()}</span>
                      </div>
                    </button>

                    {renamingId === dashboard.id ? (
                      <div className="flex gap-2 border-t border-hp-rule p-2">
                        <input
                          value={renameDraft}
                          onChange={(event) => setRenameDraft(event.target.value)}
                          className="min-w-0 flex-1 border-b border-hp-rule bg-transparent px-1 py-1 text-sm outline-none focus:border-hp-pink"
                          aria-label="Rename saved dashboard"
                        />
                        <button
                          onClick={() => renameDashboard(dashboard.id, renameDraft)}
                          disabled={loading || !renameDraft.trim()}
                          title="Save name"
                          className="flex h-8 w-8 items-center justify-center border border-hp-ink text-hp-ink transition-colors hover:bg-hp-ink hover:text-hp-foundation"
                        >
                          <Check size={14} />
                        </button>
                        <button
                          onClick={() => {
                            setRenamingId(null);
                            setRenameDraft("");
                          }}
                          title="Cancel rename"
                          className="flex h-8 w-8 items-center justify-center border border-hp-rule text-hp-muted transition-colors hover:border-hp-ink hover:text-hp-ink"
                        >
                          <X size={14} />
                        </button>
                      </div>
                    ) : (
                      <div className="flex border-t border-hp-rule">
                        <button
                          onClick={() => {
                            setRenamingId(dashboard.id);
                            setRenameDraft(dashboard.title);
                          }}
                          className="flex flex-1 items-center justify-center gap-2 px-3 py-2 text-[10px] uppercase tracking-[0.14em] text-hp-muted transition-colors hover:bg-hp-inset hover:text-hp-ink"
                        >
                          <Pencil size={13} />
                          Rename
                        </button>
                        <button
                          onClick={() => deleteDashboard(dashboard.id)}
                          className="flex flex-1 items-center justify-center gap-2 border-l border-hp-rule px-3 py-2 text-[10px] uppercase tracking-[0.14em] text-signal-danger transition-colors hover:bg-hp-inset"
                        >
                          <Trash2 size={13} />
                          Delete
                        </button>
                      </div>
                    )}
                  </article>
                ))
              ) : (
                <p className="text-sm text-hp-muted">No saved specs yet.</p>
              )}
            </div>
          </section>
        </aside>

        <section className="min-w-0 space-y-6">
          {result ? (
            <>
              <CurrentDashboardPanel
                result={result}
                titleDraft={titleDraft}
                editPrompt={editPrompt}
                loading={loading}
                onTitleChange={setTitleDraft}
                onRename={() => result.dashboardId && renameDashboard(result.dashboardId, titleDraft)}
                onEditPromptChange={setEditPrompt}
                onApplyEdit={applyDashboardEdit}
              />
              <AnalysisOutput result={result} />
            </>
          ) : (
            <div className="border border-hp-rule bg-hp-card p-8">
              <div className="flex h-64 items-center justify-center border border-dashed border-hp-rule text-center text-sm text-hp-muted">
                Ask for an ad-hoc Meta Ads comparison to generate a reusable dashboard spec.
              </div>
            </div>
          )}
        </section>
      </section>
    </main>
  );
}

function CurrentDashboardPanel({
  result,
  titleDraft,
  editPrompt,
  loading,
  onTitleChange,
  onRename,
  onEditPromptChange,
  onApplyEdit,
}: {
  result: AnalysisResult;
  titleDraft: string;
  editPrompt: string;
  loading: boolean;
  onTitleChange: (value: string) => void;
  onRename: () => void;
  onEditPromptChange: (value: string) => void;
  onApplyEdit: () => void;
}) {
  return (
    <section className="border border-hp-rule bg-hp-card p-4">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0 flex-1">
          <div className="mb-2 flex items-center gap-2 text-hp-ink">
            <Save size={16} />
            <span className="text-[11px] uppercase tracking-[0.14em]">
              {result.dashboardId ? "Saved Dashboard" : "Unsaved Dashboard"}
            </span>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row">
            <input
              value={titleDraft}
              onChange={(event) => onTitleChange(event.target.value)}
              disabled={!result.dashboardId}
              className="min-w-0 flex-1 border border-hp-rule bg-hp-inset px-3 py-2 text-sm outline-none focus:border-hp-pink disabled:opacity-60"
              aria-label="Dashboard name"
            />
            <button
              onClick={onRename}
              disabled={loading || !result.dashboardId || !titleDraft.trim() || titleDraft === result.title}
              className="flex h-10 items-center justify-center gap-2 border border-hp-ink px-4 text-[11px] uppercase tracking-[0.14em] text-hp-ink transition-colors hover:bg-hp-ink hover:text-hp-foundation disabled:hover:bg-transparent disabled:hover:text-hp-ink"
            >
              <Pencil size={14} />
              Rename
            </button>
          </div>
        </div>

        <div className="min-w-0 flex-1">
          <div className="mb-2 flex items-center gap-2 text-hp-ink">
            <Sparkles size={16} />
            <span className="text-[11px] uppercase tracking-[0.14em]">Edit with GPT</span>
          </div>
          <div className="flex flex-col gap-2">
            <textarea
              value={editPrompt}
              onChange={(event) => onEditPromptChange(event.target.value)}
              rows={3}
              placeholder="Add a campaign-umbrella table, move the trend chart first, or compare this against last month."
              className="w-full resize-none border border-hp-rule bg-hp-inset p-3 text-sm leading-6 outline-none placeholder:text-hp-muted focus:border-hp-pink"
            />
            <button
              onClick={onApplyEdit}
              disabled={loading || !editPrompt.trim()}
              className="flex h-10 items-center justify-center gap-2 bg-hp-ink px-4 text-[11px] uppercase tracking-[0.14em] text-hp-foundation transition-colors hover:bg-hp-pink"
            >
              {loading ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
              Apply Edit
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}

function ModeSwitch({
  value,
  onChange,
}: {
  value: AnalysisMode;
  onChange: (value: AnalysisMode) => void;
}) {
  return (
    <div className="flex border border-hp-rule bg-hp-card">
      <button
        onClick={() => onChange("fast")}
        className={`flex items-center gap-2 px-4 py-2 text-[11px] uppercase tracking-[0.14em] ${
          value === "fast" ? "bg-hp-ink text-hp-foundation" : "text-hp-body hover:bg-hp-inset"
        }`}
        title="Fast mode uses gpt-5.4-nano"
      >
        <Gauge size={15} />
        Fast
      </button>
      <button
        onClick={() => onChange("deep")}
        className={`flex items-center gap-2 border-l border-hp-rule px-4 py-2 text-[11px] uppercase tracking-[0.14em] ${
          value === "deep" ? "bg-hp-ink text-hp-foundation" : "text-hp-body hover:bg-hp-inset"
        }`}
        title="Deep mode adds gpt-5.5 interpretation"
      >
        <Brain size={15} />
        Deep
      </button>
    </div>
  );
}

function AnalysisOutput({ result }: { result: AnalysisResult }) {
  return (
    <>
      <section className="border border-hp-rule bg-hp-card p-6">
        <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
          <div>
            <span className="text-[11px] uppercase tracking-[0.14em] text-hp-muted">
              {result.status === "ready" ? "Generated Dashboard" : "Needs Narrowing"}
            </span>
            <h2 className="mt-2 font-title text-[34px] leading-tight text-hp-ink">
              {result.title}
            </h2>
          </div>
          {result.dashboardId ? (
            <div className="flex items-center gap-2 border border-hp-rule px-3 py-2 text-xs text-hp-muted">
              <Save size={14} />
              Saved
            </div>
          ) : null}
        </div>
        <p className="mt-5 max-w-4xl text-sm leading-7 text-hp-body">{result.answer}</p>
        {result.persistenceWarning ? (
          <p className="mt-3 text-sm text-signal-warning">{result.persistenceWarning}</p>
        ) : null}
        <MetaStrip result={result} />
      </section>

      {result.status === "ready" ? (
        <div className="space-y-6">
          {result.widgets.map((widget, index) => (
            <WidgetRenderer
              key={`${widget.type}-${widget.title}-${index}`}
              widget={widget}
              result={result}
            />
          ))}
        </div>
      ) : null}
    </>
  );
}

function MetaStrip({ result }: { result: AnalysisResult }) {
  return (
    <div className="mt-6 grid gap-3 border-t border-hp-rule pt-4 text-xs md:grid-cols-4">
      <MiniFact label="Plan Model" value={result.modelUsed.plan} />
      <MiniFact label="Analysis Model" value={result.modelUsed.analysis || "none"} />
      <MiniFact label="Est. Cost" value={`$${result.tokenEstimate.estimatedCostUsd.toFixed(5)}`} />
      <MiniFact
        label="Source Rows"
        value={formatNumber(result.sourceTransparency.recordCounts.matched_insights || 0)}
      />
    </div>
  );
}

function MiniFact({ label, value }: { label: string; value: string }) {
  return (
    <div className="border border-hp-rule bg-hp-inset px-3 py-2">
      <div className="text-[10px] uppercase tracking-[0.14em] text-hp-muted">{label}</div>
      <div className="mt-1 truncate text-hp-ink">{value}</div>
    </div>
  );
}

function WidgetRenderer({
  widget,
  result,
}: {
  widget: AnalysisSpec["widgets"][number];
  result: AnalysisResult;
}) {
  if (widget.type === "metric") {
    return <MetricWidget widget={widget} result={result} />;
  }

  if (widget.type === "line" || widget.type === "bar") {
    return <ChartWidget widget={widget} result={result} />;
  }

  return <TableWidget title={widget.title} table={result.table} />;
}

function MetricWidget({
  widget,
  result,
}: {
  widget: AnalysisSpec["widgets"][number];
  result: AnalysisResult;
}) {
  return (
    <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
      {widget.metrics.map((metric) => (
        <div key={metric} className="border border-hp-rule bg-hp-card p-5">
          <div className="text-[11px] uppercase tracking-[0.14em] text-hp-muted">
            {labelFor(metric)}
          </div>
          <div className="mt-3 text-2xl tabular-nums text-hp-ink">
            {formatMetricValue(result.totals[metric], metric)}
          </div>
        </div>
      ))}
    </section>
  );
}

function ChartWidget({
  widget,
  result,
}: {
  widget: AnalysisSpec["widgets"][number];
  result: AnalysisResult;
}) {
  const xKey = widget.x || result.spec.dimensions[0] || result.table.columns[0]?.key || "label";
  const metrics = widget.metrics.filter((metric) => result.table.columns.some((column) => column.key === metric));

  return (
    <section className="border border-hp-rule bg-hp-card p-6">
      <SectionTitle icon={<BarChart3 size={18} />} title={widget.title} />
      <div className="h-80">
        <ResponsiveContainer width="100%" height="100%">
          {widget.type === "bar" ? (
            <BarChart data={result.table.rows} margin={{ top: 8, right: 18, bottom: 0, left: 0 }}>
              <CartesianGrid stroke="#D4CFC4" vertical={false} />
              <XAxis dataKey={xKey} tickLine={false} axisLine={false} tick={{ fill: "#8A8178", fontSize: 11 }} />
              <YAxis tickLine={false} axisLine={false} tick={{ fill: "#8A8178", fontSize: 11 }} />
              <Tooltip contentStyle={tooltipStyle} />
              {metrics.map((metric, index) => (
                <Bar key={metric} dataKey={metric} fill={CHART_COLORS[index % CHART_COLORS.length]} />
              ))}
            </BarChart>
          ) : (
            <LineChart data={result.table.rows} margin={{ top: 8, right: 18, bottom: 0, left: 0 }}>
              <CartesianGrid stroke="#D4CFC4" vertical={false} />
              <XAxis dataKey={xKey} tickLine={false} axisLine={false} tick={{ fill: "#8A8178", fontSize: 11 }} />
              <YAxis tickLine={false} axisLine={false} tick={{ fill: "#8A8178", fontSize: 11 }} />
              <Tooltip contentStyle={tooltipStyle} />
              {metrics.map((metric, index) => (
                <Line
                  key={metric}
                  type="monotone"
                  dataKey={metric}
                  stroke={CHART_COLORS[index % CHART_COLORS.length]}
                  strokeWidth={2}
                  dot={false}
                />
              ))}
            </LineChart>
          )}
        </ResponsiveContainer>
      </div>
    </section>
  );
}

function TableWidget({
  title,
  table,
}: {
  title: string;
  table: AnalysisResult["table"];
}) {
  return (
    <section className="border border-hp-rule bg-hp-card p-6">
      <SectionTitle icon={<Table2 size={18} />} title={title} />
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="bg-hp-inset text-left text-[11px] uppercase tracking-[0.14em] text-hp-muted">
              {table.columns.map((column) => (
                <th
                  key={column.key}
                  className={`border-b border-hp-rule px-3 py-3 ${
                    column.type === "text" ? "" : "text-right"
                  }`}
                >
                  {column.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {table.rows.map((row, index) => (
              <tr key={index} className="border-b border-hp-rule last:border-b-0">
                {table.columns.map((column) => (
                  <td
                    key={column.key}
                    className={`px-3 py-3 ${
                      column.type === "text"
                        ? "max-w-[360px] text-hp-ink"
                        : "text-right tabular-nums"
                    }`}
                  >
                    {formatCell(row[column.key], column)}
                  </td>
                ))}
              </tr>
            ))}
            {!table.rows.length ? (
              <tr>
                <td colSpan={table.columns.length || 1} className="px-3 py-8 text-center text-sm text-hp-muted">
                  No matching rows.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function SectionTitle({ icon, title }: { icon: React.ReactNode; title: string }) {
  return (
    <div className="mb-5 flex items-center gap-2 text-hp-ink">
      {icon}
      <h3 className="font-title text-[28px] leading-tight">{title}</h3>
    </div>
  );
}

const tooltipStyle = {
  background: "#FBF7F1",
  border: "1px solid #D4CFC4",
  borderRadius: 2,
  color: "#2A2725",
};

function formatCell(value: string | number | null | undefined, column: AnalysisTableColumn) {
  if (column.type === "money") return formatMoney(Number(value || 0));
  if (column.type === "percent") return `${Number(value || 0).toFixed(2)}%`;
  if (column.type === "number") return formatNumber(Number(value || 0));
  return value ?? "n/a";
}

function formatMetricValue(value: string | number | null | undefined, metric: AnalysisMetric) {
  if (["spend", "monthly_budget", "cpc", "cpl", "cpm"].includes(metric)) {
    return formatMoney(Number(value || 0));
  }
  if (metric === "ctr") return `${Number(value || 0).toFixed(2)}%`;
  return formatNumber(Number(value || 0));
}

function labelFor(value: string) {
  const labels: Record<string, string> = {
    ad_count: "Ads",
    ad_set_count: "Ad Sets",
    bookings: "Bookings",
    campaign_count: "Campaigns",
    clicks: "Clicks",
    conversions: "Conversions",
    cpc: "CPC",
    cpl: "CPL",
    cpm: "CPM",
    ctr: "CTR",
    creative_count: "Creatives",
    frequency: "Frequency",
    impressions: "Impressions",
    leads: "Leads",
    monthly_budget: "Monthly Budget",
    reach: "Reach",
    spend: "Spend",
  };
  return labels[value] || value;
}

function formatMoney(value: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: value >= 100 ? 0 : 2,
  }).format(value);
}

function formatNumber(value: number) {
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(value);
}
