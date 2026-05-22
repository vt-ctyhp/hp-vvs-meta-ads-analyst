"use client";

import {
  BarChart3,
  Bot,
  Check,
  ChevronDown,
  HelpCircle,
  History,
  Loader2,
  Pencil,
  Send,
  Sparkles,
  Trash2,
  X,
} from "lucide-react";
import { useCallback, useMemo, useState } from "react";

import { AnalysisOutput } from "@/components/analysis-client";
import type {
  AnalysisFilter,
  AnalysisResult,
  SavedAnalysisDashboard,
} from "@/lib/ad-hoc-analytics";
import type { AnalysisMode } from "@/lib/env";
import { translateError } from "@/lib/glossary";

type ChatMessage = {
  role: "user" | "assistant";
  content: string;
  rangeLabel: string;
};

type Props = {
  initialSaved: SavedAnalysisDashboard[];
  canUseAdHocAnalysis: boolean;
  dateRange: {
    days: number;
    startDate: string | null;
    endDate: string | null;
  };
  filters?: {
    brand: string | null;
    group: string | null;
    status: string | null;
  };
};

const DEFAULT_FILTERS = {
  brand: null,
  group: null,
  status: null,
};

export function OptimizeAiPanel({
  initialSaved,
  canUseAdHocAnalysis,
  dateRange,
  filters = DEFAULT_FILTERS,
}: Props) {
  const [prompt, setPrompt] = useState("");
  const [mode, setMode] = useState<AnalysisMode>("fast");
  const [showModeHelp, setShowModeHelp] = useState(false);

  const [chatSessionId, setChatSessionId] = useState<string | null>(null);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [isChatting, setIsChatting] = useState(false);

  const [analysisResult, setAnalysisResult] = useState<AnalysisResult | null>(null);
  const [saved, setSaved] = useState(initialSaved);
  const [isBuilding, setIsBuilding] = useState(false);
  const [isDashboardLoading, setIsDashboardLoading] = useState(false);
  const [analysisStatus, setAnalysisStatus] = useState("");
  const [analysisActionStatus, setAnalysisActionStatus] = useState("");
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameDraft, setRenameDraft] = useState("");
  const [editPrompt, setEditPrompt] = useState("");

  const requestedRangeLabel = formatRequestedRange(dateRange);
  const runtimeFilters = useMemo<AnalysisFilter[]>(() => {
    const nextFilters: AnalysisFilter[] = [];
    if (filters.brand) {
      nextFilters.push({ field: "brand", operator: "equals", value: filters.brand });
    }
    if (filters.group) {
      nextFilters.push({
        field: "campaign_umbrella",
        operator: "equals",
        value: filters.group,
      });
    }
    if (filters.status) {
      nextFilters.push({
        field: "delivery_status",
        operator: "equals",
        value: filters.status,
      });
    }
    return nextFilters;
  }, [filters.brand, filters.group, filters.status]);
  const runtimeContext = useMemo(
    () => ({
      dateRange,
      filters: runtimeFilters,
    }),
    [dateRange, runtimeFilters],
  );

  const refreshSaved = useCallback(async function refreshSaved() {
    try {
      const response = await fetch("/api/analysis");
      if (!response.ok) return;
      const payload = await response.json();
      if (Array.isArray(payload.dashboards)) setSaved(payload.dashboards);
    } catch {
      // Saved-list refreshes are best-effort after a successful build.
    }
  }, []);

  const sendChatMessage = useCallback(async function sendChatMessage() {
    const message = prompt.trim();
    if (!message) return;

    setPrompt("");
    setChatMessages((messages) => [
      ...messages,
      { role: "user", content: message, rangeLabel: requestedRangeLabel },
    ]);
    setIsChatting(true);

    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          sessionId: chatSessionId,
          message,
          days: dateRange.days,
          startDate: dateRange.startDate,
          endDate: dateRange.endDate,
          brand: filters.brand,
          group: filters.group,
          status: filters.status,
        }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Chat failed");
      setChatSessionId(payload.sessionId ?? null);
      setChatMessages((messages) => [
        ...messages,
        {
          role: "assistant",
          content: payload.answer,
          rangeLabel: formatSourceRange(payload.sourceTransparency, requestedRangeLabel),
        },
      ]);
    } catch (error) {
      setChatMessages((messages) => [
        ...messages,
        {
          role: "assistant",
          content: translateError(error),
          rangeLabel: requestedRangeLabel,
        },
      ]);
    } finally {
      setIsChatting(false);
    }
  }, [
    chatSessionId,
    dateRange.days,
    dateRange.endDate,
    dateRange.startDate,
    filters.brand,
    filters.group,
    filters.status,
    prompt,
    requestedRangeLabel,
  ]);

  const buildAnalysis = useCallback(async function buildAnalysis() {
    const nextPrompt = prompt.trim();
    if (!nextPrompt) return;

    setPrompt("");
    setIsBuilding(true);
    setAnalysisStatus("");
    setAnalysisActionStatus("");
    setAnalysisResult(null);

    try {
      const response = await fetch("/api/analysis", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          prompt: nextPrompt,
          mode,
          runtimeContext,
        }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Analysis failed");
      setAnalysisResult(payload);
      setEditPrompt("");
      setAnalysisActionStatus(payload.dashboardId ? "Dashboard saved automatically." : "");
      await refreshSaved();
    } catch (error) {
      setAnalysisStatus(translateError(error));
    } finally {
      setIsBuilding(false);
    }
  }, [
    mode,
    prompt,
    refreshSaved,
    runtimeContext,
  ]);

  async function loadSavedDashboard(dashboardId: string) {
    setIsDashboardLoading(true);
    setAnalysisStatus("");
    setAnalysisActionStatus("");
    try {
      const response = await fetch(
        `/api/analysis?dashboardId=${encodeURIComponent(dashboardId)}${runtimeQuery(runtimeContext)}`,
      );
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Could not load saved dashboard");
      setAnalysisResult(payload);
      setPrompt(payload.prompt || "");
      setMode(payload.mode || "fast");
      setEditPrompt("");
    } catch (error) {
      setAnalysisStatus(translateError(error));
    } finally {
      setIsDashboardLoading(false);
    }
  }

  async function renameDashboard(dashboardId: string, title: string) {
    const nextTitle = title.trim();
    if (!nextTitle) return;

    setIsDashboardLoading(true);
    setAnalysisStatus("");
    setAnalysisActionStatus("");
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
      setAnalysisResult((current) =>
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
      setAnalysisActionStatus("Dashboard renamed.");
    } catch (error) {
      setAnalysisStatus(translateError(error));
    } finally {
      setIsDashboardLoading(false);
    }
  }

  async function deleteDashboard(dashboardId: string) {
    if (!window.confirm("Delete this saved ad-hoc dashboard?")) return;

    setIsDashboardLoading(true);
    setAnalysisStatus("");
    setAnalysisActionStatus("");
    try {
      const response = await fetch(`/api/analysis?dashboardId=${encodeURIComponent(dashboardId)}`, {
        method: "DELETE",
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Delete failed");
      setSaved((dashboards) => dashboards.filter((dashboard) => dashboard.id !== dashboardId));
      if (analysisResult?.dashboardId === payload.id) {
        setAnalysisResult(null);
        setEditPrompt("");
      }
      setAnalysisActionStatus("Dashboard deleted.");
    } catch (error) {
      setAnalysisStatus(translateError(error));
    } finally {
      setIsDashboardLoading(false);
    }
  }

  async function applyDashboardEdit() {
    const nextPrompt = editPrompt.trim();
    if (!nextPrompt || !analysisResult?.dashboardId) return;

    setIsBuilding(true);
    setAnalysisStatus("");
    setAnalysisActionStatus("");
    try {
      const response = await fetch("/api/analysis", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          action: "edit",
          dashboardId: analysisResult.dashboardId,
          currentPrompt: analysisResult.prompt,
          currentSpec: analysisResult.spec,
          prompt: nextPrompt,
          mode,
          runtimeContext,
        }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Dashboard edit failed");
      setAnalysisResult(payload);
      setPrompt(payload.prompt || nextPrompt);
      setEditPrompt("");
      setAnalysisActionStatus(payload.dashboardId ? "Dashboard updated and saved." : "");
      await refreshSaved();
    } catch (error) {
      setAnalysisStatus(translateError(error));
    } finally {
      setIsBuilding(false);
    }
  }

  if (!canUseAdHocAnalysis) {
    return (
      <section className="border border-hp-rule bg-hp-card p-6 text-sm text-hp-muted">
        AI analysis tools require AI Analysis access.
      </section>
    );
  }

  return (
    <section className="space-y-6">
      <header className="border-b border-hp-rule pb-6">
        <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div>
            <p className="text-[11px] uppercase tracking-[0.14em] text-hp-muted">
              Analyst room
            </p>
            <h1 className="mt-2 font-[family-name:var(--font-title)] text-4xl leading-tight text-hp-ink md:text-5xl">
              AI Analysis
            </h1>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-hp-body">
              Ask ad-hoc Meta Ads questions, build reusable dashboard specs, and load saved analysis against the selected data range.
            </p>
          </div>
          <div className="border border-hp-rule bg-hp-card px-4 py-3">
            <p className="text-[10px] uppercase tracking-[0.14em] text-hp-muted">
              Selected range
            </p>
            <p className="mt-1 font-[family-name:var(--font-title)] text-2xl leading-none text-hp-ink">
              {requestedRangeLabel}
            </p>
          </div>
        </div>
      </header>

      <section className="border border-hp-rule bg-hp-card p-5 sm:p-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0 flex-1">
            <div className="mb-4 flex items-center gap-2 text-hp-ink">
              <Bot size={18} />
              <h2 className="font-[family-name:var(--font-title)] text-2xl leading-tight">
                Decision copilot
              </h2>
            </div>
            <textarea
              value={prompt}
              onChange={(event) => setPrompt(event.target.value)}
              rows={4}
              className="w-full resize-none border border-hp-rule bg-hp-inset px-3 py-2 text-sm leading-6 text-hp-body outline-none placeholder:text-hp-muted focus:border-hp-pink"
              placeholder="Ask a question or describe the analysis to build"
            />
          </div>

          <div className="w-full space-y-3 lg:w-80">
            <RangeBadge label={requestedRangeLabel} />
            <div className="relative border border-hp-rule p-3">
              <div className="mb-2 flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-[0.14em] text-hp-muted">
                  <Sparkles size={15} />
                  Build depth
                </div>
                <button
                  type="button"
                  aria-expanded={showModeHelp}
                  aria-label="Show mode help"
                  onClick={() => setShowModeHelp((value) => !value)}
                  className="inline-flex h-7 w-7 items-center justify-center text-hp-muted hover:bg-hp-inset hover:text-hp-ink"
                >
                  <HelpCircle size={15} />
                </button>
              </div>
              <div className="grid grid-cols-2 border border-hp-rule">
                <button
                  type="button"
                  onClick={() => setMode("fast")}
                  className={[
                    "h-9 text-sm font-medium transition-colors",
                    mode === "fast"
                      ? "bg-hp-ink text-hp-foundation"
                      : "bg-hp-card text-hp-body hover:bg-hp-inset",
                  ].join(" ")}
                >
                  Fast
                </button>
                <button
                  type="button"
                  onClick={() => setMode("deep")}
                  className={[
                    "h-9 border-l border-hp-rule text-sm font-medium transition-colors",
                    mode === "deep"
                      ? "bg-hp-ink text-hp-foundation"
                      : "bg-hp-card text-hp-body hover:bg-hp-inset",
                  ].join(" ")}
                >
                  Deep
                </button>
              </div>
              {showModeHelp ? (
                <div className="absolute right-3 top-10 z-10 w-72 border border-hp-rule bg-hp-card p-3 text-xs leading-5 text-hp-body shadow-lg">
                  <p>
                    <span className="font-medium text-hp-ink">Fast</span> is for simple cuts,
                    quick comparisons, and normal dashboard builds.
                  </p>
                  <p className="mt-2">
                    <span className="font-medium text-hp-ink">Deep</span> is for
                    interpretation-heavy or multi-step analysis.
                  </p>
                </div>
              ) : null}
            </div>
          </div>
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => void sendChatMessage()}
            disabled={isChatting || !prompt.trim()}
            className="inline-flex h-10 items-center justify-center gap-2 bg-hp-ink px-4 text-sm font-medium text-hp-foundation transition-colors hover:bg-hp-pink disabled:cursor-not-allowed disabled:bg-hp-inset disabled:text-hp-muted disabled:hover:bg-hp-inset"
          >
            {isChatting ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
            Ask
          </button>
          <button
            type="button"
            onClick={() => void buildAnalysis()}
            disabled={isBuilding || !prompt.trim()}
            className="inline-flex h-10 items-center justify-center gap-2 border border-hp-ink px-4 text-sm font-medium text-hp-ink transition-colors hover:bg-hp-ink hover:text-hp-foundation disabled:cursor-not-allowed disabled:border-hp-rule disabled:text-hp-muted disabled:hover:bg-transparent disabled:hover:text-hp-muted"
          >
            {isBuilding ? <Loader2 size={16} className="animate-spin" /> : <BarChart3 size={16} />}
            Build analysis
          </button>
        </div>
      </section>

      <SavedAnalysisDrawer
        saved={saved}
        isLoading={isDashboardLoading}
        renamingId={renamingId}
        renameDraft={renameDraft}
        onLoad={(dashboardId) => void loadSavedDashboard(dashboardId)}
        onStartRename={(dashboard) => {
          setRenamingId(dashboard.id);
          setRenameDraft(dashboard.title);
        }}
        onRenameDraftChange={setRenameDraft}
        onSaveRename={(dashboardId) => void renameDashboard(dashboardId, renameDraft)}
        onCancelRename={() => {
          setRenamingId(null);
          setRenameDraft("");
        }}
        onDelete={(dashboardId) => void deleteDashboard(dashboardId)}
      />

      {chatMessages.length ? (
        <section className="border border-hp-rule bg-hp-card p-5">
          <div className="mb-4 flex items-center gap-2 text-hp-ink">
            <Bot size={18} />
            <h2 className="font-[family-name:var(--font-title)] text-2xl leading-tight">Ask AI</h2>
          </div>
          <div className="space-y-3">
            {chatMessages.map((message, index) => (
              <article
                key={`${message.role}-${index}`}
                className={[
                  "border p-3 text-sm leading-6 [overflow-wrap:anywhere]",
                  message.role === "user"
                    ? "border-hp-rule bg-hp-inset text-hp-ink"
                    : "border-hp-rule bg-hp-card text-hp-body",
                ].join(" ")}
              >
                <div className="mb-2 flex flex-wrap items-center gap-2 text-[10px] uppercase tracking-wider text-hp-muted">
                  <span>{message.role}</span>
                  <span className="h-1 w-1 bg-hp-rule" />
                  <span>{message.rangeLabel}</span>
                </div>
                {message.content}
              </article>
            ))}
          </div>
        </section>
      ) : null}

      {analysisActionStatus || analysisStatus ? (
        <section
          className={[
            "border p-4 text-sm",
            analysisStatus
              ? "border-signal-danger bg-signal-danger-bg text-signal-danger"
              : "border-signal-positive bg-signal-positive-bg text-signal-positive",
          ].join(" ")}
        >
          {analysisStatus || analysisActionStatus}
        </section>
      ) : null}

      {analysisResult ? (
        <section className="space-y-5">
          <section className="border border-hp-rule bg-hp-card p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="font-[family-name:var(--font-title)] text-2xl leading-tight text-hp-ink">
                  Built analysis
                </h2>
                <p className="mt-1 text-xs text-hp-muted">
                  Data range: {formatAnalysisRange(analysisResult)}
                </p>
              </div>
              <div className="border border-hp-rule px-3 py-1 text-xs uppercase tracking-[0.14em] text-hp-muted">
                {analysisResult.mode}
              </div>
            </div>
          </section>
          {analysisResult.dashboardId ? (
            <section className="border border-hp-rule bg-hp-card p-4">
              <div className="mb-3 flex items-center gap-2 text-hp-ink">
                <Sparkles size={16} />
                <h2 className="font-[family-name:var(--font-title)] text-2xl leading-tight">
                  Edit saved analysis
                </h2>
              </div>
              <div className="flex flex-col gap-3 lg:flex-row">
                <textarea
                  value={editPrompt}
                  onChange={(event) => setEditPrompt(event.target.value)}
                  rows={3}
                  placeholder="Add a comparison, change the grouping, or revise the dashboard layout."
                  className="min-h-24 flex-1 resize-none border border-hp-rule bg-hp-inset px-3 py-2 text-sm leading-6 text-hp-body outline-none placeholder:text-hp-muted focus:border-hp-pink"
                />
                <button
                  type="button"
                  onClick={() => void applyDashboardEdit()}
                  disabled={isBuilding || !editPrompt.trim()}
                  className="inline-flex h-10 items-center justify-center gap-2 bg-hp-ink px-4 text-sm font-medium text-hp-foundation transition-colors hover:bg-hp-pink disabled:cursor-not-allowed disabled:bg-hp-inset disabled:text-hp-muted disabled:hover:bg-hp-inset lg:self-end"
                >
                  {isBuilding ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
                  Update analysis
                </button>
              </div>
            </section>
          ) : null}
          <AnalysisOutput result={analysisResult} hideDiagnostics />
        </section>
      ) : null}
    </section>
  );
}

function SavedAnalysisDrawer({
  saved,
  isLoading,
  renamingId,
  renameDraft,
  onLoad,
  onStartRename,
  onRenameDraftChange,
  onSaveRename,
  onCancelRename,
  onDelete,
}: {
  saved: SavedAnalysisDashboard[];
  isLoading: boolean;
  renamingId: string | null;
  renameDraft: string;
  onLoad: (dashboardId: string) => void;
  onStartRename: (dashboard: SavedAnalysisDashboard) => void;
  onRenameDraftChange: (value: string) => void;
  onSaveRename: (dashboardId: string) => void;
  onCancelRename: () => void;
  onDelete: (dashboardId: string) => void;
}) {
  return (
    <details className="group border border-hp-rule bg-hp-card">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3">
        <div className="flex items-center gap-2 text-hp-ink">
          <History size={18} />
          <span className="font-[family-name:var(--font-title)] text-xl leading-tight">Saved analyses</span>
          <span className="border border-hp-rule bg-hp-inset px-2 py-0.5 text-xs text-hp-muted">
            {saved.length}
          </span>
        </div>
        <ChevronDown
          size={17}
          className="text-hp-muted transition-transform group-open:rotate-180"
        />
      </summary>
      <div className="border-t border-hp-rule p-4">
        {saved.length ? (
          <div className="grid gap-3 lg:grid-cols-2">
            {saved.map((dashboard) => (
              <article key={dashboard.id} className="border border-hp-rule p-3">
                <button
                  type="button"
                  onClick={() => onLoad(dashboard.id)}
                  disabled={isLoading}
                  className="block w-full text-left disabled:cursor-not-allowed disabled:opacity-60"
                >
                  <div className="line-clamp-2 text-sm font-medium text-hp-ink">
                    {dashboard.title}
                  </div>
                  <div className="mt-2 flex flex-wrap items-center gap-2 text-[10px] uppercase tracking-[0.14em] text-hp-muted">
                    <span>{dashboard.mode}</span>
                    <span>{new Date(dashboard.updatedAt).toLocaleDateString()}</span>
                  </div>
                </button>
                {renamingId === dashboard.id ? (
                  <div className="mt-3 flex gap-2">
                    <input
                      value={renameDraft}
                      onChange={(event) => onRenameDraftChange(event.target.value)}
                      className="min-w-0 flex-1 border border-hp-rule bg-hp-inset px-2 py-1 text-sm text-hp-body outline-none focus:border-hp-pink"
                      aria-label="Rename saved dashboard"
                    />
                    <button
                      type="button"
                      onClick={() => onSaveRename(dashboard.id)}
                      disabled={isLoading || !renameDraft.trim()}
                      title="Save name"
                      className="inline-flex h-8 w-8 items-center justify-center border border-hp-ink text-hp-ink hover:bg-hp-ink hover:text-hp-foundation disabled:cursor-not-allowed disabled:border-hp-rule disabled:text-hp-muted"
                    >
                      <Check size={14} />
                    </button>
                    <button
                      type="button"
                      onClick={onCancelRename}
                      title="Cancel rename"
                      className="inline-flex h-8 w-8 items-center justify-center border border-hp-rule text-hp-muted hover:border-hp-ink hover:text-hp-ink"
                    >
                      <X size={14} />
                    </button>
                  </div>
                ) : (
                  <div className="mt-3 flex gap-2">
                    <button
                      type="button"
                      onClick={() => onStartRename(dashboard)}
                      className="inline-flex h-8 flex-1 items-center justify-center gap-2 border border-hp-rule text-xs text-hp-muted hover:border-hp-ink hover:text-hp-ink"
                    >
                      <Pencil size={13} />
                      Rename
                    </button>
                    <button
                      type="button"
                      onClick={() => onDelete(dashboard.id)}
                      className="inline-flex h-8 flex-1 items-center justify-center gap-2 border border-hp-rule text-xs text-signal-danger hover:border-signal-danger hover:bg-signal-danger-bg"
                    >
                      <Trash2 size={13} />
                      Delete
                    </button>
                  </div>
                )}
              </article>
            ))}
          </div>
        ) : (
          <p className="text-sm text-hp-muted">No saved analyses yet.</p>
        )}
      </div>
    </details>
  );
}

function RangeBadge({ label }: { label: string }) {
  return (
    <div className="border border-hp-rule bg-hp-inset px-3 py-2 text-xs text-hp-body">
      <span className="font-medium text-hp-ink">Selected data range:</span> {label}
    </div>
  );
}

function runtimeQuery(runtimeContext: {
  dateRange?: Props["dateRange"];
  filters?: AnalysisFilter[];
}) {
  const params = new URLSearchParams();
  if (runtimeContext.dateRange?.days) {
    params.set("days", String(runtimeContext.dateRange.days));
  }
  if (runtimeContext.dateRange?.startDate) {
    params.set("startDate", runtimeContext.dateRange.startDate);
  }
  if (runtimeContext.dateRange?.endDate) {
    params.set("endDate", runtimeContext.dateRange.endDate);
  }
  for (const filter of runtimeContext.filters || []) {
    if (filter.field === "brand") params.set("brand", filter.value);
    if (filter.field === "campaign_umbrella") params.set("group", filter.value);
    if (filter.field === "delivery_status") params.set("status", filter.value);
  }
  const query = params.toString();
  return query ? `&${query}` : "";
}

function formatRequestedRange(dateRange: Props["dateRange"]) {
  if (dateRange.startDate || dateRange.endDate) {
    return `${dateRange.startDate || "earliest"} to ${dateRange.endDate || "latest"}`;
  }
  return `Last ${dateRange.days} days`;
}

function formatSourceRange(source: unknown, fallback: string) {
  const range = sourceTransparencyRange(source);
  if (!range?.start && !range?.end) return fallback;
  const days = range.days ? ` (${range.days} days)` : "";
  return `${range.start || "earliest"} to ${range.end || "latest"}${days}`;
}

function formatAnalysisRange(result: AnalysisResult) {
  return formatSourceRange(result.sourceTransparency, "Range unavailable");
}

function sourceTransparencyRange(source: unknown) {
  if (!source || typeof source !== "object") return null;
  const maybeRange = (source as { timeRange?: unknown }).timeRange;
  if (!maybeRange || typeof maybeRange !== "object") return null;
  const range = maybeRange as { start?: unknown; end?: unknown; days?: unknown };
  return {
    start: typeof range.start === "string" ? range.start : null,
    end: typeof range.end === "string" ? range.end : null,
    days: typeof range.days === "number" ? range.days : null,
  };
}
