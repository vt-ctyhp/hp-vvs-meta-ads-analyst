import type { UserRole } from "@/lib/access-control";
import { createAdsAnalystClient } from "@/lib/ads-analyst-db";
import type { RosterEntry } from "@/components/v2/operate/people-roster";
import type { SyncRunRow } from "@/components/v2/operate/pipelines-panel";

export async function fetchOperateSyncRuns(): Promise<SyncRunRow[]> {
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

export async function fetchOperateRoster(): Promise<RosterEntry[]> {
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

export function buildPipelinesSentence(args: {
  syncRuns: SyncRunRow[];
  backfillJobsCount: number;
}) {
  const latestSync = args.syncRuns[0];
  const pieces: string[] = [];

  if (latestSync) {
    pieces.push(
      `Last sync ${relTime(latestSync.startedAt)} - ${latestSync.status ?? "unknown"}.`,
    );
  } else {
    pieces.push("No sync runs yet in this environment.");
  }

  if (args.backfillJobsCount > 0) {
    pieces.push(
      `${args.backfillJobsCount} backfill job${args.backfillJobsCount === 1 ? "" : "s"} in history.`,
    );
  }

  return pieces.join(" ");
}

export function buildHealthSentence(status: string | null) {
  return status ? `System health: ${status}.` : "Health snapshot loading.";
}

function parseRoles(value: unknown): UserRole[] {
  if (Array.isArray(value)) return value.filter((v): v is UserRole => typeof v === "string");
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value);
      if (Array.isArray(parsed)) return parsed.filter((v): v is UserRole => typeof v === "string");
    } catch {
      // ignore malformed role payloads from the read-only view
    }
  }
  return [];
}

function relTime(iso: string | null): string {
  if (!iso) return "-";
  const ms = Date.now() - Date.parse(iso);
  if (!Number.isFinite(ms) || ms < 0) return "just now";
  const mins = Math.round(ms / 60_000);
  if (mins < 60) return `${mins} min ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}
