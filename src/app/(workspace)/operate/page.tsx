import { CoverageHeatmap } from "@/components/v2/operate/coverage-heatmap";
import { HealthPanel } from "@/components/v2/operate/health-panel";
import { OperateTabs, type OperateTab } from "@/components/v2/operate/operate-tabs";
import {
  PipelinesPanel,
  type SyncRunRow,
} from "@/components/v2/operate/pipelines-panel";
import {
  PeopleRoster,
  type RosterEntry,
} from "@/components/v2/operate/people-roster";
import { SignalStrip } from "@/components/v2/signal-strip";
import { StatusSentence } from "@/components/v2/status-sentence";
import { hasPermission, type UserRole } from "@/lib/access-control";
import { createAdsAnalystClient } from "@/lib/ads-analyst-db";
import { getMetaAdsBackfillState } from "@/lib/meta-backfill";
import { requirePagePermission } from "@/lib/server-route-auth";
import { getSystemHealth } from "@/lib/system-health";

export const dynamic = "force-dynamic";

type SearchParams = { tab?: string };

const VALID_TABS: OperateTab[] = ["pipelines", "coverage", "health", "people"];

export default async function OperatePage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const profile = await requirePagePermission("manage_backfill", "/operate");
  const params = await searchParams;
  const tab: OperateTab = VALID_TABS.includes(params.tab as OperateTab)
    ? (params.tab as OperateTab)
    : "pipelines";

  // Lazy-load only the data the active tab needs. Pipelines + Coverage share
  // getMetaAdsBackfillState so we always run it for those two; Health and
  // People each do their own server call.
  const [backfillState, syncRuns, health, roster] = await Promise.all([
    tab === "pipelines" || tab === "coverage"
      ? getMetaAdsBackfillState().catch(() => null)
      : Promise.resolve(null),
    tab === "pipelines" ? fetchSyncRuns().catch(() => []) : Promise.resolve([]),
    tab === "health" ? getSystemHealth().catch(() => null) : Promise.resolve(null),
    tab === "people" ? fetchRoster().catch(() => []) : Promise.resolve([]),
  ]);

  const canRunSync = hasPermission(profile.roles, "run_meta_sync");

  // Status sentence inputs are cheap to compute regardless of tab.
  const sentence = buildSentence({
    syncRuns,
    backfillJobsCount: backfillState?.jobs.length ?? 0,
    healthStatus: health?.status ?? null,
    tab,
  });

  return (
    <div className="space-y-6">
      <StatusSentence sentence={sentence} />

      <SignalStrip room="operate" />

      <OperateTabs active={tab} />

      {tab === "pipelines" ? (
        <PipelinesPanel
          canRunSync={canRunSync}
          syncRuns={syncRuns}
          backfillJobs={backfillState?.jobs ?? []}
          backfillChunks={backfillState?.chunks ?? []}
        />
      ) : null}

      {tab === "coverage" ? (
        <CoverageHeatmap
          coverage={backfillState?.coverage ?? []}
          rangeStart={backfillState?.coverageRange.start ?? "—"}
          rangeEnd={backfillState?.coverageRange.end ?? "—"}
        />
      ) : null}

      {tab === "health" && health ? (
        <HealthPanel snapshot={health} />
      ) : tab === "health" ? (
        <p className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
          Health snapshot unavailable. Try refreshing.
        </p>
      ) : null}

      {tab === "people" ? <PeopleRoster roster={roster} /> : null}
    </div>
  );
}

// ── data fetchers ──────────────────────────────────────────────────────────

async function fetchSyncRuns(): Promise<SyncRunRow[]> {
  const supabase = createAdsAnalystClient("web") as unknown as {
    from: (table: string) => {
      select: (cols: string) => {
        order: (
          col: string,
          opts: { ascending: boolean; nullsFirst?: boolean },
        ) => {
          limit: (n: number) => Promise<{ data: unknown; error: Error | null }>;
        };
      };
    };
  };

  const { data, error } = await supabase
    .from("sync_runs")
    .select("id, trigger, status, started_at, completed_at, metrics, errors")
    .order("started_at", { ascending: false, nullsFirst: false })
    .limit(25);

  if (error) throw error;
  const rows = Array.isArray(data) ? (data as Record<string, unknown>[]) : [];
  return rows.map((row) => ({
    id: String(row.id ?? ""),
    trigger: (row.trigger as string | null) ?? null,
    status: (row.status as string | null) ?? null,
    startedAt: (row.started_at as string | null) ?? null,
    completedAt: (row.completed_at as string | null) ?? null,
    metrics: row.metrics ?? null,
    errors: row.errors ?? null,
  }));
}

async function fetchRoster(): Promise<RosterEntry[]> {
  const supabase = createAdsAnalystClient("web") as unknown as {
    schema: (s: "analytics") => {
      from: (t: "ads_analyst_identity_profiles_v1") => {
        select: (cols: string) => Promise<{
          data: unknown;
          error: Error | null;
        }>;
      };
    };
  };

  const { data, error } = await supabase
    .schema("analytics")
    .from("ads_analyst_identity_profiles_v1")
    .select("app_user_id,auth_user_id,email,full_name,initials,active,roles");

  if (error) throw error;
  const rows = Array.isArray(data) ? (data as Record<string, unknown>[]) : [];
  return rows.map((row) => ({
    appUserId: (row.app_user_id as string | null) ?? null,
    authUserId: (row.auth_user_id as string | null) ?? null,
    email: String(row.email ?? ""),
    fullName: String(row.full_name ?? row.email ?? ""),
    initials: (row.initials as string | null) ?? null,
    active: Boolean(row.active),
    roles: parseRoles(row.roles),
  }));
}

function parseRoles(value: unknown): UserRole[] {
  if (Array.isArray(value)) return value.filter((v): v is UserRole => typeof v === "string");
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value);
      if (Array.isArray(parsed)) return parsed.filter((v): v is UserRole => typeof v === "string");
    } catch {
      // ignore
    }
  }
  return [];
}

// ── status sentence ─────────────────────────────────────────────────────────

function buildSentence(args: {
  syncRuns: SyncRunRow[];
  backfillJobsCount: number;
  healthStatus: string | null;
  tab: OperateTab;
}): string {
  const { syncRuns, backfillJobsCount, healthStatus, tab } = args;

  const latestSync = syncRuns[0];
  if (tab === "pipelines") {
    const pieces: string[] = [];
    if (latestSync) {
      pieces.push(
        `Last sync ${relTime(latestSync.startedAt)} — ${latestSync.status ?? "unknown"}.`,
      );
    } else {
      pieces.push("No sync runs yet in this environment.");
    }
    if (backfillJobsCount > 0) {
      pieces.push(
        `${backfillJobsCount} backfill job${backfillJobsCount === 1 ? "" : "s"} in history.`,
      );
    }
    return pieces.join(" ");
  }

  if (tab === "coverage") {
    return backfillJobsCount > 0
      ? "Historical coverage by month and account."
      : "Run a sync or queue a backfill job to populate coverage.";
  }

  if (tab === "health") {
    return healthStatus
      ? `System health: ${healthStatus}.`
      : "Health snapshot loading…";
  }

  return "Read-only roster from the analytics identity view.";
}

function relTime(iso: string | null): string {
  if (!iso) return "—";
  const ms = Date.now() - Date.parse(iso);
  if (!Number.isFinite(ms) || ms < 0) return "just now";
  const mins = Math.round(ms / 60_000);
  if (mins < 60) return `${mins} min ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}
