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
export function RunSyncButton({ size = "md" }: { size?: "sm" | "md" }) {
  const router = useRouter();
  const [status, setStatus] = useState<"idle" | "running" | "error">("idle");
  const [error, setError] = useState<string | null>(null);

  async function run() {
    if (status === "running") return;
    setStatus("running");
    setError(null);
    try {
      const response = await fetch("/api/sync", {
        method: "POST",
        credentials: "same-origin",
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

  return (
    <div className="flex flex-col items-center gap-2">
      <button
        type="button"
        onClick={run}
        disabled={status === "running"}
        className={`${sizeClass} inline-flex items-center gap-2 rounded-full bg-[#E14B7B] font-medium text-white shadow-sm transition-colors hover:bg-[#C53D6A] disabled:cursor-not-allowed disabled:opacity-60`}
      >
        {status === "running" ? "Running sync…" : "Run Meta sync now"}
      </button>
      {error ? (
        <p className="max-w-md text-center text-xs text-rose-700">{error}</p>
      ) : null}
    </div>
  );
}
