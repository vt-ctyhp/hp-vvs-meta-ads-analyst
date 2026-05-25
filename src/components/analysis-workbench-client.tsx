"use client";

import { BarChart3, Clock3, FileText, Loader2, Send, Table2 } from "lucide-react";
import { useMemo, useState, type ReactNode } from "react";

import {
  normalizeAnalysisOutputMode,
  type AnalysisOutputMode,
  type AnalysisWorkbenchRun,
} from "@/lib/analysis-workbench-contract";
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

export function AnalysisWorkbenchClient({ initialRuns }: Props) {
  const [runs, setRuns] = useState(initialRuns);
  const [selectedRun, setSelectedRun] = useState<AnalysisWorkbenchRun | null>(
    initialRuns[0] || null,
  );
  const [prompt, setPrompt] = useState("");
  const [outputMode, setOutputMode] = useState<AnalysisOutputMode>("answer_visuals");
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState("");

  const statusSentence = useMemo(() => {
    if (selectedRun) {
      return `${selectedRun.title} is saved as a durable ${OUTPUT_MODE_LABELS[
        selectedRun.outputMode
      ].toLowerCase()} run.`;
    }

    return "Create the first durable Ask AI run from one prompt.";
  }, [selectedRun]);

  async function submitRun() {
    const nextPrompt = prompt.trim();
    if (!nextPrompt) return;

    setLoading(true);
    setStatus("");

    try {
      const response = await fetch("/api/analysis-runs", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ prompt: nextPrompt, outputMode }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Run creation failed");
      const run = payload.run as AnalysisWorkbenchRun;
      setSelectedRun(run);
      setRuns((current) => [run, ...current.filter((item) => item.id !== run.id)].slice(0, 12));
      setPrompt("");
      setStatus("Run created.");
    } catch (error) {
      setStatus(translateError(error));
    } finally {
      setLoading(false);
    }
  }

  async function reopenRun(runId: string) {
    setLoading(true);
    setStatus("");

    try {
      const response = await fetch(`/api/analysis-runs?runId=${encodeURIComponent(runId)}`);
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Run reopen failed");
      const run = payload.run as AnalysisWorkbenchRun;
      setSelectedRun(run);
      setOutputMode(normalizeAnalysisOutputMode(run.outputMode));
    } catch (error) {
      setStatus(translateError(error));
    } finally {
      setLoading(false);
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
              {status ? (
                <p className="mt-3 border border-hp-rule bg-hp-inset px-3 py-2 text-sm text-hp-body">
                  {status}
                </p>
              ) : null}
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
            {selectedRun ? <RunDetail run={selectedRun} /> : <EmptyRunDetail />}
          </section>
        </main>
      </div>
    </div>
  );
}

function ModeSelector({
  value,
  onChange,
}: {
  value: AnalysisOutputMode;
  onChange: (value: AnalysisOutputMode) => void;
}) {
  return (
    <div className="grid gap-2">
      {OUTPUT_MODES.map((mode) => {
        const active = value === mode;
        return (
          <button
            key={mode}
            type="button"
            onClick={() => onChange(mode)}
            title={OUTPUT_MODE_HELP[mode]}
            className={
              active
                ? "border border-hp-ink bg-hp-ink px-3 py-3 text-left text-hp-foundation"
                : "border border-hp-rule bg-hp-foundation px-3 py-3 text-left text-hp-body transition-colors hover:border-hp-ink"
            }
          >
            <span className="block text-[11px] uppercase tracking-[0.14em]">
              {OUTPUT_MODE_LABELS[mode]}
            </span>
          </button>
        );
      })}
    </div>
  );
}

function RunDetail({ run }: { run: AnalysisWorkbenchRun }) {
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
        <div className="border border-hp-rule bg-hp-foundation px-3 py-2 text-[11px] uppercase tracking-[0.14em] text-hp-muted">
          {OUTPUT_MODE_LABELS[run.outputMode]}
        </div>
      </div>

      <div className="grid gap-4 border-b border-hp-rule py-5 md:grid-cols-3">
        <RunField label="Created" value={formatDateTime(run.createdAt)} />
        <RunField label="Updated" value={formatDateTime(run.updatedAt)} />
        <RunField label="Run ID" value={run.id} />
      </div>

      <section className="border-b border-hp-rule py-5">
        <div className="mb-3 flex items-center gap-2 text-hp-ink">
          <FileText size={17} />
          <span className="text-[11px] uppercase tracking-[0.14em]">Answer</span>
        </div>
        <p className="max-w-3xl text-sm leading-6 text-hp-body">{run.answer.summary}</p>
      </section>

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

function EmptyRunDetail() {
  return (
    <div className="flex min-h-96 items-center justify-center border border-dashed border-hp-rule bg-hp-foundation p-6 text-center">
      <p className="max-w-sm text-sm leading-6 text-hp-muted">No run selected.</p>
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

function formatDate(value: string) {
  return new Date(value).toLocaleDateString();
}

function formatDateTime(value: string) {
  return new Date(value).toLocaleString();
}
