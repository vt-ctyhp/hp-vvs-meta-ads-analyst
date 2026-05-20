/**
 * Platform glossary — single source of truth for user-facing labels.
 *
 * Rules:
 * - NEVER hard-code UI strings for these concepts elsewhere. Import from here.
 * - Adding a new concept? Add it to this file, not inline in a component.
 * - Backend enum values are translated through the `format*` helpers below so
 *   raw codes (ACTIVE, partial, locked) never reach users.
 *
 * The labels here are the canonical platform vocabulary. If a label feels
 * wrong on one screen, change it here so every screen updates together.
 */

// ── Auth ───────────────────────────────────────────────────────────────────
export const AUTH = {
  signIn: "Sign In",
  signingIn: "Signing In",
  signOut: "Sign Out",
} as const;

// ── Sync / data freshness ──────────────────────────────────────────────────
export const SYNC = {
  /** Verb used on every "pull latest from Meta" affordance. Never "Refresh" / "Pull" / "Fetch". */
  action: "Sync",
  inProgress: "Syncing",
  /** Noun for the data freshness window setting in admin tools. */
  window: "Sync window",
} as const;

// ── Generic verbs (use these to keep action vocab consistent) ──────────────
export const ACTIONS = {
  open: "Open",
  close: "Close",
  cancel: "Cancel",
  save: "Save",
  remove: "Remove",
  retry: "Retry",
  apply: "Apply",
} as const;

// ── Domain terms (the platform's product vocabulary) ───────────────────────
export const TERMS = {
  /** Full form. Use for section headers, eyebrows, descriptive copy. */
  campaignUmbrella: "Campaign Umbrella",
  /** Short form. Use for tight contexts only: table column headers, tab strips. */
  umbrellaShort: "Umbrella",
  /** Column / tile header for the canonical primary KPI column. */
  primaryKpi: "Primary KPI",
  /** Fallback label when the resolved KPI label is missing. */
  primaryKpiFallback: "Primary KPI",
} as const;

// ── Ad delivery state ──────────────────────────────────────────────────────
export type AdDeliveryLabel = "Live" | "Paused" | "Off" | "Unknown";

/** Translate Meta's configured + effective status pair into a one-word user label. */
export function formatAdDelivery(
  configured: string | null | undefined,
  effective: string | null | undefined,
): AdDeliveryLabel {
  const value = (effective || configured || "").toUpperCase();
  if (value === "ACTIVE") return "Live";
  if (value === "PAUSED") return "Paused";
  if (
    value === "DELETED" ||
    value === "ARCHIVED" ||
    value === "DISAPPROVED" ||
    value === "PENDING_REVIEW" ||
    value === "PENDING_BILLING_INFO" ||
    value === "CAMPAIGN_PAUSED" ||
    value === "ADSET_PAUSED" ||
    value === "WITH_ISSUES"
  ) {
    return "Off";
  }
  return value ? "Off" : "Unknown";
}

/**
 * Cosmetic translator for any raw Meta enum we still need to show as text in
 * a reference / advanced section. Replaces the old `metaStatusLabel` helper.
 * Pattern: lower-cases, replaces underscores with spaces, capitalizes first letter.
 */
export function formatMetaStatus(value: string | null | undefined): string {
  if (!value) return "—";
  const cleaned = value.toLowerCase().replace(/_/g, " ").trim();
  if (!cleaned) return "—";
  return cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
}

// ── Backfill job & chunk status ────────────────────────────────────────────
export type BackfillJobStatus =
  | "pending"
  | "running"
  | "paused"
  | "success"
  | "partial"
  | "failed"
  | "canceled";

export type BackfillChunkStatus = "queued" | "running" | "success" | "failed" | "canceled";

export type LockStatus = "locked" | "settling" | "active";

/** Job-level status → user-facing label. Replaces raw enum surfacing. */
export function formatBackfillJobStatus(value: string): string {
  switch (value) {
    case "pending":
      return "Queued";
    case "running":
      return "Running";
    case "paused":
      return "Paused";
    case "success":
      return "Completed";
    case "partial":
      return "Partial";
    case "failed":
      return "Failed";
    case "canceled":
      return "Canceled";
    default:
      return formatMetaStatus(value);
  }
}

/** Chunk-level status → user-facing label. */
export function formatBackfillChunkStatus(value: string): string {
  switch (value) {
    case "queued":
      return "Queued";
    case "running":
      return "Running";
    case "success":
      return "Completed";
    case "failed":
      return "Failed";
    case "canceled":
      return "Canceled";
    default:
      return formatMetaStatus(value);
  }
}

/** Lock status (data settling / finalized) → user-facing label. */
export function formatLockStatus(value: LockStatus | string): string {
  switch (value) {
    case "locked":
      return "Final";
    case "settling":
      return "Settling";
    case "active":
      return "Updating";
    default:
      return formatMetaStatus(value);
  }
}

// ── Error translation ──────────────────────────────────────────────────────
/**
 * Convert raw backend or JS error strings into clean user-facing copy.
 * Strips SQL leaks, stack traces, and HTTP boilerplate; falls back to a
 * friendly default when the message is too technical to surface.
 *
 * Use this anywhere a caught `Error` or fetch payload error would otherwise
 * be passed straight to `setStatus(error.message)`.
 */
export function translateError(input: unknown, fallback = "Something went wrong"): string {
  const raw = (() => {
    if (!input) return "";
    if (typeof input === "string") return input;
    if (input instanceof Error) return input.message;
    if (typeof input === "object" && input !== null) {
      // Prefer a known message-like field rather than coercing the whole
      // object via String(...), which yields the useless "[object Object]".
      const obj = input as Record<string, unknown>;
      for (const key of ["message", "error_description", "msg", "description"]) {
        const value = obj[key];
        if (typeof value === "string" && value.trim()) return value;
      }
      return "";
    }
    const stringified = String(input);
    // String coercion of a plain object is the most common source of the
    // user-visible "[object Object]" bug. Treat it as no message.
    return stringified === "[object Object]" ? "" : stringified;
  })().trim();

  if (!raw) return fallback;

  // Patterns we never want to leak to users
  const leakPatterns = [
    /relation ".*" does not exist/i,
    /column ".*" does not exist/i,
    /violates unique constraint/i,
    /violates foreign key constraint/i,
    /violates not-null constraint/i,
    /duplicate key value/i,
    /permission denied for/i,
    /syntax error at/i,
    /pg_/i,
    /TypeError:/i,
    /SyntaxError:/i,
    /ReferenceError:/i,
    /^\s*at [^\s]/m, // looks like a stack frame
  ];
  if (leakPatterns.some((pattern) => pattern.test(raw))) {
    return fallback;
  }

  // HTTP boilerplate
  if (/^HTTP \d{3}/.test(raw)) {
    return fallback;
  }

  // Common normalizations
  if (/network|fetch failed|failed to fetch/i.test(raw)) {
    return "Couldn't reach the server. Check your connection and try again.";
  }
  if (/unauthor/i.test(raw) || /401/.test(raw)) {
    return `Your session expired. Please ${AUTH.signIn.toLowerCase()} again.`;
  }
  if (/forbidden/i.test(raw) || /403/.test(raw)) {
    return "You don't have permission to do that.";
  }
  if (/not found/i.test(raw) || /404/.test(raw)) {
    return "That item couldn't be found.";
  }
  if (/timeout|timed out/i.test(raw)) {
    return "The request took too long. Try again in a moment.";
  }

  // Otherwise, sanitize: strip enclosing quotes / trailing punctuation, cap length
  let cleaned = raw.replace(/^["'\s]+|["'\s]+$/g, "");
  if (cleaned.length > 160) cleaned = `${cleaned.slice(0, 160)}…`;
  if (!cleaned) return fallback;
  // Ensure sentence shape
  if (!/[.!?]$/.test(cleaned)) cleaned = `${cleaned}.`;
  return cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
}

// ── Meta ranking diagnostics ───────────────────────────────────────────────
/** Meta's "above_average_offers" etc. → readable phrase. */
export function formatRanking(value: string | null | undefined): string {
  if (!value) return "Unavailable";
  const cleaned = value.toLowerCase().replace(/_/g, " ").trim();
  if (!cleaned) return "Unavailable";
  return cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
}
