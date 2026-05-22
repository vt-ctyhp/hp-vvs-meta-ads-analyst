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
        // /api/system-health returns { status: "ok" | "warning" | "critical", issues: [...] }.
        // The original code read json.severity + json.ok — neither exists on
        // the payload — so every response collapsed to "ok". That made the
        // pill light up green even when 12 consecutive sync runs were
        // failing.
        const json = (await response.json()) as {
          status?: "ok" | "warning" | "critical";
          issues?: unknown[];
        };
        if (cancelled) return;

        const next: HealthStatus =
          json.status === "critical"
            ? "critical"
            : json.status === "warning"
              ? "warn"
              : json.status === "ok"
                ? "ok"
                : "unknown";
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
      ? "border-signal-positive bg-signal-positive-bg text-signal-positive"
      : status === "warn"
        ? "border-signal-warning bg-signal-warning-bg text-signal-warning"
        : status === "critical"
          ? "border-signal-danger bg-signal-danger-bg text-signal-danger"
          : "border-hp-rule bg-hp-card text-hp-muted";

  const dotClass =
    status === "ok"
      ? "bg-signal-positive"
      : status === "warn"
        ? "bg-signal-warning"
        : status === "critical"
          ? "bg-signal-danger"
          : "bg-hp-muted";

  return (
    <span
      role="status"
      title="System health"
      className={`inline-flex h-10 items-center gap-2 border px-3 text-xs font-medium ${bgClass}`}
    >
      <span className={`inline-block h-2 w-2 rounded-full ${dotClass}`} />
      <span>{label}</span>
    </span>
  );
}
