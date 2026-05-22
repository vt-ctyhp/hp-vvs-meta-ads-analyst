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
      <section className="rounded-xl border border-stone-200 bg-white p-6 text-sm text-stone-600">
        AI analysis tools require AI Analysis access.
      </section>
    );
  }

  return (
    <section className="space-y-5">
      <section className="rounded-xl border border-stone-200 bg-white p-4">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0 flex-1">
            <div className="mb-3 flex items-center gap-2 text-stone-950">
              <Bot size={18} />
              <h2 className="text-sm font-semibold">Decision copilot</h2>
            </div>
            <textarea
              value={prompt}
              onChange={(event) => setPrompt(event.target.value)}
              rows={4}
              className="w-full resize-none rounded-md border border-stone-300 bg-white px-3 py-2 text-sm leading-6 outline-none focus:ring-2 focus:ring-stone-400"
              placeholder="Ask a question or describe the analysis to build"
            />
          </div>

          <div className="w-full space-y-3 lg:w-80">
            <RangeBadge label={requestedRangeLabel} />
            <div className="relative rounded-lg border border-stone-200 p-3">
              <div className="mb-2 flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-[0.14em] text-stone-500">
                  <Sparkles size={15} />
                  Build depth
                </div>
                <button
                  type="button"
                  aria-expanded={showModeHelp}
                  aria-label="Show mode help"
                  onClick={() => setShowModeHelp((value) => !value)}
                  className="inline-flex h-7 w-7 items-center justify-center rounded-md text-stone-500 hover:bg-stone-100 hover:text-stone-950"
                >
                  <HelpCircle size={15} />
                </button>
              </div>
              <div className="grid grid-cols-2 overflow-hidden rounded-md border border-stone-200">
                <button
                  type="button"
                  onClick={() => setMode("fast")}
                  className={[
                    "h-9 text-sm font-medium transition-colors",
                    mode === "fast"
                      ? "bg-stone-900 text-stone-50"
                      : "bg-white text-stone-700 hover:bg-stone-100",
                  ].join(" ")}
                >
                  Fast
                </button>
                <button
                  type="button"
                  onClick={() => setMode("deep")}
                  className={[
                    "h-9 border-l border-stone-200 text-sm font-medium transition-colors",
                    mode === "deep"
                      ? "bg-stone-900 text-stone-50"
                      : "bg-white text-stone-700 hover:bg-stone-100",
                  ].join(" ")}
                >
                  Deep
                </button>
              </div>
              {showModeHelp ? (
                <div className="absolute right-3 top-10 z-10 w-72 rounded-lg border border-stone-200 bg-white p-3 text-xs leading-5 text-stone-600 shadow-lg">
                  <p>
                    <span className="font-medium text-stone-950">Fast</span> is for simple cuts,
                    quick comparisons, and normal dashboard builds.
                  </p>
                  <p className="mt-2">
                    <span className="font-medium text-stone-950">Deep</span> is for
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
            className="inline-flex h-10 items-center justify-center gap-2 rounded-md bg-stone-900 px-4 text-sm font-medium text-stone-50 hover:bg-stone-800 disabled:cursor-not-allowed disabled:bg-stone-300"
          >
            {isChatting ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
            Ask
          </button>
          <button
            type="button"
            onClick={() => void buildAnalysis()}
            disabled={isBuilding || !prompt.trim()}
            className="inline-flex h-10 items-center justify-center gap-2 rounded-md border border-stone-900 px-4 text-sm font-medium text-stone-900 hover:bg-stone-900 hover:text-stone-50 disabled:cursor-not-allowed disabled:border-stone-300 disabled:text-stone-400 disabled:hover:bg-white"
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
        <section className="rounded-xl border border-stone-200 bg-white p-4">
          <div className="mb-4 flex items-center gap-2 text-stone-950">
            <Bot size={18} />
            <h2 className="text-sm font-semibold">Ask AI</h2>
          </div>
          <div className="space-y-3">
            {chatMessages.map((message, index) => (
              <article
                key={`${message.role}-${index}`}
                className={[
                  "rounded-lg border p-3 text-sm leading-6 [overflow-wrap:anywhere]",
                  message.role === "user"
                    ? "border-stone-200 bg-stone-50 text-stone-950"
                    : "border-stone-200 bg-white text-stone-700",
                ].join(" ")}
              >
                <div className="mb-2 flex flex-wrap items-center gap-2 text-[10px] uppercase tracking-wider text-stone-400">
                  <span>{message.role}</span>
                  <span className="h-1 w-1 rounded-full bg-stone-300" />
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
            "rounded-xl border p-4 text-sm",
            analysisStatus
              ? "border-rose-200 bg-rose-50 text-rose-900"
              : "border-emerald-200 bg-emerald-50 text-emerald-900",
          ].join(" ")}
        >
          {analysisStatus || analysisActionStatus}
        </section>
      ) : null}

      {analysisResult ? (
        <section className="space-y-5">
          <section className="rounded-xl border border-stone-200 bg-white p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-sm font-semibold text-stone-950">Built analysis</h2>
                <p className="mt-1 text-xs text-stone-500">
                  Data range: {formatAnalysisRange(analysisResult)}
                </p>
              </div>
              <div className="rounded-full border border-stone-200 px-3 py-1 text-xs uppercase tracking-[0.14em] text-stone-500">
                {analysisResult.mode}
              </div>
            </div>
          </section>
          {analysisResult.dashboardId ? (
            <section className="rounded-xl border border-stone-200 bg-white p-4">
              <div className="mb-3 flex items-center gap-2 text-stone-950">
                <Sparkles size={16} />
                <h2 className="text-sm font-semibold">Edit saved analysis</h2>
              </div>
              <div className="flex flex-col gap-3 lg:flex-row">
                <textarea
                  value={editPrompt}
                  onChange={(event) => setEditPrompt(event.target.value)}
                  rows={3}
                  placeholder="Add a comparison, change the grouping, or revise the dashboard layout."
                  className="min-h-24 flex-1 resize-none rounded-md border border-stone-300 bg-white px-3 py-2 text-sm leading-6 outline-none focus:ring-2 focus:ring-stone-400"
                />
                <button
                  type="button"
                  onClick={() => void applyDashboardEdit()}
                  disabled={isBuilding || !editPrompt.trim()}
                  className="inline-flex h-10 items-center justify-center gap-2 rounded-md bg-stone-900 px-4 text-sm font-medium text-stone-50 hover:bg-stone-800 disabled:cursor-not-allowed disabled:bg-stone-300 lg:self-end"
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
    <details className="group rounded-xl border border-stone-200 bg-white">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3">
        <div className="flex items-center gap-2 text-stone-950">
          <History size={18} />
          <span className="text-sm font-semibold">Saved analyses</span>
          <span className="rounded-full bg-stone-100 px-2 py-0.5 text-xs text-stone-500">
            {saved.length}
          </span>
        </div>
        <ChevronDown
          size={17}
          className="text-stone-500 transition-transform group-open:rotate-180"
        />
      </summary>
      <div className="border-t border-stone-200 p-4">
        {saved.length ? (
          <div className="grid gap-3 lg:grid-cols-2">
            {saved.map((dashboard) => (
              <article key={dashboard.id} className="rounded-lg border border-stone-200 p-3">
                <button
                  type="button"
                  onClick={() => onLoad(dashboard.id)}
                  disabled={isLoading}
                  className="block w-full text-left disabled:cursor-not-allowed disabled:opacity-60"
                >
                  <div className="line-clamp-2 text-sm font-medium text-stone-950">
                    {dashboard.title}
                  </div>
                  <div className="mt-2 flex flex-wrap items-center gap-2 text-[10px] uppercase tracking-[0.14em] text-stone-500">
                    <span>{dashboard.mode}</span>
                    <span>{new Date(dashboard.updatedAt).toLocaleDateString()}</span>
                  </div>
                </button>
                {renamingId === dashboard.id ? (
                  <div className="mt-3 flex gap-2">
                    <input
                      value={renameDraft}
                      onChange={(event) => onRenameDraftChange(event.target.value)}
                      className="min-w-0 flex-1 rounded-md border border-stone-300 px-2 py-1 text-sm outline-none focus:ring-2 focus:ring-stone-400"
                      aria-label="Rename saved dashboard"
                    />
                    <button
                      type="button"
                      onClick={() => onSaveRename(dashboard.id)}
                      disabled={isLoading || !renameDraft.trim()}
                      title="Save name"
                      className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-stone-900 text-stone-900 hover:bg-stone-900 hover:text-stone-50 disabled:cursor-not-allowed disabled:border-stone-300 disabled:text-stone-400"
                    >
                      <Check size={14} />
                    </button>
                    <button
                      type="button"
                      onClick={onCancelRename}
                      title="Cancel rename"
                      className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-stone-300 text-stone-600 hover:border-stone-900 hover:text-stone-950"
                    >
                      <X size={14} />
                    </button>
                  </div>
                ) : (
                  <div className="mt-3 flex gap-2">
                    <button
                      type="button"
                      onClick={() => onStartRename(dashboard)}
                      className="inline-flex h-8 flex-1 items-center justify-center gap-2 rounded-md border border-stone-200 text-xs text-stone-600 hover:border-stone-900 hover:text-stone-950"
                    >
                      <Pencil size={13} />
                      Rename
                    </button>
                    <button
                      type="button"
                      onClick={() => onDelete(dashboard.id)}
                      className="inline-flex h-8 flex-1 items-center justify-center gap-2 rounded-md border border-stone-200 text-xs text-rose-700 hover:border-rose-300 hover:bg-rose-50"
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
          <p className="text-sm text-stone-500">No saved analyses yet.</p>
        )}
      </div>
    </details>
  );
}

function RangeBadge({ label }: { label: string }) {
  return (
    <div className="rounded-lg border border-stone-200 bg-stone-50 px-3 py-2 text-xs text-stone-600">
      <span className="font-medium text-stone-950">Selected data range:</span> {label}
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
