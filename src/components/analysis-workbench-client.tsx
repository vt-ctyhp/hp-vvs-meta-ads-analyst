"use client";

import {
  AlertTriangle,
  BarChart3,
  Clock3,
  Download,
  EyeOff,
  FileText,
  Info,
  LayoutDashboard,
  Loader2,
  Pin,
  RefreshCw,
  Send,
  Settings2,
  Table2,
  X,
} from "lucide-react";
import { useMemo, useState, type FormEvent, type ReactNode } from "react";

import {
  buildAnalysisContextChips,
  normalizeAnalysisOutputMode,
  resolveAnalysisRunContext,
  type AnalysisOutputMode,
  type AnalysisWorkbenchDashboardPacket,
  type AnalysisWorkbenchContextChip,
  type AnalysisWorkbenchControlledEdit,
  type AnalysisRunStatus,
  type AnalysisWorkbenchVisualCard,
  type AnalysisWorkbenchVisualCell,
  type AnalysisWorkbenchRun,
} from "@/lib/analysis-workbench-contract";
import {
  buildAnalysisWorkbenchChartPngExportSource,
  buildAnalysisWorkbenchPdfReportExport,
  buildAnalysisWorkbenchTableCsvExport,
  isAnalysisWorkbenchChartCard,
  isAnalysisWorkbenchTableCard,
  type AnalysisWorkbenchChartExportCard,
  type AnalysisWorkbenchTableExportCard,
} from "@/lib/analysis-workbench-export";
import { translateError } from "@/lib/glossary";

type Props = {
  initialRuns: AnalysisWorkbenchRun[];
};

const OUTPUT_MODE_LABELS: Record<AnalysisOutputMode, string> = {
  answer_only: "Answer only",
  answer_visuals: "Answer + visuals",
  full_dashboard: "Full dashboard",
};

const OUTPUT_MODE_HELP: Record<AnalysisOutputMode, string> = {
  answer_only: "Text answer with cited numbers, assumptions, and no charts.",
  answer_visuals: "Text answer plus key chart and table cards for quick understanding.",
  full_dashboard: "Saved packet with editable charts, pivot tables, exports, and source notes.",
};

const OUTPUT_MODES: AnalysisOutputMode[] = ["answer_only", "answer_visuals", "full_dashboard"];
type StatusKind = "idle" | "success" | "error";
type ControlledEditDraft = AnalysisWorkbenchControlledEdit;
type ReadableAnswerItem = {
  body: string;
  label?: string;
};
type ParsedReadableAnswer = {
  context: ReadableAnswerItem[];
  findings: ReadableAnswerItem[];
  assumptions: ReadableAnswerItem[];
  caveats: ReadableAnswerItem[];
  sourceNotes: ReadableAnswerItem[];
};

const EDIT_METRIC_OPTIONS = ["spend", "primary_results", "cpl", "ctr"] as const;
const EDIT_DIMENSION_OPTIONS = ["campaign_umbrella", "campaign", "ad_set", "creative"] as const;
const EDIT_FILTER_OPTIONS = ["brand", "campaign_umbrella", "delivery_status"] as const;
const EDIT_CHART_OPTIONS = ["bar_chart", "line_chart", "flat_table", "pivot_table", "scatter_chart"] as const;

export function AnalysisWorkbenchClient({ initialRuns }: Props) {
  const [runs, setRuns] = useState(initialRuns);
  const [selectedRun, setSelectedRun] = useState<AnalysisWorkbenchRun | null>(
    initialRuns[0] || null,
  );
  const [prompt, setPrompt] = useState("");
  const [outputMode, setOutputMode] = useState<AnalysisOutputMode>("answer_visuals");
  const [loading, setLoading] = useState(false);
  const [promoting, setPromoting] = useState(false);
  const [rerunning, setRerunning] = useState(false);
  const [status, setStatus] = useState("");
  const [statusKind, setStatusKind] = useState<StatusKind>("idle");
  const [removedContextKeys, setRemovedContextKeys] = useState<string[]>([]);

  const statusSentence = useMemo(() => {
    if (selectedRun) {
      return `${selectedRun.title} is saved as a durable ${OUTPUT_MODE_LABELS[
        selectedRun.outputMode
      ].toLowerCase()} run.`;
    }

    return "Create the first durable Ask AI run from one prompt.";
  }, [selectedRun]);
  const inheritedContextChips = useMemo(() => {
    const chips = buildAnalysisContextChips(
      selectedRun ? resolveAnalysisRunContext(selectedRun) : null,
    );
    return chips.filter((chip) => !removedContextKeys.includes(chip.id));
  }, [removedContextKeys, selectedRun]);

  async function submitRun() {
    const nextPrompt = prompt.trim();
    if (!nextPrompt) return;

    setLoading(true);
    setStatus("");
    setStatusKind("idle");

    try {
      const response = await fetch("/api/analysis-runs", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          prompt: nextPrompt,
          outputMode,
          ...(selectedRun ? { parentRunId: selectedRun.id } : {}),
          ...(removedContextKeys.length ? { removedContextKeys } : {}),
        }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Run creation failed");
      const run = payload.run as AnalysisWorkbenchRun;
      setSelectedRun(run);
      setRuns((current) => [run, ...current.filter((item) => item.id !== run.id)].slice(0, 12));
      setPrompt("");
      setRemovedContextKeys([]);
      setStatus("Run created.");
      setStatusKind("success");
    } catch (error) {
      setStatus(translateError(error));
      setStatusKind("error");
    } finally {
      setLoading(false);
    }
  }

  async function reopenRun(runId: string) {
    setLoading(true);
    setStatus("");
    setStatusKind("idle");

    try {
      const response = await fetch(`/api/analysis-runs?runId=${encodeURIComponent(runId)}`);
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Run reopen failed");
      const run = payload.run as AnalysisWorkbenchRun;
      setSelectedRun(run);
      setOutputMode(normalizeAnalysisOutputMode(run.outputMode));
      setRemovedContextKeys([]);
      setStatus("Run reopened.");
      setStatusKind("success");
    } catch (error) {
      setStatus(translateError(error));
      setStatusKind("error");
    } finally {
      setLoading(false);
    }
  }

  async function promoteSelectedRun() {
    if (!selectedRun) return;

    setPromoting(true);
    setStatus("");
    setStatusKind("idle");

    try {
      const response = await fetch("/api/analysis-runs", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          action: "promote_dashboard",
          runId: selectedRun.id,
        }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Dashboard promotion failed");
      const run = payload.run as AnalysisWorkbenchRun;
      setSelectedRun(run);
      setRuns((current) => [run, ...current.filter((item) => item.id !== run.id)].slice(0, 12));
      setOutputMode("full_dashboard");
      setStatus("Dashboard packet saved.");
      setStatusKind("success");
    } catch (error) {
      setStatus(translateError(error));
      setStatusKind("error");
    } finally {
      setPromoting(false);
    }
  }

  async function rerunSelectedRun(edits?: ControlledEditDraft) {
    if (!selectedRun) return;

    setRerunning(true);
    setStatus("");
    setStatusKind("idle");

    try {
      const response = await fetch("/api/analysis-runs", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          action: "rerun",
          runId: selectedRun.id,
          ...(edits && Object.keys(edits).length ? { edits } : {}),
        }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Run rerun failed");
      const run = payload.run as AnalysisWorkbenchRun;
      setSelectedRun(run);
      setRuns((current) => [run, ...current.filter((item) => item.id !== run.id)].slice(0, 12));
      setOutputMode(normalizeAnalysisOutputMode(run.outputMode));
      setRemovedContextKeys([]);
      setStatus(edits && Object.keys(edits).length ? "Edited run created." : "Run refreshed.");
      setStatusKind("success");
    } catch (error) {
      setStatus(translateError(error));
      setStatusKind("error");
    } finally {
      setRerunning(false);
    }
  }

  return (
    <div className="min-h-screen bg-hp-foundation px-4 py-6 text-hp-body md:px-8">
      <div className="mx-auto max-w-7xl">
        <header className="border-b border-hp-rule pb-6">
          <span className="text-[11px] uppercase tracking-[0.14em] text-hp-muted">
            HP/VVS Meta Ads
          </span>
          <h1 className="mt-2 font-title text-4xl leading-tight text-hp-ink md:text-5xl">
            Ask AI Workbench
          </h1>
          <p className="mt-3 max-w-3xl font-title text-2xl leading-snug text-hp-ink">
            {statusSentence}
          </p>
        </header>

        <main className="mt-8 grid gap-6 xl:grid-cols-[380px_1fr]">
          <aside className="space-y-6">
            <section className="border border-hp-rule bg-hp-card p-5">
              <div className="mb-4 flex items-center gap-2 text-hp-ink">
                <FileText size={17} />
                <span className="text-[11px] uppercase tracking-[0.14em]">New Run</span>
              </div>

              <ModeSelector value={outputMode} onChange={setOutputMode} />
              <InheritedContextChips
                chips={inheritedContextChips}
                onRemove={(id) =>
                  setRemovedContextKeys((current) =>
                    current.includes(id) ? current : [...current, id],
                  )
                }
              />

              <textarea
                value={prompt}
                onChange={(event) => setPrompt(event.target.value)}
                rows={7}
                placeholder="Which campaign groups changed most this week?"
                className="mt-4 w-full resize-none border border-hp-rule bg-hp-inset p-3 text-sm leading-6 text-hp-body outline-none placeholder:text-hp-muted focus:border-hp-ink"
              />
              <button
                onClick={submitRun}
                disabled={loading || !prompt.trim()}
                className="mt-3 flex h-11 w-full items-center justify-center gap-2 bg-hp-ink px-4 text-[11px] uppercase tracking-[0.14em] text-hp-foundation transition-colors hover:bg-hp-body disabled:hover:bg-hp-ink"
              >
                {loading ? <Loader2 size={15} className="animate-spin" /> : <Send size={15} />}
                Run analysis
              </button>
              <StatusNotice loading={loading} status={status} kind={statusKind} />
            </section>

            <section className="border border-hp-rule bg-hp-card p-5">
              <div className="mb-4 flex items-center gap-2 text-hp-ink">
                <Clock3 size={17} />
                <span className="text-[11px] uppercase tracking-[0.14em]">Recent Runs</span>
              </div>

              <div className="space-y-2">
                {runs.length ? (
                  runs.map((run) => (
                    <button
                      key={run.id}
                      onClick={() => reopenRun(run.id)}
                      className="w-full border border-hp-rule bg-hp-foundation p-3 text-left transition-colors hover:bg-hp-inset"
                    >
                      <span className="line-clamp-2 block text-sm text-hp-ink">{run.title}</span>
                      <span className="mt-2 flex items-center justify-between gap-3 text-[10px] uppercase tracking-[0.14em] text-hp-muted">
                        <span>{OUTPUT_MODE_LABELS[run.outputMode]}</span>
                        <span>{formatDate(run.updatedAt)}</span>
                      </span>
                    </button>
                  ))
                ) : (
                  <p className="border border-dashed border-hp-rule bg-hp-foundation p-4 text-sm text-hp-muted">
                    No runs yet.
                  </p>
                )}
              </div>
            </section>
          </aside>

          <section className="min-w-0 border border-hp-rule bg-hp-card p-5">
            {selectedRun ? (
              <RunDetail
                run={selectedRun}
                onPromote={promoteSelectedRun}
                promoting={promoting}
                onRerun={() => rerunSelectedRun()}
                onApplyEdits={rerunSelectedRun}
                rerunning={rerunning}
              />
            ) : (
              <EmptyRunDetail />
            )}
          </section>
        </main>
      </div>
    </div>
  );
}

export function ModeSelector({
  value,
  onChange,
}: {
  value: AnalysisOutputMode;
  onChange: (value: AnalysisOutputMode) => void;
}) {
  return (
    <div
      aria-label="Output mode"
      role="radiogroup"
      className="grid overflow-visible border border-hp-rule bg-hp-foundation sm:grid-cols-3"
    >
      {OUTPUT_MODES.map((mode) => {
        const active = value === mode;
        const helpId = `output-mode-help-${mode}`;
        return (
          <button
            key={mode}
            type="button"
            role="radio"
            aria-checked={active}
            aria-describedby={helpId}
            onClick={() => onChange(mode)}
            title={OUTPUT_MODE_HELP[mode]}
            className={
              active
                ? "group relative min-h-[72px] border-b border-hp-ink bg-hp-ink px-3 py-3 text-left text-hp-foundation last:border-b-0 sm:border-b-0 sm:border-r sm:last:border-r-0"
                : "group relative min-h-[72px] border-b border-hp-rule bg-hp-foundation px-3 py-3 text-left text-hp-body transition-colors hover:bg-hp-inset hover:text-hp-ink last:border-b-0 sm:border-b-0 sm:border-r sm:last:border-r-0"
            }
          >
            <span className="flex items-center justify-between gap-2 text-[11px] uppercase tracking-[0.14em]">
              <span>{OUTPUT_MODE_LABELS[mode]}</span>
              <Info size={13} aria-hidden />
            </span>
            <span
              id={helpId}
              role="tooltip"
              className="absolute left-0 top-[calc(100%+8px)] z-30 hidden w-72 border border-hp-rule bg-hp-card px-3 py-2 text-sm normal-case leading-5 tracking-normal text-hp-body shadow-[0_8px_24px_rgba(42,39,37,0.08)] group-hover:block group-focus-visible:block"
            >
              {OUTPUT_MODE_HELP[mode]}
            </span>
          </button>
        );
      })}
    </div>
  );
}

export function InheritedContextChips({
  chips,
  onRemove,
}: {
  chips: AnalysisWorkbenchContextChip[];
  onRemove: (id: string) => void;
}) {
  if (!chips.length) return null;

  return (
    <div className="mt-4 border border-hp-rule bg-hp-foundation p-3">
      <div className="mb-2 text-[10px] uppercase tracking-[0.14em] text-hp-muted">
        Inherited Context
      </div>
      <div className="flex flex-wrap gap-2">
        {chips.map((chip) => (
          <span
            key={chip.id}
            className="inline-flex min-h-9 max-w-full items-center gap-2 border border-hp-rule bg-hp-card px-2.5 py-1 text-[11px] uppercase tracking-[0.14em] text-hp-body"
          >
            <span className="text-hp-muted">{chip.label}</span>
            <span className="normal-case tracking-normal text-hp-ink">{chip.value}</span>
            <button
              type="button"
              onClick={() => onRemove(chip.id)}
              aria-label={`Remove inherited context ${chip.label} ${chip.value}`}
              className="-mr-1 inline-flex h-6 w-6 items-center justify-center border border-hp-rule text-hp-muted hover:border-hp-ink hover:text-hp-ink"
            >
              <X size={12} aria-hidden />
            </button>
          </span>
        ))}
      </div>
    </div>
  );
}

export function StatusNotice({
  loading,
  status,
  kind,
}: {
  loading: boolean;
  status: string;
  kind: StatusKind;
}) {
  if (loading) {
    return (
      <p
        role="status"
        className="mt-3 flex items-start gap-2 border border-hp-rule bg-hp-inset px-3 py-2 text-sm text-hp-body"
      >
        <Loader2 size={15} className="mt-1 shrink-0 animate-spin" />
        Creating governed run...
      </p>
    );
  }

  if (!status) return null;

  const error = kind === "error";
  return (
    <p
      role={error ? "alert" : "status"}
      className={
        error
          ? "mt-3 flex items-start gap-2 border border-signal-danger bg-signal-danger-bg px-3 py-2 text-sm text-hp-ink"
          : "mt-3 border border-hp-rule bg-hp-inset px-3 py-2 text-sm text-hp-body"
      }
    >
      {error ? <AlertTriangle size={15} className="mt-1 shrink-0" /> : null}
      <span>{status}</span>
    </p>
  );
}

export function RunDetail({
  run,
  onPromote,
  onRerun,
  onApplyEdits,
  promoting = false,
  rerunning = false,
}: {
  run: AnalysisWorkbenchRun;
  onPromote?: () => void;
  onRerun?: () => void;
  onApplyEdits?: (edits: ControlledEditDraft) => void;
  promoting?: boolean;
  rerunning?: boolean;
}) {
  const canPromote = run.status === "completed" && run.outputMode !== "full_dashboard" && onPromote;

  return (
    <article>
      <div className="flex flex-col gap-4 border-b border-hp-rule pb-5 md:flex-row md:items-start md:justify-between">
        <div>
          <span className="text-[11px] uppercase tracking-[0.14em] text-hp-muted">
            {run.status}
          </span>
          <h2 className="mt-2 font-title text-3xl leading-tight text-hp-ink">{run.title}</h2>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-hp-body">{run.prompt}</p>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          {onRerun ? (
            <button
              type="button"
              onClick={onRerun}
              disabled={rerunning}
              className="inline-flex h-10 items-center justify-center gap-2 border border-hp-rule bg-hp-card px-3 text-[11px] uppercase tracking-[0.14em] text-hp-body transition-colors hover:border-hp-ink hover:bg-hp-inset disabled:hover:border-hp-rule disabled:hover:bg-hp-card"
            >
              {rerunning ? (
                <Loader2 size={14} className="animate-spin" aria-hidden />
              ) : (
                <RefreshCw size={14} aria-hidden />
              )}
              Rerun latest data
            </button>
          ) : null}
          {canPromote ? (
            <button
              type="button"
              onClick={onPromote}
              disabled={promoting}
              className="inline-flex h-10 items-center justify-center gap-2 border border-hp-rule bg-hp-ink px-3 text-[11px] uppercase tracking-[0.14em] text-hp-foundation transition-colors hover:bg-hp-body disabled:hover:bg-hp-ink"
            >
              {promoting ? (
                <Loader2 size={14} className="animate-spin" aria-hidden />
              ) : (
                <LayoutDashboard size={14} aria-hidden />
              )}
              Promote to dashboard
            </button>
          ) : null}
          <div className="border border-hp-rule bg-hp-foundation px-3 py-2 text-[11px] uppercase tracking-[0.14em] text-hp-muted">
            {OUTPUT_MODE_LABELS[run.outputMode]}
          </div>
        </div>
      </div>

      <div className="grid gap-4 border-b border-hp-rule py-5 md:grid-cols-3">
        <RunField label="Created" value={formatDateTime(run.createdAt)} />
        <RunField label="Updated" value={formatDateTime(run.updatedAt)} />
        <RunField label="Run ID" value={run.id} />
      </div>

      {onApplyEdits ? (
        <ControlledEditPanel run={run} onApply={onApplyEdits} disabled={rerunning} />
      ) : null}

      <section className="border-b border-hp-rule py-5">
        <div className="mb-3 flex items-center gap-2 text-hp-ink">
          <FileText size={17} />
          <span className="text-[11px] uppercase tracking-[0.14em]">Answer</span>
        </div>
        <ReadableAnswer summary={run.answer.summary} />
      </section>

      {run.dashboardPacket ? (
        <DashboardPacketView
          packet={run.dashboardPacket}
          runId={run.id}
          onApplyEdits={onApplyEdits}
        />
      ) : null}

      <SourceNotes notes={run.sourceNotes} />

      <VisualCardGrid
        cards={run.visualCards}
        runStatus={run.status}
        runId={run.id}
        sourceNotes={run.sourceNotes}
      />

      <section className="grid gap-4 py-5 md:grid-cols-2">
        <StructuredStatus icon={<Table2 size={17} />} label="Facts" value={statusFromJson(run.facts)} />
        <StructuredStatus
          icon={<BarChart3 size={17} />}
          label="Visuals"
          value={`${run.visualCards.length} cards`}
        />
      </section>
    </article>
  );
}

function ReadableAnswer({ summary }: { summary: string }) {
  const answer = parseReadableAnswer(summary);

  if (!hasReadableAnswerContent(answer)) {
    return <p className="max-w-3xl text-sm leading-6 text-hp-muted">No answer saved.</p>;
  }

  const supportingSections = [
    { title: "Assumptions", items: answer.assumptions },
    { title: "Caveats", items: answer.caveats },
    { title: "Source notes", items: answer.sourceNotes },
  ].filter((section) => section.items.length);

  return (
    <div className="max-w-3xl space-y-4 text-sm leading-6 text-hp-body">
      {answer.context.length ? (
        <AnswerInset title="Context" items={answer.context} />
      ) : null}

      {answer.findings.length ? (
        <div>
          <p className="mb-2 text-[10px] uppercase tracking-[0.14em] text-hp-muted">
            Findings
          </p>
          <ol className="divide-y divide-hp-rule-soft border-y border-hp-rule-soft">
            {answer.findings.map((item, index) => (
              <li key={`${item.body}-${index}`} className="grid grid-cols-[2.5rem_1fr] gap-3 py-3">
                <span className="font-title text-lg leading-6 text-hp-muted lining-nums">
                  {String(index + 1).padStart(2, "0")}
                </span>
                <p>
                  {item.label ? (
                    <span className="mr-1 font-bold text-hp-ink">{item.label}:</span>
                  ) : null}
                  <AnswerText text={item.body} />
                </p>
              </li>
            ))}
          </ol>
        </div>
      ) : null}

      {supportingSections.length ? (
        <div className="grid gap-3 md:grid-cols-3">
          {supportingSections.map((section) => (
            <AnswerInset key={section.title} title={section.title} items={section.items} />
          ))}
        </div>
      ) : null}
    </div>
  );
}

function AnswerInset({ title, items }: { title: string; items: ReadableAnswerItem[] }) {
  return (
    <div className="border-l border-hp-rule pl-3">
      <p className="text-[10px] uppercase tracking-[0.14em] text-hp-muted">{title}</p>
      <div className="mt-1 space-y-2">
        {items.map((item, index) => (
          <p key={`${item.body}-${index}`}>
            {item.label ? <span className="mr-1 font-bold text-hp-ink">{item.label}:</span> : null}
            <AnswerText text={item.body} />
          </p>
        ))}
      </div>
    </div>
  );
}

function AnswerText({ text }: { text: string }) {
  return text.split(/(\[[A-Z]\d+\])/g).map((part, index) => {
    if (/^\[[A-Z]\d+\]$/.test(part)) {
      return (
        <span
          key={`${part}-${index}`}
          className="mx-0.5 inline-flex border border-hp-rule-soft bg-hp-card px-1 text-[0.72em] leading-5 text-hp-muted lining-nums"
        >
          {part}
        </span>
      );
    }

    return part;
  });
}

function parseReadableAnswer(summary: string): ParsedReadableAnswer {
  const parsed: ParsedReadableAnswer = {
    context: [],
    findings: [],
    assumptions: [],
    caveats: [],
    sourceNotes: [],
  };

  const sentences = summary
    .trim()
    .split(/(?<=\.)\s+(?=[A-Z0-9])/)
    .map((sentence) => sentence.replace(/\s+/g, " ").trim())
    .filter(Boolean);

  sentences.forEach((sentence) => {
    const labelMatch = sentence.match(/^([A-Z][A-Za-z ]{2,32}s?):\s+(.+)$/);
    const label = labelMatch?.[1];
    const body = labelMatch?.[2] || sentence;
    const lowerLabel = label?.toLowerCase() || "";
    const lowerSentence = sentence.toLowerCase();
    const item = label ? { label, body } : { body };

    if (lowerLabel.startsWith("assumption")) {
      parsed.assumptions.push({ body });
      return;
    }

    if (lowerLabel.startsWith("caveat")) {
      parsed.caveats.push({ body });
      return;
    }

    if (lowerLabel.startsWith("source note")) {
      parsed.sourceNotes.push({ body });
      return;
    }

    if (
      lowerSentence.startsWith("answer only mode used governed meta ads facts") ||
      lowerSentence.startsWith("answer + visuals mode used governed meta ads facts") ||
      lowerSentence.startsWith("full dashboard mode used governed meta ads facts")
    ) {
      parsed.context.push(item);
      return;
    }

    parsed.findings.push(item);
  });

  if (!sentences.length && summary.trim()) {
    parsed.findings.push({ body: summary.trim() });
  }

  return parsed;
}

function hasReadableAnswerContent(answer: ParsedReadableAnswer) {
  return Boolean(
    answer.context.length ||
      answer.findings.length ||
      answer.assumptions.length ||
      answer.caveats.length ||
      answer.sourceNotes.length,
  );
}

export function VisualCardGrid({
  cards,
  runStatus,
  runId,
  sourceNotes = [],
}: {
  cards: AnalysisWorkbenchVisualCard[];
  runStatus: AnalysisRunStatus;
  runId?: string;
  sourceNotes?: AnalysisWorkbenchRun["sourceNotes"];
}) {
  if (!cards.length) {
    return (
      <section className="border-b border-hp-rule py-5">
        <div className="mb-3 flex items-center gap-2 text-hp-ink">
          <BarChart3 size={17} />
          <span className="text-[11px] uppercase tracking-[0.14em]">Visual Cards</span>
        </div>
        <p className="border border-dashed border-hp-rule bg-hp-foundation p-4 text-sm text-hp-muted">
          {runStatus === "failed"
            ? "Run failed validation; no visual cards rendered."
            : "No visual cards saved for this run."}
        </p>
      </section>
    );
  }

  return (
    <section className="border-b border-hp-rule py-5">
      <div className="mb-4 flex items-center gap-2 text-hp-ink">
        <BarChart3 size={17} />
        <span className="text-[11px] uppercase tracking-[0.14em]">Visual Cards</span>
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        {cards.map((card) => (
          <VisualCard key={card.id} card={card} runId={runId} sourceNotes={sourceNotes} />
        ))}
      </div>
    </section>
  );
}

function ControlledEditPanel({
  run,
  onApply,
  disabled,
}: {
  run: AnalysisWorkbenchRun;
  onApply: (edits: ControlledEditDraft) => void;
  disabled?: boolean;
}) {
  const context = resolveAnalysisRunContext(run);
  const firstCard = run.visualCards[0] || run.dashboardPacket?.visualObjects[0] || null;
  const [start, setStart] = useState(context?.dateRange?.start || "");
  const [end, setEnd] = useState(context?.dateRange?.end || "");
  const [filterField, setFilterField] =
    useState<(typeof EDIT_FILTER_OPTIONS)[number]>("campaign_umbrella");
  const [filterValue, setFilterValue] = useState(context?.filters?.[0]?.value || "");
  const [metric, setMetric] = useState<(typeof EDIT_METRIC_OPTIONS)[number]>(
    (context?.metrics?.[0] as (typeof EDIT_METRIC_OPTIONS)[number]) || "spend",
  );
  const [dimension, setDimension] = useState<(typeof EDIT_DIMENSION_OPTIONS)[number]>(
    (context?.dimensions?.[0] as (typeof EDIT_DIMENSION_OPTIONS)[number]) || "campaign_umbrella",
  );
  const [chartType, setChartType] = useState<(typeof EDIT_CHART_OPTIONS)[number]>(
    (firstCard?.type as (typeof EDIT_CHART_OPTIONS)[number]) || "bar_chart",
  );
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("desc");
  const [limit, setLimit] = useState("10");
  const [objectTitle, setObjectTitle] = useState(firstCard?.title || "");

  function submitEdits(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const nextLimit = Number(limit);
    const edits: ControlledEditDraft = {
      ...(start && end ? { dateRange: { start, end, days: 1, label: `${start} to ${end}` } } : {}),
      ...(filterValue.trim()
        ? {
            filters: [
              { field: filterField, operator: "equals" as const, value: filterValue.trim() },
            ],
          }
        : {}),
      metrics: [metric],
      dimensions: [dimension],
      sort: { field: metric, direction: sortDirection },
      ...(Number.isFinite(nextLimit) && nextLimit > 0 ? { limit: nextLimit } : {}),
      visual: { type: chartType, metrics: [metric], dimensions: [dimension] },
      ...(firstCard && objectTitle.trim()
        ? { objectTitles: { [firstCard.id]: objectTitle.trim() } }
        : {}),
    };

    onApply(edits);
  }

  return (
    <section className="border-b border-hp-rule py-5">
      <div className="mb-4 flex items-center gap-2 text-hp-ink">
        <Settings2 size={17} aria-hidden />
        <span className="text-[11px] uppercase tracking-[0.14em]">Controlled Edits</span>
      </div>
      <form onSubmit={submitEdits} className="grid gap-3 lg:grid-cols-3">
        <label className="grid gap-1 text-sm text-hp-body">
          <span className="text-[10px] uppercase tracking-[0.14em] text-hp-muted">
            Date range
          </span>
          <span className="grid grid-cols-2 gap-2">
            <input
              type="date"
              value={start}
              onChange={(event) => setStart(event.target.value)}
              className="h-10 border border-hp-rule bg-hp-foundation px-2 text-sm text-hp-ink outline-none focus:border-hp-ink"
            />
            <input
              type="date"
              value={end}
              onChange={(event) => setEnd(event.target.value)}
              className="h-10 border border-hp-rule bg-hp-foundation px-2 text-sm text-hp-ink outline-none focus:border-hp-ink"
            />
          </span>
        </label>
        <label className="grid gap-1 text-sm text-hp-body">
          <span className="text-[10px] uppercase tracking-[0.14em] text-hp-muted">Filter</span>
          <span className="grid grid-cols-[0.9fr_1.1fr] gap-2">
            <select
              value={filterField}
              onChange={(event) =>
                setFilterField(event.target.value as (typeof EDIT_FILTER_OPTIONS)[number])
              }
              className="h-10 border border-hp-rule bg-hp-foundation px-2 text-sm text-hp-ink outline-none focus:border-hp-ink"
            >
              {EDIT_FILTER_OPTIONS.map((option) => (
                <option key={option} value={option}>
                  {editLabel(option)}
                </option>
              ))}
            </select>
            <input
              value={filterValue}
              onChange={(event) => setFilterValue(event.target.value)}
              placeholder="Book Appts US"
              className="h-10 border border-hp-rule bg-hp-foundation px-2 text-sm text-hp-ink outline-none placeholder:text-hp-muted focus:border-hp-ink"
            />
          </span>
        </label>
        <label className="grid gap-1 text-sm text-hp-body">
          <span className="text-[10px] uppercase tracking-[0.14em] text-hp-muted">Metric</span>
          <select
            value={metric}
            onChange={(event) => setMetric(event.target.value as (typeof EDIT_METRIC_OPTIONS)[number])}
            className="h-10 border border-hp-rule bg-hp-foundation px-2 text-sm text-hp-ink outline-none focus:border-hp-ink"
          >
            {EDIT_METRIC_OPTIONS.map((option) => (
              <option key={option} value={option}>
                {editLabel(option)}
              </option>
            ))}
          </select>
        </label>
        <label className="grid gap-1 text-sm text-hp-body">
          <span className="text-[10px] uppercase tracking-[0.14em] text-hp-muted">Grouping</span>
          <select
            value={dimension}
            onChange={(event) =>
              setDimension(event.target.value as (typeof EDIT_DIMENSION_OPTIONS)[number])
            }
            className="h-10 border border-hp-rule bg-hp-foundation px-2 text-sm text-hp-ink outline-none focus:border-hp-ink"
          >
            {EDIT_DIMENSION_OPTIONS.map((option) => (
              <option key={option} value={option}>
                {editLabel(option)}
              </option>
            ))}
          </select>
        </label>
        <label className="grid gap-1 text-sm text-hp-body">
          <span className="text-[10px] uppercase tracking-[0.14em] text-hp-muted">
            Chart type
          </span>
          <select
            value={chartType}
            onChange={(event) =>
              setChartType(event.target.value as (typeof EDIT_CHART_OPTIONS)[number])
            }
            className="h-10 border border-hp-rule bg-hp-foundation px-2 text-sm text-hp-ink outline-none focus:border-hp-ink"
          >
            {EDIT_CHART_OPTIONS.map((option) => (
              <option key={option} value={option}>
                {editLabel(option)}
              </option>
            ))}
          </select>
        </label>
        <label className="grid gap-1 text-sm text-hp-body">
          <span className="text-[10px] uppercase tracking-[0.14em] text-hp-muted">Sort</span>
          <span className="grid grid-cols-[1fr_72px] gap-2">
            <select
              value={sortDirection}
              onChange={(event) => setSortDirection(event.target.value === "asc" ? "asc" : "desc")}
              className="h-10 border border-hp-rule bg-hp-foundation px-2 text-sm text-hp-ink outline-none focus:border-hp-ink"
            >
              <option value="desc">High first</option>
              <option value="asc">Low first</option>
            </select>
            <input
              type="number"
              min={1}
              max={100}
              value={limit}
              onChange={(event) => setLimit(event.target.value)}
              aria-label="Limit"
              className="h-10 border border-hp-rule bg-hp-foundation px-2 text-sm text-hp-ink outline-none focus:border-hp-ink"
            />
          </span>
        </label>
        <label className="grid gap-1 text-sm text-hp-body lg:col-span-2">
          <span className="text-[10px] uppercase tracking-[0.14em] text-hp-muted">
            Object title
          </span>
          <input
            value={objectTitle}
            onChange={(event) => setObjectTitle(event.target.value)}
            className="h-10 border border-hp-rule bg-hp-foundation px-2 text-sm text-hp-ink outline-none focus:border-hp-ink"
          />
        </label>
        <div className="flex items-end">
          <button
            type="submit"
            disabled={disabled}
            className="inline-flex h-10 w-full items-center justify-center gap-2 bg-hp-ink px-4 text-[11px] uppercase tracking-[0.14em] text-hp-foundation transition-colors hover:bg-hp-body disabled:hover:bg-hp-ink"
          >
            {disabled ? <Loader2 size={14} className="animate-spin" aria-hidden /> : null}
            Apply edits
          </button>
        </div>
      </form>
    </section>
  );
}

export function EmptyRunDetail() {
  return (
    <div className="flex min-h-96 items-center justify-center border border-dashed border-hp-rule bg-hp-foundation p-6 text-center">
      <p className="max-w-sm text-sm leading-6 text-hp-muted">No run selected.</p>
    </div>
  );
}

function DashboardPacketView({
  packet,
  runId,
  onApplyEdits,
}: {
  packet: AnalysisWorkbenchDashboardPacket;
  runId: string;
  onApplyEdits?: (edits: ControlledEditDraft) => void;
}) {
  const sourceNotes = packet.sourceNotes.map(normalizeSourceNote).filter(Boolean) as Array<{
    id: string;
    label: string;
    value: string;
  }>;

  return (
    <section className="border-b border-hp-rule py-5">
      <div className="mb-4 flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div>
          <div className="flex items-center gap-2 text-hp-ink">
            <LayoutDashboard size={17} />
            <span className="text-[11px] uppercase tracking-[0.14em]">Dashboard Packet</span>
          </div>
          <h3 className="mt-2 font-title text-2xl leading-tight text-hp-ink">
            Full dashboard packet
          </h3>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-hp-body">
            {packet.directAnswer.summary}
          </p>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center md:flex-col md:items-end">
          <ExportButton
            label="Export PDF"
            ariaLabel="Export dashboard packet PDF"
            onClick={() => downloadDashboardPacketPdf(runId, packet)}
          />
          <div className="border border-hp-rule bg-hp-foundation px-3 py-2 text-[11px] uppercase tracking-[0.14em] text-hp-muted">
            {formatDateTime(packet.generatedAt)}
          </div>
        </div>
      </div>

      <div className="grid gap-3 md:grid-cols-3">
        <PacketStat
          label="Evidence table"
          value={packet.primaryEvidenceTable?.title || "No evidence table"}
        />
        <PacketStat label="Visual objects" value={`${packet.visualObjects.length}`} />
        <PacketStat label="Source notes" value={`${sourceNotes.length}`} />
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        <PacketInsightGroup
          title="Winners"
          insights={packet.insightSummary.winners}
          onApplyEdits={onApplyEdits}
        />
        <PacketInsightGroup
          title="Losers"
          insights={packet.insightSummary.losers}
          onApplyEdits={onApplyEdits}
        />
        <PacketInsightGroup
          title="Anomalies"
          insights={packet.insightSummary.anomalies}
          onApplyEdits={onApplyEdits}
        />
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        <PacketList
          title="Next Actions"
          items={packet.nextActions.map((action) => `${action.title}: ${action.detail}`)}
        />
        <PacketList title="Assumptions" items={packet.assumptions} />
        <PacketList title="Caveats" items={packet.caveats} />
      </div>

      {sourceNotes.length ? (
        <dl className="mt-4 grid gap-3 md:grid-cols-2">
          {sourceNotes.map((note) => (
            <div key={`${note.id}-${note.label}`} className="border border-hp-rule bg-hp-foundation p-3">
              <dt className="text-[10px] uppercase tracking-[0.14em] text-hp-muted">{note.label}</dt>
              <dd className="mt-1 text-sm leading-5 text-hp-body">{note.value}</dd>
            </div>
          ))}
        </dl>
      ) : null}
    </section>
  );
}

function PacketStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="border border-hp-rule bg-hp-foundation p-3">
      <div className="text-[10px] uppercase tracking-[0.14em] text-hp-muted">{label}</div>
      <div className="mt-1 text-sm leading-5 text-hp-ink">{value}</div>
    </div>
  );
}

function PacketInsightGroup({
  title,
  insights,
  onApplyEdits,
}: {
  title: string;
  insights: AnalysisWorkbenchDashboardPacket["insightSummary"]["winners"];
  onApplyEdits?: (edits: ControlledEditDraft) => void;
}) {
  const visibleInsights = insights.filter((insight) => !insight.hidden);

  return (
    <div className="border border-hp-rule bg-hp-foundation p-3">
      <h4 className="text-[10px] uppercase tracking-[0.14em] text-hp-muted">{title}</h4>
      {visibleInsights.length ? (
        <ul className="mt-2 space-y-2">
          {visibleInsights.map((insight) => (
            <li key={insight.id} className="text-sm leading-5 text-hp-body">
              <div>
                <span className="font-bold text-hp-ink">{insight.title}: </span>
                {insight.detail}
                {insight.pinned ? (
                  <span className="ml-2 border border-hp-rule px-1.5 py-0.5 text-[9px] uppercase tracking-[0.14em] text-hp-muted">
                    Pinned
                  </span>
                ) : null}
              </div>
              {onApplyEdits ? (
                <div className="mt-2 flex flex-wrap gap-2">
                  <button
                    type="button"
                    aria-label={`Pin insight ${insight.id}`}
                    onClick={() =>
                      onApplyEdits({
                        insightVisibility: { [insight.id]: { pinned: true } },
                      })
                    }
                    className="inline-flex h-8 items-center gap-1 border border-hp-rule bg-hp-card px-2 text-[10px] uppercase tracking-[0.14em] text-hp-body hover:border-hp-ink hover:text-hp-ink"
                  >
                    <Pin size={12} aria-hidden />
                    {insight.pinned ? "Pinned" : "Pin"}
                  </button>
                  <button
                    type="button"
                    aria-label={`Hide insight ${insight.id}`}
                    onClick={() =>
                      onApplyEdits({
                        insightVisibility: { [insight.id]: { hidden: true } },
                      })
                    }
                    className="inline-flex h-8 items-center gap-1 border border-hp-rule bg-hp-card px-2 text-[10px] uppercase tracking-[0.14em] text-hp-body hover:border-hp-ink hover:text-hp-ink"
                  >
                    <EyeOff size={12} aria-hidden />
                    Hide insight
                  </button>
                </div>
              ) : null}
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-2 text-sm text-hp-muted">None saved.</p>
      )}
    </div>
  );
}

function PacketList({ title, items }: { title: string; items: string[] }) {
  return (
    <div className="border border-hp-rule bg-hp-foundation p-3">
      <h4 className="text-[10px] uppercase tracking-[0.14em] text-hp-muted">{title}</h4>
      {items.length ? (
        <ul className="mt-2 space-y-2">
          {items.map((item) => (
            <li key={item} className="text-sm leading-5 text-hp-body">
              {item}
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-2 text-sm text-hp-muted">None saved.</p>
      )}
    </div>
  );
}

function SourceNotes({ notes }: { notes: unknown[] }) {
  const normalized = notes.map(normalizeSourceNote).filter(Boolean) as Array<{
    id: string;
    label: string;
    value: string;
  }>;

  return (
    <section className="border-b border-hp-rule py-5">
      <div className="mb-3 flex items-center gap-2 text-hp-ink">
        <Table2 size={17} />
        <span className="text-[11px] uppercase tracking-[0.14em]">Source Notes</span>
      </div>
      {normalized.length ? (
        <dl className="grid gap-3 md:grid-cols-2">
          {normalized.map((note) => (
            <div key={`${note.id}-${note.label}`} className="border border-hp-rule bg-hp-foundation p-3">
              <dt className="text-[10px] uppercase tracking-[0.14em] text-hp-muted">{note.label}</dt>
              <dd className="mt-1 text-sm leading-5 text-hp-body">{note.value}</dd>
            </div>
          ))}
        </dl>
      ) : (
        <p className="border border-dashed border-hp-rule bg-hp-foundation p-4 text-sm text-hp-muted">
          No source notes saved for this run.
        </p>
      )}
    </section>
  );
}

function VisualCard({
  card,
  runId,
  sourceNotes,
}: {
  card: AnalysisWorkbenchVisualCard;
  runId?: string;
  sourceNotes: AnalysisWorkbenchRun["sourceNotes"];
}) {
  if (card.type === "metric_card") return <MetricVisualCard card={card} />;
  if (card.type === "flat_table") {
    return <TableVisualCard card={card} runId={runId} sourceNotes={sourceNotes} />;
  }
  if (card.type === "bar_chart") {
    return <BarVisualCard card={card} runId={runId} sourceNotes={sourceNotes} />;
  }
  if (card.type === "pivot_table") {
    return <PivotVisualCard card={card} runId={runId} sourceNotes={sourceNotes} />;
  }
  if (card.type === "scatter_chart") {
    return <ScatterVisualCard card={card} runId={runId} sourceNotes={sourceNotes} />;
  }
  return <LineVisualCard card={card} runId={runId} sourceNotes={sourceNotes} />;
}

function MetricVisualCard({ card }: { card: Extract<AnalysisWorkbenchVisualCard, { type: "metric_card" }> }) {
  return (
    <section className="border border-hp-rule bg-hp-foundation p-4">
      <p className="text-[10px] uppercase tracking-[0.14em] text-hp-muted">Metric card</p>
      <h3 className="mt-2 font-title text-2xl leading-tight text-hp-ink">{card.title}</h3>
      <p className="mt-3 font-title text-4xl leading-none text-hp-ink">{card.formattedValue}</p>
      <VisualCardMeta card={card} />
    </section>
  );
}

function TableVisualCard({
  card,
  runId,
  sourceNotes,
}: {
  card: Extract<AnalysisWorkbenchVisualCard, { type: "flat_table" }>;
  runId?: string;
  sourceNotes: AnalysisWorkbenchRun["sourceNotes"];
}) {
  return (
    <section className="overflow-hidden border border-hp-rule bg-hp-foundation">
      <div className="border-b border-hp-rule p-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p className="text-[10px] uppercase tracking-[0.14em] text-hp-muted">Flat table</p>
            <h3 className="mt-2 font-title text-2xl leading-tight text-hp-ink">{card.title}</h3>
          </div>
          <TableExportAction card={card} runId={runId} sourceNotes={sourceNotes} />
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="min-w-full border-collapse text-sm">
          <thead>
            <tr className="bg-hp-inset text-left">
              {card.columns.map((column) => (
                <th
                  key={column.key}
                  className={
                    column.kind === "metric"
                      ? "border-b border-hp-rule px-3 py-3 text-right text-[10px] font-normal uppercase tracking-[0.14em] text-hp-muted"
                      : "border-b border-hp-rule px-3 py-3 text-[10px] font-normal uppercase tracking-[0.14em] text-hp-muted"
                  }
                >
                  {column.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {card.rows.map((row, rowIndex) => (
              <tr key={rowIndex} className="border-b border-hp-rule last:border-b-0">
                {card.columns.map((column) => (
                  <td
                    key={column.key}
                    className={
                      column.kind === "metric"
                        ? "px-3 py-3 text-right tabular-nums text-hp-ink"
                        : "px-3 py-3 text-hp-ink"
                    }
                  >
                    {formatVisualCell(row[column.key])}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="p-4 pt-3">
        <VisualCardMeta card={card} />
      </div>
    </section>
  );
}

function BarVisualCard({
  card,
  runId,
  sourceNotes,
}: {
  card: Extract<AnalysisWorkbenchVisualCard, { type: "bar_chart" }>;
  runId?: string;
  sourceNotes: AnalysisWorkbenchRun["sourceNotes"];
}) {
  const maxValue = Math.max(1, ...card.bars.map((bar) => bar.value));

  return (
    <section className="border border-hp-rule bg-hp-foundation p-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-[10px] uppercase tracking-[0.14em] text-hp-muted">Bar chart</p>
          <h3 className="mt-2 font-title text-2xl leading-tight text-hp-ink">{card.title}</h3>
        </div>
        <ChartExportAction card={card} runId={runId} sourceNotes={sourceNotes} />
      </div>
      <div className="mt-4 space-y-3">
        {card.bars.map((bar) => (
          <div key={bar.label} className="grid grid-cols-[minmax(90px,0.8fr)_minmax(120px,1.2fr)_auto] items-center gap-3">
            <span className="truncate text-sm text-hp-ink">{bar.label}</span>
            <span className="h-3 bg-hp-inset">
              <span
                className="block h-3 bg-hp-ink"
                style={{ width: `${Math.max(4, (bar.value / maxValue) * 100)}%` }}
              />
            </span>
            <span className="text-right text-sm tabular-nums text-hp-ink">{bar.formattedValue}</span>
          </div>
        ))}
      </div>
      <VisualCardMeta card={card} />
    </section>
  );
}

function LineVisualCard({
  card,
  runId,
  sourceNotes,
}: {
  card: Extract<AnalysisWorkbenchVisualCard, { type: "line_chart" }>;
  runId?: string;
  sourceNotes: AnalysisWorkbenchRun["sourceNotes"];
}) {
  const polyline = lineChartPoints(card.points);

  return (
    <section className="border border-hp-rule bg-hp-foundation p-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-[10px] uppercase tracking-[0.14em] text-hp-muted">Line chart</p>
          <h3 className="mt-2 font-title text-2xl leading-tight text-hp-ink">{card.title}</h3>
        </div>
        <ChartExportAction card={card} runId={runId} sourceNotes={sourceNotes} />
      </div>
      <div className="mt-4 border border-hp-rule bg-hp-card p-3">
        {card.points.length ? (
          <>
            <svg role="img" aria-label={card.title} viewBox="0 0 320 120" className="h-36 w-full">
              <title>{card.title}</title>
              <polyline
                points={polyline}
                fill="none"
                stroke="#2a2725"
                strokeWidth="2"
                vectorEffect="non-scaling-stroke"
              />
              {polyline.split(" ").map((point, index) => {
                const [cx, cy] = point.split(",");
                return <circle key={`${point}-${index}`} cx={cx} cy={cy} r="3" fill="#9c7b3f" />;
              })}
            </svg>
            <div className="mt-2 flex justify-between gap-3 text-[10px] uppercase tracking-[0.14em] text-hp-muted">
              <span>{card.points[0]?.label}</span>
              <span>{card.points[card.points.length - 1]?.label}</span>
            </div>
          </>
        ) : (
          <p className="p-4 text-sm text-hp-muted">No trend points saved.</p>
        )}
      </div>
      <VisualCardMeta card={card} />
    </section>
  );
}

function PivotVisualCard({
  card,
  runId,
  sourceNotes,
}: {
  card: Extract<AnalysisWorkbenchVisualCard, { type: "pivot_table" }>;
  runId?: string;
  sourceNotes: AnalysisWorkbenchRun["sourceNotes"];
}) {
  return (
    <section className="overflow-hidden border border-hp-rule bg-hp-foundation">
      <div className="border-b border-hp-rule p-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p className="text-[10px] uppercase tracking-[0.14em] text-hp-muted">Pivot table</p>
            <h3 className="mt-2 font-title text-2xl leading-tight text-hp-ink">{card.title}</h3>
          </div>
          <TableExportAction card={card} runId={runId} sourceNotes={sourceNotes} />
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="min-w-full border-collapse text-sm">
          <thead>
            <tr className="bg-hp-inset text-left">
              <th className="border-b border-hp-rule px-3 py-3 text-[10px] font-normal uppercase tracking-[0.14em] text-hp-muted">
                Row
              </th>
              {card.columns.map((column) => (
                <th
                  key={column.key}
                  className="border-b border-hp-rule px-3 py-3 text-right text-[10px] font-normal uppercase tracking-[0.14em] text-hp-muted"
                >
                  {column.label}
                </th>
              ))}
              <th className="border-b border-hp-rule px-3 py-3 text-right text-[10px] font-normal uppercase tracking-[0.14em] text-hp-muted">
                Total
              </th>
            </tr>
          </thead>
          <tbody>
            {card.rows.map((row) => (
              <tr key={row.rowLabel} className="border-b border-hp-rule last:border-b-0">
                <td className="px-3 py-3 text-hp-ink">{row.rowLabel}</td>
                {card.columns.map((column) => (
                  <td key={column.key} className="px-3 py-3 text-right tabular-nums text-hp-ink">
                    {formatVisualCell(row.cells[column.key])}
                  </td>
                ))}
                <td className="px-3 py-3 text-right tabular-nums text-hp-ink">
                  {formatVisualCell(row.total)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="p-4 pt-3">
        <VisualCardMeta card={card} />
      </div>
    </section>
  );
}

function ScatterVisualCard({
  card,
  runId,
  sourceNotes,
}: {
  card: Extract<AnalysisWorkbenchVisualCard, { type: "scatter_chart" }>;
  runId?: string;
  sourceNotes: AnalysisWorkbenchRun["sourceNotes"];
}) {
  const points = scatterChartPoints(card.points);

  return (
    <section className="border border-hp-rule bg-hp-foundation p-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-[10px] uppercase tracking-[0.14em] text-hp-muted">Scatter chart</p>
          <h3 className="mt-2 font-title text-2xl leading-tight text-hp-ink">{card.title}</h3>
        </div>
        <ChartExportAction card={card} runId={runId} sourceNotes={sourceNotes} />
      </div>
      <div className="mt-4 border border-hp-rule bg-hp-card p-3">
        {card.points.length ? (
          <>
            <svg role="img" aria-label={card.title} viewBox="0 0 320 160" className="h-40 w-full">
              <title>{card.title}</title>
              <line x1="28" y1="132" x2="304" y2="132" stroke="#d4cfc4" strokeWidth="1" />
              <line x1="28" y1="16" x2="28" y2="132" stroke="#d4cfc4" strokeWidth="1" />
              {points.map((point) => (
                <circle key={point.label} cx={point.cx} cy={point.cy} r="4" fill="#2a2725" />
              ))}
            </svg>
            <div className="mt-2 grid gap-2">
              {card.points.slice(0, 4).map((point) => (
                <div
                  key={point.label}
                  className="flex items-center justify-between gap-3 text-sm text-hp-body"
                >
                  <span className="truncate text-hp-ink">{point.label}</span>
                  <span className="shrink-0 tabular-nums text-hp-ink">
                    {point.formattedX} / {point.formattedY}
                  </span>
                </div>
              ))}
            </div>
          </>
        ) : (
          <p className="p-4 text-sm text-hp-muted">No scatter points saved.</p>
        )}
      </div>
      <VisualCardMeta card={card} />
    </section>
  );
}

function TableExportAction({
  card,
  runId,
  sourceNotes,
}: {
  card: AnalysisWorkbenchVisualCard;
  runId?: string;
  sourceNotes: AnalysisWorkbenchRun["sourceNotes"];
}) {
  if (!runId || !isAnalysisWorkbenchTableCard(card)) return null;

  return (
    <ExportButton
      label="Export CSV"
      ariaLabel={`Export ${card.title} CSV`}
      onClick={() => downloadTableCsv(runId, card, sourceNotes)}
    />
  );
}

function ChartExportAction({
  card,
  runId,
  sourceNotes,
}: {
  card: AnalysisWorkbenchVisualCard;
  runId?: string;
  sourceNotes: AnalysisWorkbenchRun["sourceNotes"];
}) {
  if (!runId || !isAnalysisWorkbenchChartCard(card)) return null;

  return (
    <ExportButton
      label="Export PNG"
      ariaLabel={`Export ${card.title} PNG`}
      onClick={() => void downloadChartPng(runId, card, sourceNotes)}
    />
  );
}

function ExportButton({
  label,
  ariaLabel,
  onClick,
}: {
  label: string;
  ariaLabel: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-label={ariaLabel}
      onClick={onClick}
      className="inline-flex h-9 shrink-0 items-center justify-center gap-2 border border-hp-rule bg-hp-card px-3 text-[10px] uppercase tracking-[0.14em] text-hp-body transition-colors hover:border-hp-ink hover:bg-hp-inset hover:text-hp-ink"
    >
      <Download size={13} aria-hidden />
      {label}
    </button>
  );
}

function downloadDashboardPacketPdf(runId: string, packet: AnalysisWorkbenchDashboardPacket) {
  const pdf = buildAnalysisWorkbenchPdfReportExport({ runId, packet });
  downloadFile(pdf.fileName, pdf.content, pdf.mimeType);
}

function downloadTableCsv(
  runId: string,
  card: AnalysisWorkbenchTableExportCard,
  sourceNotes: AnalysisWorkbenchRun["sourceNotes"],
) {
  const csv = buildAnalysisWorkbenchTableCsvExport({ runId, card, sourceNotes });
  downloadFile(csv.fileName, csv.content, csv.mimeType);
}

async function downloadChartPng(
  runId: string,
  card: AnalysisWorkbenchChartExportCard,
  sourceNotes: AnalysisWorkbenchRun["sourceNotes"],
) {
  try {
    const png = buildAnalysisWorkbenchChartPngExportSource({ runId, card, sourceNotes });
    const svgBlob = new Blob([png.svg], { type: "image/svg+xml;charset=utf-8" });
    const svgUrl = URL.createObjectURL(svgBlob);

    try {
      const image = await loadImage(svgUrl);
      const canvas = document.createElement("canvas");
      canvas.width = png.width;
      canvas.height = png.height;
      const context = canvas.getContext("2d");
      if (!context) throw new Error("Canvas export is unavailable.");
      context.drawImage(image, 0, 0, png.width, png.height);
      const blob = await canvasToBlob(canvas);
      if (!blob) throw new Error("PNG export is unavailable.");
      downloadFile(png.fileName, blob, png.mimeType);
    } finally {
      URL.revokeObjectURL(svgUrl);
    }
  } catch {
    window.alert("Chart PNG export could not be prepared in this browser.");
  }
}

function downloadFile(fileName: string, content: BlobPart | Blob, mimeType: string) {
  const blob = content instanceof Blob ? content : new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
}

function loadImage(url: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("Chart image export failed."));
    image.src = url;
  });
}

function canvasToBlob(canvas: HTMLCanvasElement) {
  return new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"));
}

function VisualCardMeta({ card }: { card: AnalysisWorkbenchVisualCard }) {
  return (
    <div className="mt-4 space-y-2 border-t border-hp-rule pt-3 text-[11px] leading-5 text-hp-muted">
      <p>
        <span className="uppercase tracking-[0.14em]">Sources</span>{" "}
        {card.sourceNoteIds.join(", ")}
      </p>
      {card.assumptions?.length ? (
        <p>
          <span className="uppercase tracking-[0.14em]">Assumption</span>{" "}
          {card.assumptions[0]}
        </p>
      ) : null}
      {card.caveats?.length ? (
        <p>
          <span className="uppercase tracking-[0.14em]">Caveat</span> {card.caveats[0]}
        </p>
      ) : null}
    </div>
  );
}

function RunField({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-[0.14em] text-hp-muted">{label}</div>
      <div className="mt-1 break-words text-sm text-hp-ink">{value}</div>
    </div>
  );
}

function StructuredStatus({
  icon,
  label,
  value,
}: {
  icon: ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div className="border border-hp-rule bg-hp-foundation p-4">
      <div className="mb-2 flex items-center gap-2 text-hp-ink">
        {icon}
        <span className="text-[11px] uppercase tracking-[0.14em]">{label}</span>
      </div>
      <p className="text-sm text-hp-body">{value}</p>
    </div>
  );
}

function statusFromJson(value: unknown) {
  if (value && typeof value === "object" && "status" in value) {
    const status = (value as { status?: unknown }).status;
    if (typeof status === "string") return status;
  }

  return "pending";
}

function normalizeSourceNote(note: unknown) {
  if (!note || typeof note !== "object" || Array.isArray(note)) return null;
  const candidate = note as { id?: unknown; label?: unknown; value?: unknown };
  if (typeof candidate.label !== "string" || typeof candidate.value !== "string") return null;
  return {
    id: typeof candidate.id === "string" ? candidate.id : candidate.label,
    label: candidate.label,
    value: candidate.value,
  };
}

function formatVisualCell(cell: AnalysisWorkbenchVisualCell | undefined) {
  if (cell === null || cell === undefined || cell === "") return "n/a";
  if (typeof cell === "object") return cell.formattedValue || String(cell.value ?? "n/a");
  return String(cell);
}

function editLabel(value: string) {
  if (value === "campaign_umbrella") return "Campaign group";
  if (value === "primary_results") return "Primary KPI";
  if (value === "ad_set") return "Ad set";
  if (value === "bar_chart") return "Bar chart";
  if (value === "line_chart") return "Line chart";
  if (value === "flat_table") return "Flat table";
  if (value === "pivot_table") return "Pivot table";
  if (value === "scatter_chart") return "Scatter chart";
  if (value === "cpl") return "CPL";
  if (value === "ctr") return "CTR";
  return value
    .replace(/_/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function lineChartPoints(points: Array<{ value: number }>) {
  if (!points.length) return "";
  if (points.length === 1) return "160,60";

  const values = points.map((point) => point.value);
  const minValue = Math.min(...values);
  const maxValue = Math.max(...values);
  const range = maxValue - minValue || 1;
  const left = 12;
  const width = 296;
  const top = 12;
  const height = 96;

  return points
    .map((point, index) => {
      const x = left + (index / (points.length - 1)) * width;
      const y = top + height - ((point.value - minValue) / range) * height;
      return `${roundChartPoint(x)},${roundChartPoint(y)}`;
    })
    .join(" ");
}

function scatterChartPoints(points: Array<{ label: string; x: number; y: number }>) {
  if (!points.length) return [];

  const xValues = points.map((point) => point.x);
  const yValues = points.map((point) => point.y);
  const minX = Math.min(...xValues);
  const maxX = Math.max(...xValues);
  const minY = Math.min(...yValues);
  const maxY = Math.max(...yValues);
  const xRange = maxX - minX || 1;
  const yRange = maxY - minY || 1;

  return points.map((point) => ({
    label: point.label,
    cx: roundChartPoint(28 + ((point.x - minX) / xRange) * 276),
    cy: roundChartPoint(132 - ((point.y - minY) / yRange) * 116),
  }));
}

function roundChartPoint(value: number) {
  return Math.round(value * 100) / 100;
}

function formatDate(value: string) {
  return new Date(value).toLocaleDateString();
}

function formatDateTime(value: string) {
  return new Date(value).toLocaleString();
}
