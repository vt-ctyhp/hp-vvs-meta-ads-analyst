"use client";

import { useCallback, useEffect, useState } from "react";

import type { Room } from "@/lib/permission-routing";

type SignalRow = {
  id: string;
  signal_type: string;
  severity: "info" | "warn" | "critical";
  room: Room;
  entity_type: string;
  entity_id: string | null;
  brand: string | null;
  title: string;
  summary: string | null;
  score: number;
  recommendation: string | null;
  payload: Record<string, unknown>;
};

type Props = {
  room: Room;
  /** Visible cards before "See all (N)" link appears. */
  topCount?: number;
};

export function SignalStrip({ room, topCount = 3 }: Props) {
  const [signals, setSignals] = useState<SignalRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`/api/signals?room=${room}&limit=25`, {
        cache: "no-store",
        credentials: "same-origin",
      });
      if (!response.ok) {
        const body = (await response.json().catch(() => ({}))) as { error?: string };
        throw new Error(body.error ?? `Request failed: ${response.status}`);
      }
      const json = (await response.json()) as { signals: SignalRow[] };
      setSignals(json.signals ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [room]);

  useEffect(() => {
    load();
    const id = setInterval(load, 120_000);
    return () => clearInterval(id);
  }, [load]);

  async function dismiss(signalId: string) {
    setSignals((prev) => prev.filter((s) => s.id !== signalId));
    try {
      await fetch(`/api/signals/${signalId}/dismiss`, {
        method: "POST",
        credentials: "same-origin",
      });
    } catch {
      // Optimistic: even if the server miss, the next poll restores the row.
    }
  }

  async function act(signalId: string) {
    try {
      await fetch(`/api/signals/${signalId}/act`, {
        method: "POST",
        credentials: "same-origin",
      });
    } catch {
      // Telemetry only — failures are non-blocking.
    }
  }

  if (loading && signals.length === 0) {
    return (
      <div className="h-14 animate-pulse rounded-lg border border-stone-200 bg-stone-50" />
    );
  }

  if (error) {
    return (
      <div className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
        Signal strip unavailable: {error}.{" "}
        <button onClick={load} className="underline hover:no-underline">
          Try again
        </button>
      </div>
    );
  }

  if (signals.length === 0) {
    return (
      <div className="rounded-lg border border-stone-200 bg-stone-50 px-4 py-3 text-sm text-stone-600">
        Nothing needs your attention in this room.
      </div>
    );
  }

  const visible = expanded ? signals : signals.slice(0, topCount);
  const hidden = signals.length - visible.length;

  return (
    <div className="space-y-2">
      <div
        role="list"
        aria-label={`${room} signals`}
        className="grid grid-cols-1 gap-2 md:grid-cols-3"
      >
        {visible.map((signal) => (
          <SignalCard
            key={signal.id}
            signal={signal}
            onDismiss={() => dismiss(signal.id)}
            onAct={() => act(signal.id)}
          />
        ))}
      </div>
      {hidden > 0 || expanded ? (
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="text-xs font-medium text-stone-600 hover:text-stone-900"
        >
          {expanded ? "Collapse" : `See all (${signals.length})`}
        </button>
      ) : null}
    </div>
  );
}

function SignalCard({
  signal,
  onDismiss,
  onAct,
}: {
  signal: SignalRow;
  onDismiss: () => void;
  onAct: () => void;
}) {
  const severityStyle = severityClasses(signal.severity);
  const link = typeof signal.payload?.link_href === "string" ? signal.payload.link_href : null;

  return (
    <article
      role="listitem"
      className={`relative flex flex-col gap-2 rounded-lg border p-3 transition-shadow hover:shadow ${severityStyle}`}
    >
      <header className="flex items-start justify-between gap-2">
        <span className="text-[10px] font-semibold uppercase tracking-wider">
          {signal.severity}
        </span>
        <button
          type="button"
          onClick={onDismiss}
          aria-label="Dismiss signal"
          className="text-stone-500 hover:text-stone-900"
        >
          ×
        </button>
      </header>
      <h3 className="text-sm font-semibold leading-snug">{signal.title}</h3>
      {signal.summary ? (
        <p className="text-xs text-stone-700">{signal.summary}</p>
      ) : null}
      {signal.recommendation ? (
        <p className="text-xs italic text-stone-600">{signal.recommendation}</p>
      ) : null}
      <footer className="mt-auto flex items-center gap-2 pt-1">
        {link ? (
          <a
            href={link}
            onClick={onAct}
            className="text-xs font-medium underline hover:no-underline"
          >
            Open →
          </a>
        ) : (
          <span className="text-xs text-stone-500">No drill-down yet</span>
        )}
      </footer>
    </article>
  );
}

function severityClasses(severity: "info" | "warn" | "critical"): string {
  if (severity === "critical")
    return "border-rose-300 bg-rose-50 text-rose-900";
  if (severity === "warn")
    return "border-amber-300 bg-amber-50 text-amber-900";
  return "border-sky-300 bg-sky-50 text-sky-900";
}
