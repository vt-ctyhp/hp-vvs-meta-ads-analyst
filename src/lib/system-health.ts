/**
 * Platform-wide system health snapshot for the app shell.
 *
 * Surfaced through the small health indicator in the top nav so that
 * configuration and freshness signals live in one place — not scattered
 * across every page's body as separate banners.
 *
 * Keep this lean: it is fetched on every authenticated mount of the shell.
 * Expensive checks (Meta permission validation, Meta API calls) stay
 * page-scoped on the surfaces that need them.
 */

import { ConfigurationError, getMissingRequiredEnv } from "./env";
import { createServiceClient } from "./supabase";

export type SystemHealthStatus = "ok" | "warning" | "critical";

export type SystemHealthIssue = {
  level: "warning" | "critical";
  /** Short label shown in the slide-over. */
  title: string;
  /** Explanatory sentence; plain English, no enum codes. */
  detail: string;
  /** Optional route to open the page where the user can act on it. */
  link?: { href: string; label: string };
};

export type SystemHealthSnapshot = {
  status: SystemHealthStatus;
  generatedAt: string;
  missingEnv: string[];
  latestSync: {
    at: string | null;
    status: "success" | "partial" | "failed" | "running" | null;
    trigger: string | null;
  };
  issues: SystemHealthIssue[];
};

const STALE_SYNC_THRESHOLD_HOURS = 36;

export async function getSystemHealth(): Promise<SystemHealthSnapshot> {
  const missingEnv = getMissingRequiredEnv([
    "NEXT_PUBLIC_SUPABASE_URL",
    "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
    "SUPABASE_SERVICE_ROLE_KEY",
  ]);

  const issues: SystemHealthIssue[] = [];

  if (missingEnv.length) {
    issues.push({
      level: "critical",
      title: "Configuration incomplete",
      detail: `Missing environment values: ${missingEnv.join(", ")}.`,
    });
    return {
      status: "critical",
      generatedAt: new Date().toISOString(),
      missingEnv,
      latestSync: { at: null, status: null, trigger: null },
      issues,
    };
  }

  let latestSync: SystemHealthSnapshot["latestSync"] = {
    at: null,
    status: null,
    trigger: null,
  };

  try {
    const supabase = createServiceClient();
    const { data, error } = await supabase
      .from("sync_runs")
      .select("status,trigger,started_at,completed_at")
      .order("started_at", { ascending: false })
      .limit(1);

    if (error) throw error;

    const row = Array.isArray(data) ? data[0] : null;
    if (row) {
      const status = (row.status as SystemHealthSnapshot["latestSync"]["status"]) || null;
      latestSync = {
        at: typeof row.completed_at === "string" ? row.completed_at : (row.started_at as string),
        status,
        trigger: (row.trigger as string) || null,
      };
    }
  } catch (error) {
    if (!(error instanceof ConfigurationError)) {
      issues.push({
        level: "warning",
        title: "Couldn't read sync history",
        detail:
          error instanceof Error
            ? error.message
            : "Most recent sync status couldn't be loaded.",
      });
    }
  }

  if (latestSync.at) {
    const ageHours = (Date.now() - new Date(latestSync.at).getTime()) / 1000 / 60 / 60;
    if (latestSync.status === "failed") {
      issues.push({
        level: "critical",
        title: "Latest sync failed",
        detail: "The most recent Meta sync didn't complete. New data isn't flowing in.",
        link: { href: "/admin/backfill", label: "Open backfill" },
      });
    } else if (latestSync.status === "partial") {
      issues.push({
        level: "warning",
        title: "Latest sync was partial",
        detail: "Some accounts finished but others didn't. Data may be incomplete.",
        link: { href: "/admin/backfill", label: "Open backfill" },
      });
    } else if (ageHours > STALE_SYNC_THRESHOLD_HOURS) {
      issues.push({
        level: "warning",
        title: "Sync is stale",
        detail: `Last successful sync was over ${Math.round(ageHours)} hours ago.`,
        link: { href: "/admin/backfill", label: "Open backfill" },
      });
    }
  } else {
    issues.push({
      level: "warning",
      title: "No sync history",
      detail: "There's no record of a Meta sync yet. Run one to populate the dashboard.",
      link: { href: "/admin/backfill", label: "Open backfill" },
    });
  }

  const status: SystemHealthStatus = issues.some((issue) => issue.level === "critical")
    ? "critical"
    : issues.length
      ? "warning"
      : "ok";

  return {
    status,
    generatedAt: new Date().toISOString(),
    missingEnv,
    latestSync,
    issues,
  };
}
