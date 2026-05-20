"use client";

import { useEffect, useState } from "react";

type HealthStatus = "ok" | "warn" | "critical" | "unknown";

const POLL_MS = 90_000;

export function HealthPill() {
  const [status, setStatus] = useState<HealthStatus>("unknown");
  const [issueCount, setIssueCount] = useState<number>(0);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const response = await fetch("/api/system-health", {
          cache: "no-store",
          credentials: "same-origin",
        });
        if (!response.ok) {
          if (!cancelled) {
            setStatus("warn");
            setIssueCount(1);
          }
          return;
        }
        const json = (await response.json()) as {
          ok?: boolean;
          severity?: "ok" | "warn" | "critical";
          issues?: unknown[];
        };
        if (cancelled) return;

        const next: HealthStatus =
          json.severity === "critical" || json.ok === false
            ? "critical"
            : json.severity === "warn"
              ? "warn"
              : "ok";
        setStatus(next);
        setIssueCount(Array.isArray(json.issues) ? json.issues.length : next === "ok" ? 0 : 1);
      } catch {
        if (!cancelled) {
          setStatus("warn");
          setIssueCount(1);
        }
      }
    }

    load();
    const handle = setInterval(load, POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(handle);
    };
  }, []);

  const label =
    status === "ok"
      ? "All systems"
      : status === "warn"
        ? `${issueCount} warning${issueCount === 1 ? "" : "s"}`
        : status === "critical"
          ? `${issueCount} issue${issueCount === 1 ? "" : "s"}`
          : "Checking…";

  const bgClass =
    status === "ok"
      ? "bg-emerald-50 text-emerald-800 border-emerald-200"
      : status === "warn"
        ? "bg-amber-50 text-amber-800 border-amber-200"
        : status === "critical"
          ? "bg-rose-50 text-rose-800 border-rose-200"
          : "bg-stone-100 text-stone-700 border-stone-200";

  const dotClass =
    status === "ok"
      ? "bg-emerald-500"
      : status === "warn"
        ? "bg-amber-500"
        : status === "critical"
          ? "bg-rose-500"
          : "bg-stone-400";

  return (
    <span
      role="status"
      title="System health"
      className={`inline-flex h-10 items-center gap-2 rounded-full border px-3 text-xs font-medium ${bgClass}`}
    >
      <span className={`inline-block h-2 w-2 rounded-full ${dotClass}`} />
      <span>{label}</span>
    </span>
  );
}
