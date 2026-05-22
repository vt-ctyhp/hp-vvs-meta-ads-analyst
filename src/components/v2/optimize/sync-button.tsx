"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

/**
 * Run-sync button for the Optimize empty state.
 *
 * Calls the existing `/api/sync` POST (run_meta_sync permission gated).
 * On success refreshes the server-rendered page so the new staging rows
 * land in the dashboard payload. On failure surfaces the real error
 * (now that the [object Object] bug is fixed everywhere).
 */
type SyncMode = "incremental" | "diagnostics" | "catalog";

type Props = {
  size?: "sm" | "md";
  mode?: SyncMode;
  label?: string;
  runningLabel?: string;
  variant?: "primary" | "secondary";
  confirmMessage?: string;
};

export function RunSyncButton({
  size = "md",
  mode = "incremental",
  label,
  runningLabel,
  variant = "primary",
  confirmMessage,
}: Props) {
  const router = useRouter();
  const [status, setStatus] = useState<"idle" | "running" | "error">("idle");
  const [error, setError] = useState<string | null>(null);

  async function run() {
    if (status === "running") return;
    if (confirmMessage && !window.confirm(confirmMessage)) return;
    setStatus("running");
    setError(null);
    try {
      const hasExplicitMode = mode !== "incremental";
      const response = await fetch("/api/sync", {
        method: "POST",
        credentials: "same-origin",
        ...(hasExplicitMode
          ? {
              headers: { "content-type": "application/json" },
              body: JSON.stringify({ mode }),
            }
          : {}),
      });
      const body = (await response.json().catch(() => ({}))) as {
        error?: string;
      };
      if (!response.ok) {
        throw new Error(body.error || `Sync failed (${response.status})`);
      }
      setStatus("idle");
      router.refresh();
    } catch (e) {
      setStatus("error");
      setError(e instanceof Error ? e.message : "Sync failed.");
    }
  }

  const sizeClass = size === "sm" ? "h-8 px-3 text-xs" : "h-10 px-4 text-sm";
  const variantClass =
    variant === "secondary"
      ? "border border-stone-300 bg-white text-stone-800 hover:bg-stone-50"
      : "bg-[#E14B7B] text-white shadow-sm hover:bg-[#C53D6A]";
  const idleLabel = label ?? defaultIdleLabel(mode);
  const activeLabel =
    runningLabel ?? defaultRunningLabel(mode);

  return (
    <div className="flex flex-col items-center gap-2">
      <button
        type="button"
        onClick={run}
        disabled={status === "running"}
        className={`${sizeClass} ${variantClass} inline-flex items-center gap-2 rounded-full font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-60`}
      >
        {status === "running" ? activeLabel : idleLabel}
      </button>
      {error ? (
        <p className="max-w-md text-center text-xs text-rose-700">{error}</p>
      ) : null}
    </div>
  );
}

function defaultIdleLabel(mode: SyncMode) {
  if (mode === "catalog") return "Refresh catalog";
  if (mode === "diagnostics") return "Refresh live diagnostics";
  return "Run Meta sync now";
}

function defaultRunningLabel(mode: SyncMode) {
  if (mode === "catalog") return "Refreshing catalog…";
  if (mode === "diagnostics") return "Refreshing diagnostics…";
  return "Running sync…";
}
