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

// ── Meta ranking diagnostics ───────────────────────────────────────────────
/** Meta's "above_average_offers" etc. → readable phrase. */
export function formatRanking(value: string | null | undefined): string {
  if (!value) return "Unavailable";
  const cleaned = value.toLowerCase().replace(/_/g, " ").trim();
  if (!cleaned) return "Unavailable";
  return cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
}
