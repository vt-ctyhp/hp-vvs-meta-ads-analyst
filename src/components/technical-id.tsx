"use client";

/**
 * Platform primitive for rendering backend identifiers.
 *
 * Rule (Platform Foundations Win #5): IDs are never primary content. They
 * live in font-mono, muted, behind a disclosure, and almost always exist
 * to be copied into another tool. This component standardizes:
 * - mono + muted styling
 * - optional truncation with full value on hover
 * - one-click copy with visible confirmation
 *
 * Never use raw `<span className="font-mono">{id}</span>` for IDs — use
 * this instead so a future styling tweak applies everywhere.
 */

import { Check, Copy } from "lucide-react";
import { useEffect, useState } from "react";

export function TechnicalId({
  value,
  label,
  truncateTo,
  size = "sm",
}: {
  value: string | null | undefined;
  /** Screen-reader / tooltip context, e.g. "Ad ID". */
  label: string;
  /** If set, show only the first N chars and an ellipsis. The full value lives on hover + copy. */
  truncateTo?: number;
  size?: "xs" | "sm";
}) {
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!copied) return;
    const handle = window.setTimeout(() => setCopied(false), 1500);
    return () => window.clearTimeout(handle);
  }, [copied]);

  if (!value) {
    return <span className="text-xs italic text-hp-muted">—</span>;
  }

  const display =
    truncateTo && value.length > truncateTo ? `${value.slice(0, truncateTo)}…` : value;
  const fontSize = size === "xs" ? "text-[10px]" : "text-[11px]";

  async function copy() {
    if (typeof navigator === "undefined" || !navigator.clipboard) return;
    try {
      await navigator.clipboard.writeText(value!);
      setCopied(true);
    } catch {
      // Silent: clipboard can be blocked by permissions; nothing to do.
    }
  }

  return (
    <button
      type="button"
      onClick={copy}
      title={`${label}: ${value} — click to copy`}
      aria-label={`Copy ${label} ${value}`}
      className={`group inline-flex items-center gap-1.5 font-mono ${fontSize} text-hp-muted transition-colors duration-150 hover:text-hp-ink`}
    >
      <span className="break-all">{display}</span>
      {copied ? (
        <Check size={11} aria-hidden className="shrink-0 text-[#245D4D]" />
      ) : (
        <Copy
          size={11}
          aria-hidden
          className="shrink-0 opacity-0 transition-opacity duration-150 group-hover:opacity-100"
        />
      )}
    </button>
  );
}
